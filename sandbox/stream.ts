import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { sandboxStdoutBus, formatStdoutSSE, type StdoutEvent } from "./stdout-bus";

// Fase K.2 — SSE endpoint som strømmer live sandbox-stdout til frontend.
// URL: GET /sandbox/stdout-stream/:sandboxId?since=<event-ts>
// Auth: token verifiseres via gateway auth-handler (vi validerer eier etter).
//
// Events:
//   stdout.line         — én linje tekst (stream=stdout|stderr)
//   stdout.phase_start  — ny validation-fase starter
//   stdout.phase_end    — fase ferdig (success + durationMs + metrics)
//   stdout.error        — feil før/under kjøring
//   heartbeat           — hver 15s for å holde forbindelsen åpen

const HEARTBEAT_INTERVAL_MS = 15_000;

export const streamStdout = api.raw(
  { method: "GET", path: "/sandbox/stdout-stream/:sandboxId", expose: true, auth: true },
  async (req, res) => {
    const rawUrl = req.url ?? "";
    const url = new URL(rawUrl, "http://localhost");
    // Encore path-param injiseres ikke i raw-endpoints; parse ut selv.
    const pathMatch = url.pathname.match(/\/sandbox\/stdout-stream\/([^/?#]+)/);
    const sandboxId = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : "";

    if (!sandboxId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "sandboxId required" }));
      return;
    }

    // Eier-sjekk: auth-handleren har allerede validert token.
    // Hvis sandbox har en lagret eier, verifiser at authed user matcher.
    // (I dev kan eier mangle når sandbox opprettes uten å registrere eier.)
    const owner = sandboxStdoutBus.getOwner(sandboxId);
    const authHeaderEmail = req.headers["x-auth-email"] as string | undefined;
    if (owner && authHeaderEmail && owner !== authHeaderEmail) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not owner of sandbox" }));
      return;
    }

    // Parse "since" for replay (sekund-epoch)
    const sinceStr = url.searchParams.get("since");
    const since = sinceStr ? parseInt(sinceStr, 10) : 0;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const flushHeaders = (res as unknown as { flushHeaders?: () => void }).flushHeaders;
    if (typeof flushHeaders === "function") flushHeaders.call(res);

    log.info("sandbox stdout stream: client connected", { sandboxId, since });

    // Replay buffer — hvis klient sender `since`, filtrer dit.
    const buffer = sandboxStdoutBus.getBuffer(sandboxId);
    const replay = since > 0 ? buffer.filter((e) => e.ts > since) : buffer;
    for (const ev of replay) {
      try { res.write(formatStdoutSSE(ev)); } catch { /* close handles cleanup */ }
    }

    const writeHeartbeat = () => {
      try { res.write(`event: heartbeat\ndata: {"ts":${Date.now()}}\n\n`); } catch { /* noop */ }
    };
    writeHeartbeat();

    const unsubscribe = sandboxStdoutBus.subscribe(sandboxId, (event: StdoutEvent) => {
      try { res.write(formatStdoutSSE(event)); } catch (err) {
        log.warn("sandbox stdout stream: write failed", {
          sandboxId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    const heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeatTimer);
      unsubscribe();
      log.info("sandbox stdout stream: client disconnected", { sandboxId });
    };

    req.on("close", cleanup);
    req.on("error", (err) => {
      log.warn("sandbox stdout stream: req error", {
        sandboxId,
        error: err.message,
      });
      cleanup();
    });
  },
);

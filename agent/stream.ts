// --- Agent SSE Stream Endpoint ---
// Raw HTTP endpoint that streams AgentEvents to the frontend via Server-Sent Events.
// The agent tool loop emits events through agentEventBus; this endpoint relays them.
//
// URL:  GET /agent/stream?taskId=<conversationId>
// Headers required from client: Authorization: Bearer <token>
//
// SSE reconnect: client should send Last-Event-ID header; events before reconnect
// are not replayed (no buffer), but the stream resumes from the current state.

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { agentEventBus } from "./event-bus";
import { createAgentEvent, formatSSE, type AgentEventType } from "./events";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 15_000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal: emit an event to the bus (called by chat service for direct-chat SSE)
// ─────────────────────────────────────────────────────────────────────────────

interface EmitChatEventRequest {
  /** The stream key — conversationId for direct chat, taskId for agent tasks */
  streamKey: string;
  /** AgentEventType string, e.g. "agent.status", "agent.done" */
  eventType: string;
  /** Payload matching the event type's data shape */
  data: Record<string, unknown>;
}

export const emitChatEvent = api(
  { method: "POST", path: "/agent/emit-chat-event", expose: false },
  async (req: EmitChatEventRequest): Promise<{ ok: boolean }> => {
    const event = createAgentEvent(
      req.eventType as AgentEventType,
      req.data as any,
    );
    agentEventBus.emit(req.streamKey, event);
    return { ok: true };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stream agent events for a given task as Server-Sent Events.
 *
 * Query params:
 *   taskId  — The conversationId used when the task was started (required)
 *
 * SSE event types the client will receive:
 *   agent.status      — Phase/status changes
 *   agent.message     — AI text output (full + deltas)
 *   agent.tool_use    — Before each tool call
 *   agent.tool_result — After each tool call (with duration)
 *   agent.thinking    — AI reasoning traces
 *   agent.error       — Non-fatal and fatal errors
 *   agent.done        — Task completed (includes final summary)
 *   agent.progress    — Step-level progress within a phase
 *   agent.heartbeat   — Sent every 15s to keep the connection alive
 */
export const streamAgentEvents = api.raw(
  { method: "GET", path: "/agent/stream", expose: true, auth: true },
  async (req, res) => {
    // ── Parse query params ───────────────────────────────────────────────────
    const rawUrl = req.url ?? "";
    // Encore raw endpoints receive the path-relative URL; add a dummy base
    const url = new URL(rawUrl, "http://localhost");
    const taskId = url.searchParams.get("taskId");

    if (!taskId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "taskId query parameter is required" }));
      return;
    }

    // Last-Event-ID for reconnect tracking (events are not buffered/replayed,
    // but we log it so we can add replay later without changing the API)
    const lastEventId = req.headers["last-event-id"] as string | undefined;

    // ── SSE headers ──────────────────────────────────────────────────────────
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      // Disable proxy/nginx response buffering so events arrive immediately
      "X-Accel-Buffering": "no",
    });

    // Flush headers immediately — some proxies buffer until the first write
    if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === "function") {
      (res as unknown as { flushHeaders: () => void }).flushHeaders();
    }

    log.info("agent stream: client connected", {
      taskId,
      lastEventId: lastEventId ?? "none",
    });

    // ── Send opening heartbeat ───────────────────────────────────────────────
    const writeHeartbeat = () => {
      try {
        res.write(formatSSE(createAgentEvent("agent.heartbeat", { ts: Date.now() })));
      } catch {
        // Connection already closed — cleanup will handle it
      }
    };

    writeHeartbeat();

    // ── Subscribe to task events ─────────────────────────────────────────────
    const unsubscribe = agentEventBus.subscribe(taskId, (event) => {
      try {
        res.write(formatSSE(event));
      } catch (err) {
        log.warn("agent stream: write failed", {
          taskId,
          eventType: event.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ── Heartbeat timer ──────────────────────────────────────────────────────
    const heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

    // ── Disconnect cleanup ───────────────────────────────────────────────────
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeatTimer);
      unsubscribe();
      log.info("agent stream: client disconnected", { taskId });
    };

    req.on("close", cleanup);
    req.on("error", (err) => {
      log.warn("agent stream: request error", {
        taskId,
        error: err.message,
      });
      cleanup();
    });
  },
);

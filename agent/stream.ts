// --- Agent SSE Stream Endpoint ---
// Streams agent execution events to the client via Server-Sent Events.
// The frontend connects with EventSource (or fetch+ReadableStream for auth headers).
//
// URL: GET /agent/stream/:taskId
//   taskId — the thefoldTaskId or conversationId used when emitting events
//
// Reconnection: pass Last-Event-ID header to replay buffered events since that id.
// Heartbeat:    sent every 15 seconds to keep the connection alive.

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { agentEventBus } from "./event-bus";
import { formatSSE, createAgentEvent, type AgentEvent } from "./events";

export const streamTask = api.raw(
  { expose: true, auth: true, path: "/agent/stream/:taskId", method: "GET" },
  async (req, resp) => {
    // Extract taskId from the URL path
    const match = req.url?.match(/\/agent\/stream\/([^/?#]+)/);
    const taskId = match ? decodeURIComponent(match[1]) : "";

    if (!taskId) {
      resp.writeHead(400, { "Content-Type": "text/plain" });
      resp.end("Missing taskId");
      return;
    }

    // Set SSE headers and flush immediately so the browser/client opens the stream
    resp.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx/proxy buffering
    });
    resp.flushHeaders();

    let closed = false;

    const onEvent = (event: AgentEvent) => {
      if (closed) return;
      resp.write(formatSSE(event));
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeatTimer);
      emitter.off("event", onEvent);
      log.info("agent SSE stream disconnected", { taskId });
    };

    // Replay buffered events after Last-Event-ID (reconnection support)
    const lastEventId = req.headers["last-event-id"] as string | undefined;
    if (lastEventId) {
      const buffer = agentEventBus.getBuffer(taskId);
      const lastIdx = buffer.findIndex((e) => e.id === lastEventId);
      // Replay everything after the last seen event; if id not found replay full buffer
      const replay = lastIdx !== -1 ? buffer.slice(lastIdx + 1) : buffer;
      for (const event of replay) {
        if (closed) break;
        resp.write(formatSSE(event));
      }
    }

    // Subscribe to live events
    const emitter = agentEventBus.getEmitter(taskId);
    emitter.on("event", onEvent);

    // Heartbeat every 15 seconds to prevent proxy/load-balancer timeouts
    const heartbeatTimer = setInterval(() => {
      if (closed) return;
      const hb = createAgentEvent({
        type: "agent.heartbeat",
        data: { timestamp: new Date().toISOString() },
      });
      resp.write(formatSSE(hb));
    }, 15_000);

    req.on("close", cleanup);
    req.on("error", (err) => {
      log.warn("agent SSE stream error", { taskId, error: err.message });
      cleanup();
    });
  },
);

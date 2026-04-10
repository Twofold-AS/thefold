# ADR-001: SSE over WebSocket for agent streaming

**Status:** Accepted

## Context

TheFold's agent runs autonomous tasks that can take minutes. The frontend needs a live feed of progress: phase transitions, AI message chunks, tool calls, and a final summary. We needed to choose between WebSocket and Server-Sent Events (SSE) as the transport.

Key constraints:
- The stream is **unidirectional** — the backend pushes events, the frontend only reads
- The agent is stateless once started; no mid-stream commands are needed
- Encore.ts supports raw HTTP endpoints natively; WebSocket support requires more scaffolding
- The platform may sit behind standard HTTP proxies and CDNs

## Decision

Use **Server-Sent Events** (SSE) over a raw Encore.ts endpoint (`api.raw`).

The implementation lives in `agent/stream.ts` and `agent/event-bus.ts`. The in-process `AgentEventBus` bridges the agent tool loop to HTTP clients via Node.js `EventEmitter`.

## Consequences

**Positive:**
- SSE is a standard HTTP/1.1 feature — works transparently through proxies, load balancers, and CDNs without special configuration
- Built-in browser reconnect via `Last-Event-ID` and `EventSource` API
- Server-side implementation is straightforward: write to the response stream, no handshake protocol
- Heartbeat every 15s keeps the connection alive through aggressive proxies
- Typed events (`AgentEvent<T>`) with a discriminated union map provide end-to-end type safety

**Negative / Trade-offs:**
- SSE is HTTP/1.1 — browsers limit to ~6 connections per origin. Mitigated by HTTP/2 multiplexing in production
- No bidirectional messaging: clarification responses go through a separate REST endpoint (`POST /agent/start` with `feedback`)
- No built-in binary framing — all payloads are JSON strings

**Alternatives considered:**
- **WebSocket**: Would require a separate upgrade handshake and more complex lifecycle management. Bidirectional capability is not needed here
- **Polling**: Simple but introduces latency proportional to polling interval; adds unnecessary load
- **Encore Streaming API** (`api.streamOut`): Encore's streaming endpoint is an option but SSE gives more control over the wire format and reconnect semantics

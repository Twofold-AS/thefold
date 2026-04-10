# ADR-003: Agent event type and schema design

**Status:** Accepted

## Context

The agent tool loop emits many kinds of signals to the frontend: phase changes, AI message chunks, tool call start/end, reasoning traces, errors, and a final summary. We needed a schema that:
- Is strongly typed end-to-end (TypeScript discriminated union)
- Carries enough context for the frontend to render rich progress UI
- Is stable enough to add fields without breaking old clients
- Supports SSE reconnect (Last-Event-ID correlation)

## Decision

Use a **discriminated union** with a `type` field as the SSE `event:` line and a per-type `data` interface:

```typescript
// agent/events.ts
export type AgentEventType =
  | "agent.status"
  | "agent.message"
  | "agent.tool_use"
  | "agent.tool_result"
  | "agent.thinking"
  | "agent.error"
  | "agent.done"
  | "agent.progress"
  | "agent.heartbeat";

export interface AgentEventDataMap {
  "agent.status":      AgentStatusData;
  "agent.message":     AgentMessageData;
  "agent.tool_use":    AgentToolUseData;
  "agent.tool_result": AgentToolResultData;
  // …
}

export interface AgentEvent<T extends AgentEventType = AgentEventType> {
  id: string;           // UUID — used as SSE `id:` for Last-Event-ID
  timestamp: string;    // ISO 8601
  type: T;
  data: AgentEventDataMap[T];
}
```

Key design choices:

1. **`type` in the SSE `event:` field** — browser `EventSource.addEventListener("agent.tool_use", …)` works without parsing the data
2. **UUID `id` per event** — enables Last-Event-ID reconnect; future implementations can replay from a buffer
3. **`toolUseId` correlation** — `agent.tool_use` and `agent.tool_result` share a `toolUseId` so the frontend can match them
4. **Optional fields with `?`** — `recoverable`, `delta`, `phase` etc. are optional so they can be added/removed without a schema version bump
5. **Factory `createAgentEvent()`** — auto-generates id and timestamp, reducing boiler-plate and ensuring consistency

## Consequences

**Positive:**
- TypeScript enforces correct data shapes at the emit site (`createAgentEvent("agent.tool_use", data)` won't compile with wrong data)
- Frontend can use `switch (event.type)` with full narrowing
- SSE `event:` field enables efficient browser-side filtering
- `agent.heartbeat` keeps long-running tasks from being dropped by idle proxies

**Negative / Trade-offs:**
- Adding a new event type requires updating `AgentEventType`, `AgentEventDataMap`, and client code — but TypeScript's exhaustive checks make omissions compile errors
- The `data` JSON inside the SSE `data:` line does not include `type` (it's in the `event:` field) — older clients that parse only the `data:` field need to read the SSE `event:` line too

**Relationship to AgentProgress (Pub/Sub):**
`AgentProgress` (in `agent/messages.ts`) is a separate, higher-level message format used for Pub/Sub broadcasting to the chat service. It coexists with the SSE event schema — they serve different audiences (service mesh vs. browser client).

// --- Agent SSE Event Types ---
// Typed event definitions for the agent Server-Sent Events stream.
// Used by event-bus.ts (emit) and stream.ts (format + send).

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Event type discriminator
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Per-type data shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentStatusData {
  /** Human-readable status label, e.g. "planning", "building", "reviewing" */
  status: string;
  /** Current agent phase name */
  phase?: string;
  /** Optional detail message */
  message?: string;
  /** Loop iteration number when emitted from the tool loop */
  loop?: number;
}

export interface AgentMessageData {
  role: "assistant" | "user";
  /** Full content (for complete messages) */
  content: string;
  /** Incremental text chunk (for streaming deltas — content may be empty) */
  delta?: string;
  /** Model that produced this message */
  model?: string;
}

export interface AgentToolUseData {
  toolName: string;
  /** Anthropic tool_use block ID — used to correlate with agent.tool_result */
  toolUseId: string;
  /** Input arguments passed to the tool */
  input: Record<string, unknown>;
  /** Tool-loop iteration this call was made in */
  loopIteration: number;
}

export interface AgentToolResultData {
  toolName: string;
  /** Matches the toolUseId from the corresponding agent.tool_use event */
  toolUseId: string;
  /** Serialised result returned to the AI */
  content: string;
  /** true when the tool threw an error */
  isError: boolean;
  /** Wall-clock time for the tool call in milliseconds */
  durationMs: number;
  /** Total execution time including serialization overhead */
  executionTimeMs?: number;
}

export interface AgentThinkingData {
  thought: string;
}

export interface AgentErrorData {
  message: string;
  /** Optional short error code, e.g. "max_loops", "tool_call_failed", "ai_error" */
  code?: string;
  /** Whether the agent can continue despite this error */
  recoverable?: boolean;
}

export interface AgentDoneData {
  finalText: string;
  /** Ordered list of tool names called during the run */
  toolsUsed: string[];
  /** Number of files written via repo_write_file */
  filesWritten: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd: number;
  /** Number of tool-loop iterations consumed */
  loopsUsed: number;
  /** true if the run was cut short by MAX_LOOPS */
  stoppedAtMaxLoops: boolean;
  /** Total tokens used across all tool calls (input + output) */
  tokenCount?: number;
  /** Estimated cost in USD for the entire run */
  costEstimate?: number;
  /** Paths of files changed by repo_write_file calls */
  filesChanged?: string[];
}

export interface AgentProgressData {
  /** Short label for the current step, e.g. "Writing src/api.ts" */
  step: string;
  /** Total steps if known */
  total?: number;
  /** Current step index (0-based) */
  current?: number;
  detail?: string;
}

export interface AgentHeartbeatData {
  /** Unix timestamp in milliseconds */
  ts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union map — ties each event type to its data shape
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentEventDataMap {
  "agent.status": AgentStatusData;
  "agent.message": AgentMessageData;
  "agent.tool_use": AgentToolUseData;
  "agent.tool_result": AgentToolResultData;
  "agent.thinking": AgentThinkingData;
  "agent.error": AgentErrorData;
  "agent.done": AgentDoneData;
  "agent.progress": AgentProgressData;
  "agent.heartbeat": AgentHeartbeatData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core event envelope
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentEvent<T extends AgentEventType = AgentEventType> {
  /** Unique event ID — used as the SSE `id:` field and for Last-Event-ID reconnect */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  type: T;
  data: AgentEventDataMap[T];
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a typed AgentEvent with auto-generated id and current timestamp.
 *
 * @param type   One of the AgentEventType values
 * @param data   Payload matching the type's data shape
 * @param id     Optional explicit ID (defaults to a new UUID)
 */
export function createAgentEvent<T extends AgentEventType>(
  type: T,
  data: AgentEventDataMap[T],
  id?: string,
): AgentEvent<T> {
  return {
    id: id ?? randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    data,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE wire formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an AgentEvent as an SSE message string ready to write to the response.
 *
 * Wire format:
 *   id: <uuid>\n
 *   event: <agent.type>\n
 *   data: {"timestamp":"…","data":{…}}\n
 *   \n
 *
 * The `event:` field is the full AgentEventType string so browser EventSource
 * listeners can filter with addEventListener("agent.tool_use", …).
 */
export function formatSSE(event: AgentEvent): string {
  return (
    `id: ${event.id}\n` +
    `event: ${event.type}\n` +
    `data: ${JSON.stringify({ timestamp: event.timestamp, data: event.data })}\n\n`
  );
}

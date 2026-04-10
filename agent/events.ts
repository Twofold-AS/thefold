// --- Agent SSE Event Schema ---
// Typed event definitions for the agent Server-Sent Events (SSE) stream.
// Events flow from the tool loop → event bus → SSE endpoint → frontend.

export interface AgentEvent {
  id: string;
  timestamp: string;
  type: AgentEventType;
  data: unknown;
}

export type AgentEventType =
  | "agent.status"
  | "agent.message"
  | "agent.tool_use"
  | "agent.tool_result"
  | "agent.thinking"
  | "agent.error"
  | "agent.done"
  | "agent.progress"
  | "agent.plan"
  | "agent.review"
  | "agent.heartbeat";

export interface AgentStatusEvent {
  type: "agent.status";
  data: { status: string; phase?: string; message?: string };
}

export interface AgentMessageEvent {
  type: "agent.message";
  data: { delta: string; role: "assistant"; messageId: string };
}

export interface AgentToolUseEvent {
  type: "agent.tool_use";
  data: { toolName: string; toolId: string; input: Record<string, unknown> };
}

export interface AgentToolResultEvent {
  type: "agent.tool_result";
  data: { toolId: string; toolName: string; result: unknown; durationMs: number; success: boolean };
}

export interface AgentThinkingEvent {
  type: "agent.thinking";
  data: { text: string };
}

export interface AgentErrorEvent {
  type: "agent.error";
  data: { errorType: string; message: string; retryable: boolean; suggestedAction?: string };
}

export interface AgentDoneEvent {
  type: "agent.done";
  data: { summary?: string; filesChanged?: string[]; tokensUsed?: number };
}

export interface AgentProgressEvent {
  type: "agent.progress";
  data: { step: number; totalSteps: number; description: string };
}

export interface AgentHeartbeatEvent {
  type: "agent.heartbeat";
  data: { timestamp: string };
}

export type TypedAgentEvent =
  | AgentStatusEvent
  | AgentMessageEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentThinkingEvent
  | AgentErrorEvent
  | AgentDoneEvent
  | AgentProgressEvent
  | AgentHeartbeatEvent;

// Helper to create events with auto-generated id and timestamp
export function createAgentEvent(event: TypedAgentEvent): AgentEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: event.type,
    data: event.data,
  };
}

// Format an AgentEvent as an SSE wire frame
export function formatSSE(event: AgentEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

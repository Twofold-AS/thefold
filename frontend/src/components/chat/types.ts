// --- Chat line types (U3/U6/U7) ---
// Discriminated union used by AgentStream.tsx to render a chronologically
// merged stack of thought-lines, tool-calls, sub-agent groups (Fase H) and
// validation phases (Fase K).
//
// Each line carries `timestamp` so the stack stays stable across re-renders.

export type LineStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped"
  | "info";

/** agent.thought — plain prose from the model */
export interface ThoughtLine {
  kind: "thought";
  id: string;
  timestamp: number;
  text: string;
}

/** tool_use + tool_result pair — U2 primary type */
export interface ToolCallLineData {
  kind: "tool_call";
  id: string; // toolCallId (Anthropic tool_use_id or OpenAI tc.id)
  timestamp: number;
  toolName: string;
  status: LineStatus;
  input?: Record<string, unknown>;
  result?: unknown;
  durationMs?: number;
  isError?: boolean;
  errorMessage?: string;
}

/** U6 — Fase H sub-agent group. Rendered as parent-line + N child-lines. */
export interface SwarmGroupLine {
  kind: "swarm_group";
  id: string;
  timestamp: number;
  label: string; // "Agenter på oppgaven (3)"
  agents: Array<{
    index: number;
    role: "planner" | "implementer" | "tester" | "reviewer" | "documenter" | "researcher" | "security";
    label: string;
    status: LineStatus;
    durationMs?: number;
    inputContext?: string;
    output?: string;
  }>;
}

/** U7 — Fase K validation pipeline phase. */
export interface ValidationPhaseLine {
  kind: "validation_phase";
  id: string;
  timestamp: number;
  phaseIndex: number; // 0..4
  phaseName: string; // "Skriver filer" | "npm install" | "TypeScript" | "Build" | "Tests"
  status: LineStatus;
  durationMs?: number;
  detail?: string;
  sandboxId?: string; // for stdout-stream-modal
}

/** Union over every renderable line */
export type ChatLine =
  | ThoughtLine
  | ToolCallLineData
  | SwarmGroupLine
  | ValidationPhaseLine;

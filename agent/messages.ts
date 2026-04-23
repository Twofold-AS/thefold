import type { AgentPhase } from "./state-machine";

// ============================================================
// NEW CONTRACT — AgentProgress (unified message type)
// ============================================================

export interface ProgressStep {
  id: string;              // "context", "confidence", "plan", "build:1", "validate", etc.
  label: string;           // "Analyserte repository", "gateway/auth.ts"
  detail?: string;         // "14 filer, 3 minner"
  done: boolean | null;    // true=done, false=in progress, null=waiting
  timestamp?: number;      // U5 — epoch ms, for chronological merge with tool-calls
}

/** U5 — Persistent representation of a tool-call for AgentStream rendering. */
export interface ProgressToolCall {
  id: string;                  // toolCallId (Anthropic tool_use_id / OpenAI tc.id)
  timestamp: number;           // epoch ms — chronology key
  toolName: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  input?: Record<string, unknown>;
  result?: unknown;
  durationMs?: number;
  isError?: boolean;
  errorMessage?: string;
}

export interface ProgressReport {
  filesChanged: Array<{ path: string; action: "create" | "modify" | "delete"; diff?: string }>;
  costUsd: number;
  duration: string;
  qualityScore?: number;   // 1-10 from AI review
  concerns?: string[];
  reviewId: string;        // reference to code_reviews table
}

export interface AgentProgress {
  status: "thinking" | "working" | "waiting" | "done" | "failed";
  phase: string;           // "context" | "confidence" | "planning" | "building" | "validating" | "reviewing" | "completing" | "clarification"
  summary: string;         // "Bygger gateway/auth.ts (2/4)"
  progress?: {
    current: number;
    total: number;
    currentFile?: string;
  };
  steps: ProgressStep[];
  /** U5 — tool-call-linjer merget kronologisk med steps i AgentStream */
  toolCalls?: ProgressToolCall[];
  report?: ProgressReport;           // only when done
  question?: string;                 // only when waiting
  subAgents?: Array<{                // only during sub-agent work
    id: string;
    role: string;
    model: string;
    status: "pending" | "working" | "done" | "failed";
    label: string;
  }>;
  error?: string;                    // only when failed
}

export function serializeProgress(progress: AgentProgress): string {
  return JSON.stringify({ type: "progress", ...progress });
}

export function deserializeProgress(raw: string): AgentProgress | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === "progress") return parsed as AgentProgress;
    // Legacy fallback — convert old types
    return convertLegacy(parsed);
  } catch {
    return null;
  }
}

function convertLegacy(parsed: any): AgentProgress | null {
  if (!parsed?.type) return null;

  switch (parsed.type) {
    case "status":
      return {
        status: "working",
        phase: parsed.phase || "building",
        summary: parsed.meta?.title || parsed.phase || "Jobber...",
        steps: (parsed.steps || []).map((s: any) => ({
          id: s.label,
          label: s.label,
          detail: s.detail,
          done: s.status === "done" ? true : s.status === "active" ? false : null,
        })),
      };
    case "thought":
      return null; // thoughts not shown in new UI
    case "report":
      return {
        status: parsed.status === "completed" ? "done" : parsed.status === "failed" ? "failed" : "working",
        phase: parsed.status === "completed" ? "completing" : "building",
        summary: parsed.text?.substring(0, 100) || "",
        steps: [],
      };
    case "clarification":
      return {
        status: "waiting",
        phase: "clarification",
        summary: "Trenger avklaring",
        steps: (parsed.steps || []).map((s: any) => ({
          id: s.label,
          label: s.label,
          done: null,
        })),
        question: parsed.questions?.[0] || "",
      };
    case "review":
      return {
        status: "waiting",
        phase: "reviewing",
        summary: "Venter pa godkjenning",
        steps: [],
        report: {
          filesChanged: [],
          costUsd: 0,
          duration: "",
          qualityScore: parsed.reviewData?.quality,
          concerns: parsed.reviewData?.concerns,
          reviewId: parsed.reviewData?.reviewId || "",
        },
      };
    case "completion":
      return {
        status: "done",
        phase: "completing",
        summary: parsed.text || "Ferdig",
        steps: [],
      };
    default:
      return null;
  }
}

// ============================================================
// LEGACY EXPORTS — kept for backward compatibility.
// New code should use serializeProgress/deserializeProgress.
// ============================================================

export interface StepInfo {
  label: string;
  status: "pending" | "active" | "done" | "error" | "info";
  detail?: string;
}

export interface StatusMeta {
  title?: string;
  planProgress?: { current: number; total: number };
  activeTasks?: Array<{ id: string; title: string; status: string }>;
  error?: string;
}

export interface ReviewMeta {
  reviewId: string;
  quality: number;
  filesChanged: number;
  concerns: string[];
  reviewUrl: string;
}

export type AgentMessage =
  | { type: "status"; phase: AgentPhase; steps: StepInfo[]; meta?: StatusMeta }
  | { type: "thought"; text: string; timestamp: number }
  | { type: "report"; text: string; status: "working" | "failed" | "completed" | "needs_input"; prUrl?: string; filesChanged?: string[] }
  | { type: "clarification"; phase: AgentPhase; questions: string[]; steps: StepInfo[] }
  | { type: "review"; phase: AgentPhase; reviewData: ReviewMeta; steps: StepInfo[] }
  | { type: "completion"; text: string; prUrl?: string; filesChanged?: string[] };

// Known message type strings for validation
const KNOWN_TYPES = ["status", "thought", "report", "clarification", "review", "completion"] as const;

export function serializeMessage(msg: AgentMessage): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(raw: string): AgentMessage | null {
  try {
    const parsed = JSON.parse(raw);
    // Validate it's an object with a known type
    if (parsed && typeof parsed === "object" && parsed.type) {
      if ((KNOWN_TYPES as readonly string[]).includes(parsed.type)) {
        return parsed as AgentMessage;
      }
      // Legacy: { type: "agent_status", ... } -> convert
      if (parsed.type === "agent_status") {
        return convertLegacyStatus(parsed);
      }
      // Legacy: { type: "agent_thought", ... } -> convert
      if (parsed.type === "agent_thought") {
        return {
          type: "thought",
          text: parsed.thought || "",
          timestamp: parsed.timestamp || Date.now(),
        };
      }
    }
    return null;
  } catch {
    // Not JSON -> legacy plain text report
    return null;
  }
}

function convertLegacyStatus(parsed: Record<string, unknown>): AgentMessage {
  const phase = (parsed.phase as string) || "building";
  const steps = Array.isArray(parsed.steps)
    ? (parsed.steps as Array<{ label: string; status: string }>).map((s) => ({
        label: s.label || "",
        status: (s.status || "pending") as StepInfo["status"],
      }))
    : [];

  // Legacy with reviewData -> review message
  if (parsed.reviewData && typeof parsed.reviewData === "object") {
    const rd = parsed.reviewData as Record<string, unknown>;
    return {
      type: "review",
      phase: phase as AgentPhase,
      reviewData: {
        reviewId: (rd.reviewId as string) || "",
        quality: (rd.quality as number) || 0,
        filesChanged: (rd.filesChanged as number) || 0,
        concerns: Array.isArray(rd.concerns) ? rd.concerns as string[] : [],
        reviewUrl: (rd.reviewUrl as string) || "",
      },
      steps,
    };
  }

  // Legacy with questions -> clarification message
  if (parsed.questions && Array.isArray(parsed.questions) && (parsed.questions as string[]).length > 0) {
    return {
      type: "clarification",
      phase: phase as AgentPhase,
      questions: parsed.questions as string[],
      steps,
    };
  }

  // Default: status message
  return {
    type: "status",
    phase: phase as AgentPhase,
    steps,
    meta: {
      title: parsed.title as string | undefined,
      planProgress: parsed.planProgress as StatusMeta["planProgress"],
      activeTasks: parsed.activeTasks as StatusMeta["activeTasks"],
    },
  };
}

// Always use new contract
export function useNewContract(): boolean {
  return true;
}

// === CONVENIENCE BUILDERS (legacy, kept for backward compat) ===

export function buildStatusMessage(
  phase: AgentPhase,
  steps: StepInfo[],
  meta?: StatusMeta,
): AgentMessage {
  return { type: "status", phase, steps, meta };
}

export function buildThoughtMessage(text: string): AgentMessage {
  return { type: "thought", text, timestamp: Date.now() };
}

export function buildReportMessage(
  text: string,
  status: "working" | "failed" | "completed" | "needs_input",
  extra?: { prUrl?: string; filesChanged?: string[] },
): AgentMessage {
  return { type: "report", text, status, ...extra };
}

export function buildClarificationMessage(
  phase: AgentPhase,
  questions: string[],
  steps: StepInfo[],
): AgentMessage {
  return { type: "clarification", phase, questions, steps };
}

export function buildReviewMessage(
  phase: AgentPhase,
  reviewData: ReviewMeta,
  steps: StepInfo[],
): AgentMessage {
  return { type: "review", phase, reviewData, steps };
}

export function buildCompletionMessage(
  text: string,
  extra?: { prUrl?: string; filesChanged?: string[] },
): AgentMessage {
  return { type: "completion", text, ...extra };
}

// === PHASE MAPPING (for report->status conversion in subscriber) ===

export function mapReportStatusToPhase(status: "working" | "failed" | "completed" | "needs_input"): AgentPhase {
  switch (status) {
    case "working": return "building";
    case "completed": return "completed";
    case "failed": return "failed";
    case "needs_input": return "needs_input";
  }
}

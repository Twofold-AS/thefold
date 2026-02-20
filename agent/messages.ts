import type { AgentPhase } from "./state-machine";

// === THE SINGLE MESSAGE TYPE PUBLISHED VIA PUB/SUB ===

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

// === SERIALIZATION ===

export function serializeMessage(msg: AgentMessage): string {
  return JSON.stringify(msg);
}

// === DESERIALIZATION (with legacy fallback) ===

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

// === CONVENIENCE BUILDERS (replace report/think/reportSteps) ===

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

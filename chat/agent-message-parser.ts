// Duplicated types from agent/messages.ts for cross-service boundary
// Encore.ts prohibits direct imports between services — this is the chat-side parser
// Keep in sync with agent/messages.ts

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
  | { type: "status"; phase: string; steps: StepInfo[]; meta?: StatusMeta }
  | { type: "thought"; text: string; timestamp: number }
  | { type: "report"; text: string; status: "working" | "failed" | "completed" | "needs_input"; prUrl?: string; filesChanged?: string[] }
  | { type: "clarification"; phase: string; questions: string[]; steps: StepInfo[] }
  | { type: "review"; phase: string; reviewData: ReviewMeta; steps: StepInfo[] }
  | { type: "completion"; text: string; prUrl?: string; filesChanged?: string[] };

const KNOWN_TYPES = ["status", "thought", "report", "clarification", "review", "completion"] as const;

/** Deserialize an agent message from its JSON content string */
export function deserializeMessage(raw: string): AgentMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.type) {
      if ((KNOWN_TYPES as readonly string[]).includes(parsed.type)) {
        return parsed as AgentMessage;
      }
      // Legacy: { type: "agent_status", ... }
      if (parsed.type === "agent_status") {
        return convertLegacyStatus(parsed);
      }
      // Legacy: { type: "agent_thought", ... }
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

  if (parsed.reviewData && typeof parsed.reviewData === "object") {
    const rd = parsed.reviewData as Record<string, unknown>;
    return {
      type: "review",
      phase,
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

  if (parsed.questions && Array.isArray(parsed.questions) && (parsed.questions as string[]).length > 0) {
    return {
      type: "clarification",
      phase,
      questions: parsed.questions as string[],
      steps,
    };
  }

  return {
    type: "status",
    phase,
    steps,
    meta: {
      title: parsed.title as string | undefined,
      planProgress: parsed.planProgress as StatusMeta["planProgress"],
      activeTasks: parsed.activeTasks as StatusMeta["activeTasks"],
    },
  };
}

/** Map report status to a UI phase string */
export function mapReportStatusToPhase(status: string): string {
  switch (status) {
    case "working": return "Bygger";
    case "completed": return "Ferdig";
    case "failed": return "Feilet";
    case "needs_input": return "Venter";
    default: return "Bygger";
  }
}

/** Build a serialized status message (for converting reports to status format) */
export function buildStatusContent(phase: string, steps: StepInfo[], meta?: StatusMeta): string {
  return JSON.stringify({ type: "status", phase, steps, meta });
}

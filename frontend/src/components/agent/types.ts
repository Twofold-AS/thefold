export interface AgentStep {
  label: string;
  icon?: string;
  status: "pending" | "active" | "done" | "error" | "info";
  detail?: string;
}

export interface ReviewData {
  reviewId: string;
  quality: number;
  filesChanged: number;
  concerns: string[];
  reviewUrl: string;
}

/** Message types from the backend AgentMessage contract */
export type AgentMessageType = "status" | "thought" | "report" | "clarification" | "review" | "completion";

export interface AgentStatusData {
  type?: AgentMessageType;
  phase: string;
  title: string;
  steps: AgentStep[];
  error?: string;
  questions?: string[];
  reviewData?: ReviewData;
  planProgress?: { current: number; total: number };
  activeTasks?: Array<{ id: string; title: string; status: string }>;
  taskId?: string;
}

/** Parse agent_status content into AgentStatusData — supports new contract + legacy */
export function parseAgentStatusContent(content: string): AgentStatusData | null {
  try {
    const parsed = JSON.parse(content);

    // New format: { type: "status", phase, steps, meta }
    if (parsed.type === "status") {
      return {
        type: "status",
        phase: parsed.phase || "Bygger",
        title: parsed.meta?.title || parsed.phase || "Bygger",
        steps: parsed.steps || [],
        error: parsed.meta?.error,
        planProgress: parsed.meta?.planProgress,
        activeTasks: parsed.meta?.activeTasks,
      };
    }

    // New format: { type: "review", phase, reviewData, steps }
    if (parsed.type === "review") {
      return {
        type: "review",
        phase: "Venter",
        title: "Review klar",
        steps: parsed.steps || [],
        reviewData: parsed.reviewData,
      };
    }

    // New format: { type: "clarification", phase, questions, steps }
    if (parsed.type === "clarification") {
      return {
        type: "clarification",
        phase: "Venter",
        title: "Trenger avklaring",
        steps: parsed.steps || [],
        questions: parsed.questions,
      };
    }

    // Legacy format: { type: "agent_status", phase, title, steps, ... }
    if (parsed.type === "agent_status") {
      return {
        phase: parsed.phase || "Bygger",
        title: parsed.title || parsed.phase || "Bygger",
        steps: parsed.steps || [],
        error: parsed.error,
        questions: parsed.questions,
        reviewData: parsed.reviewData,
        planProgress: parsed.planProgress,
        activeTasks: parsed.activeTasks,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export interface AgentPhaseProps {
  data: AgentStatusData;
  lastThought?: string;
  onReply?: (answer: string) => void;
  onDismiss?: () => void;
  onApprove?: (reviewId: string) => void;
  onRequestChanges?: (reviewId: string) => void;
  onReject?: (reviewId: string) => void;
  onForceContinue?: (taskId: string) => void;
  onCancelTask?: (taskId: string) => void;
}

/** Fixed phase titles — always use these, never echo content as title */
export const PHASE_TITLES: Record<string, string> = {
  Forbereder: "Forbereder",
  Analyserer: "Analyserer",
  Planlegger: "Planlegger",
  Bygger: "Bygger kode",
  Reviewer: "Reviewer kode",
  Utfører: "Jobber med oppgave",
  Venter: "Trenger avklaring",
  Ferdig: "Oppgave fullført",
  Feilet: "Feil oppstod",
  Stopped: "Oppgave stoppet",
};

/** Get the fixed title for a phase, falling back to the phase name itself */
export function getPhaseTitle(phase: string): string {
  return PHASE_TITLES[phase] || phase;
}

/** Parse clarification messages from AI into structured data */
export function parseClarificationContent(content: string): {
  uncertainties: string[];
  questions: string[];
} {
  const uncertainties: string[] = [];
  const questions: string[] = [];

  // Parse "**Usikkerheter:**" section
  const uncMatch = content.match(/\*\*Usikkerheter:\*\*\s*([\s\S]*?)(?=\*\*Spørsmål:|$)/i);
  if (uncMatch) {
    const lines = uncMatch[1].trim().split(/\n/);
    for (const line of lines) {
      const cleaned = line.replace(/^\d+\.\s*/, "").trim();
      if (cleaned) uncertainties.push(cleaned);
    }
  }

  // Parse "**Spørsmål:**" section
  const qMatch = content.match(/\*\*Spørsmål:\*\*\s*([\s\S]*?)$/i);
  if (qMatch) {
    const lines = qMatch[1].trim().split(/\n/);
    for (const line of lines) {
      const cleaned = line.replace(/^\d+\.\s*/, "").trim();
      if (cleaned) questions.push(cleaned);
    }
  }

  // If no structured content found, treat all questions array items as questions
  return { uncertainties, questions };
}

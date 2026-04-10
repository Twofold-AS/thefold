// Agent message types — mirrors backend agent/messages.ts AgentMessage union

export type AgentMessageType =
  | "status"
  | "thought"
  | "report"
  | "clarification"
  | "review"
  | "completion"
  | "agent_status"
  | "agent_thought"
  | "agent_progress"
  | "agent_report";

// Phase names used by the agent in progress messages
export type AgentPhase =
  | "Forbereder"
  | "Analyserer"
  | "Planlegger"
  | "Bygger"
  | "Reviewer"
  | "Utforer"
  | "Ferdig"
  | "Feilet"
  | "completed"
  | "failed";

export type AgentStatus =
  | "idle"
  | "running"
  | "waiting"
  | "needs_input"
  | "done"
  | "completed"
  | "failed";

// Typed shape of a parsed agent_status / agent_progress message payload
export interface AgentProgressPayload {
  type?: AgentMessageType;
  status?: AgentStatus;
  phase?: AgentPhase | string;
  message?: string;
  steps?: AgentStep[];
  reviewId?: string;
  taskId?: string;
  prUrl?: string;
  error?: string;
}

export interface AgentStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

// Audit log entry
export interface AuditLogEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  actionType: string;
  details: Record<string, unknown>;
  success: boolean | null;
  errorMessage: string | null;
  confidenceScore: number | null;
  taskId: string | null;
  repoName: string | null;
  durationMs: number | null;
}

// Code review types
export type ReviewStatus = "pending" | "approved" | "changes_requested" | "rejected";

export interface ReviewFile {
  path: string;
  content: string;
  action: "create" | "modify" | "delete";
}

export interface AIReviewData {
  documentation: string;
  qualityScore: number;
  concerns: string[];
  memoriesExtracted: string[];
}

export interface CodeReview {
  id: string;
  conversationId: string;
  taskId: string;
  projectTaskId?: string;
  sandboxId: string;
  filesChanged: ReviewFile[];
  aiReview?: AIReviewData;
  status: ReviewStatus;
  reviewerId?: string;
  feedback?: string;
  createdAt: string;
  reviewedAt?: string;
  prUrl?: string;
}

export interface ReviewSummary {
  id: string;
  taskId: string;
  repoName?: string;
  fileCount: number;
  qualityScore: number | null;
  status: string;
  createdAt: string;
  prUrl?: string;
}

// Phase metrics
export interface PhaseMetricsSummary {
  phase: string;
  avgCostUsd: number;
  avgTokensInput: number;
  avgTokensOutput: number;
  avgDurationMs: number;
  totalCostUsd: number;
  totalAiCalls: number;
  taskCount: number;
  p95CostUsd: number;
}

export interface TaskPhaseBreakdown {
  phase: string;
  tokensInput: number;
  tokensOutput: number;
  cachedTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
  aiCalls: number;
}

export interface TaskCostBreakdown {
  taskId: string;
  jobId: string;
  phases: TaskPhaseBreakdown[];
  totalCostUsd: number;
  totalTokens: number;
  totalDurationMs: number;
}

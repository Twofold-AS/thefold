import type { AgentPhase } from "./state-machine";
export type { AgentPhase };

// === Status Constants & Mapping ===

export const TASK_STATUS = {
  BACKLOG: "backlog",
  PLANNED: "planned",
  IN_PROGRESS: "in_progress",
  IN_REVIEW: "in_review",
  DONE: "done",
  BLOCKED: "blocked",
  DELETED: "deleted",
} as const;

/** Map fra project_tasks status til tasks status */
export function mapProjectStatus(projectStatus: string): string {
  const map: Record<string, string> = {
    pending: TASK_STATUS.BACKLOG,
    running: TASK_STATUS.IN_PROGRESS,
    completed: TASK_STATUS.DONE,
    failed: TASK_STATUS.BLOCKED,
    skipped: TASK_STATUS.BLOCKED,
    pending_review: TASK_STATUS.IN_REVIEW,
  };
  return map[projectStatus] || TASK_STATUS.BACKLOG;
}

/** Map fra tasks status til Linear state */
export function mapToLinearState(status: string): string {
  const map: Record<string, string> = {
    backlog: "Backlog",
    planned: "Todo",
    in_progress: "In Progress",
    in_review: "In Review",
    done: "Done",
    blocked: "Blocked",
  };
  return map[status] || "Backlog";
}

// DEL 2A: Meta-reasoning types for the agent loop

export interface DiagnosisResult {
  rootCause: 'bad_plan' | 'implementation_error' | 'missing_context' | 'impossible_task' | 'environment_error';
  reason: string;
  suggestedAction: 'revise_plan' | 'fix_code' | 'fetch_more_context' | 'escalate_to_human' | 'retry';
  confidence: number; // 0-1
}

export interface AgentExecutionContext {
  conversationId: string;
  taskId: string;
  taskDescription: string;
  userMessage: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  // TheFold task engine (optional — for tasks from /tasks service)
  thefoldTaskId?: string;
  // Model routing
  modelMode: 'auto' | 'manual';
  modelOverride?: string;
  selectedModel: string;
  totalCostUsd: number;
  totalTokensUsed: number;
  // Meta-reasoning
  attemptHistory: AttemptRecord[];
  errorPatterns: ErrorPattern[];
  totalAttempts: number;
  maxAttempts: number; // 5
  planRevisions: number;
  maxPlanRevisions: number; // 2
  // Sub-agents
  subAgentsEnabled: boolean;
  subAgentResults?: import("../ai/sub-agents").SubAgentResult[];
  // State machine
  phase?: AgentPhase;
  // Persistent job queue (XD)
  jobId?: string;
}

export interface AttemptRecord {
  stepIndex: number;
  action: string;
  result: 'success' | 'failure';
  error?: string;
  duration: number;
  tokensUsed: number;
}

export interface ErrorPattern {
  pattern: string;
  frequency: number;
  lastSeen: string;
  knownFix?: string;
}

// === Project Orchestrator Types ===

export interface ProjectPlan {
  id: string;
  conversationId: string;
  userRequest: string;
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  currentPhase: number;
  phases: ProjectPhase[];
  conventions: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalCostUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectPhase {
  phase: number;
  name: string;
  description: string;
  tasks: ProjectTask[];
}

export interface ProjectTask {
  id: string;
  projectId: string;
  phase: number;
  taskOrder: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'pending_review';
  dependsOn: string[];
  outputFiles: string[];
  outputTypes: string[];
  contextHints: string[];
  linearTaskId?: string;
  prUrl?: string;
  costUsd: number;
  errorMessage?: string;
  attemptCount: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface CuratedContext {
  relevantFiles: Array<{ path: string; content: string }>;
  dependencyOutputs: Array<{ taskTitle: string; files: string[]; types: string[] }>;
  memoryContext: string[];
  docsContext: string[];
  conventions: string;
  tokenEstimate: number;
}

// === Code Review Types ===

export interface ReviewFile {
  path: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
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
  repoName?: string;
  filesChanged: ReviewFile[];
  aiReview?: AIReviewData;
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  reviewerId?: string;
  feedback?: string;
  createdAt: Date;
  reviewedAt?: Date;
  prUrl?: string;
}

export interface DecomposeProjectRequest {
  userMessage: string;
  repoOwner: string;
  repoName: string;
  projectStructure: string;
  existingFiles?: Array<{ path: string; content: string }>;
}

export interface DecomposeProjectResponse {
  phases: Array<{
    name: string;
    description: string;
    tasks: Array<{
      title: string;
      description: string;
      dependsOnIndices: number[];
      contextHints: string[];
    }>;
  }>;
  conventions: string;
  reasoning: string;
  estimatedTotalTasks: number;
}

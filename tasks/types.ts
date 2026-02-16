export interface Task {
  id: string;
  title: string;
  description: string | null;
  repo: string | null;
  status: TaskStatus;
  priority: number;
  labels: string[];
  phase: string | null;
  dependsOn: string[];
  source: TaskSource;
  linearTaskId: string | null;
  linearSyncedAt: string | null;
  healingSourceId: string | null;
  estimatedComplexity: number | null;
  estimatedTokens: number | null;
  plannedOrder: number | null;
  assignedTo: string;
  buildJobId: string | null;
  prUrl: string | null;
  reviewId: string | null;
  errorMessage?: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type TaskStatus = "backlog" | "planned" | "in_progress" | "in_review" | "done" | "blocked" | "deleted";
export type TaskSource = "manual" | "linear" | "healing" | "marketplace" | "chat" | "orchestrator";

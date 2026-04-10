// Task status as a string-enum — mirrors backend `tasks/types.ts`
export const TaskStatus = {
  Backlog: "backlog",
  Planned: "planned",
  InProgress: "in_progress",
  InReview: "in_review",
  Done: "done",
  Blocked: "blocked",
  Completed: "completed",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export type TaskSource = "manual" | "chat" | "linear" | "healing" | "marketplace";

export interface TheFoldTask {
  id: string;
  title: string;
  description: string;
  repo: string;
  status: TaskStatus | string;
  priority: number;
  labels: string[];
  source: TaskSource | string;
  assignedTo: string;
  buildJobId: string | null;
  prUrl: string | null;
  reviewId: string | null;
  errorMessage: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface LinearTask {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  labels: string[];
}

// Helpers

export function mapTaskStatus(status: string): "done" | "active" | "pending" {
  if (status === "done" || status === "completed") return "done";
  if (status === "in_progress" || status === "in_review") return "active";
  return "pending";
}

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "done":
    case "completed":
      return "done";
    case "in_progress":
      return "aktiv";
    case "in_review":
      return "review";
    case "planned":
      return "planlagt";
    case "backlog":
      return "backlog";
    case "blocked":
      return "blokkert";
    default:
      return status;
  }
}

import { apiFetch } from "./client";

// --- Types ---

export interface LinearTask {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  labels: string[];
}

export interface TheFoldTask {
  id: string;
  title: string;
  description: string;
  repo: string;
  status: string;
  priority: number;
  labels: string[];
  source: string;
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

// --- Linear Tasks ---

export async function getTasks() {
  return apiFetch<{
    tasks: LinearTask[];
  }>("/linear/tasks", {
    method: "POST",
    body: {},
  });
}

export async function getTasksByLabel(label: string) {
  const result = await getTasks();
  return {
    tasks: result.tasks.filter((t) => t.labels.includes(label)),
  };
}

// --- TheFold Task Engine ---

export async function listTheFoldTasks(options?: {
  repo?: string;
  status?: string;
  source?: string;
  labels?: string[];
  limit?: number;
  offset?: number;
}) {
  return apiFetch<{ tasks: TheFoldTask[]; total: number }>("/tasks/list", {
    method: "POST",
    body: options || {},
  });
}

export async function createTask(data: {
  title: string;
  description: string;
  repo?: string;
  priority?: number;
  labels?: string[];
}) {
  return apiFetch<{ task: TheFoldTask }>("/tasks/create", {
    method: "POST",
    body: data,
  });
}

export async function getTask(taskId: string) {
  return apiFetch<{ task: TheFoldTask }>(`/tasks/get?id=${encodeURIComponent(taskId)}`);
}

export async function getTaskStats() {
  return apiFetch<{
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byRepo: Record<string, number>;
  }>("/tasks/stats", { method: "GET" });
}

export async function syncLinearTasks() {
  return apiFetch<{ created: number; updated: number; total: number }>("/tasks/sync-linear", {
    method: "POST",
    body: {},
  });
}

export async function listDeletedTasks(repoName: string) {
  return apiFetch<{ tasks: TheFoldTask[] }>(`/tasks/deleted/${repoName}`);
}

export async function softDeleteTask(taskId: string) {
  return apiFetch<void>("/tasks/soft-delete", { method: "POST", body: { taskId } });
}

export async function restoreTask(taskId: string) {
  return apiFetch<void>("/tasks/restore", { method: "POST", body: { taskId } });
}

export async function permanentDeleteTask(taskId: string) {
  return apiFetch<void>("/tasks/permanent-delete", { method: "POST", body: { taskId } });
}

export async function updateTask(taskId: string, data: {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  labels?: string[];
  repo?: string;
}) {
  return apiFetch<{ task: TheFoldTask }>("/tasks/update", {
    method: "POST",
    body: { taskId, ...data },
  });
}

export async function syncTaskToLinear(taskId: string) {
  return apiFetch<{ linearUrl: string | null; success: boolean }>("/tasks/sync-to-linear", {
    method: "POST",
    body: { taskId },
  });
}

export async function cancelTask(taskId: string) {
  return apiFetch<{ cancelled: boolean }>("/tasks/cancel", { method: "POST", body: { taskId } });
}

export async function respondToClarification(taskId: string, response: string, conversationId: string) {
  return apiFetch<{ success: boolean }>("/agent/respond", {
    method: "POST",
    body: { taskId, response, conversationId },
  });
}

export async function forceContinueTask(taskId: string, conversationId: string) {
  return apiFetch<{ success: boolean }>("/agent/force-continue", {
    method: "POST",
    body: { taskId, conversationId },
  });
}

import { apiFetch } from "./client";

// --- Types ---

export interface BuilderJobSummary {
  id: string;
  taskId: string;
  status: string;
  buildStrategy: string;
  currentPhase: string | null;
  currentStep: number;
  totalSteps: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BuildStepInfo {
  id: string;
  stepNumber: number;
  phase: string;
  action: string;
  filePath: string | null;
  status: string;
  tokensUsed: number;
}

// --- Builder API ---

export async function listBuilderJobs(options?: {
  taskId?: string;
  status?: string;
  repo?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch<{ jobs: BuilderJobSummary[]; total: number }>("/builder/jobs", {
    method: "POST",
    body: options || {},
  });
}

export async function getBuilderJob(jobId: string) {
  return apiFetch<{
    job: BuilderJobSummary;
    steps: BuildStepInfo[];
  }>(`/builder/job?jobId=${encodeURIComponent(jobId)}`, { method: "GET" });
}

// Builder Service types

export type BuildPhase = "init" | "scaffold" | "dependencies" | "implement" | "integrate" | "finalize";
export type BuildStrategy = "sequential" | "scaffold_first" | "dependency_order";
export type BuildStepAction = "create_file" | "modify_file" | "delete_file" | "run_command" | "install_dep" | "validate_file";
export type BuildJobStatus = "pending" | "planning" | "building" | "validating" | "complete" | "failed" | "cancelled";
export type BuildStepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface FileStatus {
  path: string;
  status: "pending" | "success" | "failed" | "skipped";
  attempts: number;
  errors: string[];
}

export interface FileValidation {
  path: string;
  valid: boolean;
  errors: string[];
}

export interface DependencyGraph {
  [filePath: string]: string[]; // file → files it depends on
}

export interface BuilderJob {
  id: string;
  taskId: string;
  sandboxId: string | null;
  status: BuildJobStatus;
  plan: BuildPlan;
  buildStrategy: BuildStrategy;
  currentPhase: BuildPhase | null;
  currentStep: number;
  totalSteps: number;
  filesWritten: FileStatus[];
  filesValidated: FileValidation[];
  buildIterations: number;
  maxIterations: number;
  contextWindow: Record<string, string>;
  dependencyGraph: DependencyGraph;
  totalTokensUsed: number;
  totalCostUsd: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BuildStep {
  id: string;
  jobId: string;
  stepNumber: number;
  phase: BuildPhase;
  action: BuildStepAction;
  filePath: string | null;
  promptContext: Record<string, unknown> | null;
  aiModel: string | null;
  tokensUsed: number;
  status: BuildStepStatus;
  content: string | null;
  output: string | null;
  error: string | null;
  validationResult: Record<string, unknown> | null;
  fixAttempts: number;
  createdAt: string;
  completedAt: string | null;
}

// Plan from agent's ai.planTask()
export interface BuildPlan {
  description: string;
  repo: string;
  repoOwner: string;
  repoName: string;
  model: string;
  steps: BuildPlanStep[];
}

export interface BuildPlanStep {
  action: "create_file" | "modify_file" | "delete_file" | "run_command";
  filePath?: string;
  description?: string;
  content?: string;
  command?: string;
}

export interface BuildResult {
  jobId: string;
  success: boolean;
  filesChanged: Array<{ path: string; content: string; action: "create" | "modify" | "delete" }>;
  totalTokensUsed: number;
  totalCostUsd: number;
  validationOutput: string;
  errors: string[];
}

// --- Request/Response types ---

export interface StartBuildRequest {
  taskId: string;
  sandboxId: string;
  plan: BuildPlan;
}

export interface StartBuildResponse {
  jobId: string;
  result: BuildResult;
}

export interface BuildStatusRequest {
  jobId: string;
}

export interface BuildStatusResponse {
  job: BuilderJob;
  steps: BuildStep[];
}

export interface CancelBuildRequest {
  jobId: string;
}

export interface CancelBuildResponse {
  cancelled: boolean;
}

export interface GetJobRequest {
  jobId: string;
}

export interface ListJobsRequest {
  taskId?: string;
  status?: BuildJobStatus;
  repo?: string;
  limit?: number;
  offset?: number;
}

export interface ListJobsResponse {
  jobs: BuilderJob[];
  total: number;
}

export interface BuildProgressEvent {
  jobId: string;
  taskId: string;
  phase: BuildPhase;
  step: number;
  totalSteps: number;
  currentFile: string | null;
  status: "started" | "completed" | "failed";
  message: string;
}

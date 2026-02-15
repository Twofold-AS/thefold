// Builder Service — TheFold's hands
// Orchestrates file-by-file code building with dependency analysis

import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type {
  BuilderJob, BuildStep, BuildResult,
  BuildJobStatus, BuildStepStatus, BuildPhase,
  StartBuildRequest, StartBuildResponse,
  BuildStatusRequest, BuildStatusResponse,
  CancelBuildRequest, CancelBuildResponse,
  GetJobRequest, ListJobsRequest, ListJobsResponse,
  FileStatus, FileValidation,
} from "./types";
import { db, updateJobPhase, updateJobStatus, updateJobCost } from "./db";
import { initPhase, scaffoldPhase, dependenciesPhase, implementPhase, integratePhase, finalizePhase } from "./phases";

// --- Helpers ---

function parseJsonb<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val as T;
}

function parseJob(row: Record<string, unknown>): BuilderJob {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    sandboxId: (row.sandbox_id as string) || null,
    status: row.status as BuildJobStatus,
    plan: parseJsonb(row.plan, { description: "", repo: "", repoOwner: "", repoName: "", model: "", steps: [] }),
    buildStrategy: (row.build_strategy as string) as BuilderJob["buildStrategy"],
    currentPhase: (row.current_phase as string) as BuildPhase || null,
    currentStep: (row.current_step as number) || 0,
    totalSteps: (row.total_steps as number) || 0,
    filesWritten: parseJsonb<FileStatus[]>(row.files_written, []),
    filesValidated: parseJsonb<FileValidation[]>(row.files_validated, []),
    buildIterations: (row.build_iterations as number) || 0,
    maxIterations: (row.max_iterations as number) || 10,
    contextWindow: parseJsonb<Record<string, string>>(row.context_window, {}),
    dependencyGraph: parseJsonb(row.dependency_graph, {}),
    totalTokensUsed: (row.total_tokens_used as number) || 0,
    totalCostUsd: Number(row.total_cost_usd) || 0,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
  };
}

function parseStep(row: Record<string, unknown>): BuildStep {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    stepNumber: row.step_number as number,
    phase: row.phase as BuildPhase,
    action: row.action as BuildStep["action"],
    filePath: (row.file_path as string) || null,
    promptContext: parseJsonb(row.prompt_context, null),
    aiModel: (row.ai_model as string) || null,
    tokensUsed: (row.tokens_used as number) || 0,
    status: row.status as BuildStepStatus,
    content: (row.content as string) || null,
    output: (row.output as string) || null,
    error: (row.error as string) || null,
    validationResult: parseJsonb(row.validation_result, null),
    fixAttempts: (row.fix_attempts as number) || 0,
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

// --- Core build orchestration ---

async function executeBuild(job: BuilderJob): Promise<BuildResult> {
  try {
    // Phase 1: Init
    await updateJobPhase(job.id, "init");
    await updateJobStatus(job.id, "planning");
    await initPhase(job);

    // Phase 2: Scaffold (only for new projects)
    if (job.buildStrategy === "scaffold_first") {
      await updateJobPhase(job.id, "scaffold");
      await scaffoldPhase(job);
    }

    // Phase 3: Dependencies
    await updateJobPhase(job.id, "dependencies");
    await dependenciesPhase(job);

    // Phase 4: Implement (file-by-file)
    await updateJobPhase(job.id, "implement");
    await updateJobStatus(job.id, "building");
    await implementPhase(job);

    // Phase 5: Integrate (full validation)
    await updateJobPhase(job.id, "integrate");
    await updateJobStatus(job.id, "validating");
    const integration = await integratePhase(job);

    // Phase 6: Finalize
    await updateJobPhase(job.id, "finalize");
    const result = await finalizePhase(job, integration.output);

    if (!integration.success) {
      result.success = false;
      result.errors = integration.errors;
    }

    // Update final status
    await updateJobStatus(job.id, result.success ? "complete" : "failed");
    await updateJobCost(job.id, job.totalTokensUsed, job.totalCostUsd);
    await db.exec`
      UPDATE builder_jobs
      SET files_written = ${JSON.stringify(job.filesWritten)}::jsonb,
          build_iterations = ${job.buildIterations},
          context_window = ${JSON.stringify(job.contextWindow)}::jsonb
      WHERE id = ${job.id}::uuid
    `;

    return result;

  } catch (err) {
    log.error(err, "build execution failed");
    await updateJobStatus(job.id, "failed");
    return {
      jobId: job.id,
      success: false,
      filesChanged: [],
      totalTokensUsed: job.totalTokensUsed,
      totalCostUsd: job.totalCostUsd,
      validationOutput: "",
      errors: [String(err)],
    };
  }
}

// --- Endpoints ---

export const start = api(
  { method: "POST", path: "/builder/start", expose: false },
  async (req: StartBuildRequest): Promise<StartBuildResponse> => {
    const row = await db.queryRow<{ id: string }>`
      INSERT INTO builder_jobs (task_id, sandbox_id, plan, status, started_at)
      VALUES (${req.taskId}, ${req.sandboxId}, ${JSON.stringify(req.plan)}::jsonb, 'pending', NOW())
      RETURNING id
    `;

    if (!row) throw APIError.internal("failed to create builder job");

    const job: BuilderJob = {
      id: row.id,
      taskId: req.taskId,
      sandboxId: req.sandboxId,
      status: "pending",
      plan: req.plan,
      buildStrategy: "sequential",
      currentPhase: null,
      currentStep: 0,
      totalSteps: 0,
      filesWritten: [],
      filesValidated: [],
      buildIterations: 0,
      maxIterations: 10,
      contextWindow: {},
      dependencyGraph: {},
      totalTokensUsed: 0,
      totalCostUsd: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString(),
    };

    const result = await executeBuild(job);

    return { jobId: job.id, result };
  }
);

export const status = api(
  { method: "POST", path: "/builder/status", expose: false },
  async (req: BuildStatusRequest): Promise<BuildStatusResponse> => {
    const jobRow = await db.queryRow<Record<string, unknown>>`
      SELECT * FROM builder_jobs WHERE id = ${req.jobId}::uuid
    `;
    if (!jobRow) throw APIError.notFound("builder job not found");

    const steps: BuildStep[] = [];
    const stepRows = await db.query<Record<string, unknown>>`
      SELECT * FROM build_steps WHERE job_id = ${req.jobId}::uuid ORDER BY step_number
    `;
    for await (const row of stepRows) {
      steps.push(parseStep(row));
    }

    return { job: parseJob(jobRow), steps };
  }
);

export const cancel = api(
  { method: "POST", path: "/builder/cancel", expose: false },
  async (req: CancelBuildRequest): Promise<CancelBuildResponse> => {
    const result = await db.queryRow<{ id: string }>`
      UPDATE builder_jobs
      SET status = 'cancelled', completed_at = NOW()
      WHERE id = ${req.jobId}::uuid AND status NOT IN ('complete', 'failed', 'cancelled')
      RETURNING id
    `;

    return { cancelled: !!result };
  }
);

export const getJob = api(
  { method: "GET", path: "/builder/job", expose: true, auth: true },
  async (req: GetJobRequest): Promise<BuildStatusResponse> => {
    return status(req);
  }
);

export const listJobs = api(
  { method: "POST", path: "/builder/jobs", expose: true, auth: true },
  async (req: ListJobsRequest): Promise<ListJobsResponse> => {
    const limit = req.limit || 20;
    const offset = req.offset || 0;

    let jobs: BuilderJob[] = [];
    let total = 0;

    if (req.repo) {
      // Filter by repo name stored in plan JSONB
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM builder_jobs WHERE plan->>'repoName' = ${req.repo}
      `;
      total = countRow?.count || 0;
      const rows = await db.query<Record<string, unknown>>`
        SELECT * FROM builder_jobs WHERE plan->>'repoName' = ${req.repo}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) jobs.push(parseJob(row));
    } else if (req.taskId && req.status) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM builder_jobs WHERE task_id = ${req.taskId} AND status = ${req.status}
      `;
      total = countRow?.count || 0;
      const rows = await db.query<Record<string, unknown>>`
        SELECT * FROM builder_jobs WHERE task_id = ${req.taskId} AND status = ${req.status}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) jobs.push(parseJob(row));
    } else if (req.taskId) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM builder_jobs WHERE task_id = ${req.taskId}
      `;
      total = countRow?.count || 0;
      const rows = await db.query<Record<string, unknown>>`
        SELECT * FROM builder_jobs WHERE task_id = ${req.taskId}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) jobs.push(parseJob(row));
    } else if (req.status) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM builder_jobs WHERE status = ${req.status}
      `;
      total = countRow?.count || 0;
      const rows = await db.query<Record<string, unknown>>`
        SELECT * FROM builder_jobs WHERE status = ${req.status}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) jobs.push(parseJob(row));
    } else {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM builder_jobs
      `;
      total = countRow?.count || 0;
      const rows = await db.query<Record<string, unknown>>`
        SELECT * FROM builder_jobs ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) jobs.push(parseJob(row));
    }

    return { jobs, total };
  }
);

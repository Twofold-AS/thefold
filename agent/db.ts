import { SQLDatabase } from "encore.dev/storage/sqldb";

// Shared database reference for the agent service
export const db = new SQLDatabase("agent", { migrations: "./migrations" });

// --- Advisory Lock per Repo (concurrency protection) ---

/**
 * Acquire a non-blocking advisory lock for a repo (owner/name).
 * Uses pg_try_advisory_lock with hashtext — returns true if acquired, false if already held.
 * Lock is session-level and must be released with releaseRepoLock().
 */
export async function acquireRepoLock(repoOwner: string, repoName: string): Promise<boolean> {
  const key = `${repoOwner}/${repoName}`;
  const row = await db.queryRow<{ locked: boolean }>`
    SELECT pg_try_advisory_lock(hashtext(${key})) as locked
  `;
  return row?.locked ?? false;
}

/**
 * Release a previously acquired advisory lock for a repo.
 */
export async function releaseRepoLock(repoOwner: string, repoName: string): Promise<void> {
  const key = `${repoOwner}/${repoName}`;
  await db.queryRow`
    SELECT pg_advisory_unlock(hashtext(${key}))
  `;
}

// --- Agent Jobs (persistent job tracking) ---

export interface AgentJob {
  id: string;
  taskId: string;
  conversationId: string;
  repoOwner: string;
  repoName: string;
  status: "pending" | "running" | "completed" | "failed" | "expired" | "resuming";
  currentPhase: string | null;
  checkpoint: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  costUsd: number;
  tokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** Create a new job with status=pending */
export async function createJob(params: {
  taskId: string;
  conversationId: string;
  repoOwner: string;
  repoName: string;
}): Promise<string> {
  const row = await db.queryRow<{ id: string }>`
    INSERT INTO agent_jobs (task_id, conversation_id, repo_owner, repo_name, status)
    VALUES (${params.taskId}, ${params.conversationId}, ${params.repoOwner}, ${params.repoName}, 'pending')
    RETURNING id
  `;
  return row!.id;
}

/** Set job to running, increment attempts */
export async function startJob(jobId: string): Promise<void> {
  await db.exec`
    UPDATE agent_jobs
    SET status = 'running', started_at = NOW(), updated_at = NOW(), attempts = attempts + 1
    WHERE id = ${jobId}::uuid
  `;
}

/** Save phase checkpoint (called after each major step) */
export async function updateJobCheckpoint(
  jobId: string,
  phase: string,
  checkpoint: Record<string, unknown>,
  costDelta?: { costUsd: number; tokensUsed: number }
): Promise<void> {
  if (costDelta) {
    await db.exec`
      UPDATE agent_jobs
      SET current_phase = ${phase},
          checkpoint = ${JSON.stringify(checkpoint)}::jsonb,
          cost_usd = cost_usd + ${costDelta.costUsd},
          tokens_used = tokens_used + ${costDelta.tokensUsed},
          updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
  } else {
    await db.exec`
      UPDATE agent_jobs
      SET current_phase = ${phase},
          checkpoint = ${JSON.stringify(checkpoint)}::jsonb,
          updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
  }
}

/** Mark job as completed */
export async function completeJob(jobId: string): Promise<void> {
  await db.exec`
    UPDATE agent_jobs
    SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE id = ${jobId}::uuid
  `;
}

/** Mark job as failed with error message */
export async function failJob(jobId: string, error: string): Promise<void> {
  await db.exec`
    UPDATE agent_jobs
    SET status = 'failed', error = ${error}, updated_at = NOW()
    WHERE id = ${jobId}::uuid
  `;
}

/** Find jobs that were running when process last crashed */
export async function findResumableJobs(): Promise<AgentJob[]> {
  const rows = db.query<{
    id: string; task_id: string; conversation_id: string;
    repo_owner: string; repo_name: string; status: string;
    current_phase: string | null; checkpoint: unknown;
    attempts: number; max_attempts: number; error: string | null;
    cost_usd: string; tokens_used: number;
    created_at: Date; updated_at: Date;
    started_at: Date | null; completed_at: Date | null;
  }>`
    SELECT id, task_id, conversation_id, repo_owner, repo_name,
           status, current_phase, checkpoint, attempts, max_attempts,
           error, cost_usd, tokens_used,
           created_at, updated_at, started_at, completed_at
    FROM agent_jobs
    WHERE status = 'running'
      AND attempts < max_attempts
      AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY updated_at DESC
  `;
  const jobs: AgentJob[] = [];
  for await (const row of rows) {
    jobs.push({
      id: row.id,
      taskId: row.task_id,
      conversationId: row.conversation_id,
      repoOwner: row.repo_owner,
      repoName: row.repo_name,
      status: row.status as AgentJob["status"],
      currentPhase: row.current_phase,
      checkpoint: (typeof row.checkpoint === "string" ? JSON.parse(row.checkpoint) : row.checkpoint) as Record<string, unknown>,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      error: row.error,
      costUsd: parseFloat(row.cost_usd),
      tokensUsed: row.tokens_used,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    });
  }
  return jobs;
}

/** Expire old pending/running jobs (>7 days) */
export async function expireOldJobs(): Promise<number> {
  await db.exec`
    UPDATE agent_jobs
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('pending', 'running')
      AND created_at < NOW() - INTERVAL '7 days'
  `;
  return 0; // Encore exec does not return affected row count
}

/** Get the active (running or pending) job for a repo */
export async function getActiveJobForRepo(repoOwner: string, repoName: string): Promise<AgentJob | null> {
  const row = await db.queryRow<{
    id: string; task_id: string; conversation_id: string;
    repo_owner: string; repo_name: string; status: string;
    current_phase: string | null; checkpoint: unknown;
    attempts: number; max_attempts: number; error: string | null;
    cost_usd: string; tokens_used: number;
    created_at: Date; updated_at: Date;
    started_at: Date | null; completed_at: Date | null;
  }>`
    SELECT id, task_id, conversation_id, repo_owner, repo_name,
           status, current_phase, checkpoint, attempts, max_attempts,
           error, cost_usd, tokens_used,
           created_at, updated_at, started_at, completed_at
    FROM agent_jobs
    WHERE repo_owner = ${repoOwner}
      AND repo_name = ${repoName}
      AND status IN ('running', 'pending')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    conversationId: row.conversation_id,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    status: row.status as AgentJob["status"],
    currentPhase: row.current_phase,
    checkpoint: (typeof row.checkpoint === "string" ? JSON.parse(row.checkpoint) : row.checkpoint) as Record<string, unknown>,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    error: row.error,
    costUsd: parseFloat(row.cost_usd),
    tokensUsed: row.tokens_used,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

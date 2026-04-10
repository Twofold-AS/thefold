import log from "encore.dev/log";
import { db } from "./db";
import { agentErrorEvents } from "./event-bus";

// --- Types ---

export interface HeartbeatRecord {
  taskId: string;
  jobId: string;
  phase: string;
  lastHeartbeatAt: string;
  /** Milliseconds since last heartbeat */
  silentMs: number;
}

export interface RecoveryResult {
  taskId: string;
  jobId: string;
  recovered: boolean;
  resumedFromPhase: string | null;
  message: string;
}

// --- Constants ---

/** If no heartbeat for this long, consider the agent crashed */
const CRASH_THRESHOLD_MS = 30_000;

// --- In-process heartbeat registry ---
// Maps jobId → last heartbeat timestamp (ms)
const heartbeats = new Map<string, number>();

/**
 * Update heartbeat for a running job.
 * Call this from inside long-running agent phases.
 */
export function recordHeartbeat(jobId: string): void {
  heartbeats.set(jobId, Date.now());
}

/**
 * Check if a job appears to have crashed (no heartbeat for CRASH_THRESHOLD_MS).
 */
export function isCrashed(jobId: string): boolean {
  const last = heartbeats.get(jobId);
  if (last == null) return false; // Never registered — don't assume crashed
  return Date.now() - last > CRASH_THRESHOLD_MS;
}

// --- Crash detection ---

/**
 * Scan all running jobs in DB and return any that appear crashed
 * based on the in-process heartbeat registry.
 */
export async function detectCrashedAgents(): Promise<HeartbeatRecord[]> {
  const crashed: HeartbeatRecord[] = [];

  const rows = db.query<{
    id: string;
    task_id: string;
    current_phase: string | null;
    updated_at: Date;
  }>`
    SELECT id, task_id, current_phase, updated_at
    FROM agent_jobs
    WHERE status = 'running'
    ORDER BY updated_at ASC
  `;

  for await (const row of rows) {
    const jobId = row.id;
    const last = heartbeats.get(jobId);
    // Consider crashed if heartbeat registered but silent > threshold,
    // OR if updated_at is stale and the job is "running" in DB
    const dbSilentMs = Date.now() - row.updated_at.getTime();
    const hbSilentMs = last != null ? Date.now() - last : dbSilentMs;

    if (hbSilentMs > CRASH_THRESHOLD_MS || dbSilentMs > CRASH_THRESHOLD_MS * 2) {
      crashed.push({
        taskId: row.task_id,
        jobId,
        phase: row.current_phase ?? "unknown",
        lastHeartbeatAt: last
          ? new Date(last).toISOString()
          : row.updated_at.toISOString(),
        silentMs: Math.min(hbSilentMs, dbSilentMs),
      });
    }
  }

  return crashed;
}

// --- Recovery ---

/**
 * Attempt to recover a crashed agent by resuming from the last successful checkpoint.
 *
 * Strategy:
 * 1. Read the last successful checkpoint from agent_jobs.checkpoint
 * 2. Mark the job as recoverable (status → 'pending', phase reset)
 * 3. Emit an agent.status event so chat/UI knows recovery is in progress
 * 4. The job queue will pick it up on the next poll cycle
 */
export async function recoverAgent(taskId: string): Promise<RecoveryResult> {
  log.info("Attempting agent recovery", { taskId });

  // Find the crashed job
  const job = await db.queryRow<{
    id: string;
    task_id: string;
    current_phase: string | null;
    checkpoint: string | null;
    attempts: number;
    max_attempts: number;
    conversation_id: string | null;
  }>`
    SELECT id, task_id, current_phase, checkpoint, attempts, max_attempts, conversation_id
    FROM agent_jobs
    WHERE task_id = ${taskId} AND status = 'running'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!job) {
    return {
      taskId,
      jobId: "",
      recovered: false,
      resumedFromPhase: null,
      message: "No running job found for this task",
    };
  }

  // Check if we've exhausted retries
  if (job.attempts >= job.max_attempts) {
    log.warn("Agent crash recovery aborted — max attempts reached", {
      taskId,
      jobId: job.id,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
    });

    // Fail the job permanently and notify
    await db.exec`
      UPDATE agent_jobs
      SET status = 'failed',
          error  = 'Crashed and max recovery attempts reached',
          updated_at = NOW()
      WHERE id = ${job.id}
    `;

    await agentErrorEvents.publish({
      taskId,
      conversationId: job.conversation_id ?? undefined,
      error: "Crashed and max recovery attempts reached",
      phase: job.current_phase ?? "unknown",
      attempts: job.attempts,
      createdAt: new Date().toISOString(),
    });

    return {
      taskId,
      jobId: job.id,
      recovered: false,
      resumedFromPhase: null,
      message: "Max recovery attempts reached — task marked as failed",
    };
  }

  // Parse the last checkpoint to determine resume phase
  let resumePhase: string | null = null;
  if (job.checkpoint) {
    try {
      const cp = JSON.parse(job.checkpoint) as { phase?: string };
      resumePhase = cp.phase ?? null;
    } catch {
      // Malformed checkpoint — start from beginning
    }
  }

  // Reset job to pending so the queue picks it up again
  await db.exec`
    UPDATE agent_jobs
    SET status     = 'pending',
        current_phase = ${resumePhase},
        updated_at = NOW()
    WHERE id = ${job.id}
  `;

  // Clear stale heartbeat so detectCrashedAgents won't immediately re-flag it
  heartbeats.delete(job.id);

  log.info("Agent recovery queued", {
    taskId,
    jobId: job.id,
    resumePhase,
    attempt: job.attempts + 1,
  });

  return {
    taskId,
    jobId: job.id,
    recovered: true,
    resumedFromPhase: resumePhase,
    message: resumePhase
      ? `Queued for recovery — resuming from phase: ${resumePhase}`
      : "Queued for recovery — restarting from beginning",
  };
}

// --- Background monitor ---

let _monitorTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a background monitor that checks for crashed agents every 15 seconds
 * and automatically triggers recovery.
 *
 * Returns a stop function.
 */
export function startCrashMonitor(): () => void {
  if (_monitorTimer) return () => {};

  _monitorTimer = setInterval(async () => {
    try {
      const crashed = await detectCrashedAgents();
      for (const { taskId, jobId, phase, silentMs } of crashed) {
        log.warn("Crashed agent detected — initiating recovery", {
          taskId,
          jobId,
          phase,
          silentMs,
        });
        const result = await recoverAgent(taskId);
        log.info("Recovery result", { taskId, recovered: result.recovered, message: result.message });
      }
    } catch (err) {
      log.warn("Crash monitor error", { error: err instanceof Error ? err.message : String(err) });
    }
  }, 15_000);

  return () => {
    if (_monitorTimer) {
      clearInterval(_monitorTimer);
      _monitorTimer = null;
    }
  };
}

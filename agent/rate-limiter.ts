import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { db } from "./db";

export const MAX_TASKS_PER_HOUR = 20;
export const MAX_TASKS_PER_DAY = 100;

/**
 * Check if a user is within rate limits for starting agent tasks (ASI02).
 * Returns { allowed: true } if under limits, otherwise { allowed: false, reason }.
 */
export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);

  const hourCount = await db.queryRow<{ count: number }>`
    SELECT COALESCE(SUM(task_count), 0)::int as count
    FROM agent_rate_limits
    WHERE user_id = ${userId}
      AND window_start >= ${hourStart.toISOString()}::timestamptz
  `;

  if ((hourCount?.count || 0) >= MAX_TASKS_PER_HOUR) {
    return { allowed: false, reason: `Rate limit: maks ${MAX_TASKS_PER_HOUR} tasks per time` };
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const dayCount = await db.queryRow<{ count: number }>`
    SELECT COALESCE(SUM(task_count), 0)::int as count
    FROM agent_rate_limits
    WHERE user_id = ${userId}
      AND window_start >= ${dayStart.toISOString()}::timestamptz
  `;

  if ((dayCount?.count || 0) >= MAX_TASKS_PER_DAY) {
    return { allowed: false, reason: `Rate limit: maks ${MAX_TASKS_PER_DAY} tasks per dag` };
  }

  return { allowed: true };
}

/**
 * Record a task start for rate limit tracking.
 * Uses upsert to increment the counter for the current hourly window.
 */
export async function recordTaskStart(userId: string): Promise<void> {
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);

  await db.exec`
    INSERT INTO agent_rate_limits (user_id, window_start, task_count)
    VALUES (${userId}, ${hourStart.toISOString()}::timestamptz, 1)
    ON CONFLICT (user_id, window_start)
    DO UPDATE SET task_count = agent_rate_limits.task_count + 1
  `;
}

// --- Cleanup endpoint + cron ---

interface CleanupRateLimitsResponse {
  deleted: number;
}

export const cleanupRateLimits = api(
  { method: "POST", path: "/agent/cleanup-rate-limits", expose: false },
  async (): Promise<CleanupRateLimitsResponse> => {
    const result = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM agent_rate_limits
        WHERE window_start < NOW() - INTERVAL '48 hours'
        RETURNING user_id
      )
      SELECT COUNT(*)::int as count FROM deleted
    `;
    return { deleted: result?.count ?? 0 };
  }
);

const _rateLimitCleanup = new CronJob("cleanup-rate-limits", {
  title: "Clean up old rate limit records",
  schedule: "0 3 * * *",
  endpoint: cleanupRateLimits,
});

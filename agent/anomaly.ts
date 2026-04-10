import { db } from "./db";
import log from "encore.dev/log";

type Severity = "info" | "warning" | "critical";

interface AnomalyCheck {
  metric: string;
  value: number;
  taskId?: string;
}

/**
 * Update Welford running stats (mean + variance) for the given metric.
 * Uses an incremental Welford online algorithm to avoid storing all samples.
 */
async function updateBaseline(
  metric: string,
  value: number,
): Promise<{ mean: number; stddev: number; n: number }> {
  const row = await db.queryRow<{ mean: number; stddev: number; sample_count: number }>`
    SELECT mean, stddev, sample_count FROM anomaly_baselines WHERE metric = ${metric}
  `;

  const n = (row?.sample_count ?? 0) + 1;
  const oldMean = row?.mean ?? value;
  const newMean = oldMean + (value - oldMean) / n;
  const oldVar = (row?.stddev ?? 1) ** 2;
  const newVar =
    n === 1 ? 0 : (oldVar * (n - 2) + (value - oldMean) * (value - newMean)) / (n - 1);
  const newStddev = Math.sqrt(Math.max(newVar, 0.01));

  await db.exec`
    INSERT INTO anomaly_baselines (metric, mean, stddev, sample_count)
    VALUES (${metric}, ${newMean}, ${newStddev}, ${n})
    ON CONFLICT (metric) DO UPDATE SET
      mean = ${newMean}, stddev = ${newStddev}, sample_count = ${n}, updated_at = NOW()
  `;

  return { mean: newMean, stddev: newStddev, n };
}

/**
 * Check a metric value against its statistical baseline.
 * Returns the anomaly severity if detected, null if within normal range.
 *
 * Thresholds (sigma):
 *   > 3.0 → critical
 *   > 2.5 → warning
 *   > 2.0 → info
 *
 * Requires at least 10 samples before anomaly detection kicks in.
 */
export async function checkAnomaly(check: AnomalyCheck): Promise<Severity | null> {
  const { mean, stddev, n } = await updateBaseline(check.metric, check.value);

  // Need enough samples for meaningful detection
  if (n < 10) return null;

  const sigmas = Math.abs(check.value - mean) / stddev;
  let severity: Severity | null = null;

  if (sigmas > 3) severity = "critical";
  else if (sigmas > 2.5) severity = "warning";
  else if (sigmas > 2) severity = "info";

  if (severity) {
    await db.exec`
      INSERT INTO anomaly_alerts (metric, expected_value, actual_value, deviation_sigmas, severity, task_id)
      VALUES (
        ${check.metric},
        ${mean},
        ${check.value},
        ${sigmas},
        ${severity},
        ${check.taskId ?? null}::uuid
      )
    `;
    log.warn("anomaly detected", {
      metric: check.metric,
      value: check.value,
      mean,
      stddev,
      sigmas,
      severity,
      taskId: check.taskId,
    });
  }

  return severity;
}

/**
 * Check token usage anomaly for a completed task.
 * Fire-and-forget safe — catches all errors internally.
 */
export async function checkTokenAnomaly(tokensUsed: number, taskId?: string): Promise<void> {
  await checkAnomaly({ metric: "tokens_per_task", value: tokensUsed, taskId });
}

/**
 * Check cost (USD) anomaly for a completed task.
 * Fire-and-forget safe — catches all errors internally.
 */
export async function checkCostAnomaly(costUsd: number, taskId?: string): Promise<void> {
  await checkAnomaly({ metric: "cost_per_task_usd", value: costUsd, taskId });
}

/**
 * Check retry count anomaly for a completed task.
 * Fire-and-forget safe — catches all errors internally.
 */
export async function checkRetryAnomaly(retries: number, taskId?: string): Promise<void> {
  await checkAnomaly({ metric: "retries_per_task", value: retries, taskId });
}

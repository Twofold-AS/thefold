// Shared database and helpers for builder service
// Extracted to avoid circular dependency between builder.ts and phases.ts

import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic } from "encore.dev/pubsub";
import type { BuildProgressEvent, BuildPhase, BuildJobStatus } from "./types";

export const db = new SQLDatabase("builder", {
  migrations: "./migrations",
});

export const buildProgress = new Topic<BuildProgressEvent>("build-progress", {
  deliveryGuarantee: "at-least-once",
});

export async function recordStep(
  jobId: string, stepNumber: number, phase: string, action: string, filePath: string | null,
  data: { status: string; content?: string; output?: string; error?: string | null; tokensUsed?: number; aiModel?: string; validationResult?: Record<string, unknown> | null }
) {
  await db.exec`
    INSERT INTO build_steps (job_id, step_number, phase, action, file_path, status, content, output, error, tokens_used, ai_model, validation_result, completed_at)
    VALUES (${jobId}::uuid, ${stepNumber}, ${phase}, ${action}, ${filePath},
            ${data.status}, ${data.content || null}, ${data.output || null}, ${data.error || null},
            ${data.tokensUsed || 0}, ${data.aiModel || null},
            ${data.validationResult ? JSON.stringify(data.validationResult) : null}::jsonb,
            ${data.status === "success" || data.status === "failed" ? new Date().toISOString() : null}::timestamptz)
  `;
}

export async function updateJobPhase(jobId: string, phase: BuildPhase) {
  await db.exec`UPDATE builder_jobs SET current_phase = ${phase} WHERE id = ${jobId}::uuid`;
}

export async function updateJobStatus(jobId: string, status: BuildJobStatus) {
  const now = status === "complete" || status === "failed" ? new Date().toISOString() : null;
  if (now) {
    await db.exec`UPDATE builder_jobs SET status = ${status}, completed_at = ${now}::timestamptz WHERE id = ${jobId}::uuid`;
  } else {
    await db.exec`UPDATE builder_jobs SET status = ${status} WHERE id = ${jobId}::uuid`;
  }
}

export async function updateJobCost(jobId: string, tokens: number, cost: number) {
  await db.exec`
    UPDATE builder_jobs
    SET total_tokens_used = ${tokens}, total_cost_usd = ${cost}
    WHERE id = ${jobId}::uuid
  `;
}

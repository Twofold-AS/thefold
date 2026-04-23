import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { memory } from "~encore/clients";
import { db } from "./db";

export const runSleepCycle = api(
  { method: "POST", path: "/agent/sleep/run", expose: false },
  async (): Promise<{ status: string; logId: string; summary: Record<string, number> }> => {
    // Create sleep log entry (Fase G: starts at phase 0/4)
    const logRow = await db.queryRow<{ id: string }>`
      INSERT INTO sleep_logs (started_at, status, current_phase, current_phase_label, total_phases)
      VALUES (NOW(), 'running', 0, 'Starter', 4)
      RETURNING id
    `;
    const logId = logRow!.id;

    const summary: Record<string, number> = {
      reviewed: 0,
      archived: 0,
      promoted: 0,
      merged: 0,
    };

    // Fase G: helper to update the phase progress surfaced by /agent/sleep/status
    const setPhase = async (phase: number, label: string) => {
      await db.exec`
        UPDATE sleep_logs SET current_phase = ${phase}, current_phase_label = ${label}
        WHERE id = ${logId}::uuid
      `;
    };

    try {
      await setPhase(1, "Arkiverer svake regler");
      // STEP 1: Archive — low-confidence rules not applied in 30+ days
      const archiveResult = await memory.archiveKnowledge();
      summary.archived = archiveResult.archived;

      await setPhase(2, "Gjennomgår kunnskap");
      // STEP 2: Review — fetch low-to-mid confidence rules for awareness
      // (listing them counts as reviewed; no AI call needed for basic sleep maintenance)
      const reviewResult = await memory.listKnowledge({ status: "active", limit: 20 });
      const toReview = reviewResult.items.filter(
        (r) => r.confidence >= 0.3 && r.confidence <= 0.5
      );
      summary.reviewed = toReview.length;

      await setPhase(3, "Promoterer sterke regler");
      // STEP 3: Promote — high-confidence, frequently-used rules
      const promoteResult = await memory.promoteKnowledge();
      summary.promoted = promoteResult.promoted;

      await setPhase(4, "Konsoliderer duplikater");
      // STEP 4: Merge duplicates — archive near-duplicate rules sharing a common prefix
      const mergeResult = await memory.mergeKnowledgeDuplicates();
      summary.merged = mergeResult.merged;

      // Update sleep log with results
      await db.exec`
        UPDATE sleep_logs SET
          completed_at = NOW(),
          knowledge_reviewed = ${summary.reviewed},
          knowledge_archived = ${summary.archived},
          knowledge_promoted = ${summary.promoted},
          knowledge_merged = ${summary.merged},
          status = 'completed',
          report = ${JSON.stringify(summary)}::jsonb
        WHERE id = ${logId}::uuid
      `;

      log.info("sleep cycle completed", { logId, ...summary });
      return { status: "completed", logId, summary };
    } catch (err) {
      await db.exec`
        UPDATE sleep_logs SET status = 'failed', completed_at = NOW() WHERE id = ${logId}::uuid
      `;
      log.error("sleep cycle failed", { logId, error: String(err) });
      throw err;
    }
  }
);

// CronJob: Sunday 03:00 UTC — doesn't conflict with monitor/registry which run at different times
const _weeklySleep = new CronJob("weekly-sleep", {
  title: "Weekly knowledge maintenance",
  schedule: "0 3 * * 0",
  endpoint: runSleepCycle,
});

// GET /agent/sleep/status — Live status for the dream widget (Fase G, Commit 37)
// Any authenticated user can see it — sleep is global, not per-user.

export interface SleepStatus {
  isRunning: boolean;
  startedAt?: string;
  elapsedSeconds?: number;
  phase?: string;
  progress?: { step: number; total: number };
}

export const sleepStatus = api(
  { method: "GET", path: "/agent/sleep/status", expose: true, auth: true },
  async (): Promise<SleepStatus> => {
    const row = await db.queryRow<{
      id: string;
      started_at: string;
      current_phase: number | null;
      current_phase_label: string | null;
      total_phases: number | null;
    }>`
      SELECT id, started_at, current_phase, current_phase_label, total_phases
      FROM sleep_logs
      WHERE status = 'running' AND completed_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `;

    if (!row) return { isRunning: false };

    const startedAtMs = new Date(row.started_at).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));

    return {
      isRunning: true,
      startedAt: String(row.started_at),
      elapsedSeconds,
      phase: row.current_phase_label ?? undefined,
      progress:
        row.current_phase != null && row.total_phases != null
          ? { step: row.current_phase, total: row.total_phases }
          : undefined,
    };
  },
);

// GET /agent/sleep/logs — List recent sleep cycle logs for dashboard
export const getSleepLogs = api(
  { method: "GET", path: "/agent/sleep/logs", expose: true, auth: true },
  async (): Promise<{
    logs: Array<{
      id: string;
      startedAt: string;
      completedAt: string | null;
      status: string;
      summary: Record<string, number>;
    }>;
  }> => {
    const logs: Array<{
      id: string;
      startedAt: string;
      completedAt: string | null;
      status: string;
      summary: Record<string, number>;
    }> = [];

    const rows = db.query<{
      id: string;
      started_at: string;
      completed_at: string | null;
      status: string;
      report: string | null;
    }>`
      SELECT id, started_at, completed_at, status, report
      FROM sleep_logs
      ORDER BY started_at DESC
      LIMIT 10
    `;

    for await (const row of rows) {
      logs.push({
        id: row.id,
        startedAt: String(row.started_at),
        completedAt: row.completed_at ? String(row.completed_at) : null,
        status: row.status,
        summary: row.report
          ? typeof row.report === "string"
            ? JSON.parse(row.report)
            : (row.report as Record<string, number>)
          : {},
      });
    }

    return { logs };
  }
);

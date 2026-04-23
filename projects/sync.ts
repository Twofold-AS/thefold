import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { db } from "./db";

// Fase I.5 — Sync-jobs. Bind flere plattformer (GitHub, Framer, Figma) på samme
// kanoniske prosjekt. source_of_truth avgjør retning ved automatisk sync.

export type SyncDirection = "repo_to_design" | "design_to_repo" | "bidirectional";
export type SyncStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type SyncTriggeredBy = "manual" | "webhook" | "cron";
export type SyncPlatform = "github" | "framer" | "figma";

export interface SyncJob {
  id: string;
  projectId: string;
  direction: SyncDirection;
  status: SyncStatus;
  triggeredBy: SyncTriggeredBy;
  sourcePlatform: SyncPlatform;
  targetPlatform: SyncPlatform;
  details: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface SyncJobRow {
  id: string;
  project_id: string;
  direction: string;
  status: string;
  triggered_by: string;
  source_platform: string;
  target_platform: string;
  details: unknown;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

function parseRow(r: SyncJobRow): SyncJob {
  const details = typeof r.details === "string" ? JSON.parse(r.details) : (r.details ?? {});
  return {
    id: r.id,
    projectId: r.project_id,
    direction: r.direction as SyncDirection,
    status: r.status as SyncStatus,
    triggeredBy: r.triggered_by as SyncTriggeredBy,
    sourcePlatform: r.source_platform as SyncPlatform,
    targetPlatform: r.target_platform as SyncPlatform,
    details: details as Record<string, unknown>,
    errorMessage: r.error_message,
    createdAt: r.created_at.toISOString(),
    startedAt: r.started_at?.toISOString() ?? null,
    completedAt: r.completed_at?.toISOString() ?? null,
  };
}

async function assertOwnsProject(projectId: string, email: string): Promise<void> {
  const row = await db.queryRow<{ id: string }>`
    SELECT id FROM projects WHERE id = ${projectId} AND owner_email = ${email} AND archived_at IS NULL
  `;
  if (!row) throw APIError.notFound("project not found");
}

export const triggerSync = api(
  { method: "POST", path: "/projects/sync/trigger", expose: true, auth: true },
  async (req: {
    projectId: string;
    direction: SyncDirection;
    sourcePlatform: SyncPlatform;
    targetPlatform: SyncPlatform;
  }): Promise<{ job: SyncJob }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);

    if (req.sourcePlatform === req.targetPlatform) {
      throw APIError.invalidArgument("source and target platform must differ");
    }

    const row = await db.queryRow<SyncJobRow>`
      INSERT INTO sync_jobs (project_id, direction, triggered_by, source_platform, target_platform)
      VALUES (${req.projectId}, ${req.direction}, 'manual', ${req.sourcePlatform}, ${req.targetPlatform})
      RETURNING id, project_id, direction, status, triggered_by,
                source_platform, target_platform, details, error_message,
                created_at, started_at, completed_at
    `;
    if (!row) throw APIError.internal("failed to create sync job");
    log.info("sync job created", { id: row.id, projectId: req.projectId, direction: req.direction });
    return { job: parseRow(row) };
  }
);

export const listSyncJobs = api(
  { method: "POST", path: "/projects/sync/list", expose: true, auth: true },
  async (req: { projectId: string; limit?: number }): Promise<{ jobs: SyncJob[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);

    const limit = Math.min(req.limit ?? 20, 100);
    const out: SyncJob[] = [];
    const rows = await db.query<SyncJobRow>`
      SELECT id, project_id, direction, status, triggered_by,
             source_platform, target_platform, details, error_message,
             created_at, started_at, completed_at
      FROM sync_jobs
      WHERE project_id = ${req.projectId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    for await (const r of rows) out.push(parseRow(r));
    return { jobs: out };
  }
);

export const cancelSyncJob = api(
  { method: "POST", path: "/projects/sync/cancel", expose: true, auth: true },
  async (req: { jobId: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const row = await db.queryRow<{ project_id: string; owner_email: string; status: string }>`
      SELECT sj.project_id, p.owner_email, sj.status
      FROM sync_jobs sj
      JOIN projects p ON p.id = sj.project_id
      WHERE sj.id = ${req.jobId}
    `;
    if (!row) throw APIError.notFound("sync job not found");
    if (row.owner_email !== auth.email) throw APIError.permissionDenied("not owner");
    if (row.status !== "pending" && row.status !== "running") {
      return { success: false };
    }

    await db.exec`
      UPDATE sync_jobs SET status = 'cancelled', completed_at = NOW()
      WHERE id = ${req.jobId}
    `;
    return { success: true };
  }
);

// Intern webhook-receiver for Framer/Figma/GitHub.
// Validering av signatur skjer i plattform-spesifikke adaptere (fremtidig).
// NB: Encore støtter ikke named-type-union som path-param — bruker `string`
// og validerer innholdet manuelt inni handleren.
export const receiveWebhook = api(
  { method: "POST", path: "/projects/sync/webhook/:platform", expose: true, auth: false },
  async (req: {
    platform: string;
    projectId?: string;
    event?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ accepted: boolean }> => {
    if (!req.projectId) return { accepted: false };
    if (req.platform !== "github" && req.platform !== "framer" && req.platform !== "figma") {
      return { accepted: false };
    }
    const platform = req.platform as SyncPlatform;

    const projectRow = await db.queryRow<{ id: string; source_of_truth: string }>`
      SELECT id, source_of_truth FROM projects WHERE id = ${req.projectId} AND archived_at IS NULL
    `;
    if (!projectRow) return { accepted: false };

    // Hvis eventen kommer fra source-of-truth-plattformen, trigger sync til alle andre.
    const sourceMatches =
      (projectRow.source_of_truth === "repo" && platform === "github") ||
      (projectRow.source_of_truth === "framer" && platform === "framer") ||
      (projectRow.source_of_truth === "figma" && platform === "figma");

    if (!sourceMatches) {
      log.info("webhook ignored (not source of truth)", {
        projectId: req.projectId,
        platform: req.platform,
        sourceOfTruth: projectRow.source_of_truth,
      });
      return { accepted: false };
    }

    const targets: SyncPlatform[] = (["github", "framer", "figma"] as SyncPlatform[]).filter(
      (p) => p !== platform
    );
    for (const target of targets) {
      await db.exec`
        INSERT INTO sync_jobs (project_id, direction, triggered_by, source_platform, target_platform, details)
        VALUES (
          ${req.projectId}, 'bidirectional', 'webhook',
          ${platform}, ${target},
          ${JSON.stringify({ event: req.event ?? "unknown", payload: req.payload ?? {} })}::jsonb
        )
      `;
    }

    log.info("webhook accepted, sync jobs created", {
      projectId: req.projectId,
      platform: req.platform,
      targets,
    });
    return { accepted: true };
  }
);

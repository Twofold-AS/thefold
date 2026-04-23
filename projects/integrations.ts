import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "./db";

// Fase I.1 — Per-prosjekt integrasjoner. Holder metadata om hvor
// prosjektet er koblet (GitHub repo full name, Framer site id, Figma file id, etc.)

export type IntegrationPlatform = "github" | "framer" | "figma";

interface IntegrationRow {
  id: string;
  project_id: string;
  platform: string;
  remote_id: string | null;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectIntegration {
  id: string;
  projectId: string;
  platform: IntegrationPlatform;
  remoteId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function parseRow(r: IntegrationRow): ProjectIntegration {
  const meta = typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata ?? {});
  return {
    id: r.id,
    projectId: r.project_id,
    platform: r.platform as IntegrationPlatform,
    remoteId: r.remote_id,
    metadata: meta as Record<string, unknown>,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

async function assertOwnsProject(projectId: string, email: string): Promise<void> {
  const row = await db.queryRow<{ id: string }>`
    SELECT id FROM projects WHERE id = ${projectId} AND owner_email = ${email} AND archived_at IS NULL
  `;
  if (!row) throw APIError.notFound("project not found");
}

export const listIntegrations = api(
  { method: "POST", path: "/projects/integrations/list", expose: true, auth: true },
  async (req: { projectId: string }): Promise<{ integrations: ProjectIntegration[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);

    const out: ProjectIntegration[] = [];
    const rows = await db.query<IntegrationRow>`
      SELECT id, project_id, platform, remote_id, metadata, created_at, updated_at
      FROM project_integrations
      WHERE project_id = ${req.projectId}
      ORDER BY platform
    `;
    for await (const r of rows) out.push(parseRow(r));
    return { integrations: out };
  }
);

export const upsertIntegration = api(
  { method: "POST", path: "/projects/integrations/save", expose: true, auth: true },
  async (req: {
    projectId: string;
    platform: IntegrationPlatform;
    remoteId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ integration: ProjectIntegration }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);

    const meta = JSON.stringify(req.metadata ?? {});
    const row = await db.queryRow<IntegrationRow>`
      INSERT INTO project_integrations (project_id, platform, remote_id, metadata)
      VALUES (${req.projectId}, ${req.platform}, ${req.remoteId ?? null}, ${meta}::jsonb)
      ON CONFLICT (project_id, platform) DO UPDATE SET
        remote_id = EXCLUDED.remote_id,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id, project_id, platform, remote_id, metadata, created_at, updated_at
    `;
    if (!row) throw APIError.internal("failed to save integration");
    return { integration: parseRow(row) };
  }
);

export const deleteIntegration = api(
  { method: "POST", path: "/projects/integrations/delete", expose: true, auth: true },
  async (req: { projectId: string; platform: IntegrationPlatform }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);
    await db.exec`
      DELETE FROM project_integrations
      WHERE project_id = ${req.projectId} AND platform = ${req.platform}
    `;
    return { success: true };
  }
);

// Intern endpoint brukt av chat-context-resolver (I.1).
export const getProjectContextInternal = api(
  { method: "POST", path: "/projects/context/internal", expose: false },
  async (req: { projectId: string }): Promise<{
    project: {
      id: string;
      name: string;
      projectType: string;
      description: string | null;
      sourceOfTruth: string;
    } | null;
    integrations: ProjectIntegration[];
  }> => {
    const projRow = await db.queryRow<{
      id: string;
      name: string;
      project_type: string;
      description: string | null;
      source_of_truth: string;
    }>`
      SELECT id, name, project_type, description, source_of_truth
      FROM projects
      WHERE id = ${req.projectId} AND archived_at IS NULL
    `;
    if (!projRow) return { project: null, integrations: [] };

    const integrations: ProjectIntegration[] = [];
    const rows = await db.query<IntegrationRow>`
      SELECT id, project_id, platform, remote_id, metadata, created_at, updated_at
      FROM project_integrations
      WHERE project_id = ${req.projectId}
    `;
    for await (const r of rows) integrations.push(parseRow(r));

    return {
      project: {
        id: projRow.id,
        name: projRow.name,
        projectType: projRow.project_type,
        description: projRow.description,
        sourceOfTruth: projRow.source_of_truth,
      },
      integrations,
    };
  }
);

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { db } from "./db";
import { encryptApiKey, decryptApiKey, previewApiKey } from "./crypto";

// Fase I.1 — Per-prosjekt API-nøkkel-håndtering.
// Nøkler krypteres ved lagring (AES-256-GCM via crypto.ts).
// Frontend ser kun `preview` (f.eks. "sk-a...bc12") — aldri plain text.

interface KeyRow {
  id: string;
  project_id: string;
  key_name: string;
  key_preview: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectApiKey {
  id: string;
  projectId: string;
  keyName: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

function parseRow(r: KeyRow): ProjectApiKey {
  return {
    id: r.id,
    projectId: r.project_id,
    keyName: r.key_name,
    preview: r.key_preview,
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

export const listApiKeys = api(
  { method: "POST", path: "/projects/api-keys/list", expose: true, auth: true },
  async (req: { projectId: string }): Promise<{ keys: ProjectApiKey[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);
    const keys: ProjectApiKey[] = [];
    const rows = await db.query<KeyRow>`
      SELECT id, project_id, key_name, key_preview, created_at, updated_at
      FROM project_api_keys
      WHERE project_id = ${req.projectId}
      ORDER BY key_name
    `;
    for await (const r of rows) keys.push(parseRow(r));
    return { keys };
  }
);

export const setApiKey = api(
  { method: "POST", path: "/projects/api-keys/set", expose: true, auth: true },
  async (req: {
    projectId: string;
    keyName: string;
    value: string;
  }): Promise<{ key: ProjectApiKey }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    if (!req.keyName.trim()) throw APIError.invalidArgument("keyName required");
    if (!req.value.trim()) throw APIError.invalidArgument("value required");

    await assertOwnsProject(req.projectId, auth.email);

    const encrypted = encryptApiKey(req.value);
    const preview = previewApiKey(req.value);

    const row = await db.queryRow<KeyRow>`
      INSERT INTO project_api_keys (project_id, key_name, key_value_encrypted, key_preview)
      VALUES (${req.projectId}, ${req.keyName.trim()}, ${encrypted}, ${preview})
      ON CONFLICT (project_id, key_name) DO UPDATE SET
        key_value_encrypted = EXCLUDED.key_value_encrypted,
        key_preview = EXCLUDED.key_preview,
        updated_at = NOW()
      RETURNING id, project_id, key_name, key_preview, created_at, updated_at
    `;
    if (!row) throw APIError.internal("failed to save key");
    log.info("project api-key saved", { projectId: req.projectId, keyName: req.keyName });
    return { key: parseRow(row) };
  }
);

export const deleteApiKey = api(
  { method: "POST", path: "/projects/api-keys/delete", expose: true, auth: true },
  async (req: { projectId: string; keyName: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);
    await db.exec`
      DELETE FROM project_api_keys WHERE project_id = ${req.projectId} AND key_name = ${req.keyName}
    `;
    return { success: true };
  }
);

// UUID v4 shape: 8-4-4-4-12 hex chars. Used to guard `project_id = $1::uuid`
// queries — Postgres throws "invalid input syntax for type uuid" and
// produces a nasty error-log otherwise. Callers outside the projects
// context (agent tool-loop without an active project) routinely pass
// empty-string or undefined here, so we short-circuit to a null result
// instead of letting PG reject.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Intern endpoint for andre services som trenger en dekryptert nøkkel.
export const resolveApiKey = api(
  { method: "POST", path: "/projects/api-keys/resolve", expose: false },
  async (req: { projectId: string; keyName: string }): Promise<{ value: string | null }> => {
    // Fail-soft on invalid/empty projectId. Tools like web_scrape call
    // resolveApiKey opportunistically to find per-project overrides; for
    // chats without an active project the projectId is empty, and
    // previously we passed that through and let PG explode with
    // "unable to parse uuid". Now we just return null.
    const pid = (req.projectId ?? "").trim();
    if (!pid || !UUID_REGEX.test(pid)) {
      return { value: null };
    }
    const keyName = (req.keyName ?? "").trim();
    if (!keyName) return { value: null };

    const row = await db.queryRow<{ encrypted: string }>`
      SELECT key_value_encrypted AS encrypted
      FROM project_api_keys
      WHERE project_id = ${pid}::uuid AND key_name = ${keyName}
    `;
    if (!row) return { value: null };
    try {
      return { value: decryptApiKey(row.encrypted) };
    } catch (err) {
      log.warn("api-key decrypt failed", {
        projectId: pid,
        keyName,
        error: err instanceof Error ? err.message : String(err),
      });
      return { value: null };
    }
  }
);

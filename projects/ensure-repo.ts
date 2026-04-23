// ensureProjectRepo — creates a companion GitHub repo for non-code projects
// (Framer / Figma) on demand, so the agent's builder has somewhere to commit
// generated code. Safe to call repeatedly: if the project already has
// `github_repo` set, we return it as-is.
//
// Naming convention: `framer-<slug(name)>` in the GitHub App's installed org.
// On collision (422 from GitHub) we append "-2", "-3", … until we find a free
// slot (capped at 100 attempts).

import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { github as githubClient } from "~encore/clients";
import { db } from "./db";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface EnsureProjectRepoRequest {
  projectId: string;
}

export interface EnsureProjectRepoResponse {
  /** "owner/name" when a repo exists. Empty string for code projects that
   *  don't yet have one (creation of code-project repos is handled at
   *  project-creation time in /projects/create, not here). */
  githubRepo: string;
  projectType: string;
  created: boolean;
}

export const ensureProjectRepo = api(
  { method: "POST", path: "/projects/ensure-repo", expose: false },
  async (req: EnsureProjectRepoRequest): Promise<EnsureProjectRepoResponse> => {
    // Internal endpoint — no auth check. Callers (the agent) vouch for ownership.
    const row = await db.queryRow<{
      id: string;
      name: string;
      project_type: string;
      github_repo: string | null;
      github_private: boolean;
      description: string | null;
      owner_email: string;
    }>`
      SELECT id, name, project_type, github_repo, github_private, description, owner_email
      FROM projects
      WHERE id = ${req.projectId} AND archived_at IS NULL
    `;
    if (!row) throw APIError.notFound("project not found");

    if (row.github_repo) {
      return { githubRepo: row.github_repo, projectType: row.project_type, created: false };
    }

    // Code projects should have their repo provisioned at /projects/create time.
    // We don't auto-create here — return empty and let caller decide.
    if (row.project_type === "code") {
      return { githubRepo: "", projectType: row.project_type, created: false };
    }

    const { owner: org } = await githubClient.getGitHubOwner();

    // framer-<slug> / figma-<slug> / framer_figma-<slug>
    const base = `${row.project_type}-${slugify(row.name)}` || `${row.project_type}-project-${row.id.slice(0, 8)}`;

    let finalName: string | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        await githubClient.createRepo({
          org,
          name: candidate,
          description: row.description ?? `Companion repo for ${row.project_type} project ${row.name}`,
          isPrivate: row.github_private,
        });
        finalName = candidate;
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = e;
        if (msg.includes("422") || msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("name already")) {
          // Collision — try next suffix
          continue;
        }
        // Any other error: stop and bubble up
        throw e;
      }
    }

    if (!finalName) {
      throw APIError.internal(`Could not allocate repo name for ${row.name}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
    }

    const fullName = `${org}/${finalName}`;
    await db.exec`
      UPDATE projects SET github_repo = ${fullName}, updated_at = NOW()
      WHERE id = ${row.id}
    `;

    log.info("ensureProjectRepo: created companion repo", {
      projectId: row.id,
      projectType: row.project_type,
      githubRepo: fullName,
    });

    return { githubRepo: fullName, projectType: row.project_type, created: true };
  }
);

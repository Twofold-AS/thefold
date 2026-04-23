import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { github as githubClient } from "~encore/clients";
import { db } from "./db";
import type { ProjectType } from "./types";

// Endpoints for the Prosjekt-sync-hub modal.
// Listing: cross-join GitHub repos (via github.listRepos) with projects rows
// that already link to a given fullName. Link/unlink: minimal create + null-out.

// ─────────────────────────────────────────────────────────────────────────
// GET /projects/github-sync-data
// ─────────────────────────────────────────────────────────────────────────

export interface GithubSyncRow {
  fullName: string;     // "thefold-dev/yamaha-mt07"
  owner: string;        // "thefold-dev"
  name: string;         // "yamaha-mt07"
  description: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string;
  linkedProject: {
    id: string;
    name: string;
    type: ProjectType;
  } | null;
}

interface GithubSyncResponse {
  rows: GithubSyncRow[];
  ownerResolved: string | null;
}

export const githubSyncData = api(
  { method: "POST", path: "/projects/github-sync-data", expose: true, auth: true },
  async (): Promise<GithubSyncResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    // Resolve owner + repos via github service (paginated after Prio 2 fix).
    const reposRes = await githubClient.listRepos({});
    const repos = reposRes.repos ?? [];

    if (repos.length === 0) {
      return { rows: [], ownerResolved: null };
    }

    // Lookup existing project-links for all fullNames in one query.
    const fullNames = repos.map((r) => r.fullName);
    const linked = new Map<string, { id: string; name: string; type: ProjectType }>();
    if (fullNames.length > 0) {
      const rows = db.query<{ id: string; name: string; project_type: string; github_repo: string }>`
        SELECT id, name, project_type, github_repo
        FROM projects
        WHERE owner_email = ${auth.email}
          AND archived_at IS NULL
          AND github_repo = ANY(${fullNames}::text[])
      `;
      for await (const r of rows) {
        linked.set(r.github_repo, { id: r.id, name: r.name, type: r.project_type as ProjectType });
      }
    }

    const resolvedOwner = repos[0].fullName.split("/")[0] ?? null;
    const rows: GithubSyncRow[] = repos.map((r) => {
      const ownerPart = r.fullName.split("/")[0] ?? "";
      return {
        fullName: r.fullName,
        owner: ownerPart,
        name: r.name,
        description: r.description ?? "",
        private: r.private,
        defaultBranch: r.defaultBranch,
        pushedAt: r.pushedAt,
        linkedProject: linked.get(r.fullName) ?? null,
      };
    });

    log.info("github-sync-data returning", { email: auth.email, repoCount: rows.length, linkedCount: linked.size });
    return { rows, ownerResolved: resolvedOwner };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// POST /projects/link-repo
// ─────────────────────────────────────────────────────────────────────────

interface LinkRepoRequest {
  repoFullName: string;   // "owner/name"
  projectType: ProjectType;
  /** Optional override — defaults to repo.name. */
  projectName?: string;
}

interface LinkRepoResponse {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  linked: boolean;
  reason?: string; // populated when linked=false (e.g. already linked)
  /** Number of legacy repo-* conversations that got the new project_id (0 if none or no-op). */
  backfilledConversations?: number;
}

export const linkRepo = api(
  { method: "POST", path: "/projects/link-repo", expose: true, auth: true },
  async (req: LinkRepoRequest): Promise<LinkRepoResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    if (!req.repoFullName || !req.repoFullName.includes("/")) {
      throw APIError.invalidArgument("repoFullName must be 'owner/name'");
    }
    if (!["code", "framer", "figma", "framer_figma"].includes(req.projectType)) {
      throw APIError.invalidArgument("invalid projectType");
    }

    const repoName = req.repoFullName.split("/")[1];
    const desiredName = (req.projectName?.trim()) || repoName;

    // Dedup: already linked?
    const existing = await db.queryRow<{ id: string; name: string; project_type: string }>`
      SELECT id, name, project_type
      FROM projects
      WHERE owner_email = ${auth.email}
        AND archived_at IS NULL
        AND github_repo = ${req.repoFullName}
      LIMIT 1
    `;
    if (existing) {
      return {
        projectId: existing.id,
        projectName: existing.name,
        projectType: existing.project_type as ProjectType,
        linked: false,
        reason: "already linked",
      };
    }

    // Try insert, rename on name-UNIQUE-collision (global partial unique index).
    let finalName = desiredName;
    let attempt = 0;
    let newId: string | null = null;
    while (attempt < 10 && !newId) {
      try {
        const row = await db.queryRow<{ id: string }>`
          INSERT INTO projects (
            name, project_type, owner_email,
            github_repo, github_private, github_auto_merge, github_auto_pr,
            source_of_truth
          ) VALUES (
            ${finalName}, ${req.projectType}, ${auth.email},
            ${req.repoFullName}, false, false, true,
            'repo'
          )
          RETURNING id
        `;
        if (row) newId = row.id;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("unique") && attempt < 9) {
          attempt++;
          finalName = `${desiredName}-${attempt}`;
          continue;
        }
        throw APIError.internal(`link-repo failed: ${msg}`);
      }
    }

    if (!newId) throw APIError.internal("failed to insert after retries");

    // Backfill: legacy conversations with id-prefix "repo-<reponame>-" and
    // project_id IS NULL get linked to this new project. Cross-service call
    // into chat (since conversations lives in chat DB, not projects DB).
    let backfilledConversations = 0;
    try {
      const { chat } = await import("~encore/clients");
      const projectScope: "cowork" | "designer" =
        req.projectType === "framer" || req.projectType === "figma" || req.projectType === "framer_figma"
          ? "designer" : "cowork";
      const res = await (chat as unknown as {
        backfillProjectConversations: (r: {
          ownerEmail: string; projectId: string; repoName: string;
          projectScope: "cowork" | "designer";
        }) => Promise<{ updated: number }>;
      }).backfillProjectConversations({
        ownerEmail: auth.email,
        projectId: newId,
        repoName,
        projectScope,
      });
      backfilledConversations = res.updated;
    } catch (err) {
      log.warn("link-repo: backfill failed (non-fatal)", {
        projectId: newId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    log.info("link-repo: created", {
      projectId: newId, finalName, repoFullName: req.repoFullName, type: req.projectType,
      backfilledConversations,
    });
    return {
      projectId: newId,
      projectName: finalName,
      projectType: req.projectType,
      linked: true,
      backfilledConversations,
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// POST /projects/unlink-repo
// ─────────────────────────────────────────────────────────────────────────

interface UnlinkRepoRequest {
  projectId: string;
}

interface UnlinkRepoResponse {
  success: boolean;
  previousRepo: string | null;
}

export const unlinkRepo = api(
  { method: "POST", path: "/projects/unlink-repo", expose: true, auth: true },
  async (req: UnlinkRepoRequest): Promise<UnlinkRepoResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const row = await db.queryRow<{ github_repo: string | null; owner_email: string }>`
      SELECT github_repo, owner_email FROM projects WHERE id = ${req.projectId}::uuid
    `;
    if (!row) throw APIError.notFound("project not found");
    if (row.owner_email !== auth.email) throw APIError.permissionDenied("not owner");

    const previous = row.github_repo;
    await db.exec`
      UPDATE projects SET github_repo = NULL, updated_at = NOW()
      WHERE id = ${req.projectId}::uuid
    `;

    log.info("unlink-repo: nullified", { projectId: req.projectId, previousRepo: previous });
    return { success: true, previousRepo: previous };
  },
);

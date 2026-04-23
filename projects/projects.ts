// --- Projects service (Fase I.0.a) ---
// Canonical project registry. CRUD + name-uniqueness-check. GitHub repo
// creation is called from a separate endpoint (/projects/create) which
// composes this with github.createRepo when applicable.

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { github as githubClient } from "~encore/clients";
import { db } from "./db";
import {
  type Project,
  type ProjectType,
  type ProjectSourceOfTruth,
  GITHUB_REPO_REGEX,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Row parsing
// ─────────────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  project_type: string;
  description: string | null;
  owner_email: string;
  github_repo: string | null;
  github_private: boolean;
  github_auto_merge: boolean;
  github_auto_pr: boolean;
  framer_site_url: string | null;
  figma_file_url: string | null;
  source_of_truth: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    projectType: row.project_type as ProjectType,
    description: row.description,
    ownerEmail: row.owner_email,
    githubRepo: row.github_repo,
    githubPrivate: row.github_private,
    githubAutoMerge: row.github_auto_merge,
    githubAutoPr: row.github_auto_pr,
    framerSiteUrl: row.framer_site_url,
    figmaFileUrl: row.figma_file_url,
    sourceOfTruth: row.source_of_truth as ProjectSourceOfTruth,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────

export interface CreateProjectRequest {
  name: string;
  projectType: ProjectType;
  description?: string;
  /** CoWork-modal: GitHub settings */
  githubPrivate?: boolean;
  githubAutoMerge?: boolean;
  githubAutoPr?: boolean;
  /** Fase I.3 — Skal vi faktisk opprette GitHub-repo? Default true for code-type. */
  createGithubRepo?: boolean;
  /** Fase I.3 — GitHub-org for createRepo. Uten denne hopper vi over repo-opprettelse. */
  githubOrg?: string;
  /** Designer-modal: platform links */
  framerSiteUrl?: string;
  figmaFileUrl?: string;
}

export interface CreateProjectResponse {
  project: Project;
}

export const createProject = api(
  { method: "POST", path: "/projects/create", expose: true, auth: true },
  async (req: CreateProjectRequest): Promise<CreateProjectResponse> => {
    const auth = getAuthData()!;
    const name = req.name.trim();

    if (!GITHUB_REPO_REGEX.test(name)) {
      throw APIError.invalidArgument(
        "Navnet kan kun inneholde bokstaver, tall, punktum, understrek og bindestrek.",
      );
    }
    if (name.length < 2 || name.length > 100) {
      throw APIError.invalidArgument("Navnet må være mellom 2 og 100 tegn.");
    }
    if (!["code", "framer", "figma", "framer_figma"].includes(req.projectType)) {
      throw APIError.invalidArgument("Ugyldig project_type.");
    }

    // Global uniqueness check before insert (race-safe via unique index).
    const row = await db.queryRow<ProjectRow>`
      INSERT INTO projects (
        name, project_type, description, owner_email,
        github_private, github_auto_merge, github_auto_pr,
        framer_site_url, figma_file_url
      ) VALUES (
        ${name}, ${req.projectType}, ${req.description ?? null}, ${auth.email},
        ${req.githubPrivate ?? true},
        ${req.githubAutoMerge ?? false},
        ${req.githubAutoPr ?? false},
        ${req.framerSiteUrl ?? null},
        ${req.figmaFileUrl ?? null}
      )
      RETURNING id, name, project_type, description, owner_email,
                github_repo, github_private, github_auto_merge, github_auto_pr,
                framer_site_url, figma_file_url, source_of_truth,
                archived_at, created_at, updated_at
    `.catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("idx_projects_name_unique") || msg.toLowerCase().includes("unique")) {
        throw APIError.alreadyExists(`Prosjektnavnet "${name}" er allerede tatt.`);
      }
      throw err;
    });

    if (!row) throw APIError.internal("failed to create project");

    // Fase I.3 — Hvis projectType === "code" og githubOrg er oppgitt, opprett GitHub-repo.
    // Feil her blokkerer IKKE prosjektet i DB; repo kan knyttes senere via /projects/set-github-repo.
    if (req.projectType === "code" && req.createGithubRepo !== false && req.githubOrg) {
      try {
        const res = await githubClient.createRepo({
          org: req.githubOrg,
          name,
          description: req.description ?? undefined,
          isPrivate: req.githubPrivate ?? true,
        });
        // url-format: https://github.com/<org>/<repo>
        const match = res.url.match(/github\.com\/([^/]+\/[^/]+)$/);
        const fullName = match ? match[1] : `${req.githubOrg}/${name}`;
        await db.exec`
          UPDATE projects SET github_repo = ${fullName}, updated_at = NOW()
          WHERE id = ${row.id}
        `;
        row.github_repo = fullName;
      } catch (err) {
        log.warn("github repo creation failed (project still created)", {
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info("project created", { id: row.id, name, type: req.projectType, owner: auth.email });
    return { project: parseProject(row) };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Check name availability
// ─────────────────────────────────────────────────────────────────────────

export interface CheckNameRequest {
  name: string;
}

export interface CheckNameResponse {
  available: boolean;
  reason?: string;
}

export const checkName = api(
  { method: "POST", path: "/projects/check-name", expose: true, auth: true },
  async (req: CheckNameRequest): Promise<CheckNameResponse> => {
    const name = req.name.trim();
    if (name.length < 2) return { available: false, reason: "For kort (minst 2 tegn)." };
    if (name.length > 100) return { available: false, reason: "For langt (maks 100 tegn)." };
    if (!GITHUB_REPO_REGEX.test(name)) {
      return {
        available: false,
        reason: "Bruk kun bokstaver, tall, punktum, understrek og bindestrek.",
      };
    }
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM projects WHERE name = ${name} AND archived_at IS NULL
    `;
    if (existing) return { available: false, reason: "Navnet er allerede tatt." };
    return { available: true };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// List (per user)
// ─────────────────────────────────────────────────────────────────────────

export interface ListProjectsRequest {
  scope?: "cowork" | "designer";
}

export interface ListProjectsResponse {
  projects: Project[];
}

export const listProjects = api(
  { method: "POST", path: "/projects/list", expose: true, auth: true },
  async (req: ListProjectsRequest): Promise<ListProjectsResponse> => {
    const auth = getAuthData()!;
    // Designer = strict framer/figma match.
    // CoWork   = inverse: anything NOT framer/figma/framer_figma (code + legacy + unknown).
    const designerTypes = ["framer", "figma", "framer_figma"];
    const projects: Project[] = [];

    // Debug: log every request so we can see what scope and count was served.
    log.info("projects.list called", { scope: req.scope ?? "all", email: auth.email });

    if (req.scope === "designer") {
      const rows = db.query<ProjectRow>`
        SELECT id, name, project_type, description, owner_email,
               github_repo, github_private, github_auto_merge, github_auto_pr,
               framer_site_url, figma_file_url, source_of_truth,
               archived_at, created_at, updated_at
        FROM projects
        WHERE owner_email = ${auth.email}
          AND archived_at IS NULL
          AND project_type = ANY(${designerTypes}::text[])
        ORDER BY updated_at DESC
      `;
      for await (const r of rows) projects.push(parseProject(r));
    } else if (req.scope === "cowork") {
      // Inverse-match: project_type != any designer type. project_type is NOT NULL
      // on this table (DEFAULT 'code' + CHECK constraint), but we keep the IS NULL
      // branch in the predicate defensively in case an ALTER ever relaxes it.
      const rows = db.query<ProjectRow>`
        SELECT id, name, project_type, description, owner_email,
               github_repo, github_private, github_auto_merge, github_auto_pr,
               framer_site_url, figma_file_url, source_of_truth,
               archived_at, created_at, updated_at
        FROM projects
        WHERE owner_email = ${auth.email}
          AND archived_at IS NULL
          AND (project_type IS NULL OR project_type <> ALL(${designerTypes}::text[]))
        ORDER BY updated_at DESC
      `;
      for await (const r of rows) projects.push(parseProject(r));
    } else {
      const rows = db.query<ProjectRow>`
        SELECT id, name, project_type, description, owner_email,
               github_repo, github_private, github_auto_merge, github_auto_pr,
               framer_site_url, figma_file_url, source_of_truth,
               archived_at, created_at, updated_at
        FROM projects
        WHERE owner_email = ${auth.email} AND archived_at IS NULL
        ORDER BY updated_at DESC
      `;
      for await (const r of rows) projects.push(parseProject(r));
    }

    log.info("projects.list returning", {
      scope: req.scope ?? "all",
      count: projects.length,
      types: projects.map((p) => p.projectType),
    });

    return { projects };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Get by id
// ─────────────────────────────────────────────────────────────────────────

export interface GetProjectRequest {
  id: string;
}

export interface GetProjectResponse {
  project: Project;
}

export const getProject = api(
  { method: "POST", path: "/projects/get", expose: true, auth: true },
  async (req: GetProjectRequest): Promise<GetProjectResponse> => {
    const auth = getAuthData()!;
    const row = await db.queryRow<ProjectRow>`
      SELECT id, name, project_type, description, owner_email,
             github_repo, github_private, github_auto_merge, github_auto_pr,
             framer_site_url, figma_file_url, source_of_truth,
             archived_at, created_at, updated_at
      FROM projects
      WHERE id = ${req.id}::uuid AND owner_email = ${auth.email}
    `;
    if (!row) throw APIError.notFound("project not found");
    return { project: parseProject(row) };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Update (settings-modal)
// ─────────────────────────────────────────────────────────────────────────

export interface UpdateProjectRequest {
  id: string;
  projectType?: ProjectType;
  description?: string;
  githubPrivate?: boolean;
  githubAutoMerge?: boolean;
  githubAutoPr?: boolean;
  framerSiteUrl?: string | null;
  figmaFileUrl?: string | null;
  sourceOfTruth?: ProjectSourceOfTruth;
}

export const updateProject = api(
  { method: "POST", path: "/projects/update", expose: true, auth: true },
  async (req: UpdateProjectRequest): Promise<GetProjectResponse> => {
    const auth = getAuthData()!;
    const existing = await db.queryRow<ProjectRow>`
      SELECT * FROM projects WHERE id = ${req.id}::uuid AND owner_email = ${auth.email}
    `;
    if (!existing) throw APIError.notFound("project not found");

    const updated = await db.queryRow<ProjectRow>`
      UPDATE projects SET
        project_type     = COALESCE(${req.projectType ?? null}, project_type),
        description      = COALESCE(${req.description ?? null}, description),
        github_private   = COALESCE(${req.githubPrivate ?? null}, github_private),
        github_auto_merge= COALESCE(${req.githubAutoMerge ?? null}, github_auto_merge),
        github_auto_pr   = COALESCE(${req.githubAutoPr ?? null}, github_auto_pr),
        framer_site_url  = COALESCE(${req.framerSiteUrl ?? null}, framer_site_url),
        figma_file_url   = COALESCE(${req.figmaFileUrl ?? null}, figma_file_url),
        source_of_truth  = COALESCE(${req.sourceOfTruth ?? null}, source_of_truth),
        updated_at       = NOW()
      WHERE id = ${req.id}::uuid
      RETURNING id, name, project_type, description, owner_email,
                github_repo, github_private, github_auto_merge, github_auto_pr,
                framer_site_url, figma_file_url, source_of_truth,
                archived_at, created_at, updated_at
    `;
    if (!updated) throw APIError.internal("update failed");
    return { project: parseProject(updated) };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Archive (soft-delete)
// ─────────────────────────────────────────────────────────────────────────

export const archiveProject = api(
  { method: "POST", path: "/projects/archive", expose: true, auth: true },
  async (req: { id: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData()!;
    await db.exec`
      UPDATE projects SET archived_at = NOW(), updated_at = NOW()
      WHERE id = ${req.id}::uuid AND owner_email = ${auth.email}
    `;
    return { success: true };
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Internal: set github_repo after repo creation
// ─────────────────────────────────────────────────────────────────────────

export const setGithubRepo = api(
  { method: "POST", path: "/projects/set-github-repo", expose: false },
  async (req: { id: string; githubRepo: string }): Promise<{ success: boolean }> => {
    await db.exec`
      UPDATE projects SET github_repo = ${req.githubRepo}, updated_at = NOW()
      WHERE id = ${req.id}::uuid
    `;
    return { success: true };
  },
);

import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { db } from "./db";
import { decryptApiKey } from "./crypto";

// Internal service wrapper around the `framer-api` npm package.
//
// Replaces the old speculative REST-URL stub in framer-dispatch.ts. All Framer
// Server API calls go through here so auth-resolution (per-project key with
// global fallback) and error-mapping live in one place.
//
// Caller pattern:
//   const session = await getFramerSession(projectId);
//   const file = await session.framer.createCodeFile("Foo", "...");
//   await session.disconnect();
//
// Each endpoint below is an internal Encore API so AI tools can call it via
// ~encore/clients without importing framer-api directly.

const globalFramerKey = secret("FramerApiKey");

interface ProjectRow {
  id: string;
  framer_site_url: string | null;
  project_type: string;
  owner_email: string;
}

/**
 * Framer project URL extraction. Server API expects the full project URL
 * (e.g. https://framer.com/projects/abc123) — we store that in
 * projects.framer_site_url already.
 */
async function loadProjectForFramer(projectId: string): Promise<ProjectRow> {
  const row = await db.queryRow<ProjectRow>`
    SELECT id, framer_site_url, project_type, owner_email
    FROM projects
    WHERE id = ${projectId} AND archived_at IS NULL
  `;
  if (!row) throw APIError.notFound(`project ${projectId} not found`);
  if (!row.framer_site_url) {
    throw APIError.failedPrecondition(
      `project ${projectId} has no framer_site_url — set it in project settings`,
    );
  }
  return row;
}

/**
 * Resolve the Framer API key for a project. Tries per-project key first
 * (project_api_keys where key_name='framer'), falls back to global
 * FramerApiKey secret.
 */
async function resolveFramerKey(projectId: string): Promise<string> {
  const row = await db.queryRow<{ encrypted: string }>`
    SELECT key_value_encrypted AS encrypted
    FROM project_api_keys
    WHERE project_id = ${projectId} AND key_name = 'framer'
  `;
  if (row) {
    try {
      return decryptApiKey(row.encrypted);
    } catch (err) {
      log.warn("framer per-project key decrypt failed, falling back to global", {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  try {
    const global = globalFramerKey();
    if (global && global.trim()) return global.trim();
  } catch {
    // Global secret not set — fall through.
  }
  throw APIError.failedPrecondition(
    `no Framer API key for project ${projectId} — set project_api_keys[framer] or FramerApiKey secret`,
  );
}

/**
 * Lazy-connect to Framer. framer-api is an optional runtime dep — if not
 * installed, we return a clear error instead of crashing the service.
 */
async function openFramerSession(projectUrl: string, apiKey: string) {
  let connect: (url: string, key: string) => Promise<unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("framer-api" as any)) as { connect: typeof connect };
    connect = mod.connect;
  } catch (err) {
    throw APIError.unavailable(
      "framer-api package not installed — run `npm install framer-api` at repo root",
    );
  }
  return connect(projectUrl, apiKey);
}

// --- Minimal shapes mirroring framer-api@0.1.7 exports. The real SDK's
// Framer type is a massive union of mixins (AvailablePluginMethods & ...)
// pulling in 7000+ lines of internal types. We declare only the subset we
// actually call so our wrapper surface stays stable across SDK patch
// releases. If a call path breaks when framer-api bumps, fix it here. ---

// Matches SDK getters on `CodeFile` class. In the real SDK these are
// readonly getters — we treat them as plain properties which is fine since
// we only ever read them.
interface CodeFileLike {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly content: string;
  setFileContent: (code: string) => Promise<CodeFileLike>;
  rename: (newName: string) => Promise<CodeFileLike>;
  remove: () => Promise<void>;
}

// Matches SDK `Hostname` interface.
interface HostnameLike {
  hostname: string;
  type: "default" | "custom" | "version";
  isPrimary: boolean;
  isPublished: boolean;
  deploymentId: string;
}

// Matches SDK `Deployment` + `PublishResult`.
interface DeploymentLike {
  id: string;
  createdAt: string;
  updatedAt: string;
}
interface PublishResultLike {
  deployment: DeploymentLike;
  hostnames: HostnameLike[];
}

interface FramerSessionLike {
  getProjectInfo: () => Promise<Record<string, unknown>>;
  getCodeFiles: () => Promise<readonly CodeFileLike[]>;
  getCodeFile: (id: string) => Promise<CodeFileLike | null>;
  // Real SDK: createCodeFile(name, code, options?) — second positional is
  // `code`, not `content`. Our callers pass the user-supplied content string
  // here directly.
  createCodeFile: (
    name: string,
    code: string,
    options?: { editViaPlugin?: boolean },
  ) => Promise<CodeFileLike>;
  publish: () => Promise<PublishResultLike>;
  // Real SDK returns Hostname[] directly (no wrapper object) and accepts
  // an optional domains[] filter.
  deploy: (deploymentId: string, domains?: string[]) => Promise<HostnameLike[]>;
  disconnect: () => Promise<void>;
}

async function withFramerSession<T>(
  projectId: string,
  fn: (session: FramerSessionLike) => Promise<T>,
): Promise<T> {
  const project = await loadProjectForFramer(projectId);
  const apiKey = await resolveFramerKey(projectId);
  const session = (await openFramerSession(project.framer_site_url!, apiKey)) as FramerSessionLike;
  try {
    return await fn(session);
  } finally {
    try {
      await session.disconnect();
    } catch (err) {
      log.warn("framer disconnect failed (non-critical)", {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// --- Internal Encore endpoints (surface = agent, via ~encore/clients). ---

export const framerGetProjectInfo = api(
  { method: "POST", path: "/projects/framer/project-info", expose: false },
  async (req: { projectId: string }): Promise<{ info: Record<string, unknown> }> => {
    const info = await withFramerSession(req.projectId, (s) => s.getProjectInfo());
    return { info };
  },
);

export const framerListCodeFiles = api(
  { method: "POST", path: "/projects/framer/code-files/list", expose: false },
  async (
    req: { projectId: string },
  ): Promise<{ files: Array<{ id: string; name: string; path?: string; size: number }> }> => {
    const files = await withFramerSession(req.projectId, (s) => s.getCodeFiles());
    return {
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        size: f.content?.length ?? 0,
      })),
    };
  },
);

export const framerCreateCodeFile = api(
  { method: "POST", path: "/projects/framer/code-files/create", expose: false },
  async (req: {
    projectId: string;
    name: string;
    content: string;
    editViaPlugin?: boolean;
  }): Promise<{ file: { id: string; name: string; path?: string } }> => {
    if (!req.name.trim()) throw APIError.invalidArgument("name required");
    const file = await withFramerSession(req.projectId, (s) =>
      s.createCodeFile(req.name, req.content, { editViaPlugin: req.editViaPlugin }),
    );
    log.info("framer code-file created", {
      projectId: req.projectId,
      name: req.name,
      fileId: file.id,
      size: req.content.length,
    });
    return { file: { id: file.id, name: file.name, path: file.path } };
  },
);

export const framerSetCodeFileContent = api(
  { method: "POST", path: "/projects/framer/code-files/set-content", expose: false },
  async (req: {
    projectId: string;
    fileId: string;
    content: string;
  }): Promise<{ success: true }> => {
    await withFramerSession(req.projectId, async (s) => {
      const file = await s.getCodeFile(req.fileId);
      if (!file) throw APIError.notFound(`code-file ${req.fileId} not found`);
      await file.setFileContent(req.content);
    });
    log.info("framer code-file updated", {
      projectId: req.projectId,
      fileId: req.fileId,
      size: req.content.length,
    });
    return { success: true };
  },
);

export const framerPublish = api(
  { method: "POST", path: "/projects/framer/publish", expose: false },
  async (
    req: { projectId: string },
  ): Promise<{ deploymentId: string; hostnames: string[] }> => {
    const result = await withFramerSession(req.projectId, (s) => s.publish());
    // SDK returns Hostname[] objects with metadata; the AI only needs the
    // hostname strings so we flatten here. Primary-first ordering helps
    // downstream UI pick the canonical URL.
    const sortedHostnames = [...result.hostnames].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
    );
    const hostnames = sortedHostnames.map((h) => h.hostname);
    log.info("framer preview published", {
      projectId: req.projectId,
      deploymentId: result.deployment.id,
      hostnames,
    });
    return { deploymentId: result.deployment.id, hostnames };
  },
);

export const framerDeploy = api(
  { method: "POST", path: "/projects/framer/deploy", expose: false },
  async (
    req: { projectId: string; deploymentId: string; domains?: string[] },
  ): Promise<{ hostnames: string[] }> => {
    // SDK's deploy() returns Hostname[] directly (not wrapped). Flatten
    // to strings for the AI payload.
    const hostsRaw = await withFramerSession(req.projectId, (s) =>
      s.deploy(req.deploymentId, req.domains),
    );
    const sorted = [...hostsRaw].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    const hostnames = sorted.map((h) => h.hostname);
    log.info("framer production deployed", {
      projectId: req.projectId,
      deploymentId: req.deploymentId,
      hostnames,
    });
    return { hostnames };
  },
);

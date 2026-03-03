import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { cache } from "~encore/clients";
import { isGitHubAppEnabled, getInstallationToken, getInstalledOrg } from "./github-app";

const githubToken = secret("GitHubToken");

// --- Token resolution ---

/**
 * Resolve the best available GitHub token for a given owner.
 * Prefers GitHub App installation token when enabled, falls back to PAT.
 */
async function resolveToken(owner?: string): Promise<string> {
  if (owner && isGitHubAppEnabled()) {
    try {
      const token = await getInstallationToken(owner);
      return token;
    } catch (err) {
      log.warn("GitHub App token failed, falling back to PAT", {
        owner,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return githubToken();
}

// --- GitHub API helper ---

async function ghApi(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
  },
) {
  const token = options?.token || githubToken();
  const url = `https://api.github.com${path}`;

  const res = await fetch(url, {
    method: options?.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    log.warn("GitHub API request failed", {
      path,
      method: options?.method || "GET",
      status: res.status,
      error: error.substring(0, 500),
    });
    throw APIError.internal(`GitHub API error ${res.status}: ${error}`);
  }

  return res.json();
}

// --- Types ---

interface TreeRequest {
  owner: string;
  repo: string;
  ref?: string;
}

interface TreeResponse {
  tree: string[];
  treeString: string;
  packageJson?: { dependencies?: Record<string, string> };
  empty?: boolean;
}

interface FileRequest {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

interface FileResponse {
  content: string;
  sha: string;
}

interface FindRelevantRequest {
  owner: string;
  repo: string;
  taskDescription: string;
  tree: string[];
}

interface FindRelevantResponse {
  paths: string[];
}

interface CreatePRRequest {
  owner: string;
  repo: string;
  branch: string;
  title: string;
  body: string;
  files: { path: string; content: string; action: "create" | "modify" | "delete" }[];
}

interface CreatePRResponse {
  url: string;
  number: number;
}

// --- Endpoints ---

// Get repository file tree (with cache — 1 hour TTL)
export const getTree = api(
  { method: "POST", path: "/github/tree", expose: false },
  async (req: TreeRequest): Promise<TreeResponse> => {
    const ref = req.ref || "main";

    // Check cache first
    const cached = await cache.getOrSetRepoStructure({
      owner: req.owner,
      repo: req.repo,
      branch: ref,
    });

    if (cached.hit && cached.structure) {
      // Cache hit — still need packageJson (lightweight)
      let packageJson;
      try {
        const pkg = await getFile({
          owner: req.owner,
          repo: req.repo,
          path: "package.json",
          ref,
        });
        packageJson = JSON.parse(pkg.content);
      } catch {
        // Intentionally silent: package.json is optional — many repos don't have one
        packageJson = undefined;
      }
      return {
        tree: cached.structure.tree,
        treeString: cached.structure.treeString,
        packageJson,
      };
    }

    // Cache miss — fetch from GitHub (handle empty repos)
    const token = await resolveToken(req.owner);
    const treeRes = await fetch(
      `https://api.github.com/repos/${req.owner}/${req.repo}/git/trees/${ref}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    // Empty repo returns 404 or 409 — return empty indicator
    if (treeRes.status === 404 || treeRes.status === 409) {
      return { tree: [], treeString: "", empty: true };
    }

    if (!treeRes.ok) {
      const error = await treeRes.text();
      throw APIError.internal(`GitHub API error ${treeRes.status}: ${error}`);
    }

    const data = await treeRes.json();

    const tree: string[] = data.tree
      .filter((item: any) => item.type === "blob")
      .map((item: any) => item.path)
      .filter(
        (p: string) =>
          !p.startsWith("node_modules/") &&
          !p.startsWith(".git/") &&
          !p.startsWith("dist/") &&
          !p.startsWith(".next/")
      );

    const treeString = tree.join("\n");

    // Store in cache
    await cache.getOrSetRepoStructure({
      owner: req.owner,
      repo: req.repo,
      branch: ref,
      structure: { tree, treeString },
    });

    // Try to read package.json
    let packageJson;
    try {
      const pkg = await getFile({
        owner: req.owner,
        repo: req.repo,
        path: "package.json",
        ref,
      });
      packageJson = JSON.parse(pkg.content);
    } catch {
      packageJson = undefined;
    }

    return { tree, treeString, packageJson };
  }
);

// Get file content
export const getFile = api(
  { method: "POST", path: "/github/file", expose: false },
  async (req: FileRequest): Promise<FileResponse> => {
    const ref = req.ref || "main";
    const token = await resolveToken(req.owner);
    const data = await ghApi(
      `/repos/${req.owner}/${req.repo}/contents/${req.path}?ref=${ref}`,
      { token },
    );

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content, sha: data.sha };
  }
);

// Get file metadata (line count) without full content
interface FileMetadataRequest {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

interface FileMetadataResponse {
  path: string;
  totalLines: number;
  sizeBytes: number;
}

export const getFileMetadata = api(
  { method: "POST", path: "/github/file-metadata", expose: false },
  async (req: FileMetadataRequest): Promise<FileMetadataResponse> => {
    const ref = req.ref || "main";
    const token = await resolveToken(req.owner);
    const data = await ghApi(
      `/repos/${req.owner}/${req.repo}/contents/${req.path}?ref=${ref}`,
      { token },
    );

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const totalLines = content.split("\n").length;

    return {
      path: req.path,
      totalLines,
      sizeBytes: data.size || content.length,
    };
  }
);

// Get a chunk of a file by line range
interface FileChunkRequest {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
  startLine?: number; // 1-based, default 1
  maxLines?: number;  // default 100
}

interface FileChunkResponse {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  hasMore: boolean;
  nextStartLine: number | null;
  tokenEstimate: number; // rough estimate: ~4 chars per token
}

export const getFileChunk = api(
  { method: "POST", path: "/github/file-chunk", expose: false },
  async (req: FileChunkRequest): Promise<FileChunkResponse> => {
    const ref = req.ref || "main";
    const startLine = Math.max(req.startLine || 1, 1);
    const maxLines = Math.min(req.maxLines || 100, 500);

    // Fetch full file from GitHub
    const token = await resolveToken(req.owner);
    const data = await ghApi(
      `/repos/${req.owner}/${req.repo}/contents/${req.path}?ref=${ref}`,
      { token },
    );

    const fullContent = Buffer.from(data.content, "base64").toString("utf-8");
    const allLines = fullContent.split("\n");
    const totalLines = allLines.length;

    // Slice requested range (convert to 0-based)
    const startIdx = startLine - 1;
    const endIdx = Math.min(startIdx + maxLines, totalLines);
    const chunk = allLines.slice(startIdx, endIdx);

    const content = chunk.join("\n");
    const hasMore = endIdx < totalLines;

    return {
      path: req.path,
      content,
      startLine,
      endLine: endIdx,
      totalLines,
      hasMore,
      nextStartLine: hasMore ? endIdx + 1 : null,
      tokenEstimate: Math.ceil(content.length / 4),
    };
  }
);

// Determine which files are relevant for a task
export const findRelevantFiles = api(
  { method: "POST", path: "/github/relevant", expose: false },
  async (req: FindRelevantRequest): Promise<FindRelevantResponse> => {
    // Heuristic: find files related to the task based on keywords
    const keywords = req.taskDescription
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const scored = req.tree.map((path) => {
      const pathLower = path.toLowerCase();
      let score = 0;

      // Score based on keyword matches in path
      keywords.forEach((kw) => {
        if (pathLower.includes(kw)) score += 3;
      });

      // Boost important file types
      if (path.endsWith("encore.service.ts")) score += 2;
      if (path.includes("migration")) score += 1;
      if (path === "package.json") score += 2;
      if (path === "tsconfig.json") score += 1;

      // Boost source files
      if (path.endsWith(".ts") || path.endsWith(".tsx")) score += 1;

      return { path, score };
    });

    // Return top files, max 20 to stay within context limits
    const relevant = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((s) => s.path);

    // Always include key config files
    const essentials = ["package.json", "tsconfig.json", "encore.app"];
    essentials.forEach((e) => {
      if (req.tree.includes(e) && !relevant.includes(e)) {
        relevant.push(e);
      }
    });

    return { paths: relevant };
  }
);

// Helper: get SHA of a ref, returns null if ref doesn't exist (404/409)
async function getRefSha(owner: string, repo: string, branch: string, token?: string): Promise<string | null> {
  try {
    const data = await ghApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, { token });
    return data.object.sha;
  } catch (error: any) {
    const msg = error?.message || "";
    if (msg.includes("404") || msg.includes("409")) return null;
    throw error;
  }
}

// Create a branch, commit files, and open a pull request
// Handles empty repos: creates an initial commit on main, then opens a PR as normal
export const createPR = api(
  { method: "POST", path: "/github/pr", expose: false },
  async (req: CreatePRRequest): Promise<CreatePRResponse> => {
    // Resolve the best available token for this org
    const token = await resolveToken(req.owner);

    // 0. Verify the repo exists and is accessible before proceeding
    try {
      const repoData = await ghApi(`/repos/${req.owner}/${req.repo}`, { token });
      log.info("createPR: repo verified", {
        owner: req.owner,
        repo: req.repo,
        defaultBranch: repoData.default_branch,
        empty: repoData.size === 0,
      });
    } catch (repoErr: any) {
      const msg = repoErr?.message || String(repoErr);
      if (msg.includes("404")) {
        log.error("createPR: repo not found — verify the repo exists and the token has access", {
          owner: req.owner,
          repo: req.repo,
          usingGitHubApp: isGitHubAppEnabled(),
        });
        throw APIError.notFound(
          `Repository ${req.owner}/${req.repo} not found. ` +
          `Verify: (1) the repo exists on GitHub, (2) the ${isGitHubAppEnabled() ? "GitHub App is installed on the org" : "GitHubToken PAT has access to the repo"}.`
        );
      }
      throw repoErr;
    }

    // 1. Get the SHA of the base branch (main, fallback master)
    let baseSha = await getRefSha(req.owner, req.repo, "main", token);
    if (!baseSha) {
      baseSha = await getRefSha(req.owner, req.repo, "master", token);
    }

    // 2. If repo is empty, create an initial commit on main first
    if (!baseSha) {
      // Empty repo — GitHub Git Data API doesn't work on empty repos.
      // Must use Contents API for the initial commit.
      log.info("createPR: empty repo detected, creating initial commit", {
        owner: req.owner,
        repo: req.repo,
      });

      await ghApi(`/repos/${req.owner}/${req.repo}/contents/README.md`, {
        method: "PUT",
        body: {
          message: "Initial commit — TheFold",
          content: Buffer.from(`# ${req.repo}\n\nInitialized by TheFold\n`).toString("base64"),
        },
        token,
      });

      // GitHub needs a moment to propagate the new branch
      await new Promise(resolve => setTimeout(resolve, 2000));

      baseSha = await getRefSha(req.owner, req.repo, "main", token);
      if (!baseSha) {
        // Retry once with extra delay
        log.info("createPR: getRefSha returned null after 2s, retrying in 3s...", {
          owner: req.owner,
          repo: req.repo,
        });
        await new Promise(resolve => setTimeout(resolve, 3000));
        baseSha = await getRefSha(req.owner, req.repo, "main", token);
      }
      if (!baseSha) {
        throw APIError.internal(
          `Failed to initialize empty repository ${req.owner}/${req.repo} — branch not propagated after 5s`
        );
      }
      log.info("createPR: initial commit created", { baseSha, owner: req.owner, repo: req.repo });
    }

    // 3. Create blobs for all files
    const treeItems = await Promise.all(
      req.files
        .filter((f) => f.action !== "delete")
        .map(async (f) => {
          const blob = await ghApi(`/repos/${req.owner}/${req.repo}/git/blobs`, {
            method: "POST",
            body: { content: f.content, encoding: "utf-8" },
            token,
          });
          return {
            path: f.path,
            mode: "100644" as const,
            type: "blob" as const,
            sha: blob.sha,
          };
        })
    );

    // Handle deletions
    req.files
      .filter((f) => f.action === "delete")
      .forEach((f) => {
        treeItems.push({
          path: f.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null as any,
        });
      });

    // 4. Get the base tree
    const baseCommit = await ghApi(
      `/repos/${req.owner}/${req.repo}/git/commits/${baseSha}`,
      { token },
    );

    // 5. Create new tree with base
    const newTree = await ghApi(`/repos/${req.owner}/${req.repo}/git/trees`, {
      method: "POST",
      body: { base_tree: baseCommit.tree.sha, tree: treeItems },
      token,
    });

    // 6. Create commit
    const commit = await ghApi(`/repos/${req.owner}/${req.repo}/git/commits`, {
      method: "POST",
      body: {
        message: req.title,
        tree: newTree.sha,
        parents: [baseSha],
      },
      token,
    });

    // 7. Create branch
    try {
      await ghApi(`/repos/${req.owner}/${req.repo}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${req.branch}`, sha: commit.sha },
        token,
      });
    } catch {
      // Branch might already exist — update it
      await ghApi(`/repos/${req.owner}/${req.repo}/git/refs/heads/${req.branch}`, {
        method: "PATCH",
        body: { sha: commit.sha, force: true },
        token,
      });
    }

    // 8. Create pull request (handle 422 "already exists" idempotently)
    let pr: { html_url: string; number: number };
    try {
      pr = await ghApi(`/repos/${req.owner}/${req.repo}/pulls`, {
        method: "POST",
        body: {
          title: req.title,
          body: req.body,
          head: req.branch,
          base: "main",
        },
        token,
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("422") && msg.toLowerCase().includes("already exists")) {
        // PR already exists for this branch — find and return it
        const existing = await ghApi(
          `/repos/${req.owner}/${req.repo}/pulls?head=${req.owner}:${req.branch}&state=open`,
          { token },
        );
        if (Array.isArray(existing) && existing.length > 0) {
          return { url: existing[0].html_url, number: existing[0].number };
        }
        // Also check closed PRs
        const closed = await ghApi(
          `/repos/${req.owner}/${req.repo}/pulls?head=${req.owner}:${req.branch}&state=closed`,
          { token },
        );
        if (Array.isArray(closed) && closed.length > 0) {
          return { url: closed[0].html_url, number: closed[0].number };
        }
      }
      throw e;
    }

    return { url: pr.html_url, number: pr.number };
  }
);

// --- Create or update a single file directly on a branch (no PR) ---

interface CreateOrUpdateFileRequest {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string; // default "main"
}

interface CreateOrUpdateFileResponse {
  sha: string;
  path: string;
}

export const createOrUpdateFile = api(
  { method: "PUT", path: "/github/contents", expose: false },
  async (req: CreateOrUpdateFileRequest): Promise<CreateOrUpdateFileResponse> => {
    const token = await resolveToken(req.owner);
    const branch = req.branch || "main";

    // Check if file already exists (to get its SHA for update)
    let existingSha: string | undefined;
    try {
      const existing = await ghApi(
        `/repos/${req.owner}/${req.repo}/contents/${req.path}?ref=${branch}`,
        { token },
      );
      existingSha = existing.sha;
    } catch {
      // File doesn't exist — this is a create, not update
    }

    const body: Record<string, unknown> = {
      message: req.message,
      content: Buffer.from(req.content).toString("base64"),
      branch,
    };
    if (existingSha) {
      body.sha = existingSha;
    }

    const result = await ghApi(
      `/repos/${req.owner}/${req.repo}/contents/${req.path}`,
      {
        method: "PUT",
        body,
        token,
      },
    );

    return {
      sha: result.content?.sha || result.commit?.sha || "",
      path: req.path,
    };
  },
);

// --- List repos for an org/user ---

interface ListReposRequest {
  owner?: string; // Optional — if omitted, lists repos accessible to the authenticated user
}

interface RepoInfo {
  name: string;
  fullName: string;
  description: string;
  language: string;
  defaultBranch: string;
  pushedAt: string;
  updatedAt: string;
  private: boolean;
  archived: boolean;
  stargazersCount: number;
  openIssuesCount: number;
}

interface ListReposResponse {
  repos: RepoInfo[];
}

export const listRepos = api(
  { method: "POST", path: "/github/repos", expose: true, auth: true },
  async (req: ListReposRequest): Promise<ListReposResponse> => {
    let targetOwner = req.owner;

    // If no owner specified: resolve from GitHub App installation
    if (!targetOwner) {
      targetOwner = await getInstalledOrg() ?? undefined;
    }

    if (!targetOwner) {
      log.warn("listRepos: no owner and no GitHub App installation found");
      return { repos: [] };
    }

    const token = await resolveToken(targetOwner);
    const data = await ghApi(
      `/orgs/${targetOwner}/repos?sort=pushed&per_page=30&type=all`,
      { token }
    );

    const repos: RepoInfo[] = (data as Array<Record<string, unknown>>)
      .filter((r) => !r.archived)
      .map((r) => ({
        name: r.name as string,
        fullName: r.full_name as string,
        description: (r.description as string) || "",
        language: (r.language as string) || "",
        defaultBranch: (r.default_branch as string) || "main",
        pushedAt: (r.pushed_at as string) || "",
        updatedAt: (r.updated_at as string) || "",
        private: (r.private as boolean) || false,
        archived: false,
        stargazersCount: (r.stargazers_count as number) || 0,
        openIssuesCount: (r.open_issues_count as number) || 0,
      }));

    return { repos };
  }
);

// --- Ensure a repository exists (creates if not found, works with PAT or App) ---

interface EnsureRepoRequest {
  owner: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
}

interface EnsureRepoResponse {
  exists: boolean;
  created: boolean;
  url: string;
}

export const ensureRepoExists = api(
  { method: "POST", path: "/github/repo/ensure", expose: false },
  async (req: EnsureRepoRequest): Promise<EnsureRepoResponse> => {
    // Sanitize repo name — spaces and special chars break git URLs
    const safeName = req.name
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .substring(0, 100);

    if (!safeName) {
      throw APIError.invalidArgument("Ugyldig reponavn etter sanitering");
    }

    const token = await resolveToken(req.owner);

    // 1. Check if repo already exists
    const checkRes = await fetch(`https://api.github.com/repos/${req.owner}/${safeName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (checkRes.ok) {
      const repo = await checkRes.json();
      return { exists: true, created: false, url: repo.html_url };
    }

    if (checkRes.status !== 404) {
      const error = await checkRes.text();
      throw APIError.internal(`GitHub check repo failed: ${checkRes.status} ${error}`);
    }

    // 2. Repo not found — create it
    log.info("ensureRepoExists: creating repo", { owner: req.owner, name: safeName });

    // Try org endpoint first, fall back to user endpoint
    let createRes = await fetch(`https://api.github.com/orgs/${req.owner}/repos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: safeName,
        description: req.description || "Created by TheFold",
        private: req.isPrivate ?? true,
        auto_init: true,
      }),
    });

    // If org endpoint fails (not an org), try user endpoint
    if (createRes.status === 404) {
      createRes = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: safeName,
          description: req.description || "Created by TheFold",
          private: req.isPrivate ?? true,
          auto_init: true,
        }),
      });
    }

    if (!createRes.ok) {
      const error = await createRes.text();
      throw APIError.internal(`Failed to create repo ${req.owner}/${safeName}: ${createRes.status} ${error}`);
    }

    const repo = await createRes.json();
    log.info("ensureRepoExists: repo created", { url: repo.html_url });

    // 3. Wait briefly for GitHub to finish initializing the repo
    await new Promise(r => setTimeout(r, 2000));

    return { exists: true, created: true, url: repo.html_url };
  }
);

// --- Create a new repository (requires GitHub App) ---

interface CreateRepoRequest {
  org: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
}

interface CreateRepoResponse {
  url: string;
  cloneUrl: string;
}

export const createRepo = api(
  { method: "POST", path: "/github/repo/create", expose: true, auth: true },
  async (req: CreateRepoRequest): Promise<CreateRepoResponse> => {
    if (!isGitHubAppEnabled()) {
      throw APIError.failedPrecondition("GitHub App not enabled. Set GitHubAppEnabled=true");
    }

    // Sanitize repo name — spaces and special chars break git URLs
    const safeName = req.name
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .substring(0, 100);

    if (!safeName) {
      throw APIError.invalidArgument("Ugyldig reponavn etter sanitering");
    }

    const token = await getInstallationToken(req.org);

    const res = await fetch(`https://api.github.com/orgs/${req.org}/repos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: safeName,
        description: req.description || "Created by TheFold",
        private: req.isPrivate ?? true,
        auto_init: true,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw APIError.internal(`Failed to create repo: ${res.status} ${error}`);
    }

    const repo = await res.json();
    return { url: repo.html_url, cloneUrl: repo.clone_url };
  }
);

// --- Get installed GitHub App org/owner ---

interface GetInstalledOrgResponse {
  owner: string;
}

export const getGitHubOwner = api(
  { method: "GET", path: "/github/owner", expose: false },
  async (): Promise<GetInstalledOrgResponse> => {
    const owner = await getInstalledOrg();
    if (!owner) {
      throw APIError.failedPrecondition("No GitHub App installation found. Is the GitHub App installed?");
    }
    return { owner };
  }
);

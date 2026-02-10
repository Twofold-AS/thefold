import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";

const githubToken = secret("GitHubToken");

// --- GitHub API helper ---

async function ghApi(path: string, options?: RequestInit & { body?: unknown }) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
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

// Get repository file tree
export const getTree = api(
  { method: "POST", path: "/github/tree", expose: false },
  async (req: TreeRequest): Promise<TreeResponse> => {
    const ref = req.ref || "main";
    const data = await ghApi(
      `/repos/${req.owner}/${req.repo}/git/trees/${ref}?recursive=1`
    );

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
    const data = await ghApi(
      `/repos/${req.owner}/${req.repo}/contents/${req.path}?ref=${ref}`
    );

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content, sha: data.sha };
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

// Create a branch, commit files, and open a pull request
export const createPR = api(
  { method: "POST", path: "/github/pr", expose: false },
  async (req: CreatePRRequest): Promise<CreatePRResponse> => {
    // 1. Get the SHA of the base branch
    const mainRef = await ghApi(
      `/repos/${req.owner}/${req.repo}/git/ref/heads/main`
    );
    const baseSha = mainRef.object.sha;

    // 2. Get the base tree
    const baseCommit = await ghApi(
      `/repos/${req.owner}/${req.repo}/git/commits/${baseSha}`
    );

    // 3. Create blobs for each file
    const treeItems = await Promise.all(
      req.files
        .filter((f) => f.action !== "delete")
        .map(async (f) => {
          const blob = await ghApi(`/repos/${req.owner}/${req.repo}/git/blobs`, {
            method: "POST",
            body: { content: f.content, encoding: "utf-8" },
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
          sha: null as any, // null SHA = deletion
        });
      });

    // 4. Create new tree
    const newTree = await ghApi(`/repos/${req.owner}/${req.repo}/git/trees`, {
      method: "POST",
      body: { base_tree: baseCommit.tree.sha, tree: treeItems },
    });

    // 5. Create commit
    const commit = await ghApi(`/repos/${req.owner}/${req.repo}/git/commits`, {
      method: "POST",
      body: {
        message: req.title,
        tree: newTree.sha,
        parents: [baseSha],
      },
    });

    // 6. Create branch
    try {
      await ghApi(`/repos/${req.owner}/${req.repo}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${req.branch}`, sha: commit.sha },
      });
    } catch {
      // Branch might already exist — update it
      await ghApi(`/repos/${req.owner}/${req.repo}/git/refs/heads/${req.branch}`, {
        method: "PATCH",
        body: { sha: commit.sha, force: true },
      });
    }

    // 7. Create pull request
    const pr = await ghApi(`/repos/${req.owner}/${req.repo}/pulls`, {
      method: "POST",
      body: {
        title: req.title,
        body: req.body,
        head: req.branch,
        base: "main",
      },
    });

    return { url: pr.html_url, number: pr.number };
  }
);

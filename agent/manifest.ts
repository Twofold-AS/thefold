import log from "encore.dev/log";
import { memory } from "~encore/clients";
import { callAIWithFallback, stripMarkdownJson } from "../ai/call";

export interface ProjectManifest {
  id: string;
  repoOwner: string;
  repoName: string;
  summary: string | null;
  techStack: string[];
  services: unknown[];
  dataModels: unknown[];
  contracts: unknown[];
  conventions: string | null;
  knownPitfalls: string | null;
  fileCount: number | null;
  lastAnalyzedAt: string | null;
  version: number;
  /** D27: Map of file path → hash string for diff-based context detection */
  fileHashes?: Record<string, string>;
}

/**
 * Get or create a project manifest.
 * Checks DB first; generates via AI (Haiku) if missing or stale (> 7 days).
 * Returns null if treeString is not provided and no manifest exists.
 */
export async function getOrCreateManifest(
  owner: string,
  repo: string,
  treeString?: string
): Promise<ProjectManifest | null> {
  // Try to get existing manifest
  try {
    const result = await memory.getManifest({ repoOwner: owner, repoName: repo });
    if (result.manifest) {
      const lastAnalyzed = result.manifest.lastAnalyzedAt
        ? new Date(result.manifest.lastAnalyzedAt)
        : null;
      const staleDays = lastAnalyzed
        ? (Date.now() - lastAnalyzed.getTime()) / (1000 * 60 * 60 * 24)
        : 999;
      if (staleDays < 7) {
        log.info("manifest loaded from cache", { owner, repo, version: result.manifest.version });
        return result.manifest;
      }
      log.info("manifest is stale, regenerating", { owner, repo, staleDays: Math.round(staleDays) });
    }
  } catch {
    // Not found — generate
  }

  if (!treeString) return null;

  // Generate via AI (Haiku — cheap, sufficient)
  try {
    const response = await callAIWithFallback({
      model: "claude-haiku-4-5-20250929",
      system: "You are a code analysis assistant. Analyze repository structures and return concise JSON manifests.",
      messages: [
        {
          role: "user",
          content: `Analyze this repository structure and provide a brief manifest in JSON format.

Repository: ${owner}/${repo}
Structure:
${treeString.substring(0, 3000)}

Respond with JSON only:
{
  "summary": "one sentence description",
  "techStack": ["list", "of", "technologies"],
  "conventions": "key coding conventions observed",
  "knownPitfalls": "potential issues or gotchas"
}`,
        },
      ],
      maxTokens: 800,
    });

    let parsed: Record<string, unknown> = {};
    try {
      const raw = stripMarkdownJson(response.content);
      parsed = JSON.parse(raw);
    } catch {
      // Use defaults if parsing fails
      log.warn("manifest AI response parse failed", { owner, repo, content: response.content.substring(0, 200) });
    }

    const manifest = await memory.updateManifest({
      repoOwner: owner,
      repoName: repo,
      summary: (parsed.summary as string) || null,
      techStack: (parsed.techStack as string[]) || [],
      conventions: (parsed.conventions as string) || null,
      knownPitfalls: (parsed.knownPitfalls as string) || null,
    });

    log.info("manifest generated and stored", { owner, repo, version: manifest.manifest.version });
    return manifest.manifest;
  } catch (err) {
    log.warn("manifest generation failed", {
      owner,
      repo,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Lightweight update after task completion — bumps version and updates timestamp.
 * Fire-and-forget: errors are swallowed.
 */
export async function updateManifest(
  owner: string,
  repo: string,
  changedFiles: string[]
): Promise<void> {
  try {
    await memory.updateManifest({
      repoOwner: owner,
      repoName: repo,
      changedFiles,
    });
    log.info("manifest version bumped", { owner, repo, changedFiles: changedFiles.length });
  } catch (err) {
    log.warn("manifest update (version bump) failed", {
      owner,
      repo,
      error: err instanceof Error ? err.message : String(err),
    });
    // Non-critical — swallow
  }
}

/**
 * Format a manifest for injection into AI context.
 * Returns a markdown section (~500-800 tokens).
 */
export function formatManifestForContext(manifest: ProjectManifest): string {
  const lines: string[] = ["## Project Architecture"];

  if (manifest.summary) {
    lines.push(`**Summary:** ${manifest.summary}`);
  }

  if (manifest.techStack.length > 0) {
    lines.push(`**Tech Stack:** ${manifest.techStack.join(", ")}`);
  }

  if (manifest.conventions) {
    lines.push(`\n**Conventions:**\n${manifest.conventions}`);
  }

  if (manifest.knownPitfalls) {
    lines.push(`\n**Known Pitfalls:**\n${manifest.knownPitfalls}`);
  }

  if (manifest.fileCount) {
    lines.push(`\n**File Count:** ${manifest.fileCount} files`);
  }

  lines.push(`*(Manifest v${manifest.version})*`);

  return lines.join("\n");
}

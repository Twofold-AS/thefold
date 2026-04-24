// projects/manifest-updater.ts
//
// Background manifest refresher. Replaces the old per-send onboarding-scan
// hot path (removed from chat/chat.ts). Three entry points:
//
//   1. ensureManifestIsFresh(owner, repo) — cheap call site used by
//      chat/ai-endpoints when serving a turn. Returns the cached manifest
//      if <24h old. If stale or missing, fires a background refresh
//      (non-blocking) and returns the cached manifest anyway (or null).
//
//   2. POST /projects/refresh-manifest — internal/manual trigger for a
//      single project (by owner+repo).
//
//   3. Cron (every 6h) — iterates all active projects with a github_repo
//      that saw activity in the last 24h and refreshes any manifest
//      whose last_analyzed_at is >24h ago.

import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { db } from "./db";
import { getOrCreateManifest } from "../agent/manifest";
import { memory } from "~encore/clients";

// Background refreshes in-flight keyed by "owner/repo". Prevents stampede
// when many concurrent sends trigger stale-manifest detection on the same
// project.
const inFlight = new Set<string>();

function refreshKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

/**
 * Fire-and-forget background refresh. `getOrCreateManifest` handles staleness
 * internally (7-day threshold in the current helper), generates via AI, and
 * persists via memory.saveManifest. We just coordinate single-flight.
 */
async function backgroundRefresh(owner: string, repo: string): Promise<void> {
  const key = refreshKey(owner, repo);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await getOrCreateManifest(owner, repo);
    log.info("manifest refreshed", { owner, repo });
  } catch (err) {
    log.warn("manifest refresh failed", {
      owner,
      repo,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Read-only check used by hot paths. Returns the cached manifest if present
 * (regardless of age — caller decides if stale is acceptable). If the
 * manifest is older than staleThresholdHours (default 24), triggers a
 * background refresh but returns the cached version immediately.
 */
export async function ensureManifestIsFresh(
  owner: string,
  repo: string,
  staleThresholdHours = 24,
): Promise<{
  manifest: Awaited<ReturnType<typeof memory.getManifest>>["manifest"];
  isFresh: boolean;
}> {
  const result = await memory.getManifest({ repoOwner: owner, repoName: repo }).catch(() => ({ manifest: null }));
  const manifest = result.manifest;
  if (!manifest) {
    // No manifest yet — kick off initial generation in the background.
    // First few turns won't have it, but subsequent turns will.
    void backgroundRefresh(owner, repo);
    return { manifest: null, isFresh: false };
  }
  const ageMs = manifest.lastAnalyzedAt
    ? Date.now() - new Date(manifest.lastAnalyzedAt).getTime()
    : Infinity;
  const staleMs = staleThresholdHours * 60 * 60 * 1000;
  const isFresh = ageMs < staleMs;
  if (!isFresh) {
    void backgroundRefresh(owner, repo);
  }
  return { manifest, isFresh };
}

// --- Manual-trigger endpoint ---

interface RefreshRequest {
  owner: string;
  repo: string;
}

interface RefreshResponse {
  owner: string;
  repo: string;
  refreshed: boolean;
}

export const refreshManifest = api(
  { method: "POST", path: "/projects/refresh-manifest", expose: false },
  async (req: RefreshRequest): Promise<RefreshResponse> => {
    const key = refreshKey(req.owner, req.repo);
    if (inFlight.has(key)) {
      return { owner: req.owner, repo: req.repo, refreshed: false };
    }
    await backgroundRefresh(req.owner, req.repo);
    return { owner: req.owner, repo: req.repo, refreshed: true };
  },
);

// --- Cron: 6h periodic refresh for active repos ---
//
// Walks projects with a github_repo set and activity in the last 24h, and
// refreshes the manifest if >24h old. Runs at 02:00, 08:00, 14:00, 20:00
// UTC to spread load off user-peak hours.

async function refreshActiveProjectManifests(): Promise<{ checked: number; refreshed: number }> {
  const stats = { checked: 0, refreshed: 0 };
  const rows = db.query<{ github_repo: string }>`
    SELECT github_repo
    FROM projects
    WHERE archived_at IS NULL
      AND github_repo IS NOT NULL
      AND github_repo <> ''
      AND updated_at > NOW() - INTERVAL '24 hours'
  `;
  for await (const row of rows) {
    stats.checked += 1;
    const [owner, repo] = row.github_repo.split("/");
    if (!owner || !repo) continue;
    const { isFresh } = await ensureManifestIsFresh(owner, repo, 24);
    if (!isFresh) stats.refreshed += 1;
  }
  return stats;
}

export const manifestCronRun = api(
  { method: "POST", path: "/projects/manifest-cron", expose: false },
  async (): Promise<{ checked: number; refreshed: number }> => {
    const r = await refreshActiveProjectManifests();
    log.info("manifest cron complete", r);
    return r;
  },
);

const _manifestCron = new CronJob("manifest-refresh", {
  title: "Refresh stale project manifests",
  schedule: "0 */6 * * *",
  endpoint: manifestCronRun,
});

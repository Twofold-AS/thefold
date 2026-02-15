import { api } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { CronJob } from "encore.dev/cron";
import { createHash } from "crypto";

// --- Database ---
// PostgreSQL-based cache (CacheCluster not available in Encore.ts yet)

export const db = new SQLDatabase("cache", {
  migrations: "./migrations",
});

// --- Helpers ---

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function cacheGet(key: string): Promise<unknown | null> {
  const row = await db.queryRow<{ value: unknown }>`
    SELECT value FROM cache_entries
    WHERE key = ${key}
      AND (expires_at IS NULL OR expires_at > NOW())
  `;

  if (!row) return null;

  // Update last_used_at
  await db.exec`
    UPDATE cache_entries SET last_used_at = NOW() WHERE key = ${key}
  `;

  // Encore's Rust driver may return JSONB as a string — parse defensively
  if (typeof row.value === "string") {
    try { return JSON.parse(row.value); } catch { return row.value; }
  }
  return row.value;
}

async function cacheSet(
  key: string,
  namespace: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  await db.exec`
    INSERT INTO cache_entries (key, namespace, value, expires_at)
    VALUES (
      ${key},
      ${namespace},
      ${JSON.stringify(value)}::jsonb,
      NOW() + (${ttlSeconds} * interval '1 second')
    )
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at,
      last_used_at = NOW()
  `;
}

// --- Stats tracking (in DB for persistence across restarts) ---

async function incrementStat(namespace: string, hit: boolean): Promise<void> {
  const statKey = `_stats:${namespace}:${hit ? "hits" : "misses"}`;
  await db.exec`
    INSERT INTO cache_entries (key, namespace, value, expires_at)
    VALUES (${statKey}, '_stats', '0'::jsonb, NULL)
    ON CONFLICT (key) DO UPDATE SET
      value = to_jsonb((cache_entries.value::text::int + 1))
  `;
}

async function getStatValue(statKey: string): Promise<number> {
  const row = await db.queryRow<{ value: unknown }>`
    SELECT value FROM cache_entries WHERE key = ${statKey}
  `;
  if (!row) return 0;
  return typeof row.value === "number" ? row.value : Number(row.value);
}

// --- Embeddings Cache (90 days TTL) ---

interface EmbeddingCacheRequest {
  content: string;
  embedding?: number[];
}

interface EmbeddingCacheResponse {
  hit: boolean;
  embedding?: number[];
}

export const getOrSetEmbedding = api(
  { method: "POST", path: "/cache/embedding", expose: false },
  async (req: EmbeddingCacheRequest): Promise<EmbeddingCacheResponse> => {
    const key = `emb:${hashContent(req.content)}`;

    const cached = await cacheGet(key);
    if (cached) {
      await incrementStat("embedding", true);
      return { hit: true, embedding: cached as number[] };
    }

    await incrementStat("embedding", false);

    if (req.embedding) {
      await cacheSet(key, "embedding", req.embedding, 90 * 24 * 3600); // 90 days
    }

    return { hit: false, embedding: req.embedding };
  }
);

// --- Repo Structure Cache (1 hour TTL) ---

interface RepoStructureCacheRequest {
  owner: string;
  repo: string;
  branch: string;
  structure?: { tree: string[]; treeString: string };
}

interface RepoStructureCacheResponse {
  hit: boolean;
  structure?: { tree: string[]; treeString: string };
}

export const getOrSetRepoStructure = api(
  { method: "POST", path: "/cache/repo-structure", expose: false },
  async (req: RepoStructureCacheRequest): Promise<RepoStructureCacheResponse> => {
    const key = `repo:${req.owner}/${req.repo}:${req.branch}`;

    const cached = await cacheGet(key);
    if (cached) {
      await incrementStat("repo", true);
      return { hit: true, structure: cached as { tree: string[]; treeString: string } };
    }

    await incrementStat("repo", false);

    if (req.structure) {
      await cacheSet(key, "repo", req.structure, 3600); // 1 hour
    }

    return { hit: false, structure: req.structure };
  }
);

// --- AI Planning Cache (24 hours TTL) ---

interface AIPlanCacheRequest {
  taskDescription: string;
  repoHash: string;
  plan?: Record<string, unknown>;
}

interface AIPlanCacheResponse {
  hit: boolean;
  plan?: Record<string, unknown>;
}

export const getOrSetAIPlan = api(
  { method: "POST", path: "/cache/ai-plan", expose: false },
  async (req: AIPlanCacheRequest): Promise<AIPlanCacheResponse> => {
    const key = `plan:${hashContent(req.taskDescription + req.repoHash)}`;

    const cached = await cacheGet(key);
    if (cached) {
      await incrementStat("aiPlan", true);
      return { hit: true, plan: cached as Record<string, unknown> };
    }

    await incrementStat("aiPlan", false);

    if (req.plan) {
      await cacheSet(key, "aiPlan", req.plan, 86400); // 24 hours
    }

    return { hit: false, plan: req.plan };
  }
);

// --- Cache Statistics ---

interface CacheStats {
  embeddingHits: number;
  embeddingMisses: number;
  repoHits: number;
  repoMisses: number;
  aiPlanHits: number;
  aiPlanMisses: number;
  hitRate: number;
  totalEntries: number;
}

export const getStats = api(
  { method: "GET", path: "/cache/stats", expose: true, auth: false },
  async (): Promise<CacheStats> => {
    const embeddingHits = await getStatValue("_stats:embedding:hits");
    const embeddingMisses = await getStatValue("_stats:embedding:misses");
    const repoHits = await getStatValue("_stats:repo:hits");
    const repoMisses = await getStatValue("_stats:repo:misses");
    const aiPlanHits = await getStatValue("_stats:aiPlan:hits");
    const aiPlanMisses = await getStatValue("_stats:aiPlan:misses");

    const totalHits = embeddingHits + repoHits + aiPlanHits;
    const totalMisses = embeddingMisses + repoMisses + aiPlanMisses;
    const total = totalHits + totalMisses;

    const countRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM cache_entries
      WHERE namespace != '_stats'
    `;

    return {
      embeddingHits,
      embeddingMisses,
      repoHits,
      repoMisses,
      aiPlanHits,
      aiPlanMisses,
      hitRate: total > 0 ? Math.round((totalHits / total) * 100 * 10) / 10 : 0,
      totalEntries: countRow?.count ?? 0,
    };
  }
);

// --- Cache Invalidation ---

interface InvalidateRequest {
  namespace?: string;
  key?: string;
}

interface InvalidateResponse {
  deleted: number;
}

export const invalidate = api(
  { method: "POST", path: "/cache/invalidate", expose: false },
  async (req: InvalidateRequest): Promise<InvalidateResponse> => {
    if (req.key) {
      await db.exec`DELETE FROM cache_entries WHERE key = ${req.key}`;
      return { deleted: 1 };
    }
    if (req.namespace) {
      const row = await db.queryRow<{ count: number }>`
        WITH deleted AS (
          DELETE FROM cache_entries WHERE namespace = ${req.namespace} RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;
      return { deleted: row?.count ?? 0 };
    }
    return { deleted: 0 };
  }
);

// --- Cleanup endpoint ---

export const cleanupExpired = api(
  { method: "POST", path: "/cache/cleanup", expose: false },
  async (): Promise<{ deleted: number }> => {
    const row = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM cache_entries
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;
    return { deleted: row?.count ?? 0 };
  }
);

// --- Cleanup CronJob: remove expired entries every hour ---

const _ = new CronJob("cache-cleanup", {
  title: "Clean up expired cache entries",
  every: "1h",
  endpoint: cleanupExpired,
});

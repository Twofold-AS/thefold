// Dream Engine — weekly memory consolidation (D11)
// Runs every Sunday at 03:00 UTC.
// Scans memory clusters, synthesizes insights, merges duplicates, prunes stale data.

import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { ai, memory } from "~encore/clients";

import { db } from "./db";

// --- Dream meta helpers ---

async function getMetaValue(key: string): Promise<string | null> {
  const row = await db.queryRow<{ value: string }>`
    SELECT value FROM memory_meta WHERE key = ${key}
  `;
  return row?.value ?? null;
}

async function setMetaValue(key: string, value: string): Promise<void> {
  await db.exec`
    INSERT INTO memory_meta (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

// --- Simple word-overlap similarity (no vectors) ---

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(
    a.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3)
  );
  const wordsB = new Set(
    b.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3)
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.min(wordsA.size, wordsB.size);
}

// --- Dream result type ---

interface DreamResult {
  ran: boolean;
  skippedReason?: string;
  clustersFound: number;
  memoriesMerged: number;
  memoriesPruned: number;
  metaInsights: number;
  durationMs: number;
}

// --- Core dream logic ---

async function runDream(): Promise<DreamResult> {
  const startMs = Date.now();

  // GATE 1: Time gate — skip if last dream was < 24h ago
  const lastDreamAt = await getMetaValue("last_dream_at");
  if (lastDreamAt) {
    const lastDream = new Date(lastDreamAt);
    const hoursSinceLast = (Date.now() - lastDream.getTime()) / 3_600_000;
    if (hoursSinceLast < 24) {
      log.info("dream: skipped — too soon since last dream", { hoursSinceLast });
      return { ran: false, skippedReason: "too_soon", clustersFound: 0, memoriesMerged: 0, memoriesPruned: 0, metaInsights: 0, durationMs: Date.now() - startMs };
    }
  }

  // GATE 2: Activity gate — need at least 3 new memories since last dream
  const sinceDate = lastDreamAt ?? new Date(0).toISOString();
  const activityRow = await db.queryRow<{ count: number }>`
    SELECT COUNT(*)::int as count
    FROM memories
    WHERE created_at > ${sinceDate}::timestamptz
      AND superseded_by IS NULL
  `;
  const newMemories = activityRow?.count ?? 0;
  if (newMemories < 3) {
    log.info("dream: skipped — insufficient activity", { newMemories });
    return { ran: false, skippedReason: "low_activity", clustersFound: 0, memoriesMerged: 0, memoriesPruned: 0, metaInsights: 0, durationMs: Date.now() - startMs };
  }

  // GATE 3: Advisory lock — only one dream process at a time
  const lockRow = await db.queryRow<{ acquired: boolean }>`
    SELECT pg_try_advisory_lock(42424242) as acquired
  `;
  if (!lockRow?.acquired) {
    log.info("dream: skipped — could not acquire advisory lock");
    return { ran: false, skippedReason: "lock_busy", clustersFound: 0, memoriesMerged: 0, memoriesPruned: 0, metaInsights: 0, durationMs: Date.now() - startMs };
  }

  let memoriesMerged = 0;
  let memoriesPruned = 0;
  let clustersFound = 0;
  let metaInsights = 0;

  try {
    // PHASE 1: SCAN — Find memory clusters by source_repo + memory_type
    log.info("dream: SCAN phase starting");

    const memRows = await db.query<{
      id: string;
      content: string;
      memory_type: string;
      source_repo: string | null;
      category: string;
      tags: string[] | null;
    }>`
      SELECT id, content, memory_type, source_repo, category, tags
      FROM memories
      WHERE superseded_by IS NULL
        AND pinned = false
        AND trust_level != 'system'
      ORDER BY source_repo NULLS LAST, memory_type
      LIMIT 500
    `;

    type MemRow = { id: string; content: string; memory_type: string; source_repo: string | null; category: string; tags: string[] | null };
    const allMems: MemRow[] = [];
    for await (const row of memRows) {
      allMems.push(row as MemRow);
    }

    // Group by (source_repo, memory_type) bucket
    type Bucket = { key: string; items: MemRow[] };
    const buckets = new Map<string, MemRow[]>();
    for (const m of allMems) {
      const bucketKey = `${m.source_repo ?? "_global"}::${m.memory_type}`;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey)!.push(m);
    }

    // Within each bucket, find clusters of similar memories (word overlap >= 0.4)
    const clusters: MemRow[][] = [];
    for (const [, items] of buckets) {
      if (items.length < 2) continue;

      const used = new Set<number>();
      for (let i = 0; i < items.length; i++) {
        if (used.has(i)) continue;
        const cluster: MemRow[] = [items[i]];
        used.add(i);
        for (let j = i + 1; j < items.length; j++) {
          if (used.has(j)) continue;
          const sim = wordOverlap(items[i].content, items[j].content);
          if (sim >= 0.4) {
            cluster.push(items[j]);
            used.add(j);
          }
        }
        if (cluster.length >= 3) {
          clusters.push(cluster);
        }
      }
    }

    clustersFound = clusters.length;
    log.info("dream: SCAN complete", { clustersFound, totalMemories: allMems.length });

    // PHASE 2: ANALYZE — Synthesize each cluster via AI
    log.info("dream: ANALYZE phase starting", { clusters: clustersFound });

    type ClusterInsight = { cluster: MemRow[]; insight: string; tokensUsed: number };
    const insights: ClusterInsight[] = [];

    for (const cluster of clusters) {
      try {
        const result = await ai.consolidateMemories({
          memories: cluster.map(m => ({
            id: m.id,
            content: m.content,
            memoryType: m.memory_type,
          })),
          context: `Cluster type: ${cluster[0].memory_type}, repo: ${cluster[0].source_repo ?? "global"}`,
        });

        insights.push({ cluster, insight: result.consolidatedContent, tokensUsed: result.tokensUsed });
      } catch (err) {
        log.warn("dream: ANALYZE cluster failed", {
          clusterId: cluster[0].id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // PHASE 3: MERGE — Store consolidated memories, mark originals superseded
    log.info("dream: MERGE phase starting", { insights: insights.length });

    for (const { cluster, insight } of insights) {
      if (!insight || insight.trim().length < 20) continue;
      try {
        const sourceRepo = cluster[0].source_repo ?? undefined;
        const memType = cluster[0].memory_type as "general" | "skill" | "task" | "session" | "error_pattern" | "decision";
        const allTags = new Set<string>();
        for (const m of cluster) {
          for (const t of m.tags ?? []) allTags.add(t);
        }
        allTags.add("dream-consolidated");

        const stored = await memory.store({
          content: insight,
          category: cluster[0].category,
          memoryType: memType,
          sourceRepo,
          tags: Array.from(allTags),
          pinned: false,
          trustLevel: "agent",
        });

        // Mark originals as superseded
        for (const orig of cluster) {
          await db.exec`
            UPDATE memories
            SET superseded_by = ${stored.id}::uuid
            WHERE id = ${orig.id}::uuid
              AND superseded_by IS NULL
          `;
        }

        memoriesMerged += cluster.length;
      } catch (err) {
        log.warn("dream: MERGE failed for cluster", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // PHASE 4: META — Generate 1-2 meta-observations across all clusters
    log.info("dream: META phase starting");

    if (insights.length >= 2) {
      try {
        const allInsightTexts = insights.slice(0, 10).map(i => i.insight);
        const metaResult = await ai.consolidateMemories({
          memories: allInsightTexts.map((content, idx) => ({
            id: `meta-${idx}`,
            content,
            memoryType: "decision",
          })),
          context: "Generate high-level meta-observations across all the synthesized clusters. Focus on cross-cutting patterns.",
        });

        if (metaResult.consolidatedContent && metaResult.consolidatedContent.trim().length > 20) {
          await memory.store({
            content: metaResult.consolidatedContent,
            category: "meta",
            memoryType: "decision",
            tags: ["dream-meta", "weekly-synthesis"],
            pinned: true,
            trustLevel: "agent",
          });
          metaInsights = 1;
        }

        // Store key insights as separate memories if any
        for (const insight of metaResult.keyInsights.slice(0, 1)) {
          if (insight && insight.trim().length > 20) {
            await memory.store({
              content: insight,
              category: "meta",
              memoryType: "skill",
              tags: ["dream-meta", "key-insight"],
              pinned: false,
              trustLevel: "agent",
            });
            metaInsights++;
          }
        }
      } catch (err) {
        log.warn("dream: META phase failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // PHASE 5: PRUNE — Delete stale agent memories
    log.info("dream: PRUNE phase starting");

    const pruneResult = await db.queryRow<{ count: number }>`
      WITH pruned AS (
        DELETE FROM memories
        WHERE trust_level = 'agent'
          AND created_at < NOW() - INTERVAL '90 days'
          AND relevance_score < 0.1
          AND pinned = false
          AND superseded_by IS NULL
        RETURNING id
      )
      SELECT COUNT(*)::int as count FROM pruned
    `;
    memoriesPruned = pruneResult?.count ?? 0;

    log.info("dream: PRUNE complete", { memoriesPruned });

    // Update last_dream_at
    await setMetaValue("last_dream_at", new Date().toISOString());

    const durationMs = Date.now() - startMs;
    log.info("dream: completed", { clustersFound, memoriesMerged, memoriesPruned, metaInsights, durationMs });

    return { ran: true, clustersFound, memoriesMerged, memoriesPruned, metaInsights, durationMs };

  } finally {
    // Always release advisory lock
    await db.exec`SELECT pg_advisory_unlock(42424242)`;
  }
}

// --- API endpoint (required by CronJob) ---

export const runDreamEngine = api(
  { method: "POST", path: "/memory/dream", expose: false },
  async (): Promise<DreamResult> => {
    return runDream();
  }
);

// --- Cron: every Sunday at 03:00 UTC ---

const _dreamCron = new CronJob("memory-dream-engine", {
  title: "Weekly dream engine: memory consolidation and pruning",
  schedule: "0 3 * * 0",
  endpoint: runDreamEngine,
});

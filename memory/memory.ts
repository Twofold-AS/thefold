import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { Topic } from "encore.dev/pubsub";
import log from "encore.dev/log";
import { cache, ai } from "~encore/clients";
import { calculateImportanceScore, calculateDecayedRelevance } from "./decay";
import type { MemoryType } from "./decay";
import { sanitizeForMemory } from "../ai/sanitize";
import { createHash } from "node:crypto";
import { db } from "./db";

// --- Brain Activity Topic ---

export interface BrainEvent {
  type: "dream" | "prune" | "healing";
  phase: string;
  message: string;
  progress?: number; // 0-100
  userId: string;
}

export const brainEvents = new Topic<BrainEvent>("brain-events", {
  deliveryGuarantee: "at-least-once",
});

// In-memory cache of latest brain event per userId (for polling)
export const brainStatusCache = new Map<string, BrainEvent>();

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ZI: Switched from Voyage AI to OpenAI text-embedding-3-small (1536 dimensions)
// API key is now read from the ai_providers DB via the ai service internal endpoint.
// Configure the OpenAI key in Settings → AI-modeller.

/** Hybrid search weighting: 60% semantic (vector), 40% keyword (BM25) */
export const HYBRID_ALPHA = 0.6;

/** Embedding dimension for OpenAI text-embedding-3-small */
export const EMBEDDING_DIMENSION = 1536;

// --- Embedding helper (with cache) ---
// ZI: Using OpenAI text-embedding-3-small (1536 dimensions)
// Previously: Voyage AI voyage-3-lite (1024 dimensions)

async function embed(text: string): Promise<number[]> {
  const truncated = text.substring(0, 8000);

  // Check cache first
  const cached = await cache.getOrSetEmbedding({ content: truncated });
  if (cached.hit && cached.embedding) {
    return cached.embedding;
  }

  // Cache miss — call OpenAI API with retry for 429
  const maxRetries = 3;
  const { apiKey: openAIApiKey } = await ai.getProviderKeyInternal({ slug: "openai" });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAIApiKey}`,
        },
        body: JSON.stringify({
          input: truncated,
          model: "text-embedding-3-small",
        }),
      });

      if (res.status === 429) {
        const waitMs = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s
        log.warn(`OpenAI 429 — waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw APIError.internal(`OpenAI embedding error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const embedding: number[] = data.data[0].embedding; // 1536 dimensions

      // Store in cache for next time
      await cache.getOrSetEmbedding({ content: truncated, embedding });

      return embedding;
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 2) * 1000));
    }
  }

  throw APIError.internal("OpenAI embedding API failed after retries");
}

/** Sprint A — Permanence-grad styrer både decay og cleanup-policy.
 *  task_transient: Phase 0/N file/scrape-cache. TTL 24h via task-status-cron.
 *  normal: eksisterende oppførsel (default).
 *  project_fact: stabilt prosjekt-faktum, decay-immune, pinned.
 *  permanent: org-nivå sannhet, decay-immune, cross-prosjekt. */
export type MemoryPermanence = "task_transient" | "normal" | "project_fact" | "permanent";

interface SearchRequest {
  query?: string;                   // Kan utelates ved tag-only-søk (task_transient lookup)
  limit?: number;
  memoryType?: MemoryType;
  sourceRepo?: string;
  tags?: string[];
  includeDecayed?: boolean;
  minTrustLevel?: "user" | "agent" | "system";
  /** Sprint A — filter på prosjekt-anker. */
  projectId?: string;
  /** Sprint A — filter på permanence-grad. */
  permanence?: MemoryPermanence;
}

interface SearchResult {
  id: string;
  content: string;
  category: string;
  similarity: number;
  memoryType: MemoryType;
  relevanceScore: number;
  decayedScore: number;
  accessCount: number;
  tags: string[];
  sourceRepo?: string;
  createdAt: string;
  trustLevel: "user" | "agent" | "system";
  /** Sprint A — eksponert for konsumenter som filtrerer post-search. */
  projectId?: string | null;
  permanence?: MemoryPermanence;
}

interface SearchResponse {
  results: SearchResult[];
}

interface StoreRequest {
  content: string;
  category: string;
  conversationId?: string;
  linearTaskId?: string;
  memoryType?: MemoryType;
  sourceRepo?: string;
  tags?: string[];
  ttlDays?: number;
  pinned?: boolean;
  trustLevel?: "user" | "agent" | "system";
  /** Sprint A — kobler memoryen til et prosjekt. */
  projectId?: string;
  /** Sprint A — bestemmer decay-policy + cleanup-policy. Default 'normal'. */
  permanence?: MemoryPermanence;
}

interface StoreResponse {
  id: string;
}

interface ExtractRequest {
  conversationId: string;
  content: string;
  category: string;
  linearTaskId?: string;
}

interface ExtractResponse {
  stored: boolean;
}

interface ConsolidateRequest {
  memoryIds: string[];
}

interface ConsolidateResponse {
  newMemoryId: string;
  consolidatedCount: number;
}

interface CleanupResponse {
  deleted: number;
}

interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  avgRelevanceScore: number;
  expiringSoon: number;
}

// --- Endpoints ---

export const search = api(
  { method: "POST", path: "/memory/search", expose: true, auth: true },
  async (req: SearchRequest): Promise<SearchResponse> => {
    const limit = req.limit ?? 5;
    const queryText = (req.query ?? "").trim();

    // Build filter conditions (utvidet med Sprint A — projectId + permanence)
    const typeFilter = req.memoryType ? req.memoryType : null;
    const repoFilter = req.sourceRepo ? req.sourceRepo : null;
    const projectIdFilter = req.projectId ? req.projectId : null;
    const permanenceFilter = req.permanence ? req.permanence : null;
    const minRelevance = req.includeDecayed ? 0.0 : 0.1;

    // Sprint A — Tag-only fast-path. Brukes for task_transient-arv
    // (sub-task ber om "alt på master-X") og lignende ren-filter-spørringer.
    // Ingen embedding-call (sparer tid + $), ingen BM25 (ikke nødvendig).
    if (queryText.length === 0) {
      const filterRows = await db.query`
        SELECT
          id, content, category, created_at, last_accessed_at, memory_type,
          relevance_score::float as relevance_score, access_count, tags, source_repo, pinned,
          content_hash, trust_level, project_id, permanence
        FROM memories
        WHERE superseded_by IS NULL
          AND (${typeFilter}::text IS NULL OR memory_type = ${typeFilter})
          AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
          AND (${projectIdFilter}::uuid IS NULL OR project_id = ${projectIdFilter}::uuid)
          AND (${permanenceFilter}::text IS NULL OR permanence = ${permanenceFilter})
        ORDER BY created_at DESC
        LIMIT ${limit * 2}
      `;
      const filterResults: SearchResult[] = [];
      const filterIds: string[] = [];
      for await (const row of filterRows) {
        const id = row.id as string;
        // Tag filter (post-fetch for å bruke samme @>-semantikk som hovedflyten)
        if (req.tags && req.tags.length > 0) {
          const rowTags = (row.tags as string[]) || [];
          const hasMatch = req.tags.some((t) => rowTags.includes(t));
          if (!hasMatch) continue;
        }
        // Integrity check (samme som hovedflyt)
        const storedHash = row.content_hash as string | null;
        const rowContent = row.content as string;
        if (storedHash) {
          const computedHash = hashContent(rowContent);
          if (computedHash !== storedHash) {
            log.warn("memory integrity check failed (tag-only path)", { id });
            continue;
          }
        }
        const trustLevel = (row.trust_level as "user" | "agent" | "system") || "user";
        if (req.minTrustLevel) {
          const trustOrder = { user: 0, agent: 1, system: 2 };
          if (trustOrder[trustLevel] < trustOrder[req.minTrustLevel]) continue;
        }
        filterResults.push({
          id,
          content: rowContent,
          category: row.category as string,
          similarity: 1.0,
          memoryType: row.memory_type as MemoryType,
          relevanceScore: Number(row.relevance_score) || 0,
          decayedScore: 1.0,
          accessCount: Number(row.access_count) || 0,
          tags: (row.tags as string[]) || [],
          sourceRepo: (row.source_repo as string) || undefined,
          createdAt: String(row.created_at),
          trustLevel,
          projectId: (row.project_id as string) || null,
          permanence: ((row.permanence as MemoryPermanence) ?? "normal"),
        });
        filterIds.push(id);
        if (filterResults.length >= limit) break;
      }
      // Update access tracking
      if (filterIds.length > 0) {
        for (const id of filterIds) {
          await db.exec`
            UPDATE memories
            SET last_accessed_at = NOW(), access_count = access_count + 1
            WHERE id = ${id}::uuid
          `;
        }
      }
      log.info("tag-only memory search", {
        projectId: projectIdFilter,
        permanence: permanenceFilter,
        tags: req.tags,
        results: filterResults.length,
      });
      return { results: filterResults };
    }

    // Vector + BM25 hybrid path (eksisterende oppførsel + nye filtre)
    const embedding = await embed(queryText);
    const vec = `[${embedding.join(",")}]`;

    // BM25 keyword search (only if query has searchable terms)
    const bm25Query = queryText;
    const bm25Scores = new Map<string, number>();

    if (bm25Query.length > 0) {
      const bm25Rows = await db.query<{ id: string; bm25_score: number }>`
        SELECT
          id,
          ts_rank_cd(search_vector, plainto_tsquery('english', ${bm25Query})) as bm25_score
        FROM memories
        WHERE search_vector @@ plainto_tsquery('english', ${bm25Query})
          AND superseded_by IS NULL
          AND (${typeFilter}::text IS NULL OR memory_type = ${typeFilter})
          AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
          AND (${projectIdFilter}::uuid IS NULL OR project_id = ${projectIdFilter}::uuid)
          AND (${permanenceFilter}::text IS NULL OR permanence = ${permanenceFilter})
          AND relevance_score >= ${minRelevance}
        ORDER BY bm25_score DESC
        LIMIT ${limit * 2}
      `;

      for await (const row of bm25Rows) {
        bm25Scores.set(row.id, row.bm25_score);
      }
    }

    // Decay scoring with type-based half-lives:
    //   half_life = 90 days for error_pattern/decision, 30 days for others
    //   recency = exp(-ln2 × age_days / half_life)
    //   access_boost = exp(-0.1 × days_since_access) × log10(1 + access_count)
    //   combined = 0.7 × similarity + 0.3 × min(1, relevance × recency × (1 + access_boost × 0.5))
    const rows = await db.query`
      SELECT
        id, content, category, created_at, last_accessed_at, memory_type,
        relevance_score::float as relevance_score, access_count, tags, source_repo, pinned,
        content_hash, trust_level, project_id, permanence,
        1 - (embedding <=> ${vec}::vector) as similarity
      FROM memories
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${vec}::vector) > 0.15
        AND superseded_by IS NULL
        AND (${typeFilter}::text IS NULL OR memory_type = ${typeFilter})
        AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
        AND (${projectIdFilter}::uuid IS NULL OR project_id = ${projectIdFilter}::uuid)
        AND (${permanenceFilter}::text IS NULL OR permanence = ${permanenceFilter})
        AND relevance_score >= ${minRelevance}
      ORDER BY (
        0.7 * (1 - (embedding <=> ${vec}::vector))
        + 0.3 * LEAST(1.0,
          relevance_score
          * EXP(-0.693147 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400
              / CASE WHEN memory_type IN ('error_pattern', 'decision') THEN 90.0 ELSE 30.0 END)
          * (1 + EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - COALESCE(last_accessed_at, created_at))) / 86400)
              * LOG(1 + access_count) * 0.5)
        )
      ) DESC
      LIMIT ${limit * 2}
    `;

    let results: SearchResult[] = [];
    const ids: string[] = [];
    for await (const row of rows) {
      const similarity = row.similarity as number;
      const id = row.id as string;
      ids.push(id);

      // Tag filtering in JS (GIN index + parameter binding is complex)
      if (req.tags && req.tags.length > 0) {
        const rowTags = (row.tags as string[]) || [];
        const hasMatch = req.tags.some((t) => rowTags.includes(t));
        if (!hasMatch) continue;
      }

      // Integrity check (ASI06): verify content hash if present
      const storedHash = row.content_hash as string | null;
      const rowContent = row.content as string;
      if (storedHash) {
        const computedHash = hashContent(rowContent);
        if (computedHash !== storedHash) {
          log.warn("memory integrity check failed — content may have been tampered with", { id });
          continue; // Exclude compromised memory from results
        }
      }

      const trustLevel = (row.trust_level as "user" | "agent" | "system") || "user";

      // Filter by minimum trust level if specified
      if (req.minTrustLevel) {
        const trustOrder = { user: 0, agent: 1, system: 2 };
        if (trustOrder[trustLevel] < trustOrder[req.minTrustLevel]) continue;
      }

      const relevanceScore = Number(row.relevance_score) || 0;
      const accessCount = Number(row.access_count) || 0;

      // Compute exact decayed score in JS for display
      const decayedScore = calculateDecayedRelevance(
        relevanceScore,
        new Date(row.created_at as string),
        accessCount,
        new Date((row.last_accessed_at ?? row.created_at) as string),
        row.memory_type as MemoryType,
        (row.pinned as boolean) ?? false,
        undefined,
        (row.permanence as MemoryPermanence) ?? "normal",
      );

      results.push({
        id,
        content: rowContent,
        category: row.category as string,
        similarity,
        memoryType: row.memory_type as MemoryType,
        relevanceScore,
        decayedScore: 0.7 * similarity + 0.3 * decayedScore,
        accessCount,
        tags: (row.tags as string[]) || [],
        sourceRepo: (row.source_repo as string) || undefined,
        createdAt: String(row.created_at),
        trustLevel,
        projectId: (row.project_id as string) || null,
        permanence: ((row.permanence as MemoryPermanence) ?? "normal"),
      });
    }

    // Hybrid scoring: combine vector + BM25
    const vectorResultCount = results.length;

    // Normalize BM25 scores to 0-1 range
    const maxBm25 = Math.max(...Array.from(bm25Scores.values()), 0.001);
    const normalizedBm25 = new Map<string, number>();
    for (const [id, score] of bm25Scores) {
      normalizedBm25.set(id, score / maxBm25);
    }

    // Combine vector + BM25 for existing results
    for (const result of results) {
      const vectorScore = result.similarity;
      const bm25Score = normalizedBm25.get(result.id) || 0;

      // Hybrid score: α × vector + (1-α) × BM25
      result.similarity = HYBRID_ALPHA * vectorScore + (1 - HYBRID_ALPHA) * bm25Score;
    }

    // Add BM25-only results that vector search missed
    let bm25OnlyCount = 0;
    for (const [id, score] of normalizedBm25) {
      if (!results.find((r) => r.id === id)) {
        // Fetch this memory from DB
        const bm25OnlyRow = await db.queryRow<{
          id: string;
          content: string;
          category: string;
          created_at: string;
          last_accessed_at: string | null;
          memory_type: string;
          relevance_score: number;
          access_count: number;
          tags: string[] | null;
          source_repo: string | null;
          pinned: boolean;
          content_hash: string | null;
          trust_level: string | null;
          project_id: string | null;
          permanence: string | null;
        }>`
          SELECT id, content, category, created_at, last_accessed_at, memory_type,
            relevance_score::float as relevance_score, access_count, tags, source_repo, pinned,
            content_hash, trust_level, project_id, permanence
          FROM memories WHERE id = ${id}::uuid
        `;

        if (bm25OnlyRow) {
          // Integrity check (ASI06)
          const storedHash = bm25OnlyRow.content_hash;
          if (storedHash) {
            const computedHash = hashContent(bm25OnlyRow.content);
            if (computedHash !== storedHash) {
              log.warn("memory integrity check failed in BM25-only result", { id });
              continue;
            }
          }

          // Trust level filter
          const trustLevel = (bm25OnlyRow.trust_level || "user") as "user" | "agent" | "system";
          if (req.minTrustLevel) {
            const trustOrder = { user: 0, agent: 1, system: 2 };
            if (trustOrder[trustLevel] < trustOrder[req.minTrustLevel]) continue;
          }

          // Tag filter
          if (req.tags && req.tags.length > 0) {
            const rowTags = bm25OnlyRow.tags || [];
            const hasMatch = req.tags.some((t) => rowTags.includes(t));
            if (!hasMatch) continue;
          }

          const relevanceScore = Number(bm25OnlyRow.relevance_score) || 0;
          const accessCount = Number(bm25OnlyRow.access_count) || 0;
          const decayedScore = calculateDecayedRelevance(
            relevanceScore,
            new Date(bm25OnlyRow.created_at),
            accessCount,
            new Date(bm25OnlyRow.last_accessed_at ?? bm25OnlyRow.created_at),
            bm25OnlyRow.memory_type as MemoryType,
            bm25OnlyRow.pinned ?? false,
            undefined,
            (bm25OnlyRow.permanence as MemoryPermanence) ?? "normal",
          );

          results.push({
            id: bm25OnlyRow.id,
            content: bm25OnlyRow.content,
            category: bm25OnlyRow.category,
            similarity: (1 - HYBRID_ALPHA) * score, // BM25-only component
            memoryType: bm25OnlyRow.memory_type as MemoryType,
            relevanceScore,
            decayedScore: 0.7 * ((1 - HYBRID_ALPHA) * score) + 0.3 * decayedScore,
            accessCount,
            tags: bm25OnlyRow.tags || [],
            sourceRepo: bm25OnlyRow.source_repo || undefined,
            createdAt: String(bm25OnlyRow.created_at),
            trustLevel,
            projectId: bm25OnlyRow.project_id ?? null,
            permanence: ((bm25OnlyRow.permanence as MemoryPermanence) ?? "normal"),
          });
          bm25OnlyCount++;
          ids.push(id);
        }
      }
    }

    // Re-sort by hybrid score
    results.sort((a, b) => b.similarity - a.similarity);

    // Trim to limit
    results = results.slice(0, limit);

    // Log hybrid search results
    log.info("hybrid search completed", {
      query: queryText.substring(0, 100),
      vectorResults: vectorResultCount,
      bm25Results: bm25Scores.size,
      bm25OnlyResults: bm25OnlyCount,
      hybridResults: results.length,
      alpha: HYBRID_ALPHA,
    });

    // Update access tracking for returned results
    if (ids.length > 0) {
      for (const id of ids) {
        await db.exec`
          UPDATE memories
          SET last_accessed_at = NOW(), access_count = access_count + 1
          WHERE id = ${id}::uuid
        `;
      }
    }

    return { results };
  }
);

export const store = api(
  { method: "POST", path: "/memory/store", expose: true, auth: true },
  async (req: StoreRequest): Promise<StoreResponse> => {
    // Sanitize content before storing (OWASP ASI06)
    const content = sanitizeForMemory(req.content);
    const contentHash = hashContent(content);
    const memoryType = req.memoryType || "general";
    const ttlDays = req.ttlDays ?? 90;
    const pinned = req.pinned ?? false;
    const tags = req.tags ?? [];
    const trustLevel = req.trustLevel ?? "user";
    const permanence = req.permanence ?? "normal";
    const projectId = req.projectId ?? null;
    const relevanceScore = calculateImportanceScore(memoryType as MemoryType, req.category, pinned);

    // Sprint A — task_transient skipper embedding-call.
    // Disse memoryene konsulteres KUN via tag-filter, aldri via vector-
    // similarity. embedText() koster $0.0001 per call — ved ~100 sub-tasks/dag
    // × 5 filer × 2 pluss scrape-results = ~1000 calls/dag = $0.13/dag spart.
    let vec: string | null = null;
    if (permanence !== "task_transient") {
      const embedding = await embed(content);
      vec = `[${embedding.join(",")}]`;
    }

    const row = await db.queryRow`
      INSERT INTO memories (
        content, category, conversation_id, linear_task_id, embedding,
        memory_type, source_repo,
        tags, ttl_days, pinned, relevance_score, content_hash, trust_level,
        project_id, permanence
      )
      VALUES (
        ${content}, ${req.category},
        ${req.conversationId || null}, ${req.linearTaskId || null},
        ${vec === null ? null : vec}::vector,
        ${memoryType}, ${req.sourceRepo || null},
        ${tags}::text[], ${ttlDays}, ${pinned}, ${relevanceScore}, ${contentHash}, ${trustLevel},
        ${projectId}::uuid, ${permanence}
      )
      RETURNING id
    `;

    if (!row) throw APIError.internal("failed to store memory");
    return { id: row.id as string };
  }
);

export const extract = api(
  { method: "POST", path: "/memory/extract", expose: false },
  async (req: ExtractRequest): Promise<ExtractResponse> => {
    // Only store if content is substantial enough
    if (req.content.length < 50) return { stored: false };

    // Sanitize content before storing (OWASP ASI06)
    const content = sanitizeForMemory(req.content.substring(0, 5000));
    const contentHash = hashContent(content);
    const embedding = await embed(content);
    const vec = `[${embedding.join(",")}]`;

    await db.exec`
      INSERT INTO memories (content, category, conversation_id, linear_task_id, embedding, memory_type, content_hash, trust_level)
      VALUES (${content}, ${req.category}, ${req.conversationId}, ${req.linearTaskId || null}, ${vec}::vector, 'session', ${contentHash}, 'agent')
    `;

    return { stored: true };
  }
);

// POST /memory/consolidate — Merge overlapping memories
export const consolidate = api(
  { method: "POST", path: "/memory/consolidate", expose: false },
  async (req: ConsolidateRequest): Promise<ConsolidateResponse> => {
    if (req.memoryIds.length < 2) {
      throw APIError.invalidArgument("Need at least 2 memories to consolidate");
    }

    // Fetch all memories to consolidate
    const contents: string[] = [];
    const allTags: Set<string> = new Set();
    let category = "general";
    let sourceRepo: string | null = null;

    for (const memId of req.memoryIds) {
      const row = await db.queryRow<{
        content: string;
        category: string;
        tags: string[];
        source_repo: string | null;
      }>`
        SELECT content, category, tags, source_repo
        FROM memories WHERE id = ${memId}::uuid
      `;
      if (!row) throw APIError.notFound(`Memory ${memId} not found`);
      contents.push(row.content);
      category = row.category;
      if (row.source_repo) sourceRepo = row.source_repo;
      for (const t of row.tags || []) allTags.add(t);
    }

    // Combine content, sanitize, and generate new embedding
    const rawCombined = contents.join("\n\n---\n\n");
    const combined = sanitizeForMemory(rawCombined.substring(0, 10000));
    const contentHash = hashContent(combined);
    const embedding = await embed(combined);
    const vec = `[${embedding.join(",")}]`;
    const tags = Array.from(allTags);

    // Insert consolidated memory
    const newRow = await db.queryRow`
      INSERT INTO memories (
        content, category, embedding, memory_type, tags,
        source_repo, consolidated_from, pinned, content_hash, trust_level
      )
      VALUES (
        ${combined}, ${category}, ${vec}::vector,
        'decision', ${tags}::text[], ${sourceRepo},
        ${req.memoryIds}::uuid[], true, ${contentHash}, 'agent'
      )
      RETURNING id
    `;

    if (!newRow) throw APIError.internal("failed to store consolidated memory");
    const newId = newRow.id as string;

    // Mark old memories as superseded
    for (const memId of req.memoryIds) {
      await db.exec`
        UPDATE memories SET superseded_by = ${newId}::uuid WHERE id = ${memId}::uuid
      `;
    }

    return { newMemoryId: newId, consolidatedCount: req.memoryIds.length };
  }
);

// POST /memory/cleanup — Delete expired memories (called by cron)
export const deleteMemory = api(
  { method: "DELETE", path: "/memory/:id", expose: true, auth: true },
  async ({ id }: { id: string }): Promise<{ success: boolean }> => {
    const result = await db.queryRow<{ id: string }>`
      DELETE FROM memories WHERE id = ${id}::uuid RETURNING id
    `;
    if (!result) throw APIError.notFound("memory not found");
    return { success: true };
  }
);

export const cleanup = api(
  { method: "POST", path: "/memory/cleanup", expose: true, auth: true },
  async (): Promise<CleanupResponse> => {
    // Eksisterende cleanup for permanence='normal' (TTL-basert)
    const result = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM memories
        WHERE ttl_days > 0
          AND pinned = false
          AND permanence = 'normal'
          AND last_accessed_at < NOW() - INTERVAL '1 day' * ttl_days
        RETURNING id
      )
      SELECT COUNT(*)::int as count FROM deleted
    `;

    // Sprint A — task_transient cleanup via task-status (Fix 1).
    // Henter unike task-ID-er fra tags, spør tasks-service om status,
    // sletter task_transient hvor master er done > 24h siden.
    let transientDeleted = 0;
    try {
      transientDeleted = await cleanupTaskTransientMemories();
    } catch (err) {
      log.warn("task_transient cleanup failed (will retry next cron run)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Backstop: task_transient-rows eldre enn 7 dager slettes uansett —
    // beskyttelse mot at tasks-service-API-feil fyller DB-en med døde rader.
    const stale = await db.queryRow<{ count: number }>`
      WITH stale_deleted AS (
        DELETE FROM memories
        WHERE permanence = 'task_transient'
          AND created_at < NOW() - INTERVAL '7 days'
        RETURNING id
      )
      SELECT COUNT(*)::int as count FROM stale_deleted
    `;

    const total = (result?.count ?? 0) + transientDeleted + (stale?.count ?? 0);
    log.info("memory.cleanup completed", {
      normalDeleted: result?.count ?? 0,
      transientDeleted,
      staleTransientDeleted: stale?.count ?? 0,
    });

    return { deleted: total };
  }
);

// Sprint A — Cleanup helper for task_transient.
// Henter unike task-IDer fra tags, batcher API-call mot tasks-service,
// sletter rader hvor master-task er done > 24h siden ELLER missing.
// Watchdog: cron må fullføre <2 min, ellers timeout.
async function cleanupTaskTransientMemories(): Promise<number> {
  const startMs = Date.now();
  const timeoutMs = 2 * 60_000;

  // 1. Finn unike task-IDer fra tags-arrayen
  const taskIdRows = await db.query<{ task_id: string }>`
    SELECT DISTINCT regexp_replace(unnest(tags), '^task:', '') as task_id
    FROM memories
    WHERE permanence = 'task_transient'
      AND tags && ARRAY['task:%']::text[] IS NOT NULL
  `;
  const taskIds: string[] = [];
  for await (const row of taskIdRows) {
    if (row.task_id && /^[0-9a-f-]{36}$/i.test(row.task_id)) taskIds.push(row.task_id);
  }
  if (taskIds.length === 0) return 0;

  // 2. Spør tasks-service per task (batchet, parallell). Failure tolerert.
  const { tasks: tasksClient } = await import("~encore/clients");
  const BATCH = 50;
  const idsToDelete: string[] = [];

  for (let i = 0; i < taskIds.length; i += BATCH) {
    if (Date.now() - startMs > timeoutMs) {
      log.warn("cleanupTaskTransient: watchdog timeout, partial cleanup", {
        processed: i,
        total: taskIds.length,
      });
      break;
    }
    const slice = taskIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      slice.map((id) => tasksClient.getTaskInternal({ id })),
    );
    for (let j = 0; j < slice.length; j++) {
      const taskId = slice[j];
      const r = results[j];
      if (r.status === "rejected") {
        // Task missing eller cross-service-feil — slett task_transient (orphaned)
        idsToDelete.push(taskId);
      } else {
        const t = r.value.task;
        if (!t) {
          idsToDelete.push(taskId);
        } else if (t.status === "done" && t.completedAt) {
          const completedTime = new Date(t.completedAt).getTime();
          if (Date.now() - completedTime > 24 * 60 * 60_000) {
            idsToDelete.push(taskId);
          }
        }
      }
    }
  }

  if (idsToDelete.length === 0) return 0;

  // 3. Slett task_transient-memories for alle done-task-IDer
  const taskTags = idsToDelete.map((id) => `task:${id}`);
  const deleted = await db.queryRow<{ count: number }>`
    WITH deleted AS (
      DELETE FROM memories
      WHERE permanence = 'task_transient'
        AND tags && ${taskTags}::text[]
      RETURNING id
    )
    SELECT COUNT(*)::int as count FROM deleted
  `;
  return deleted?.count ?? 0;
}

// --- Sprint A: touchByTags ---
//
// Brukt av master-iterator for å gi task_transient-memories en frisk
// last_accessed_at før neste sub-task starter. Beskytter mot at cleanup-
// cron sletter en mid-task selv om master er ikke-done.

interface TouchByTagsRequest {
  tags: string[];
}

interface TouchByTagsResponse {
  updated: number;
}

export const touchByTags = api(
  { method: "POST", path: "/memory/touch-by-tags", expose: false },
  async (req: TouchByTagsRequest): Promise<TouchByTagsResponse> => {
    if (!req.tags || req.tags.length === 0) return { updated: 0 };
    const result = await db.queryRow<{ count: number }>`
      WITH updated AS (
        UPDATE memories
        SET last_accessed_at = NOW(), access_count = access_count + 1
        WHERE tags && ${req.tags}::text[]
        RETURNING id
      )
      SELECT COUNT(*)::int as count FROM updated
    `;
    return { updated: result?.count ?? 0 };
  }
);

// --- Sprint A: update ---
//
// Trengs av save_project_fact-tool for dedup-update-flyten. Memory.update
// fantes ikke før denne sprinten — vi har bare delete + store.

interface UpdateMemoryRequest {
  id: string;
  content?: string;
  trustLevel?: "user" | "agent" | "system";
  tags?: string[];
  pinned?: boolean;
  ttlDays?: number;
}

interface UpdateMemoryResponse {
  success: boolean;
  updated: boolean;
}

export const update = api(
  { method: "POST", path: "/memory/update", expose: true, auth: true },
  async (req: UpdateMemoryRequest): Promise<UpdateMemoryResponse> => {
    if (!req.id) throw APIError.invalidArgument("id required");

    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM memories WHERE id = ${req.id}::uuid
    `;
    if (!existing) throw APIError.notFound("memory not found");

    // Per-felt-update for ikke å overskrive felter som ikke ble passet.
    if (req.content !== undefined) {
      const sanitized = sanitizeForMemory(req.content);
      const newHash = hashContent(sanitized);
      // Re-embed kun hvis ikke task_transient (samme regel som store).
      const permRow = await db.queryRow<{ permanence: string | null }>`
        SELECT permanence FROM memories WHERE id = ${req.id}::uuid
      `;
      if (permRow?.permanence === "task_transient") {
        await db.exec`
          UPDATE memories
          SET content = ${sanitized}, content_hash = ${newHash}, embedding = NULL,
              updated_at = NOW(), last_accessed_at = NOW()
          WHERE id = ${req.id}::uuid
        `;
      } else {
        const embedding = await embed(sanitized);
        const vec = `[${embedding.join(",")}]`;
        await db.exec`
          UPDATE memories
          SET content = ${sanitized}, content_hash = ${newHash}, embedding = ${vec}::vector,
              updated_at = NOW(), last_accessed_at = NOW()
          WHERE id = ${req.id}::uuid
        `;
      }
    }
    if (req.trustLevel !== undefined) {
      await db.exec`
        UPDATE memories SET trust_level = ${req.trustLevel}, updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }
    if (req.tags !== undefined) {
      await db.exec`
        UPDATE memories SET tags = ${req.tags}::text[], updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }
    if (req.pinned !== undefined) {
      await db.exec`
        UPDATE memories SET pinned = ${req.pinned}, updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }
    if (req.ttlDays !== undefined) {
      await db.exec`
        UPDATE memories SET ttl_days = ${req.ttlDays}, updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }
    return { success: true, updated: true };
  }
);

// --- Memory Decay (Steg 2.6) ---

interface DecayResponse {
  updated: number;
  deleted: number;
  total: number;
}

/** Core decay logic — shared between manual endpoint and cron */
async function runDecayLogic(): Promise<DecayResponse> {
  const rows = await db.query<{
    id: string;
    memory_type: string;
    category: string;
    created_at: string;
    access_count: number;
    last_accessed_at: string | null;
    ttl_days: number;
  }>`
    SELECT id, memory_type, category, created_at, access_count,
           last_accessed_at, ttl_days
    FROM memories
    WHERE pinned = false AND superseded_by IS NULL
  `;

  let updated = 0;
  let deleted = 0;
  const now = new Date();

  for await (const row of rows) {
    const importance = calculateImportanceScore(
      row.memory_type as MemoryType,
      row.category,
      false
    );

    const decayedRelevance = calculateDecayedRelevance(
      importance,
      new Date(row.created_at),
      row.access_count,
      new Date(row.last_accessed_at ?? row.created_at),
      row.memory_type as MemoryType,
      false,
      now
    );

    const ageDays = (now.getTime() - new Date(row.created_at).getTime()) / 86_400_000;

    // Delete if relevance too low AND past TTL
    if (decayedRelevance < 0.05 && ageDays > row.ttl_days) {
      await db.exec`DELETE FROM memories WHERE id = ${row.id}::uuid`;
      deleted++;
    } else {
      await db.exec`
        UPDATE memories SET relevance_score = ${decayedRelevance}
        WHERE id = ${row.id}::uuid
      `;
      updated++;
    }
  }

  const totalRow = await db.queryRow<{ count: number }>`
    SELECT COUNT(*)::int as count FROM memories WHERE superseded_by IS NULL
  `;

  log.info("memory decay completed", { updated, deleted, total: totalRow?.count ?? 0 });

  return {
    updated,
    deleted,
    total: totalRow?.count ?? 0,
  };
}

// POST /memory/decay — Manual decay trigger (requires auth)
export const decay = api(
  { method: "POST", path: "/memory/decay", expose: true, auth: true },
  async (): Promise<DecayResponse> => runDecayLogic()
);

// POST /memory/decay-cron — Internal endpoint for scheduled decay
export const decayCron = api(
  { method: "POST", path: "/memory/decay-cron", expose: false },
  async (): Promise<DecayResponse> => runDecayLogic()
);

// GET /memory/brain-status — Get latest brain activity event for current user
export const brainStatus = api(
  { method: "GET", path: "/memory/brain-status", expose: true, auth: true },
  async (): Promise<{ active: boolean; event?: BrainEvent }> => {
    // In a multi-user system, we would fetch from context, but for now use a placeholder
    const userId = "current-user";
    const event = brainStatusCache.get(userId);
    return { active: !!event, event };
  }
);

// GET /memory/stats — Memory statistics
export const stats = api(
  { method: "GET", path: "/memory/stats", expose: true, auth: true },
  async (): Promise<MemoryStats> => {
    const totalRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count FROM memories WHERE superseded_by IS NULL
    `;

    const typeRows = await db.query<{ memory_type: string; count: number }>`
      SELECT memory_type, COUNT(*)::int as count
      FROM memories WHERE superseded_by IS NULL
      GROUP BY memory_type
    `;

    const byType: Record<string, number> = {};
    for await (const row of typeRows) {
      byType[row.memory_type] = row.count;
    }

    const avgRow = await db.queryRow<{ avg: number }>`
      SELECT COALESCE(AVG(relevance_score), 0)::float as avg
      FROM memories WHERE superseded_by IS NULL
    `;

    const expiringRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count
      FROM memories
      WHERE ttl_days > 0
        AND pinned = false
        AND superseded_by IS NULL
        AND last_accessed_at < NOW() - INTERVAL '1 day' * (ttl_days - 7)
    `;

    return {
      total: totalRow?.count ?? 0,
      byType,
      avgRelevanceScore: avgRow?.avg ?? 0,
      expiringSoon: expiringRow?.count ?? 0,
    };
  }
);

// --- Re-embed endpoint (ZI: after dimension migration, re-generate all embeddings) ---

interface ReEmbedResponse {
  processed: number;
  failed: number;
}

export const reEmbed = api(
  { method: "POST", path: "/memory/re-embed", expose: true, auth: true },
  async (): Promise<ReEmbedResponse> => {
    // Re-generate embeddings for memories with NULL embedding (set by migration)
    const rows = db.query<{ id: string; content: string }>`
      SELECT id, content FROM memories WHERE embedding IS NULL
    `;

    let processed = 0;
    let failed = 0;
    for await (const row of rows) {
      try {
        const embedding = await embed(row.content);
        await db.exec`
          UPDATE memories SET embedding = ${JSON.stringify(embedding)}::vector
          WHERE id = ${row.id}::uuid
        `;
        processed++;
      } catch (err) {
        log.warn("re-embed failed for memory", {
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
        failed++;
      }
    }

    // Also re-embed code patterns with NULL embeddings
    const patternRows = db.query<{ id: string; problem_description: string; solution_description: string }>`
      SELECT id, problem_description, solution_description
      FROM code_patterns WHERE problem_embedding IS NULL OR solution_embedding IS NULL
    `;

    for await (const row of patternRows) {
      try {
        const problemEmbedding = await embed(row.problem_description);
        const solutionEmbedding = await embed(row.solution_description);
        await db.exec`
          UPDATE code_patterns
          SET problem_embedding = ${JSON.stringify(problemEmbedding)}::vector,
              solution_embedding = ${JSON.stringify(solutionEmbedding)}::vector
          WHERE id = ${row.id}::uuid
        `;
        processed++;
      } catch (err) {
        log.warn("re-embed failed for code pattern", {
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
        failed++;
      }
    }

    log.info("re-embed completed", { processed, failed });
    return { processed, failed };
  }
);

// --- Code Patterns (DEL 6B) ---

interface StorePatternRequest {
  patternType: "bug_fix" | "optimization" | "refactoring" | "new_feature";
  sourceRepo: string;
  sourceTaskId?: string;
  problemDescription: string;
  solutionDescription: string;
  filesAffected?: string[];
  codeBefore?: string;
  codeAfter?: string;
  tags?: string[];
  componentId?: string;
}

interface StorePatternResponse {
  id: string;
}

interface SearchPatternsRequest {
  query: string;
  patternType?: string;
  sourceRepo?: string;
  limit?: number;
}

interface PatternResult {
  id: string;
  patternType: string;
  sourceRepo: string;
  problemDescription: string;
  solutionDescription: string;
  filesAffected: string[];
  timesReused: number;
  confidenceScore: number;
  tags: string[];
  similarity: number;
  createdAt: string;
}

interface SearchPatternsResponse {
  patterns: PatternResult[];
}

// POST /memory/store-pattern — Store a code pattern after task completion
export const storePattern = api(
  { method: "POST", path: "/memory/store-pattern", expose: false },
  async (req: StorePatternRequest): Promise<StorePatternResponse> => {
    const problemDescription = sanitizeForMemory(req.problemDescription);
    const solutionDescription = sanitizeForMemory(req.solutionDescription);
    const problemEmbedding = await embed(problemDescription);
    const solutionEmbedding = await embed(solutionDescription);
    const problemVec = `[${problemEmbedding.join(",")}]`;
    const solutionVec = `[${solutionEmbedding.join(",")}]`;
    const tags = req.tags ?? [];
    const filesAffected = req.filesAffected ?? [];

    const row = await db.queryRow`
      INSERT INTO code_patterns (
        pattern_type, source_repo, source_task_id,
        problem_description, solution_description,
        files_affected, code_before, code_after,
        problem_embedding, solution_embedding, tags, component_id
      )
      VALUES (
        ${req.patternType}, ${req.sourceRepo}, ${req.sourceTaskId || null},
        ${problemDescription}, ${solutionDescription},
        ${filesAffected}::text[], ${req.codeBefore || null}, ${req.codeAfter || null},
        ${problemVec}::vector, ${solutionVec}::vector, ${tags}::text[],
        ${req.componentId ?? null}::uuid
      )
      RETURNING id
    `;

    if (!row) throw APIError.internal("failed to store code pattern");
    return { id: row.id as string };
  }
);

// POST /memory/search-patterns — Search for similar patterns
export const searchPatterns = api(
  { method: "POST", path: "/memory/search-patterns", expose: false },
  async (req: SearchPatternsRequest): Promise<SearchPatternsResponse> => {
    const limit = req.limit ?? 5;
    const embedding = await embed(req.query);
    const vec = `[${embedding.join(",")}]`;
    const typeFilter = req.patternType || null;
    const repoFilter = req.sourceRepo || null;

    const rows = await db.query`
      SELECT
        id, pattern_type, source_repo, problem_description, solution_description,
        files_affected, times_reused, confidence_score::float as confidence_score, tags, created_at,
        1 - (problem_embedding <=> ${vec}::vector) as similarity
      FROM code_patterns
      WHERE 1 - (problem_embedding <=> ${vec}::vector) > 0.2
        AND (${typeFilter}::text IS NULL OR pattern_type = ${typeFilter})
        AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
      ORDER BY (1 - (problem_embedding <=> ${vec}::vector)) DESC
      LIMIT ${limit}
    `;

    const patterns: PatternResult[] = [];
    for await (const row of rows) {
      patterns.push({
        id: row.id as string,
        patternType: row.pattern_type as string,
        sourceRepo: row.source_repo as string,
        problemDescription: row.problem_description as string,
        solutionDescription: row.solution_description as string,
        filesAffected: (row.files_affected as string[]) || [],
        timesReused: Number(row.times_reused) || 0,
        confidenceScore: Number(row.confidence_score) || 0,
        tags: (row.tags as string[]) || [],
        similarity: row.similarity as number,
        createdAt: String(row.created_at),
      });

      // Increment reuse count
      await db.exec`
        UPDATE code_patterns SET times_reused = times_reused + 1 WHERE id = ${row.id}::uuid
      `;
    }

    return { patterns };
  }
);

// --- Knowledge System (D13) ---

interface StoreKnowledgeRequest {
  rule: string;
  category: string;
  context?: string;
  sourceTaskId?: string;
  sourceModel?: string;
  confidence?: number;
}

interface StoreKnowledgeResponse {
  id: string;
  deduplicated: boolean;
}

interface SearchKnowledgeRequest {
  query: string;
  threshold?: number;
  limit?: number;
}

interface KnowledgeResult {
  id: string;
  rule: string;
  category: string;
  context?: string;
  confidence: number;
  timesApplied: number;
  timesHelped: number;
  timesHurt: number;
  status: string;
  createdAt: string;
}

interface SearchKnowledgeResponse {
  results: KnowledgeResult[];
}

interface KnowledgeFeedbackRequest {
  id: string;
  helped: boolean;
}

interface KnowledgeFeedbackResponse {
  updated: boolean;
}

interface ListKnowledgeRequest {
  category?: string;
  status?: string;
  limit?: number;
}

interface ListKnowledgeResponse {
  items: KnowledgeResult[];
  total: number;
}

interface KnowledgeStatsResponse {
  total: number;
  active: number;
  byCategory: Record<string, number>;
  avgConfidence: number;
  topRules: KnowledgeResult[];
}

// POST /memory/knowledge/store — Store a learned rule (internal)
export const storeKnowledge = api(
  { method: "POST", path: "/memory/knowledge/store", expose: false },
  async (req: StoreKnowledgeRequest): Promise<StoreKnowledgeResponse> => {
    const rule = sanitizeForMemory(req.rule);
    if (rule.length < 10) {
      throw APIError.invalidArgument("rule too short");
    }

    // Dedup: check if a similar rule exists via ILIKE
    const existing = await db.queryRow<{ id: string; confidence: number }>`
      SELECT id, confidence FROM knowledge
      WHERE status = 'active'
        AND rule ILIKE ${`%${rule.substring(0, 80)}%`}
      LIMIT 1
    `;

    if (existing) {
      // Strengthen existing rule: bump confidence slightly
      const newConfidence = Math.min(1.0, existing.confidence + 0.05);
      await db.exec`
        UPDATE knowledge
        SET confidence = ${newConfidence},
            times_applied = times_applied + 1,
            last_applied_at = NOW(),
            updated_at = NOW()
        WHERE id = ${existing.id}::uuid
      `;
      return { id: existing.id, deduplicated: true };
    }

    const row = await db.queryRow<{ id: string }>`
      INSERT INTO knowledge (rule, category, context, source_task_id, source_model, confidence)
      VALUES (
        ${rule},
        ${req.category},
        ${req.context ?? null},
        ${req.sourceTaskId ?? null}::uuid,
        ${req.sourceModel ?? null},
        ${req.confidence ?? 0.5}
      )
      RETURNING id
    `;

    if (!row) throw APIError.internal("failed to store knowledge");
    return { id: row.id, deduplicated: false };
  }
);

// POST /memory/knowledge/search — Keyword search (internal)
export const searchKnowledge = api(
  { method: "POST", path: "/memory/knowledge/search", expose: false },
  async (req: SearchKnowledgeRequest): Promise<SearchKnowledgeResponse> => {
    const threshold = req.threshold ?? 0.3;
    const limit = req.limit ?? 5;
    const query = req.query.trim();

    const rows = await db.query<{
      id: string;
      rule: string;
      category: string;
      context: string | null;
      confidence: number;
      times_applied: number;
      times_helped: number;
      times_hurt: number;
      status: string;
      created_at: string;
    }>`
      SELECT id, rule, category, context, confidence::float as confidence,
             times_applied, times_helped, times_hurt, status, created_at
      FROM knowledge
      WHERE status = 'active'
        AND confidence > ${threshold}
        AND (rule ILIKE ${`%${query}%`} OR context ILIKE ${`%${query}%`})
      ORDER BY confidence DESC
      LIMIT ${limit}
    `;

    const results: KnowledgeResult[] = [];
    for await (const row of rows) {
      results.push({
        id: row.id,
        rule: row.rule,
        category: row.category,
        context: row.context ?? undefined,
        confidence: Number(row.confidence),
        timesApplied: Number(row.times_applied),
        timesHelped: Number(row.times_helped),
        timesHurt: Number(row.times_hurt),
        status: row.status,
        createdAt: String(row.created_at),
      });
    }

    return { results };
  }
);

// POST /memory/knowledge/feedback — Increment times_helped or times_hurt (internal)
export const knowledgeFeedback = api(
  { method: "POST", path: "/memory/knowledge/feedback", expose: false },
  async (req: KnowledgeFeedbackRequest): Promise<KnowledgeFeedbackResponse> => {
    if (req.helped) {
      await db.exec`
        UPDATE knowledge
        SET times_helped = times_helped + 1,
            times_applied = times_applied + 1,
            last_applied_at = NOW(),
            confidence = LEAST(1.0, confidence + 0.02),
            updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    } else {
      await db.exec`
        UPDATE knowledge
        SET times_hurt = times_hurt + 1,
            times_applied = times_applied + 1,
            last_applied_at = NOW(),
            confidence = GREATEST(0.0, confidence - 0.05),
            updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }
    return { updated: true };
  }
);

// GET /memory/knowledge/list — List knowledge rules (auth)
export const listKnowledge = api(
  { method: "GET", path: "/memory/knowledge/list", expose: true, auth: true },
  async (req: ListKnowledgeRequest): Promise<ListKnowledgeResponse> => {
    const limit = req.limit ?? 50;
    const statusFilter = req.status ?? "active";

    const rows = await db.query<{
      id: string;
      rule: string;
      category: string;
      context: string | null;
      confidence: number;
      times_applied: number;
      times_helped: number;
      times_hurt: number;
      status: string;
      created_at: string;
    }>`
      SELECT id, rule, category, context, confidence::float as confidence,
             times_applied, times_helped, times_hurt, status, created_at
      FROM knowledge
      WHERE (${statusFilter}::text IS NULL OR status = ${statusFilter})
        AND (${req.category ?? null}::text IS NULL OR category = ${req.category ?? null})
      ORDER BY confidence DESC, created_at DESC
      LIMIT ${limit}
    `;

    const items: KnowledgeResult[] = [];
    for await (const row of rows) {
      items.push({
        id: row.id,
        rule: row.rule,
        category: row.category,
        context: row.context ?? undefined,
        confidence: Number(row.confidence),
        timesApplied: Number(row.times_applied),
        timesHelped: Number(row.times_helped),
        timesHurt: Number(row.times_hurt),
        status: row.status,
        createdAt: String(row.created_at),
      });
    }

    const totalRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count FROM knowledge
      WHERE (${statusFilter}::text IS NULL OR status = ${statusFilter})
        AND (${req.category ?? null}::text IS NULL OR category = ${req.category ?? null})
    `;

    return { items, total: totalRow?.count ?? 0 };
  }
);

// GET /memory/knowledge/stats — Knowledge statistics (auth)
export const knowledgeStats = api(
  { method: "GET", path: "/memory/knowledge/stats", expose: true, auth: true },
  async (): Promise<KnowledgeStatsResponse> => {
    const totalRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count FROM knowledge
    `;
    const activeRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count FROM knowledge WHERE status = 'active'
    `;
    const avgRow = await db.queryRow<{ avg: number }>`
      SELECT COALESCE(AVG(confidence), 0)::float as avg FROM knowledge WHERE status = 'active'
    `;

    const catRows = await db.query<{ category: string; count: number }>`
      SELECT category, COUNT(*)::int as count
      FROM knowledge WHERE status = 'active'
      GROUP BY category
    `;
    const byCategory: Record<string, number> = {};
    for await (const row of catRows) {
      byCategory[row.category] = row.count;
    }

    const topRows = await db.query<{
      id: string;
      rule: string;
      category: string;
      context: string | null;
      confidence: number;
      times_applied: number;
      times_helped: number;
      times_hurt: number;
      status: string;
      created_at: string;
    }>`
      SELECT id, rule, category, context, confidence::float as confidence,
             times_applied, times_helped, times_hurt, status, created_at
      FROM knowledge
      WHERE status = 'active'
      ORDER BY confidence DESC, times_helped DESC
      LIMIT 5
    `;

    const topRules: KnowledgeResult[] = [];
    for await (const row of topRows) {
      topRules.push({
        id: row.id,
        rule: row.rule,
        category: row.category,
        context: row.context ?? undefined,
        confidence: Number(row.confidence),
        timesApplied: Number(row.times_applied),
        timesHelped: Number(row.times_helped),
        timesHurt: Number(row.times_hurt),
        status: row.status,
        createdAt: String(row.created_at),
      });
    }

    return {
      total: totalRow?.count ?? 0,
      active: activeRow?.count ?? 0,
      byCategory,
      avgConfidence: avgRow?.avg ?? 0,
      topRules,
    };
  }
);

// --- Manifest Endpoints ---

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
  /** D27: Map of file path → simple hash (mtime-based or content-based) for diff detection */
  fileHashes?: Record<string, string>;
}

interface GetManifestRequest {
  repoOwner: string;
  repoName: string;
}

interface GetManifestResponse {
  manifest: ProjectManifest | null;
}

interface UpdateManifestRequest {
  repoOwner: string;
  repoName: string;
  summary?: string | null;
  techStack?: string[];
  services?: unknown[];
  dataModels?: unknown[];
  contracts?: unknown[];
  /** D27: Map of file path → hash string, for diff-based context detection */
  fileHashes?: Record<string, string>;
  conventions?: string | null;
  knownPitfalls?: string | null;
  fileCount?: number | null;
  changedFiles?: string[]; // used to bump version + updated_at only
}

interface UpdateManifestResponse {
  manifest: ProjectManifest;
}

// POST /memory/manifest/get (expose: false) — get manifest by owner/repo
export const getManifest = api(
  { method: "POST", path: "/memory/manifest/get", expose: false },
  async (req: GetManifestRequest): Promise<GetManifestResponse> => {
    const row = await db.queryRow<{
      id: string;
      repo_owner: string;
      repo_name: string;
      summary: string | null;
      tech_stack: string[] | string;
      services: unknown;
      data_models: unknown;
      contracts: unknown;
      conventions: string | null;
      known_pitfalls: string | null;
      file_count: number | null;
      last_analyzed_at: string | null;
      version: number;
      file_hashes: unknown;
    }>`
      SELECT id, repo_owner, repo_name, summary, tech_stack, services, data_models,
             contracts, conventions, known_pitfalls, file_count, last_analyzed_at, version,
             file_hashes
      FROM project_manifests
      WHERE repo_owner = ${req.repoOwner} AND repo_name = ${req.repoName}
    `;

    if (!row) return { manifest: null };

    const techStack = typeof row.tech_stack === "string" ? JSON.parse(row.tech_stack) : (row.tech_stack || []);
    const services = typeof row.services === "string" ? JSON.parse(row.services) : (row.services || []);
    const dataModels = typeof row.data_models === "string" ? JSON.parse(row.data_models) : (row.data_models || []);
    const contracts = typeof row.contracts === "string" ? JSON.parse(row.contracts) : (row.contracts || []);
    const fileHashes = typeof row.file_hashes === "string"
      ? JSON.parse(row.file_hashes)
      : (row.file_hashes as Record<string, string> || {});

    return {
      manifest: {
        id: row.id,
        repoOwner: row.repo_owner,
        repoName: row.repo_name,
        summary: row.summary,
        techStack,
        services,
        dataModels,
        contracts,
        conventions: row.conventions,
        knownPitfalls: row.known_pitfalls,
        fileCount: row.file_count,
        lastAnalyzedAt: row.last_analyzed_at ? String(row.last_analyzed_at) : null,
        version: row.version,
        fileHashes,
      },
    };
  }
);

// POST /memory/manifest/update (expose: false) — upsert manifest
export const updateManifest = api(
  { method: "POST", path: "/memory/manifest/update", expose: false },
  async (req: UpdateManifestRequest): Promise<UpdateManifestResponse> => {
    // changedFiles-only path: just bump version + updated_at
    if (req.changedFiles !== undefined && Object.keys(req).filter(k => !["repoOwner", "repoName", "changedFiles"].includes(k)).length === 0) {
      await db.exec`
        UPDATE project_manifests
        SET version = version + 1, updated_at = NOW()
        WHERE repo_owner = ${req.repoOwner} AND repo_name = ${req.repoName}
      `;
      const existing = await db.queryRow<{ id: string; repo_owner: string; repo_name: string; summary: string | null; tech_stack: string[] | string; services: unknown; data_models: unknown; contracts: unknown; conventions: string | null; known_pitfalls: string | null; file_count: number | null; last_analyzed_at: string | null; version: number }>`
        SELECT id, repo_owner, repo_name, summary, tech_stack, services, data_models,
               contracts, conventions, known_pitfalls, file_count, last_analyzed_at, version
        FROM project_manifests
        WHERE repo_owner = ${req.repoOwner} AND repo_name = ${req.repoName}
      `;
      if (!existing) throw APIError.notFound("manifest not found");
      const techStack = typeof existing.tech_stack === "string" ? JSON.parse(existing.tech_stack) : (existing.tech_stack || []);
      const services = typeof existing.services === "string" ? JSON.parse(existing.services) : (existing.services || []);
      const dataModels = typeof existing.data_models === "string" ? JSON.parse(existing.data_models) : (existing.data_models || []);
      const contracts = typeof existing.contracts === "string" ? JSON.parse(existing.contracts) : (existing.contracts || []);
      return { manifest: { id: existing.id, repoOwner: existing.repo_owner, repoName: existing.repo_name, summary: existing.summary, techStack, services, dataModels, contracts, conventions: existing.conventions, knownPitfalls: existing.known_pitfalls, fileCount: existing.file_count, lastAnalyzedAt: existing.last_analyzed_at ? String(existing.last_analyzed_at) : null, version: existing.version } };
    }

    const techStack = req.techStack ?? [];
    const services = req.services ?? [];
    const dataModels = req.dataModels ?? [];
    const contracts = req.contracts ?? [];

    const row = await db.queryRow<{
      id: string;
      repo_owner: string;
      repo_name: string;
      summary: string | null;
      tech_stack: string[] | string;
      services: unknown;
      data_models: unknown;
      contracts: unknown;
      conventions: string | null;
      known_pitfalls: string | null;
      file_count: number | null;
      last_analyzed_at: string | null;
      version: number;
      file_hashes: unknown;
    }>`
      INSERT INTO project_manifests (repo_owner, repo_name, summary, tech_stack, services, data_models, contracts, conventions, known_pitfalls, file_count, last_analyzed_at, version, file_hashes)
      VALUES (
        ${req.repoOwner},
        ${req.repoName},
        ${req.summary ?? null},
        ${techStack}::text[],
        ${JSON.stringify(services)}::jsonb,
        ${JSON.stringify(dataModels)}::jsonb,
        ${JSON.stringify(contracts)}::jsonb,
        ${req.conventions ?? null},
        ${req.knownPitfalls ?? null},
        ${req.fileCount ?? null},
        NOW(),
        1,
        ${JSON.stringify(req.fileHashes ?? {})}::jsonb
      )
      ON CONFLICT (repo_owner, repo_name) DO UPDATE SET
        summary = COALESCE(EXCLUDED.summary, project_manifests.summary),
        tech_stack = CASE WHEN array_length(EXCLUDED.tech_stack, 1) > 0 THEN EXCLUDED.tech_stack ELSE project_manifests.tech_stack END,
        services = EXCLUDED.services,
        data_models = EXCLUDED.data_models,
        contracts = EXCLUDED.contracts,
        conventions = COALESCE(EXCLUDED.conventions, project_manifests.conventions),
        known_pitfalls = COALESCE(EXCLUDED.known_pitfalls, project_manifests.known_pitfalls),
        file_count = COALESCE(EXCLUDED.file_count, project_manifests.file_count),
        last_analyzed_at = NOW(),
        version = project_manifests.version + 1,
        updated_at = NOW(),
        file_hashes = CASE
          WHEN EXCLUDED.file_hashes::text != '{}'::jsonb::text
          THEN EXCLUDED.file_hashes
          ELSE project_manifests.file_hashes
        END
      RETURNING id, repo_owner, repo_name, summary, tech_stack, services, data_models,
                contracts, conventions, known_pitfalls, file_count, last_analyzed_at, version,
                file_hashes
    `;

    if (!row) throw APIError.internal("failed to upsert manifest");

    const retTechStack = typeof row.tech_stack === "string" ? JSON.parse(row.tech_stack) : (row.tech_stack || []);
    const retServices = typeof row.services === "string" ? JSON.parse(row.services) : (row.services || []);
    const retDataModels = typeof row.data_models === "string" ? JSON.parse(row.data_models) : (row.data_models || []);
    const retContracts = typeof row.contracts === "string" ? JSON.parse(row.contracts) : (row.contracts || []);
    const retFileHashes = typeof row.file_hashes === "string"
      ? JSON.parse(row.file_hashes)
      : (row.file_hashes as Record<string, string> || {});

    return {
      manifest: {
        id: row.id,
        repoOwner: row.repo_owner,
        repoName: row.repo_name,
        summary: row.summary,
        techStack: retTechStack,
        services: retServices,
        dataModels: retDataModels,
        contracts: retContracts,
        conventions: row.conventions,
        knownPitfalls: row.known_pitfalls,
        fileCount: row.file_count,
        lastAnalyzedAt: row.last_analyzed_at ? String(row.last_analyzed_at) : null,
        version: row.version,
        fileHashes: retFileHashes,
      },
    };
  }
);

// GET /memory/manifest/view (expose: true, auth: true) — view manifest
export const viewManifest = api(
  { method: "GET", path: "/memory/manifest/view", expose: true, auth: true },
  async (req: GetManifestRequest): Promise<GetManifestResponse> => {
    return getManifest(req);
  }
);

// POST /memory/manifest/edit (expose: true, auth: true) — edit manifest
export const editManifest = api(
  { method: "POST", path: "/memory/manifest/edit", expose: true, auth: true },
  async (req: UpdateManifestRequest): Promise<UpdateManifestResponse> => {
    return updateManifest(req);
  }
);

// POST /memory/knowledge/archive — Archive low-confidence stale rules (internal, used by sleep cycle)
export const archiveKnowledge = api(
  { method: "POST", path: "/memory/knowledge/archive", expose: false },
  async (): Promise<{ archived: number }> => {
    // Archive rules with confidence < 0.3 AND not applied in last 30 days
    const rows = await db.query<{ id: string }>`
      UPDATE knowledge SET status = 'archived', updated_at = NOW()
      WHERE status = 'active'
        AND confidence < 0.3
        AND (last_applied_at IS NULL OR last_applied_at < NOW() - INTERVAL '30 days')
      RETURNING id
    `;
    let archived = 0;
    for await (const _row of rows) archived++;
    return { archived };
  }
);

// POST /memory/knowledge/promote — Promote high-confidence frequently-used rules (internal)
export const promoteKnowledge = api(
  { method: "POST", path: "/memory/knowledge/promote", expose: false },
  async (): Promise<{ promoted: number }> => {
    // Promote rules with confidence > 0.8 AND applied more than 10 times
    const rows = await db.query<{ id: string }>`
      UPDATE knowledge SET status = 'promoted', promoted_at = NOW(), updated_at = NOW()
      WHERE status = 'active'
        AND confidence > 0.8
        AND times_applied > 10
      RETURNING id
    `;
    let promoted = 0;
    for await (const _row of rows) promoted++;
    return { promoted };
  }
);

// POST /memory/knowledge/merge-duplicates — Archive duplicate rules sharing a common prefix (internal)
export const mergeKnowledgeDuplicates = api(
  { method: "POST", path: "/memory/knowledge/merge-duplicates", expose: false },
  async (): Promise<{ merged: number }> => {
    // Fetch active rules with confidence > 0.5, ordered oldest first
    const rows = db.query<{ id: string; rule: string }>`
      SELECT id, rule FROM knowledge
      WHERE status = 'active' AND confidence > 0.5
      ORDER BY created_at ASC LIMIT 100
    `;
    const allRules: Array<{ id: string; rule: string }> = [];
    for await (const row of rows) allRules.push(row);

    // Find duplicates by 30-char lowercase prefix, keep oldest, archive newer
    const seen = new Map<string, string>(); // prefix → id
    let merged = 0;
    for (const rule of allRules) {
      const prefix = rule.rule.substring(0, 30).toLowerCase().trim();
      if (seen.has(prefix)) {
        await db.exec`UPDATE knowledge SET status = 'archived', updated_at = NOW() WHERE id = ${rule.id}::uuid`;
        merged++;
      } else {
        seen.set(prefix, rule.id);
      }
    }
    return { merged };
  }
);

// --- Dependency Graph (D27) ---

interface GetGraphRequest {
  repoOwner: string;
  repoName: string;
}

interface GetGraphResponse {
  graph: Record<string, string[]> | null;
  fileCount: number;
  edgeCount: number;
  analyzedAt: string | null;
}

interface UpdateGraphRequest {
  repoOwner: string;
  repoName: string;
  graph: Record<string, string[]>;
  fileCount: number;
  edgeCount: number;
}

interface UpdateGraphResponse {
  ok: boolean;
}

// POST /memory/graph/get (expose: false) — get dependency graph for a repo
export const getGraph = api(
  { method: "POST", path: "/memory/graph/get", expose: false },
  async (req: GetGraphRequest): Promise<GetGraphResponse> => {
    const row = await db.queryRow<{
      graph: unknown;
      file_count: number;
      edge_count: number;
      analyzed_at: string | null;
    }>`
      SELECT graph, file_count, edge_count, analyzed_at
      FROM project_dependency_graph
      WHERE repo_owner = ${req.repoOwner} AND repo_name = ${req.repoName}
    `;

    if (!row) {
      return { graph: null, fileCount: 0, edgeCount: 0, analyzedAt: null };
    }

    const graph = typeof row.graph === "string"
      ? JSON.parse(row.graph)
      : (row.graph as Record<string, string[]> || {});

    return {
      graph,
      fileCount: row.file_count,
      edgeCount: row.edge_count,
      analyzedAt: row.analyzed_at ? String(row.analyzed_at) : null,
    };
  }
);

// POST /memory/graph/update (expose: false) — upsert dependency graph for a repo
export const updateGraph = api(
  { method: "POST", path: "/memory/graph/update", expose: false },
  async (req: UpdateGraphRequest): Promise<UpdateGraphResponse> => {
    await db.exec`
      INSERT INTO project_dependency_graph (repo_owner, repo_name, graph, file_count, edge_count, analyzed_at)
      VALUES (
        ${req.repoOwner},
        ${req.repoName},
        ${JSON.stringify(req.graph)}::jsonb,
        ${req.fileCount},
        ${req.edgeCount},
        NOW()
      )
      ON CONFLICT (repo_owner, repo_name) DO UPDATE SET
        graph       = EXCLUDED.graph,
        file_count  = EXCLUDED.file_count,
        edge_count  = EXCLUDED.edge_count,
        analyzed_at = NOW()
    `;
    return { ok: true };
  }
);

// --- Episodic Memory (D26) ---

interface StoreEpisodeRequest {
  title: string;
  content: string;
  sourceRepo?: string;
  relatedTaskIds?: string[];
  tags?: string[];
}

interface StoreEpisodeResponse {
  id: string;
}

/**
 * D26: Store an episode-type memory capturing a completed task's narrative.
 * Episodes are structured summaries (title + content) with 180-day TTL.
 * Stored with memoryType="episode", trustLevel="agent".
 */
export const storeEpisode = api(
  { method: "POST", path: "/memory/episode/store", expose: false },
  async (req: StoreEpisodeRequest): Promise<StoreEpisodeResponse> => {
    const episodeContent = sanitizeForMemory(`# ${req.title}\n\n${req.content}`);
    const contentHash = hashContent(episodeContent);
    const embedding = await embed(episodeContent);
    const vec = `[${embedding.join(",")}]`;
    const tags = [...(req.tags ?? []), "episode"];
    const ttlDays = 180; // Episodes last longer than regular memories

    const row = await db.queryRow`
      INSERT INTO memories (
        content, category, embedding,
        memory_type, source_repo,
        tags, ttl_days, pinned, relevance_score, content_hash, trust_level
      )
      VALUES (
        ${episodeContent}, ${"agent"},
        ${vec}::vector,
        ${"episode"}, ${req.sourceRepo ?? null},
        ${tags}::text[], ${ttlDays}, false, ${0.75}, ${contentHash}, ${"agent"}
      )
      RETURNING id
    `;

    if (!row) throw new Error("failed to store episode memory");
    return { id: row.id as string };
  }
);

// --- FASE 10: Codebase Intelligence ---

/**
 * 10.1: Index an entire repo for semantic code search.
 * Incremental — skips if commitHash matches last indexed commit.
 * Embeds a content snippet per file (first 1500 chars) and stores in code_index.
 */
export const indexRepo = api(
  { method: "POST", path: "/memory/index-repo", expose: true, auth: true },
  async (req: {
    repoName: string;
    owner: string;
    files: Array<{ path: string; content: string }>;
    commitHash: string;
  }): Promise<{ indexed: number; skipped: boolean; commitHash: string; message: string }> => {
    // Check if already indexed at this commit
    const meta = await db.queryRow<{ commit_hash: string; file_count: number }>`
      SELECT commit_hash, file_count FROM code_index_meta WHERE repo_name = ${req.repoName}
    `;

    if (meta && meta.commit_hash === req.commitHash) {
      return {
        indexed: meta.file_count,
        skipped: true,
        commitHash: req.commitHash,
        message: `Repo already indexed at commit ${req.commitHash.substring(0, 8)} (${meta.file_count} files)`,
      };
    }

    // Filter to indexable code files only
    const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|py|go|rs|java|cs|rb|php|swift|kt|c|cpp|h)$/i;
    const indexableFiles = req.files.filter((f) => CODE_EXTENSIONS.test(f.path) && f.content.length > 50);

    let indexed = 0;
    const BATCH_SIZE = 20;

    for (let i = 0; i < indexableFiles.length; i += BATCH_SIZE) {
      const batch = indexableFiles.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(batch.map(async (file) => {
        try {
          // Build a rich snippet: path + first 1500 chars of content
          const snippet = `// File: ${file.path}\n${file.content.substring(0, 1500)}`;
          const embedding = await embed(snippet);
          const language = file.path.split(".").pop() ?? "unknown";

          await db.exec`
            INSERT INTO code_index (repo_name, file_path, content_snippet, embedding, commit_hash, language, updated_at)
            VALUES (
              ${req.repoName}, ${file.path}, ${snippet},
              ${JSON.stringify(embedding)}::vector,
              ${req.commitHash}, ${language}, now()
            )
            ON CONFLICT (repo_name, file_path) DO UPDATE SET
              content_snippet = EXCLUDED.content_snippet,
              embedding = EXCLUDED.embedding,
              commit_hash = EXCLUDED.commit_hash,
              language = EXCLUDED.language,
              updated_at = now()
          `;
          indexed++;
        } catch (err) {
          log.warn("code index: failed to embed file", {
            file: file.path,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }));
    }

    // Update meta
    await db.exec`
      INSERT INTO code_index_meta (repo_name, commit_hash, file_count, indexed_at)
      VALUES (${req.repoName}, ${req.commitHash}, ${indexed}, now())
      ON CONFLICT (repo_name) DO UPDATE SET
        commit_hash = EXCLUDED.commit_hash,
        file_count = EXCLUDED.file_count,
        indexed_at = now()
    `;

    log.info("code index: repo indexed", { repoName: req.repoName, indexed, commitHash: req.commitHash.substring(0, 8) });

    return {
      indexed,
      skipped: false,
      commitHash: req.commitHash,
      message: `Indexed ${indexed} files (${indexableFiles.length - indexed} failed)`,
    };
  }
);

/**
 * 10.2: Semantic code search — natural-language query against indexed codebase.
 * Returns files ranked by semantic similarity to the query.
 */
export const searchCode = api(
  { method: "POST", path: "/memory/search-code", expose: true, auth: true },
  async (req: {
    query: string;
    repoName: string;
    limit?: number;
    language?: string;
  }): Promise<{ results: Array<{ filePath: string; snippet: string; similarity: number; language: string }> }> => {
    const limit = Math.min(req.limit ?? 10, 30);

    const queryEmbedding = await embed(req.query);
    const embeddingStr = JSON.stringify(queryEmbedding);

    type CodeIndexRow = { file_path: string; content_snippet: string; similarity: number; language: string };

    const results: Array<{ filePath: string; snippet: string; similarity: number; language: string }> = [];

    if (req.language) {
      for await (const row of db.query<CodeIndexRow>`
        SELECT file_path, content_snippet,
               1 - (embedding <=> ${embeddingStr}::vector) AS similarity,
               language
        FROM code_index
        WHERE repo_name = ${req.repoName}
          AND language = ${req.language}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `) {
        results.push({
          filePath: row.file_path,
          snippet: row.content_snippet.substring(0, 500),
          similarity: typeof row.similarity === "string" ? parseFloat(row.similarity) : row.similarity,
          language: row.language,
        });
      }
    } else {
      for await (const row of db.query<CodeIndexRow>`
        SELECT file_path, content_snippet,
               1 - (embedding <=> ${embeddingStr}::vector) AS similarity,
               language
        FROM code_index
        WHERE repo_name = ${req.repoName}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `) {
        results.push({
          filePath: row.file_path,
          snippet: row.content_snippet.substring(0, 500),
          similarity: typeof row.similarity === "string" ? parseFloat(row.similarity) : row.similarity,
          language: row.language,
        });
      }
    }

    return { results };
  }
);

// --- Crons ---

const _cleanup = new CronJob("memory-cleanup", {
  title: "Clean expired memories",
  schedule: "0 4 * * *",
  endpoint: cleanup,
});

const _decay = new CronJob("memory-decay", {
  title: "Decay memory relevance scores",
  schedule: "0 3 * * *",
  endpoint: decayCron,
});

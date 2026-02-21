import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { cache } from "~encore/clients";
import { calculateImportanceScore, calculateDecayedRelevance } from "./decay";
import type { MemoryType } from "./decay";
import { sanitizeForMemory } from "../ai/sanitize";
import { createHash } from "node:crypto";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const voyageKey = secret("VoyageAPIKey");

const db = new SQLDatabase("memory", { migrations: "./migrations" });

/** Hybrid search weighting: 60% semantic (vector), 40% keyword (BM25) */
export const HYBRID_ALPHA = 0.6;

// --- Embedding helper (with cache) ---

async function embed(text: string): Promise<number[]> {
  const truncated = text.substring(0, 8000);

  // Check cache first
  const cached = await cache.getOrSetEmbedding({ content: truncated });
  if (cached.hit && cached.embedding) {
    return cached.embedding;
  }

  // Cache miss — call Voyage API with retry for 429
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${voyageKey()}`,
        },
        body: JSON.stringify({ input: truncated, model: "voyage-3-lite" }),
      });

      if (res.status === 429) {
        const waitMs = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s
        console.warn(`Voyage 429 — waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      if (!res.ok) throw APIError.internal(`Voyage API error: ${res.status}`);
      const data = await res.json();
      const embedding: number[] = data.data[0].embedding;

      // Store in cache for next time
      await cache.getOrSetEmbedding({ content: truncated, embedding });

      return embedding;
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 2) * 1000));
    }
  }

  throw APIError.internal("Voyage API failed after retries");
}

interface SearchRequest {
  query: string;
  limit?: number;
  memoryType?: MemoryType;
  sourceRepo?: string;
  tags?: string[];
  includeDecayed?: boolean;
  minTrustLevel?: "user" | "agent" | "system";
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
    const embedding = await embed(req.query);
    const vec = `[${embedding.join(",")}]`;

    // Build filter conditions
    const typeFilter = req.memoryType ? req.memoryType : null;
    const repoFilter = req.sourceRepo ? req.sourceRepo : null;
    const minRelevance = req.includeDecayed ? 0.0 : 0.1;

    // BM25 keyword search (only if query has searchable terms)
    const bm25Query = req.query.trim();
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
        content_hash, trust_level,
        1 - (embedding <=> ${vec}::vector) as similarity
      FROM memories
      WHERE 1 - (embedding <=> ${vec}::vector) > 0.15
        AND superseded_by IS NULL
        AND (${typeFilter}::text IS NULL OR memory_type = ${typeFilter})
        AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
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
        }>`
          SELECT id, content, category, created_at, last_accessed_at, memory_type,
            relevance_score::float as relevance_score, access_count, tags, source_repo, pinned,
            content_hash, trust_level
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
      query: req.query.substring(0, 100),
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
    const embedding = await embed(content);
    const vec = `[${embedding.join(",")}]`;
    const memoryType = req.memoryType || "general";
    const ttlDays = req.ttlDays ?? 90;
    const pinned = req.pinned ?? false;
    const tags = req.tags ?? [];
    const trustLevel = req.trustLevel ?? "user";
    const relevanceScore = calculateImportanceScore(memoryType as MemoryType, req.category, pinned);

    const row = await db.queryRow`
      INSERT INTO memories (
        content, category, conversation_id, linear_task_id, embedding,
        memory_type, source_repo,
        tags, ttl_days, pinned, relevance_score, content_hash, trust_level
      )
      VALUES (
        ${content}, ${req.category},
        ${req.conversationId || null}, ${req.linearTaskId || null},
        ${vec}::vector,
        ${memoryType}, ${req.sourceRepo || null},
        ${tags}::text[], ${ttlDays}, ${pinned}, ${relevanceScore}, ${contentHash}, ${trustLevel}
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
export const cleanup = api(
  { method: "POST", path: "/memory/cleanup", expose: false },
  async (): Promise<CleanupResponse> => {
    const result = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM memories
        WHERE ttl_days > 0
          AND pinned = false
          AND last_accessed_at < NOW() - INTERVAL '1 day' * ttl_days
        RETURNING id
      )
      SELECT COUNT(*)::int as count FROM deleted
    `;

    return { deleted: result?.count ?? 0 };
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

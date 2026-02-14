import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import { cache } from "~encore/clients";

const voyageKey = secret("VoyageAPIKey");

const db = new SQLDatabase("memory", { migrations: "./migrations" });

// --- Embedding helper (with cache) ---

async function embed(text: string): Promise<number[]> {
  const truncated = text.substring(0, 8000);

  // Check cache first
  const cached = await cache.getOrSetEmbedding({ content: truncated });
  if (cached.hit && cached.embedding) {
    return cached.embedding;
  }

  // Cache miss — call Voyage API
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${voyageKey()}`,
    },
    body: JSON.stringify({ input: truncated, model: "voyage-3-lite" }),
  });

  if (!res.ok) throw APIError.internal(`Voyage API error: ${res.status}`);
  const data = await res.json();
  const embedding: number[] = data.data[0].embedding;

  // Store in cache for next time
  await cache.getOrSetEmbedding({ content: truncated, embedding });

  return embedding;
}

// --- Types ---

type MemoryType = 'skill' | 'task' | 'session' | 'error_pattern' | 'decision' | 'general';

interface SearchRequest {
  query: string;
  limit?: number;
  memoryType?: MemoryType;
  sourceRepo?: string;
  tags?: string[];
  includeDecayed?: boolean;
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
  parentMemoryId?: string;
  sourceRepo?: string;
  sourceTaskId?: string;
  tags?: string[];
  ttlDays?: number;
  pinned?: boolean;
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
  { method: "POST", path: "/memory/search", expose: false },
  async (req: SearchRequest): Promise<SearchResponse> => {
    const limit = req.limit ?? 5;
    const embedding = await embed(req.query);
    const vec = `[${embedding.join(",")}]`;

    // Build filter conditions
    const typeFilter = req.memoryType ? req.memoryType : null;
    const repoFilter = req.sourceRepo ? req.sourceRepo : null;
    const minRelevance = req.includeDecayed ? 0.0 : 0.1;

    // Decayed scoring: similarity * temporal_decay * (1 + access_boost * 0.1)
    // temporal_decay = relevance_score * EXP(-0.01 * days_since_creation)
    // access_boost = LOG(1 + access_count)
    const rows = await db.query`
      SELECT
        id, content, category, created_at, memory_type, relevance_score,
        access_count, tags, source_repo,
        1 - (embedding <=> ${vec}::vector) as similarity,
        relevance_score * EXP(-0.01 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) as temporal_decay,
        LOG(1 + access_count) as access_boost
      FROM memories
      WHERE 1 - (embedding <=> ${vec}::vector) > 0.15
        AND superseded_by IS NULL
        AND (${typeFilter}::text IS NULL OR memory_type = ${typeFilter})
        AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
        AND relevance_score >= ${minRelevance}
      ORDER BY (
        (1 - (embedding <=> ${vec}::vector))
        * (relevance_score * EXP(-0.01 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400))
        * (1 + LOG(1 + access_count) * 0.1)
      ) DESC
      LIMIT ${limit}
    `;

    const results: SearchResult[] = [];
    const ids: string[] = [];
    for await (const row of rows) {
      const similarity = row.similarity as number;
      const temporalDecay = row.temporal_decay as number;
      const accessBoost = row.access_boost as number;
      const id = row.id as string;
      ids.push(id);

      // Tag filtering in JS (GIN index + parameter binding is complex)
      if (req.tags && req.tags.length > 0) {
        const rowTags = (row.tags as string[]) || [];
        const hasMatch = req.tags.some((t) => rowTags.includes(t));
        if (!hasMatch) continue;
      }

      results.push({
        id,
        content: row.content as string,
        category: row.category as string,
        similarity,
        memoryType: row.memory_type as MemoryType,
        relevanceScore: row.relevance_score as number,
        decayedScore: similarity * temporalDecay * (1 + accessBoost * 0.1),
        accessCount: row.access_count as number,
        tags: (row.tags as string[]) || [],
        sourceRepo: row.source_repo as string | undefined,
        createdAt: String(row.created_at),
      });
    }

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
    const embedding = await embed(req.content);
    const vec = `[${embedding.join(",")}]`;
    const memoryType = req.memoryType || "general";
    const ttlDays = req.ttlDays ?? 90;
    const pinned = req.pinned ?? false;
    const tags = req.tags ?? [];

    const row = await db.queryRow`
      INSERT INTO memories (
        content, category, conversation_id, linear_task_id, embedding,
        memory_type, parent_memory_id, source_repo, source_task_id,
        tags, ttl_days, pinned
      )
      VALUES (
        ${req.content}, ${req.category},
        ${req.conversationId || null}, ${req.linearTaskId || null},
        ${vec}::vector,
        ${memoryType}, ${req.parentMemoryId || null}::uuid,
        ${req.sourceRepo || null}, ${req.sourceTaskId || null},
        ${tags}::text[], ${ttlDays}, ${pinned}
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

    const embedding = await embed(req.content);
    const vec = `[${embedding.join(",")}]`;

    await db.exec`
      INSERT INTO memories (content, category, conversation_id, linear_task_id, embedding, memory_type)
      VALUES (${req.content.substring(0, 5000)}, ${req.category}, ${req.conversationId}, ${req.linearTaskId || null}, ${vec}::vector, 'session')
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

    // Combine content and generate new embedding
    const combined = contents.join("\n\n---\n\n");
    const embedding = await embed(combined);
    const vec = `[${embedding.join(",")}]`;
    const tags = Array.from(allTags);

    // Insert consolidated memory
    const newRow = await db.queryRow`
      INSERT INTO memories (
        content, category, embedding, memory_type, tags,
        source_repo, consolidated_from, pinned
      )
      VALUES (
        ${combined.substring(0, 10000)}, ${category}, ${vec}::vector,
        'decision', ${tags}::text[], ${sourceRepo},
        ${req.memoryIds}::uuid[], true
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
      SELECT COALESCE(AVG(relevance_score), 0)::decimal as avg
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
    const problemEmbedding = await embed(req.problemDescription);
    const solutionEmbedding = await embed(req.solutionDescription);
    const problemVec = `[${problemEmbedding.join(",")}]`;
    const solutionVec = `[${solutionEmbedding.join(",")}]`;
    const tags = req.tags ?? [];
    const filesAffected = req.filesAffected ?? [];

    const row = await db.queryRow`
      INSERT INTO code_patterns (
        pattern_type, source_repo, source_task_id,
        problem_description, solution_description,
        files_affected, code_before, code_after,
        problem_embedding, solution_embedding, tags
      )
      VALUES (
        ${req.patternType}, ${req.sourceRepo}, ${req.sourceTaskId || null},
        ${req.problemDescription}, ${req.solutionDescription},
        ${filesAffected}::text[], ${req.codeBefore || null}, ${req.codeAfter || null},
        ${problemVec}::vector, ${solutionVec}::vector, ${tags}::text[]
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
        files_affected, times_reused, confidence_score, tags, created_at,
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
        timesReused: row.times_reused as number,
        confidenceScore: row.confidence_score as number,
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

// --- Cron: Daily memory cleanup at 04:00 ---

const _ = new CronJob("memory-cleanup", {
  title: "Clean expired memories",
  schedule: "0 4 * * *",
  endpoint: cleanup,
});

import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";
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

interface SearchRequest {
  query: string;
  limit?: number;
}

interface MemoryResult {
  id: string;
  content: string;
  category: string;
  relevance: number;
  createdAt: string;
}

interface SearchResponse {
  results: MemoryResult[];
}

interface StoreRequest {
  content: string;
  category: string;
  conversationId?: string;
  linearTaskId?: string;
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

// --- Endpoints ---

export const search = api(
  { method: "POST", path: "/memory/search", expose: false },
  async (req: SearchRequest): Promise<SearchResponse> => {
    const limit = req.limit ?? 5;
    const embedding = await embed(req.query);
    const vec = `[${embedding.join(",")}]`;

    const rows = await db.query`
      SELECT id, content, category, created_at,
             1 - (embedding <=> ${vec}::vector) as relevance
      FROM memories
      WHERE 1 - (embedding <=> ${vec}::vector) > 0.25
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `;

    const results: MemoryResult[] = [];
    for await (const row of rows) {
      results.push({
        id: row.id as string,
        content: row.content as string,
        category: row.category as string,
        relevance: row.relevance as number,
        createdAt: row.created_at as string,
      });
    }

    return { results };
  }
);

export const store = api(
  { method: "POST", path: "/memory/store", expose: true, auth: true },
  async (req: StoreRequest): Promise<StoreResponse> => {
    const embedding = await embed(req.content);
    const vec = `[${embedding.join(",")}]`;

    const row = await db.queryRow`
      INSERT INTO memories (content, category, conversation_id, linear_task_id, embedding)
      VALUES (${req.content}, ${req.category}, ${req.conversationId || null}, ${req.linearTaskId || null}, ${vec}::vector)
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
      INSERT INTO memories (content, category, conversation_id, linear_task_id, embedding)
      VALUES (${req.content.substring(0, 5000)}, ${req.category}, ${req.conversationId}, ${req.linearTaskId || null}, ${vec}::vector)
    `;

    return { stored: true };
  }
);

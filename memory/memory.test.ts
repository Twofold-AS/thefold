import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("memory", { migrations: "./migrations" });

describe("Memory database", () => {
  const testCategory = "test-" + Date.now();

  beforeEach(async () => {
    // Clean up test memories before each test
    await db.exec`DELETE FROM memories WHERE category = ${testCategory}`;
  });

  describe("Memory insertion", () => {
    it("should insert a memory without embedding", async () => {
      const content = "This is a test memory about TypeScript";
      const result = await db.queryRow<{
        id: string;
        content: string;
        category: string;
      }>`
        INSERT INTO memories (content, category)
        VALUES (${content}, ${testCategory})
        RETURNING id, content, category
      `;

      expect(result).toBeDefined();
      expect(result!.content).toBe(content);
      expect(result!.category).toBe(testCategory);
    });

    it("should insert a memory with conversation_id and linear_task_id", async () => {
      const conversationId = "conv-123";
      const linearTaskId = "TASK-456";
      const content = "Test memory with task context";

      const result = await db.queryRow<{
        conversationId: string | null;
        linearTaskId: string | null;
      }>`
        INSERT INTO memories (content, category, conversation_id, linear_task_id)
        VALUES (${content}, ${testCategory}, ${conversationId}, ${linearTaskId})
        RETURNING conversation_id as "conversationId", linear_task_id as "linearTaskId"
      `;

      expect(result).toBeDefined();
      expect(result!.conversationId).toBe(conversationId);
      expect(result!.linearTaskId).toBe(linearTaskId);
    });

    it("should insert a memory with vector embedding", async () => {
      // Create a simple 512-dimensional vector (normally this would come from Voyage AI)
      const embedding = Array(512).fill(0).map((_, i) => i % 2 === 0 ? 0.1 : -0.1);
      const vec = `[${embedding.join(",")}]`;

      const result = await db.queryRow<{
        id: string;
        content: string;
      }>`
        INSERT INTO memories (content, category, embedding)
        VALUES ('Test with embedding', ${testCategory}, ${vec}::vector)
        RETURNING id, content
      `;

      expect(result).toBeDefined();
      expect(result!.content).toBe("Test with embedding");
    });
  });

  describe("Memory querying", () => {
    beforeEach(async () => {
      // Insert test memories
      await db.exec`
        INSERT INTO memories (content, category, created_at)
        VALUES
          ('First memory about Encore.ts', ${testCategory}, NOW() - INTERVAL '2 hours'),
          ('Second memory about databases', ${testCategory}, NOW() - INTERVAL '1 hour'),
          ('Third memory about testing', ${testCategory}, NOW())
      `;
    });

    it("should query memories by category", async () => {
      const rows = await db.query<{ content: string }>`
        SELECT content
        FROM memories
        WHERE category = ${testCategory}
        ORDER BY created_at ASC
      `;

      const memories: string[] = [];
      for await (const row of rows) {
        memories.push(row.content);
      }

      expect(memories).toHaveLength(3);
      expect(memories[0]).toBe("First memory about Encore.ts");
      expect(memories[2]).toBe("Third memory about testing");
    });

    it("should query memories with limit", async () => {
      const rows = await db.query<{ content: string }>`
        SELECT content
        FROM memories
        WHERE category = ${testCategory}
        ORDER BY created_at DESC
        LIMIT 2
      `;

      const memories: string[] = [];
      for await (const row of rows) {
        memories.push(row.content);
      }

      expect(memories).toHaveLength(2);
      expect(memories[0]).toBe("Third memory about testing");
    });

    it("should filter by linear_task_id", async () => {
      const taskId = "TASK-" + Date.now();
      await db.exec`
        INSERT INTO memories (content, category, linear_task_id)
        VALUES ('Task-specific memory', ${testCategory}, ${taskId})
      `;

      const rows = await db.query<{ content: string }>`
        SELECT content
        FROM memories
        WHERE category = ${testCategory} AND linear_task_id = ${taskId}
      `;

      const memories: string[] = [];
      for await (const row of rows) {
        memories.push(row.content);
      }

      expect(memories).toHaveLength(1);
      expect(memories[0]).toBe("Task-specific memory");
    });
  });

  describe("Vector search with pgvector", () => {
    it("should perform cosine similarity search", async () => {
      // Create three distinct embeddings
      // Embedding 1: mostly positive values
      const embedding1 = Array(512).fill(0).map((_, i) => i < 256 ? 0.5 : 0.1);
      const vec1 = `[${embedding1.join(",")}]`;

      // Embedding 2: similar to embedding1 (high cosine similarity)
      const embedding2 = Array(512).fill(0).map((_, i) => i < 256 ? 0.6 : 0.2);
      const vec2 = `[${embedding2.join(",")}]`;

      // Embedding 3: very different (low cosine similarity)
      const embedding3 = Array(512).fill(0).map((_, i) => i < 256 ? -0.5 : 0.8);
      const vec3 = `[${embedding3.join(",")}]`;

      // Insert memories with embeddings
      await db.exec`
        INSERT INTO memories (content, category, embedding)
        VALUES
          ('Similar memory 1', ${testCategory}, ${vec1}::vector),
          ('Similar memory 2', ${testCategory}, ${vec2}::vector),
          ('Different memory', ${testCategory}, ${vec3}::vector)
      `;

      // Search using embedding1 as query
      const rows = await db.query<{
        content: string;
        relevance: number;
      }>`
        SELECT
          content,
          1 - (embedding <=> ${vec1}::vector) as relevance
        FROM memories
        WHERE category = ${testCategory}
        ORDER BY embedding <=> ${vec1}::vector
        LIMIT 3
      `;

      const results: any[] = [];
      for await (const row of rows) {
        results.push(row);
      }

      expect(results).toHaveLength(3);
      // Most similar should be the query itself
      expect(results[0].content).toBe("Similar memory 1");
      expect(results[0].relevance).toBeGreaterThan(0.99);
      // Second most similar
      expect(results[1].content).toBe("Similar memory 2");
      expect(results[1].relevance).toBeGreaterThan(0.9);
      // Least similar
      expect(results[2].content).toBe("Different memory");
      expect(results[2].relevance).toBeLessThan(results[1].relevance);
    });

    it("should filter results by relevance threshold", async () => {
      // Create embeddings with known similarity
      const queryEmbedding = Array(512).fill(0).map((_, i) => i % 2 === 0 ? 1.0 : 0.0);
      const queryVec = `[${queryEmbedding.join(",")}]`;

      // Similar embedding (high cosine similarity)
      const similarEmbedding = Array(512).fill(0).map((_, i) => i % 2 === 0 ? 0.9 : 0.1);
      const similarVec = `[${similarEmbedding.join(",")}]`;

      // Different embedding (low cosine similarity)
      const differentEmbedding = Array(512).fill(0).map((_, i) => i % 2 === 0 ? 0.1 : 0.9);
      const differentVec = `[${differentEmbedding.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding)
        VALUES
          ('High relevance memory', ${testCategory}, ${similarVec}::vector),
          ('Low relevance memory', ${testCategory}, ${differentVec}::vector)
      `;

      // Search with relevance threshold of 0.5
      const rows = await db.query<{
        content: string;
        relevance: number;
      }>`
        SELECT
          content,
          1 - (embedding <=> ${queryVec}::vector) as relevance
        FROM memories
        WHERE category = ${testCategory}
          AND 1 - (embedding <=> ${queryVec}::vector) > 0.5
        ORDER BY embedding <=> ${queryVec}::vector
      `;

      const results: any[] = [];
      for await (const row of rows) {
        results.push(row);
      }

      // Only high relevance memory should be returned
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("High relevance memory");
      expect(results[0].relevance).toBeGreaterThan(0.5);
    });

    it("should calculate correct cosine distance", async () => {
      // Create identical embeddings (cosine distance should be 0, similarity 1)
      const embedding = Array(512).fill(0).map((_, i) => Math.sin(i));
      const vec = `[${embedding.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding)
        VALUES ('Identical embedding test', ${testCategory}, ${vec}::vector)
      `;

      const result = await db.queryRow<{
        distance: number;
        similarity: number;
      }>`
        SELECT
          embedding <=> ${vec}::vector as distance,
          1 - (embedding <=> ${vec}::vector) as similarity
        FROM memories
        WHERE category = ${testCategory} AND content = 'Identical embedding test'
      `;

      expect(result).toBeDefined();
      // Cosine distance should be very close to 0 (allowing for floating point precision)
      expect(result!.distance).toBeLessThan(0.001);
      // Cosine similarity should be very close to 1
      expect(result!.similarity).toBeGreaterThan(0.999);
    });

    it("should calculate correct cosine distance for orthogonal vectors", async () => {
      // Create two orthogonal embeddings (cosine distance should be 0.5, similarity 0.5)
      // First half is [1, 0, 1, 0, ...], second half is [0, 0, 0, 0, ...]
      const embedding1 = Array(512).fill(0).map((_, i) => i < 256 && i % 2 === 0 ? 1.0 : 0.0);
      const vec1 = `[${embedding1.join(",")}]`;

      // First half is [0, 0, 0, 0, ...], second half is [1, 0, 1, 0, ...]
      const embedding2 = Array(512).fill(0).map((_, i) => i >= 256 && i % 2 === 0 ? 1.0 : 0.0);
      const vec2 = `[${embedding2.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding)
        VALUES ('Orthogonal embedding', ${testCategory}, ${vec2}::vector)
      `;

      const result = await db.queryRow<{
        distance: number;
        similarity: number;
      }>`
        SELECT
          embedding <=> ${vec1}::vector as distance,
          1 - (embedding <=> ${vec1}::vector) as similarity
        FROM memories
        WHERE category = ${testCategory} AND content = 'Orthogonal embedding'
      `;

      expect(result).toBeDefined();
      // For orthogonal vectors (dot product = 0), cosine distance should be 1.0
      expect(result!.distance).toBeGreaterThan(0.95);
      expect(result!.distance).toBeLessThan(1.05);
      // Cosine similarity should be 0 (1 - distance = 0)
      expect(result!.similarity).toBeGreaterThan(-0.05);
      expect(result!.similarity).toBeLessThan(0.05);
    });
  });

  describe("Memory search with combined filters", () => {
    it("should search with vector similarity and category filter", async () => {
      const otherCategory = "other-" + Date.now();
      const embedding = Array(512).fill(0.5);
      const vec = `[${embedding.join(",")}]`;

      // Insert memories in different categories
      await db.exec`
        INSERT INTO memories (content, category, embedding)
        VALUES
          ('Test category memory', ${testCategory}, ${vec}::vector),
          ('Other category memory', ${otherCategory}, ${vec}::vector)
      `;

      // Search only in test category
      const rows = await db.query<{ content: string }>`
        SELECT content
        FROM memories
        WHERE category = ${testCategory}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT 5
      `;

      const results: string[] = [];
      for await (const row of rows) {
        results.push(row.content);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toBe("Test category memory");
      expect(results).not.toContain("Other category memory");
    });
  });
});

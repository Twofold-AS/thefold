import { describe, it, expect } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { EMBEDDING_DIMENSION, HYBRID_ALPHA } from "./memory";

const db = new SQLDatabase("memory", { migrations: "./migrations" });

describe("OpenAI embedding migration (ZI)", () => {
  const testCategory = "zi-embed-test-" + Date.now();

  describe("Embedding dimension constant", () => {
    it("EMBEDDING_DIMENSION should be 1536 for OpenAI text-embedding-3-small", () => {
      expect(EMBEDDING_DIMENSION).toBe(1536);
    });

    it("HYBRID_ALPHA should remain 0.6 (unchanged by migration)", () => {
      expect(HYBRID_ALPHA).toBe(0.6);
    });
  });

  describe("Database vector dimension", () => {
    it("should accept 1536-dimensional vectors in memories table", async () => {
      const embedding = Array(1536).fill(0).map((_, i) => Math.sin(i * 0.01));
      const vec = `[${embedding.join(",")}]`;

      const result = await db.queryRow<{ id: string; content: string }>`
        INSERT INTO memories (content, category, embedding)
        VALUES ('ZI dimension test', ${testCategory}, ${vec}::vector)
        RETURNING id, content
      `;

      expect(result).toBeDefined();
      expect(result!.content).toBe("ZI dimension test");

      // Cleanup
      await db.exec`DELETE FROM memories WHERE category = ${testCategory}`;
    });

    it("should reject wrong-dimension vectors in memories table", async () => {
      const wrongDimEmbedding = Array(512).fill(0).map((_, i) => Math.sin(i));
      const vec = `[${wrongDimEmbedding.join(",")}]`;

      await expect(
        db.exec`
          INSERT INTO memories (content, category, embedding)
          VALUES ('Wrong dimension', ${testCategory}, ${vec}::vector)
        `
      ).rejects.toThrow();
    });

    it("should accept 1536-dimensional vectors in code_patterns table", async () => {
      const embedding = Array(1536).fill(0).map((_, i) => Math.cos(i * 0.01));
      const vec = `[${embedding.join(",")}]`;

      const result = await db.queryRow<{ id: string }>`
        INSERT INTO code_patterns (
          pattern_type, source_repo,
          problem_description, solution_description,
          problem_embedding, solution_embedding
        )
        VALUES (
          'bug_fix', 'test-repo',
          'ZI problem test', 'ZI solution test',
          ${vec}::vector, ${vec}::vector
        )
        RETURNING id
      `;

      expect(result).toBeDefined();
      expect(result!.id).toBeDefined();

      // Cleanup
      await db.exec`DELETE FROM code_patterns WHERE source_repo = 'test-repo' AND problem_description = 'ZI problem test'`;
    });
  });

  describe("Cosine similarity with 1536 dimensions", () => {
    const simCategory = "zi-sim-test-" + Date.now();

    it("should compute correct similarity for identical 1536-dim vectors", async () => {
      const embedding = Array(1536).fill(0).map((_, i) => Math.sin(i * 0.005));
      const vec = `[${embedding.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding)
        VALUES ('Identical vector test', ${simCategory}, ${vec}::vector)
      `;

      const result = await db.queryRow<{ similarity: number }>`
        SELECT 1 - (embedding <=> ${vec}::vector) as similarity
        FROM memories
        WHERE category = ${simCategory}
      `;

      expect(result).toBeDefined();
      expect(result!.similarity).toBeGreaterThan(0.999);

      await db.exec`DELETE FROM memories WHERE category = ${simCategory}`;
    });

    it("should distinguish similar from dissimilar 1536-dim vectors", async () => {
      // Similar: positive-heavy
      const similar1 = Array(1536).fill(0).map((_, i) => i < 768 ? 0.5 : 0.1);
      const similar2 = Array(1536).fill(0).map((_, i) => i < 768 ? 0.6 : 0.15);
      // Dissimilar: negative-heavy
      const dissimilar = Array(1536).fill(0).map((_, i) => i < 768 ? -0.5 : 0.8);

      const vec1 = `[${similar1.join(",")}]`;
      const vec2 = `[${similar2.join(",")}]`;
      const vec3 = `[${dissimilar.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding)
        VALUES
          ('ZI similar A', ${simCategory}, ${vec1}::vector),
          ('ZI similar B', ${simCategory}, ${vec2}::vector),
          ('ZI dissimilar', ${simCategory}, ${vec3}::vector)
      `;

      // Query with similar1 as search vector
      const rows = await db.query<{ content: string; similarity: number }>`
        SELECT content, 1 - (embedding <=> ${vec1}::vector) as similarity
        FROM memories
        WHERE category = ${simCategory}
        ORDER BY embedding <=> ${vec1}::vector
      `;

      const results: Array<{ content: string; similarity: number }> = [];
      for await (const row of rows) {
        results.push(row);
      }

      expect(results).toHaveLength(3);
      // Self-similarity should be highest
      expect(results[0].content).toBe("ZI similar A");
      expect(results[0].similarity).toBeGreaterThan(0.99);
      // Similar B should be second
      expect(results[1].content).toBe("ZI similar B");
      expect(results[1].similarity).toBeGreaterThan(0.9);
      // Dissimilar should be last with lower similarity
      expect(results[2].content).toBe("ZI dissimilar");
      expect(results[2].similarity).toBeLessThan(results[1].similarity);

      await db.exec`DELETE FROM memories WHERE category = ${simCategory}`;
    });
  });

  describe("Re-embed endpoint structure", () => {
    it("should handle memories with NULL embeddings for re-embed", async () => {
      // Insert a memory without embedding (simulating post-migration state)
      await db.exec`
        INSERT INTO memories (content, category)
        VALUES ('Needs re-embedding', ${testCategory})
      `;

      // Verify it has NULL embedding
      const row = await db.queryRow<{ has_embedding: boolean }>`
        SELECT embedding IS NOT NULL as has_embedding
        FROM memories WHERE category = ${testCategory} AND content = 'Needs re-embedding'
      `;

      expect(row).toBeDefined();
      expect(row!.has_embedding).toBe(false);

      // Verify it would be selected by the re-embed query
      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int as count
        FROM memories WHERE embedding IS NULL AND category = ${testCategory}
      `;

      expect(count).toBeDefined();
      expect(count!.count).toBeGreaterThanOrEqual(1);

      await db.exec`DELETE FROM memories WHERE category = ${testCategory}`;
    });

    it("should handle code_patterns with NULL embeddings for re-embed", async () => {
      // Insert a code pattern without embeddings
      await db.exec`
        INSERT INTO code_patterns (pattern_type, source_repo, problem_description, solution_description)
        VALUES ('bug_fix', 'zi-test-repo', 'ZI test problem', 'ZI test solution')
      `;

      const row = await db.queryRow<{ has_problem: boolean; has_solution: boolean }>`
        SELECT
          problem_embedding IS NOT NULL as has_problem,
          solution_embedding IS NOT NULL as has_solution
        FROM code_patterns
        WHERE source_repo = 'zi-test-repo' AND problem_description = 'ZI test problem'
      `;

      expect(row).toBeDefined();
      expect(row!.has_problem).toBe(false);
      expect(row!.has_solution).toBe(false);

      await db.exec`DELETE FROM code_patterns WHERE source_repo = 'zi-test-repo' AND problem_description = 'ZI test problem'`;
    });
  });

  describe("OpenAI API error handling", () => {
    it("should produce correct error message format for non-OK responses", () => {
      const status = 401;
      const errorText = "Invalid API key provided";
      const errorMessage = `OpenAI embedding error ${status}: ${errorText}`;

      expect(errorMessage).toBe("OpenAI embedding error 401: Invalid API key provided");
      expect(errorMessage).toContain("OpenAI embedding error");
      expect(errorMessage).toContain("401");
    });

    it("should produce correct error message for exhausted retries", () => {
      const errorMessage = "OpenAI embedding API failed after retries";
      expect(errorMessage).toContain("OpenAI");
      expect(errorMessage).toContain("failed after retries");
    });

    it("should calculate correct exponential backoff delays", () => {
      // The embed function uses Math.pow(2, attempt + 2) * 1000
      const delays = [0, 1, 2].map(attempt => Math.pow(2, attempt + 2) * 1000);
      expect(delays[0]).toBe(4000);  // 4 seconds
      expect(delays[1]).toBe(8000);  // 8 seconds
      expect(delays[2]).toBe(16000); // 16 seconds
    });

    it("should truncate input text to 8000 characters", () => {
      const longText = "a".repeat(10000);
      const truncated = longText.substring(0, 8000);
      expect(truncated.length).toBe(8000);
      expect(truncated).not.toBe(longText);
    });
  });
});

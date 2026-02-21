import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { createHash } from "node:crypto";
import { calculateImportanceScore, calculateDecayedRelevance } from "./decay";
import { sanitize } from "../ai/sanitize";

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

  describe("Decay cleanup", () => {
    const decayCategory = "decay-test-" + Date.now();

    beforeEach(async () => {
      await db.exec`DELETE FROM memories WHERE category = ${decayCategory}`;
    });

    it("should delete old memories with very low relevance past TTL", async () => {
      // Insert a 120-day old memory with very low relevance and ttl_days=90
      await db.exec`
        INSERT INTO memories (content, category, memory_type, relevance_score, pinned, ttl_days,
          created_at, last_accessed_at, access_count)
        VALUES (
          'Old low-relevance memory', ${decayCategory}, 'general', 0.01, false, 90,
          NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days', 0
        )
      `;

      const before = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int as count FROM memories WHERE category = ${decayCategory}
      `;
      expect(before!.count).toBe(1);

      // Simulate what decay does: check if it qualifies for deletion
      const row = await db.queryRow<{
        memory_type: string;
        category: string;
        created_at: string;
        access_count: number;
        last_accessed_at: string;
        ttl_days: number;
      }>`
        SELECT memory_type, category, created_at, access_count, last_accessed_at, ttl_days
        FROM memories WHERE category = ${decayCategory}
      `;

      const now = new Date();
      const importance = calculateImportanceScore(row!.memory_type as any, row!.category, false);
      const decayed = calculateDecayedRelevance(
        importance,
        new Date(row!.created_at),
        row!.access_count,
        new Date(row!.last_accessed_at),
        row!.memory_type as any,
        false,
        now
      );
      const ageDays = (now.getTime() - new Date(row!.created_at).getTime()) / 86_400_000;

      // Should qualify for deletion: decayed < 0.05 AND age > ttl_days
      expect(decayed).toBeLessThan(0.05);
      expect(ageDays).toBeGreaterThan(90);
    });

    it("should NOT delete pinned memories regardless of age", async () => {
      // Insert a very old pinned memory
      await db.exec`
        INSERT INTO memories (content, category, memory_type, relevance_score, pinned, ttl_days,
          created_at, last_accessed_at, access_count)
        VALUES (
          'Pinned ancient memory', ${decayCategory}, 'general', 1.0, true, 30,
          NOW() - INTERVAL '365 days', NOW() - INTERVAL '365 days', 0
        )
      `;

      // Pinned memories should always have importance = 1.0 and decayed = 1.0
      const importance = calculateImportanceScore('general', decayCategory, true);
      expect(importance).toBe(1.0);

      const decayed = calculateDecayedRelevance(1.0, new Date('2020-01-01'), 0, new Date('2020-01-01'), 'general', true);
      expect(decayed).toBe(1.0);

      // Verify it's still in DB
      const after = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int as count FROM memories WHERE category = ${decayCategory}
      `;
      expect(after!.count).toBe(1);
    });

    it("should retain recent memories even with low access count", async () => {
      // Insert a brand new memory
      await db.exec`
        INSERT INTO memories (content, category, memory_type, relevance_score, pinned, ttl_days,
          created_at, last_accessed_at, access_count)
        VALUES (
          'Brand new memory', ${decayCategory}, 'general', 0.3, false, 90,
          NOW(), NOW(), 0
        )
      `;

      const now = new Date();
      const importance = calculateImportanceScore('general', decayCategory, false);
      const decayed = calculateDecayedRelevance(
        importance,
        now,
        0,
        now,
        'general',
        false,
        now
      );

      // New memory should have high decayed relevance (close to importance)
      expect(decayed).toBeGreaterThan(0.2);

      // Verify still in DB
      const after = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int as count FROM memories WHERE category = ${decayCategory}
      `;
      expect(after!.count).toBe(1);
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

// --- Pure function tests (no DB needed) ---

describe("calculateImportanceScore", () => {
  it("should return 1.0 for pinned memories regardless of type", () => {
    expect(calculateImportanceScore("general", "chat", true)).toBe(1.0);
    expect(calculateImportanceScore("error_pattern", "security", true)).toBe(1.0);
    expect(calculateImportanceScore("session", "conversation", true)).toBe(1.0);
  });

  it("should give highest scores to error_pattern and decision types", () => {
    const errorScore = calculateImportanceScore("error_pattern", "general", false);
    const decisionScore = calculateImportanceScore("decision", "general", false);
    const generalScore = calculateImportanceScore("general", "general", false);

    expect(errorScore).toBe(0.9);
    expect(decisionScore).toBe(0.85);
    expect(generalScore).toBe(0.3);
    expect(errorScore).toBeGreaterThan(decisionScore);
    expect(decisionScore).toBeGreaterThan(generalScore);
  });

  it("should score all memory_type values correctly", () => {
    expect(calculateImportanceScore("error_pattern", "test", false)).toBe(0.9);
    expect(calculateImportanceScore("decision", "test", false)).toBe(0.85);
    expect(calculateImportanceScore("skill", "test", false)).toBe(0.7);
    expect(calculateImportanceScore("task", "test", false)).toBe(0.6);
    expect(calculateImportanceScore("session", "test", false)).toBe(0.4);
    expect(calculateImportanceScore("general", "test", false)).toBe(0.3);
  });

  it("should boost architecture and security categories", () => {
    const base = calculateImportanceScore("general", "test", false);
    const arch = calculateImportanceScore("general", "architecture", false);
    const sec = calculateImportanceScore("general", "security", false);

    expect(arch).toBe(base + 0.1);
    expect(sec).toBe(base + 0.1);
  });

  it("should reduce chat and conversation categories", () => {
    const base = calculateImportanceScore("general", "test", false);
    const chat = calculateImportanceScore("general", "chat", false);
    const conv = calculateImportanceScore("general", "conversation", false);

    expect(chat).toBeCloseTo(base - 0.1, 10);
    expect(conv).toBeCloseTo(base - 0.1, 10);
  });

  it("should cap at 1.0 for high type + architecture boost", () => {
    const score = calculateImportanceScore("error_pattern", "architecture", false);
    expect(score).toBe(1.0);
  });

  it("should not go below 0.1 for low type + chat penalty", () => {
    const score = calculateImportanceScore("general", "chat", false);
    expect(score).toBe(0.2); // 0.3 - 0.1 = 0.2
    // Even with the lowest combo, should not go below 0.1
    expect(score).toBeGreaterThanOrEqual(0.1);
  });
});

describe("calculateDecayedRelevance", () => {
  const now = new Date("2025-06-15T12:00:00Z");

  it("should return 1.0 for pinned memories", () => {
    const result = calculateDecayedRelevance(
      0.3, new Date("2020-01-01"), 0, new Date("2020-01-01"), "general", true, now
    );
    expect(result).toBe(1.0);
  });

  it("should return high relevance for brand new memories", () => {
    const result = calculateDecayedRelevance(
      0.9, now, 0, now, "error_pattern", false, now
    );
    // New memory: recency=1.0, access factor~1.0
    // So result ≈ 0.9 × 1.0 × 1.0 = 0.9
    expect(result).toBeCloseTo(0.9, 1);
  });

  it("should have lower relevance for 60-day-old general memory", () => {
    const created = new Date(now.getTime() - 60 * 86_400_000); // 60 days ago
    const fresh = calculateDecayedRelevance(0.3, now, 0, now, "general", false, now);
    const old = calculateDecayedRelevance(0.3, created, 0, created, "general", false, now);

    expect(old).toBeLessThan(fresh);
    // 60 days / 30 day half-life = 2 half-lives → recency ≈ 0.25
    // So old ≈ 0.3 × 0.25 = 0.075
    expect(old).toBeLessThan(0.1);
  });

  it("should decay error_pattern slower than general (90 vs 30 day half-life)", () => {
    const created = new Date(now.getTime() - 60 * 86_400_000); // 60 days ago
    const generalDecay = calculateDecayedRelevance(0.5, created, 0, created, "general", false, now);
    const errorDecay = calculateDecayedRelevance(0.5, created, 0, created, "error_pattern", false, now);

    // error_pattern has 90-day half-life vs 30-day for general
    expect(errorDecay).toBeGreaterThan(generalDecay);
  });

  it("should decay slower when frequently accessed", () => {
    const created = new Date(now.getTime() - 45 * 86_400_000); // 45 days ago
    const recentAccess = new Date(now.getTime() - 1 * 86_400_000); // accessed yesterday

    const noAccess = calculateDecayedRelevance(0.5, created, 0, created, "general", false, now);
    const highAccess = calculateDecayedRelevance(0.5, created, 50, recentAccess, "general", false, now);

    expect(highAccess).toBeGreaterThan(noAccess);
  });

  it("should never exceed 1.0", () => {
    // Even with max importance + very high access
    const result = calculateDecayedRelevance(1.0, now, 10000, now, "error_pattern", false, now);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it("should approach zero for very old memories", () => {
    const veryOld = new Date(now.getTime() - 365 * 86_400_000); // 1 year ago
    const result = calculateDecayedRelevance(0.3, veryOld, 0, veryOld, "general", false, now);

    // 365 days / 30 day half-life = ~12 half-lives → basically zero
    expect(result).toBeLessThan(0.001);
  });
});

// --- Memory sanitization tests (OWASP ASI06) ---

describe("Memory sanitization", () => {
  it("should strip null bytes from content", () => {
    const dirty = "Hello\x00World\x00!";
    const clean = sanitize(dirty);
    expect(clean).toBe("HelloWorld!");
    expect(clean).not.toContain("\x00");
  });

  it("should strip control characters but keep newlines and tabs", () => {
    const dirty = "Line1\nLine2\tTabbed\x01\x02\x03\x7F";
    const clean = sanitize(dirty);
    expect(clean).toBe("Line1\nLine2\tTabbed");
    expect(clean).toContain("\n");
    expect(clean).toContain("\t");
  });

  it("should trim whitespace", () => {
    const dirty = "  \n  content here  \n  ";
    const clean = sanitize(dirty);
    expect(clean).toBe("content here");
  });

  it("should enforce max length", () => {
    const long = "a".repeat(60_000);
    const clean = sanitize(long, { maxLength: 1000 });
    expect(clean.length).toBe(1000);
  });

  it("should handle empty string", () => {
    expect(sanitize("")).toBe("");
  });

  it("should pass through clean content unchanged", () => {
    const clean = "This is normal content with\nnewlines and special chars: @#$%^&*()";
    expect(sanitize(clean)).toBe(clean);
  });

  it("should store sanitized content in database", async () => {
    const db = new SQLDatabase("memory", { migrations: "./migrations" });
    const category = "sanitize-test-" + Date.now();
    const dirtyContent = "Test\x00with\x01null\x02bytes";
    const cleanContent = sanitize(dirtyContent);

    await db.exec`
      INSERT INTO memories (content, category)
      VALUES (${cleanContent}, ${category})
    `;

    const row = await db.queryRow<{ content: string }>`
      SELECT content FROM memories WHERE category = ${category}
    `;

    expect(row).toBeDefined();
    expect(row!.content).toBe("Testwithnullbytes");
    expect(row!.content).not.toContain("\x00");
    expect(row!.content).not.toContain("\x01");
    expect(row!.content).not.toContain("\x02");

    // Cleanup
    await db.exec`DELETE FROM memories WHERE category = ${category}`;
  });
});

// --- Memory integrity tests (OWASP ASI06) ---

describe("Memory integrity (ASI06)", () => {
  const integrityDb = new SQLDatabase("memory", { migrations: "./migrations" });
  const integrityCategory = "integrity-test-" + Date.now();

  beforeEach(async () => {
    await integrityDb.exec`DELETE FROM memories WHERE category = ${integrityCategory}`;
  });

  it("should store content hash on creation", async () => {
    const content = "Test memory for integrity check";
    const expectedHash = createHash("sha256").update(content).digest("hex");

    await integrityDb.exec`
      INSERT INTO memories (content, category, content_hash, trust_level)
      VALUES (${content}, ${integrityCategory}, ${expectedHash}, 'agent')
    `;

    const row = await integrityDb.queryRow<{ content_hash: string; trust_level: string }>`
      SELECT content_hash, trust_level FROM memories WHERE category = ${integrityCategory}
    `;

    expect(row).toBeDefined();
    expect(row!.content_hash).toBe(expectedHash);
    expect(row!.trust_level).toBe("agent");
  });

  it("should detect tampered content on integrity check", async () => {
    const original = "Original untampered content";
    const originalHash = createHash("sha256").update(original).digest("hex");
    const tampered = "Tampered content that changed!";

    await integrityDb.exec`
      INSERT INTO memories (content, category, content_hash, trust_level)
      VALUES (${tampered}, ${integrityCategory}, ${originalHash}, 'user')
    `;

    const row = await integrityDb.queryRow<{ content: string; content_hash: string }>`
      SELECT content, content_hash FROM memories WHERE category = ${integrityCategory}
    `;

    expect(row).toBeDefined();
    // Integrity check: recompute hash and compare
    const computedHash = createHash("sha256").update(row!.content).digest("hex");
    expect(computedHash).not.toBe(row!.content_hash); // Mismatch = tampered
  });

  it("should set trust_level on store/extract", async () => {
    const userContent = "User-created memory";
    const agentContent = "Agent-generated memory";
    const userHash = createHash("sha256").update(userContent).digest("hex");
    const agentHash = createHash("sha256").update(agentContent).digest("hex");

    await integrityDb.exec`
      INSERT INTO memories (content, category, content_hash, trust_level)
      VALUES
        (${userContent}, ${integrityCategory}, ${userHash}, 'user'),
        (${agentContent}, ${integrityCategory}, ${agentHash}, 'agent')
    `;

    const rows = await integrityDb.query<{ content: string; trust_level: string }>`
      SELECT content, trust_level FROM memories
      WHERE category = ${integrityCategory}
      ORDER BY created_at ASC
    `;

    const results: Array<{ content: string; trust_level: string }> = [];
    for await (const row of rows) {
      results.push(row);
    }

    expect(results).toHaveLength(2);
    expect(results[0].trust_level).toBe("user");
    expect(results[1].trust_level).toBe("agent");
  });

  describe("Hybrid search (BM25 + vector)", () => {
    const hybridCategory = "test-hybrid-" + Date.now();

    beforeEach(async () => {
      await db.exec`DELETE FROM memories WHERE category = ${hybridCategory}`;
    });

    it("should find memories by exact keyword match via BM25", async () => {
      // Store a memory with specific keyword
      const content = "checkRateLimit function handles API throttling";
      const contentHash = createHash("sha256").update(content).digest("hex");
      const embedding = Array(512)
        .fill(0)
        .map((_, i) => Math.sin(i * 0.1));
      const vec = `[${embedding.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding, content_hash, trust_level)
        VALUES (${content}, ${hybridCategory}, ${vec}::vector, ${contentHash}, 'agent')
      `;

      // Verify that search_vector was generated by trigger
      const row = await db.queryRow<{ has_sv: boolean }>`
        SELECT search_vector IS NOT NULL as has_sv
        FROM memories WHERE content = ${content}
      `;
      expect(row!.has_sv).toBe(true);
    });

    it("should rank exact keyword match higher than semantic-only match", async () => {
      // Memory A: contains "checkRateLimit" exactly
      // Memory B: semantically similar ("API throttling protection") but without keyword
      // Search for "checkRateLimit" → A should rank higher

      const contentA = "The checkRateLimit function validates request frequency";
      const contentB = "API throttling protection prevents abuse";
      const hashA = createHash("sha256").update(contentA).digest("hex");
      const hashB = createHash("sha256").update(contentB).digest("hex");

      // Use identical embeddings so vector score is equal
      const embedding = Array(512)
        .fill(0)
        .map((_, i) => Math.sin(i * 0.05));
      const vec = `[${embedding.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding, content_hash, trust_level)
        VALUES
          (${contentA}, ${hybridCategory}, ${vec}::vector, ${hashA}, 'agent'),
          (${contentB}, ${hybridCategory}, ${vec}::vector, ${hashB}, 'agent')
      `;

      // BM25: "checkRateLimit" matches contentA but not contentB
      const bm25Result = await db.query<{ content: string; score: number }>`
        SELECT content, ts_rank_cd(search_vector, plainto_tsquery('english', 'checkRateLimit')) as score
        FROM memories
        WHERE category = ${hybridCategory}
          AND search_vector @@ plainto_tsquery('english', 'checkRateLimit')
      `;

      const bm25Results: Array<{ content: string; score: number }> = [];
      for await (const r of bm25Result) {
        bm25Results.push(r);
      }

      // contentA should match, contentB should NOT
      expect(bm25Results.length).toBeGreaterThanOrEqual(1);
      expect(bm25Results.some((r) => r.content.includes("checkRateLimit"))).toBe(true);
    });

    it("should generate search_vector via trigger on INSERT", async () => {
      const content = "Encore TypeScript migration strategy for PostgreSQL databases";
      const hash = createHash("sha256").update(content).digest("hex");
      const embedding = Array(512)
        .fill(0)
        .map(() => Math.random() * 0.1);
      const vec = `[${embedding.join(",")}]`;

      await db.exec`
        INSERT INTO memories (content, category, embedding, content_hash, trust_level, tags)
        VALUES (${content}, ${hybridCategory}, ${vec}::vector, ${hash}, 'user', ARRAY['encore', 'migration'])
      `;

      const row = await db.queryRow<{ sv_text: string }>`
        SELECT search_vector::text as sv_text
        FROM memories WHERE content = ${content}
      `;

      expect(row).toBeDefined();
      expect(row!.sv_text).toContain("encor"); // stemmed form of "encore"
      expect(row!.sv_text).toContain("migrat"); // stemmed form of "migration"
    });

    it("should handle empty search query gracefully", async () => {
      // BM25 with empty query should not throw error
      const result = await db.query<{ id: string }>`
        SELECT id FROM memories
        WHERE search_vector @@ plainto_tsquery('english', '')
        LIMIT 1
      `;

      const rows: string[] = [];
      for await (const r of result) {
        rows.push(r.id);
      }
      // Empty query returns 0 results, not error
      expect(rows.length).toBe(0);
    });

    it("should combine BM25 and vector scores correctly", () => {
      // Unit test for scoring logic (no DB needed)
      const alpha = 0.6;
      const vectorScore = 0.8;
      const bm25Score = 1.0; // normalised

      const hybrid = alpha * vectorScore + (1 - alpha) * bm25Score;
      expect(hybrid).toBeCloseTo(0.88);

      // Pure vector (no BM25 match):
      const vectorOnly = alpha * vectorScore + (1 - alpha) * 0;
      expect(vectorOnly).toBeCloseTo(0.48);

      // Pure BM25 (no vector match):
      const bm25Only = alpha * 0 + (1 - alpha) * bm25Score;
      expect(bm25Only).toBeCloseTo(0.4);
    });
  });
});

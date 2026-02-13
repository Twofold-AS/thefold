import { describe, it, expect, beforeEach } from "vitest";
import {
  db,
  getOrSetEmbedding,
  getOrSetRepoStructure,
  getOrSetAIPlan,
  getStats,
  cleanupExpired,
  invalidate,
} from "./cache";

describe("cache service", () => {
  beforeEach(async () => {
    await db.exec`DELETE FROM cache_entries`;
  });

  describe("embedding cache", () => {
    it("returns miss on first call", async () => {
      const result = await getOrSetEmbedding({ content: "hello world" });
      expect(result.hit).toBe(false);
      expect(result.embedding).toBeUndefined();
    });

    it("stores and retrieves embedding", async () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

      // Store
      const miss = await getOrSetEmbedding({
        content: "test embedding content",
        embedding,
      });
      expect(miss.hit).toBe(false);

      // Retrieve
      const hit = await getOrSetEmbedding({ content: "test embedding content" });
      expect(hit.hit).toBe(true);
      expect(hit.embedding).toEqual(embedding);
    });

    it("different content produces different keys", async () => {
      await getOrSetEmbedding({ content: "content A", embedding: [1, 2, 3] });
      await getOrSetEmbedding({ content: "content B", embedding: [4, 5, 6] });

      const hitA = await getOrSetEmbedding({ content: "content A" });
      const hitB = await getOrSetEmbedding({ content: "content B" });

      expect(hitA.hit).toBe(true);
      expect(hitA.embedding).toEqual([1, 2, 3]);
      expect(hitB.hit).toBe(true);
      expect(hitB.embedding).toEqual([4, 5, 6]);
    });
  });

  describe("repo structure cache", () => {
    it("returns miss on first call", async () => {
      const result = await getOrSetRepoStructure({
        owner: "test",
        repo: "myrepo",
        branch: "main",
      });
      expect(result.hit).toBe(false);
    });

    it("stores and retrieves repo structure", async () => {
      const structure = {
        tree: ["src/index.ts", "package.json"],
        treeString: "src/index.ts\npackage.json",
      };

      await getOrSetRepoStructure({
        owner: "test",
        repo: "myrepo",
        branch: "main",
        structure,
      });

      const hit = await getOrSetRepoStructure({
        owner: "test",
        repo: "myrepo",
        branch: "main",
      });

      expect(hit.hit).toBe(true);
      expect(hit.structure).toEqual(structure);
    });

    it("different branches are cached separately", async () => {
      await getOrSetRepoStructure({
        owner: "test",
        repo: "myrepo",
        branch: "main",
        structure: { tree: ["main.ts"], treeString: "main.ts" },
      });
      await getOrSetRepoStructure({
        owner: "test",
        repo: "myrepo",
        branch: "develop",
        structure: { tree: ["develop.ts"], treeString: "develop.ts" },
      });

      const main = await getOrSetRepoStructure({
        owner: "test",
        repo: "myrepo",
        branch: "main",
      });
      const develop = await getOrSetRepoStructure({
        owner: "test",
        repo: "myrepo",
        branch: "develop",
      });

      expect(main.structure!.tree).toEqual(["main.ts"]);
      expect(develop.structure!.tree).toEqual(["develop.ts"]);
    });
  });

  describe("AI plan cache", () => {
    it("stores and retrieves plan", async () => {
      const plan = { steps: [{ action: "create", file: "index.ts" }] };

      await getOrSetAIPlan({
        taskDescription: "Add health check endpoint",
        repoHash: "abc123",
        plan,
      });

      const hit = await getOrSetAIPlan({
        taskDescription: "Add health check endpoint",
        repoHash: "abc123",
      });

      expect(hit.hit).toBe(true);
      expect(hit.plan).toEqual(plan);
    });

    it("different tasks are cached separately", async () => {
      await getOrSetAIPlan({
        taskDescription: "Task A",
        repoHash: "hash1",
        plan: { task: "A" },
      });
      await getOrSetAIPlan({
        taskDescription: "Task B",
        repoHash: "hash1",
        plan: { task: "B" },
      });

      const a = await getOrSetAIPlan({ taskDescription: "Task A", repoHash: "hash1" });
      const b = await getOrSetAIPlan({ taskDescription: "Task B", repoHash: "hash1" });

      expect(a.plan).toEqual({ task: "A" });
      expect(b.plan).toEqual({ task: "B" });
    });
  });

  describe("stats", () => {
    it("tracks hits and misses", async () => {
      // Generate some cache activity
      await getOrSetEmbedding({ content: "stats test", embedding: [1] });
      await getOrSetEmbedding({ content: "stats test" }); // hit

      const stats = await getStats();
      expect(stats).toHaveProperty("hitRate");
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(100);
      expect(stats).toHaveProperty("totalEntries");
    });
  });

  describe("cleanup", () => {
    it("removes expired entries", async () => {
      // Insert an already-expired entry directly
      await db.exec`
        INSERT INTO cache_entries (key, namespace, value, expires_at)
        VALUES ('expired:test', 'test', '"old"'::jsonb, NOW() - INTERVAL '1 hour')
      `;

      // Insert a valid entry
      await db.exec`
        INSERT INTO cache_entries (key, namespace, value, expires_at)
        VALUES ('valid:test', 'test', '"new"'::jsonb, NOW() + INTERVAL '1 hour')
      `;

      const result = await cleanupExpired();
      expect(result.deleted).toBe(1);

      // Valid entry should still exist
      const row = await db.queryRow<{ key: string }>`
        SELECT key FROM cache_entries WHERE key = 'valid:test'
      `;
      expect(row).toBeDefined();
    });
  });

  describe("invalidate", () => {
    it("deletes by key", async () => {
      await getOrSetEmbedding({ content: "to delete", embedding: [1] });

      // Verify it's cached
      const before = await getOrSetEmbedding({ content: "to delete" });
      expect(before.hit).toBe(true);

      // Get the actual key to invalidate
      const row = await db.queryRow<{ key: string }>`
        SELECT key FROM cache_entries WHERE namespace = 'embedding' LIMIT 1
      `;
      expect(row).toBeDefined();

      await invalidate({ key: row!.key });

      // Should be gone
      const after = await getOrSetEmbedding({ content: "to delete" });
      expect(after.hit).toBe(false);
    });

    it("deletes by namespace", async () => {
      await getOrSetRepoStructure({
        owner: "a",
        repo: "b",
        branch: "main",
        structure: { tree: ["f.ts"], treeString: "f.ts" },
      });
      await getOrSetRepoStructure({
        owner: "c",
        repo: "d",
        branch: "main",
        structure: { tree: ["g.ts"], treeString: "g.ts" },
      });

      const result = await invalidate({ namespace: "repo" });
      expect(result.deleted).toBe(2);
    });
  });
});

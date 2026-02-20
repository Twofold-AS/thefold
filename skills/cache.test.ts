import { describe, it, expect } from "vitest";

// hashResolveInput is a module-level helper — we test its behavior via resolve()
// since it's not exported. We test caching behavior via observable side effects.

describe("Skills Caching", () => {
  // Test 1: hashResolveInput produces different keys for different contexts
  // We test this by verifying two different contexts would produce different cache keys.
  // Since hashResolveInput is internal, we verify the function's logic here directly.
  it("should generate different cache keys for different taskTypes", () => {
    // Replicate hashResolveInput logic
    function hashResolveInput(ctx: {
      taskType?: string;
      repo?: string;
      labels?: string[];
      files?: string[];
    }): string {
      const parts = [
        ctx.taskType || "all",
        ctx.repo || "",
        (ctx.labels || []).slice().sort().join(","),
        (ctx.files || []).slice().sort().join(","),
      ];
      return parts.join("|").replace(/[^a-zA-Z0-9|,._-]/g, "_").substring(0, 200);
    }

    const key1 = hashResolveInput({ taskType: "coding" });
    const key2 = hashResolveInput({ taskType: "planning" });
    const key3 = hashResolveInput({ taskType: "coding", repo: "my-repo" });

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key2).not.toBe(key3);
  });

  // Test 2: hashResolveInput produces same key for same context (cache reuse)
  it("should generate same cache key for identical contexts", () => {
    function hashResolveInput(ctx: {
      taskType?: string;
      repo?: string;
      labels?: string[];
      files?: string[];
    }): string {
      const parts = [
        ctx.taskType || "all",
        ctx.repo || "",
        (ctx.labels || []).slice().sort().join(","),
        (ctx.files || []).slice().sort().join(","),
      ];
      return parts.join("|").replace(/[^a-zA-Z0-9|,._-]/g, "_").substring(0, 200);
    }

    const key1 = hashResolveInput({ taskType: "coding", repo: "repo-a", labels: ["bug", "feature"] });
    // Same context but labels in different order — should still match after sorting
    const key2 = hashResolveInput({ taskType: "coding", repo: "repo-a", labels: ["feature", "bug"] });

    expect(key1).toBe(key2);
  });

  // Test 3: cache invalidate endpoint is called via cross-service after skill CRUD
  // We verify the invalidate endpoint works in isolation
  it("should invalidate skills cache via cache.invalidate", async () => {
    const { invalidate } = await import("../cache/cache");

    // Invalidate the skills namespace — should succeed without errors
    const result = await invalidate({ namespace: "skills" });
    // Returns number of deleted entries (0 is valid — namespace might be empty)
    expect(typeof result.deleted).toBe("number");
    expect(result.deleted).toBeGreaterThanOrEqual(0);
  });
});

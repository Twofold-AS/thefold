import { describe, it, expect, beforeEach } from "vitest";
import { register, get, list, search, use, useComponent, healingStatus } from "./registry";
import { db } from "./db";

// Clean up between tests
beforeEach(async () => {
  await db.exec`DELETE FROM healing_events`;
  await db.exec`DELETE FROM components`;
});

// --- Helper ---

function sampleComponent(overrides?: Record<string, unknown>) {
  return {
    name: "auth-middleware",
    description: "JWT authentication middleware for Express/Encore",
    category: "auth" as const,
    files: [
      { path: "auth/middleware.ts", content: "export function authMiddleware() {}", language: "typescript" },
    ],
    sourceRepo: "thefold",
    tags: ["auth", "middleware", "jwt"],
    ...overrides,
  };
}

// --- Tests ---

describe("Registry Service", () => {
  describe("Register component", () => {
    it("should register a component and return all fields", async () => {
      const result = await register(sampleComponent());
      const comp = result.component;

      expect(comp.id).toBeDefined();
      expect(comp.name).toBe("auth-middleware");
      expect(comp.description).toBe("JWT authentication middleware for Express/Encore");
      expect(comp.category).toBe("auth");
      expect(comp.version).toBe("1.0.0");
      expect(comp.files).toHaveLength(1);
      expect(comp.files[0].path).toBe("auth/middleware.ts");
      expect(comp.sourceRepo).toBe("thefold");
      expect(comp.extractedBy).toBe("thefold");
      expect(comp.usedByRepos).toEqual([]);
      expect(comp.timesUsed).toBe(0);
      expect(comp.validationStatus).toBe("pending");
      expect(comp.tags).toContain("auth");
    });

    it("should reject registration without name", async () => {
      await expect(register(sampleComponent({ name: "" }))).rejects.toThrow();
    });

    it("should reject registration without files", async () => {
      await expect(register(sampleComponent({ files: [] }))).rejects.toThrow();
    });
  });

  describe("Get component", () => {
    it("should get component by ID", async () => {
      const { component: created } = await register(sampleComponent());
      const { component: fetched } = await get({ id: created.id });

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe("auth-middleware");
    });

    it("should throw not found for unknown ID", async () => {
      await expect(get({ id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow();
    });
  });

  describe("List/search components", () => {
    it("should list all components", async () => {
      await register(sampleComponent());
      await register(sampleComponent({ name: "api-client", category: "api" }));

      const result = await list({});
      expect(result.total).toBe(2);
      expect(result.components).toHaveLength(2);
    });

    it("should filter by category", async () => {
      await register(sampleComponent({ category: "auth" }));
      await register(sampleComponent({ name: "api-client", category: "api" }));

      const result = await list({ category: "auth" });
      expect(result.total).toBe(1);
      expect(result.components[0].category).toBe("auth");
    });

    it("should filter by source repo", async () => {
      await register(sampleComponent({ sourceRepo: "repo-a" }));
      await register(sampleComponent({ name: "other", sourceRepo: "repo-b" }));

      const result = await list({ sourceRepo: "repo-a" });
      expect(result.total).toBe(1);
      expect(result.components[0].sourceRepo).toBe("repo-a");
    });

    it("should search by name", async () => {
      await register(sampleComponent({ name: "auth-middleware" }));
      await register(sampleComponent({ name: "logger-util" }));

      const result = await search({ query: "auth" });
      expect(result.components).toHaveLength(1);
      expect(result.components[0].name).toBe("auth-middleware");
    });

    it("should search by description", async () => {
      await register(sampleComponent({ description: "Handles JWT tokens" }));
      await register(sampleComponent({ name: "db-pool", description: "Database connection pool" }));

      const result = await search({ query: "JWT" });
      expect(result.components).toHaveLength(1);
      expect(result.components[0].description).toContain("JWT");
    });

    it("should return empty for empty query", async () => {
      const result = await search({ query: "" });
      expect(result.components).toHaveLength(0);
    });
  });

  describe("Use tracking", () => {
    it("should add repo to used_by_repos and increment times_used", async () => {
      const { component: created } = await register(sampleComponent());

      await use({ componentId: created.id, repo: "project-a" });
      const { component: after } = await get({ id: created.id });

      expect(after.usedByRepos).toContain("project-a");
      expect(after.timesUsed).toBe(1);
    });

    it("should not duplicate repos in used_by_repos but still increment times_used", async () => {
      const { component: created } = await register(sampleComponent());

      await use({ componentId: created.id, repo: "project-a" });
      await use({ componentId: created.id, repo: "project-a" });
      const { component: after } = await get({ id: created.id });

      expect(after.usedByRepos.filter((r) => r === "project-a")).toHaveLength(1);
      expect(after.timesUsed).toBe(2);
    });

    it("should add multiple different repos", async () => {
      const { component: created } = await register(sampleComponent());

      await use({ componentId: created.id, repo: "project-a" });
      await use({ componentId: created.id, repo: "project-b" });
      const { component: after } = await get({ id: created.id });

      expect(after.usedByRepos).toContain("project-a");
      expect(after.usedByRepos).toContain("project-b");
      expect(after.timesUsed).toBe(2);
    });
  });

  describe("Healing events", () => {
    it("should create healing event with no affected repos", async () => {
      const { component: created } = await register(sampleComponent());

      // Directly insert a healing event (since triggerHealing requires tasks service)
      await db.exec`
        INSERT INTO healing_events (component_id, old_version, new_version, trigger, severity, status)
        VALUES (${created.id}::uuid, '1.0.0', '1.1.0', 'bugfix', 'normal', 'completed')
      `;

      const result = await healingStatus({});
      expect(result.total).toBe(1);
      expect(result.events[0].trigger).toBe("bugfix");
      expect(result.events[0].severity).toBe("normal");
      expect(result.events[0].status).toBe("completed");
    });

    it("should filter healing events by status", async () => {
      const { component: created } = await register(sampleComponent());

      await db.exec`
        INSERT INTO healing_events (component_id, trigger, status)
        VALUES (${created.id}::uuid, 'update', 'pending')
      `;
      await db.exec`
        INSERT INTO healing_events (component_id, trigger, status)
        VALUES (${created.id}::uuid, 'bugfix', 'completed')
      `;

      const pending = await healingStatus({ status: "pending" });
      expect(pending.total).toBe(1);
      expect(pending.events[0].status).toBe("pending");

      const completed = await healingStatus({ status: "completed" });
      expect(completed.total).toBe(1);
      expect(completed.events[0].status).toBe("completed");
    });

    it("should filter healing events by component", async () => {
      const { component: c1 } = await register(sampleComponent({ name: "comp-a" }));
      const { component: c2 } = await register(sampleComponent({ name: "comp-b" }));

      await db.exec`
        INSERT INTO healing_events (component_id, trigger, status)
        VALUES (${c1.id}::uuid, 'update', 'pending')
      `;
      await db.exec`
        INSERT INTO healing_events (component_id, trigger, status)
        VALUES (${c2.id}::uuid, 'security', 'in_progress')
      `;

      const result = await healingStatus({ componentId: c1.id });
      expect(result.total).toBe(1);
      expect(result.events[0].componentId).toBe(c1.id);
    });
  });

  describe("useComponent (exposed endpoint)", () => {
    it("should track usage and increment times_used", async () => {
      const { component: created } = await register(sampleComponent());

      await useComponent({ componentId: created.id, repo: "frontend-app" });
      const { component: after } = await get({ id: created.id });

      expect(after.usedByRepos).toContain("frontend-app");
      expect(after.timesUsed).toBe(1);
    });

    it("should reject without componentId", async () => {
      await expect(useComponent({ componentId: "", repo: "test" })).rejects.toThrow();
    });

    it("should reject without repo", async () => {
      const { component: created } = await register(sampleComponent());
      await expect(useComponent({ componentId: created.id, repo: "" })).rejects.toThrow();
    });

    it("should throw not_found for unknown component", async () => {
      await expect(
        useComponent({ componentId: "00000000-0000-0000-0000-000000000000", repo: "test" })
      ).rejects.toThrow();
    });
  });

  describe("Duplicate detection", () => {
    it("should allow same name with different versions", async () => {
      const { component: v1 } = await register(sampleComponent({ version: "1.0.0" }));
      const { component: v2 } = await register(
        sampleComponent({ version: "2.0.0", previousVersionId: v1.id })
      );

      expect(v1.id).not.toBe(v2.id);
      expect(v2.previousVersionId).toBe(v1.id);
      expect(v2.version).toBe("2.0.0");

      const result = await list({});
      expect(result.total).toBe(2);
    });
  });
});

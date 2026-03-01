import { describe, it, expect, beforeEach } from "vitest";
import { register, list, useComponentWithVars, substituteVariables } from "./registry";
import { db } from "./db";

// Clean up between tests — only delete non-seeded components
beforeEach(async () => {
  await db.exec`DELETE FROM healing_events`;
  await db.exec`DELETE FROM components WHERE source != 'seeded'`;
});

// --- Helper ---

function sampleComponent(overrides?: Record<string, unknown>) {
  return {
    name: "test-pattern",
    description: "A test pattern for variable substitution",
    category: "api" as const,
    files: [
      {
        path: "{{SERVICE_NAME}}/handler.ts",
        content: 'import { api } from "encore.dev/api";\n\nexport const {{endpointName}} = api({ method: "POST", path: "/{{service}}/{{endpoint}}" }, async () => {});',
        language: "typescript",
      },
    ],
    sourceRepo: "test-repo",
    tags: ["test", "pattern"],
    ...overrides,
  };
}

// --- Tests ---

describe("Z-Project: Component Library (ZL)", () => {
  describe("substituteVariables", () => {
    it("replaces {{VAR}} placeholders correctly", () => {
      const input = "Hello {{NAME}}, welcome to {{PLACE}}!";
      const result = substituteVariables(input, { NAME: "Alice" });
      expect(result).toBe("Hello Alice, welcome to {{PLACE}}!");
    });

    it("handles multiple variables in a single string", () => {
      const input = "{{SERVICE_NAME}}/{{ENDPOINT_NAME}}.ts";
      const result = substituteVariables(input, {
        SERVICE_NAME: "users",
        ENDPOINT_NAME: "create",
      });
      expect(result).toBe("users/create.ts");
    });

    it("replaces all occurrences of the same variable", () => {
      const input = "{{NAME}} says hello to {{NAME}}";
      const result = substituteVariables(input, { NAME: "Bob" });
      expect(result).toBe("Bob says hello to Bob");
    });

    it("returns original string when no matching variables", () => {
      const input = "No variables here";
      const result = substituteVariables(input, { UNUSED: "value" });
      expect(result).toBe("No variables here");
    });

    it("handles empty variables object", () => {
      const input = "{{KEEP}} this {{AS_IS}}";
      const result = substituteVariables(input, {});
      expect(result).toBe("{{KEEP}} this {{AS_IS}}");
    });
  });

  describe("Seeded patterns (migration)", () => {
    it("seeded patterns exist after migration with type=pattern", async () => {
      const result = await list({ type: "pattern", sourceRepo: "thefold" });
      // The migration seeds 5 patterns
      expect(result.total).toBeGreaterThanOrEqual(5);
      const names = result.components.map((c) => c.name);
      expect(names).toContain("Encore API Endpoint");
      expect(names).toContain("SQLDatabase + Migration");
      expect(names).toContain("Pub/Sub Topic + Subscription");
      expect(names).toContain("Feature Flag Pattern");
      expect(names).toContain("Rate Limiter Pattern");

      // Verify they all have type=pattern and source=seeded
      for (const comp of result.components) {
        if (comp.source === "seeded") {
          expect(comp.type).toBe("pattern");
          expect(comp.qualityScore).toBeGreaterThanOrEqual(80);
        }
      }
    });

    it("seeded patterns have files with {{VAR}} placeholders", async () => {
      const result = await list({ type: "pattern" });
      const apiPattern = result.components.find((c) => c.name === "Encore API Endpoint");
      expect(apiPattern).toBeDefined();
      expect(apiPattern!.files.length).toBeGreaterThan(0);
      // The API endpoint pattern has {{SERVICE_NAME}} and {{Name}} placeholders
      const fileContent = apiPattern!.files[0].content;
      expect(fileContent).toContain("{{Name}}");
    });
  });

  describe("useComponentWithVars", () => {
    it("returns files with substituted variables", async () => {
      const { component: created } = await register(sampleComponent());

      const result = await useComponentWithVars({
        componentId: created.id,
        variables: {
          SERVICE_NAME: "orders",
          endpointName: "createOrder",
          service: "orders",
          endpoint: "create",
        },
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("orders/handler.ts");
      expect(result.files[0].content).toContain("createOrder");
      expect(result.files[0].content).toContain("/orders/create");
      // No unresolved variables that were passed in
      expect(result.files[0].path).not.toContain("{{SERVICE_NAME}}");
      expect(result.files[0].content).not.toContain("{{endpointName}}");
    });

    it("returns files without substitution when no variables provided", async () => {
      const { component: created } = await register(sampleComponent());

      const result = await useComponentWithVars({
        componentId: created.id,
      });

      expect(result.files).toHaveLength(1);
      // Should keep original placeholders
      expect(result.files[0].path).toBe("{{SERVICE_NAME}}/handler.ts");
      expect(result.files[0].content).toContain("{{endpointName}}");
    });

    it("tracks usage when targetRepo is provided", async () => {
      const { component: created } = await register(sampleComponent());

      await useComponentWithVars({
        componentId: created.id,
        targetRepo: "my-project",
        variables: { SERVICE_NAME: "api" },
      });

      // Verify the component was updated
      const row = await db.queryRow`
        SELECT used_by_repos, times_used FROM components WHERE id = ${created.id}::uuid
      `;
      expect(row).toBeDefined();
      // times_used should have been incremented
      expect((row as Record<string, unknown>).times_used as number).toBeGreaterThanOrEqual(1);
    });

    it("throws not found for unknown component", async () => {
      await expect(
        useComponentWithVars({
          componentId: "00000000-0000-0000-0000-000000000000",
          variables: {},
        })
      ).rejects.toThrow();
    });

    it("throws invalid argument for empty componentId", async () => {
      await expect(
        useComponentWithVars({
          componentId: "",
          variables: {},
        })
      ).rejects.toThrow();
    });
  });

  describe("listComponents with type filter", () => {
    it("filters by type=component (default)", async () => {
      // Register a plain component (default type)
      await register(sampleComponent({ name: "my-component" }));

      // List with type filter — seeded patterns have type=pattern, our component has type=component
      const result = await list({ type: "component" });
      const names = result.components.map((c) => c.name);
      expect(names).toContain("my-component");
      // Should not include seeded patterns
      expect(names).not.toContain("Encore API Endpoint");
    });

    it("filters by type=pattern to get seeded patterns", async () => {
      const result = await list({ type: "pattern" });
      expect(result.total).toBeGreaterThanOrEqual(5);
      for (const comp of result.components) {
        expect(comp.type).toBe("pattern");
      }
    });

    it("filters by search text", async () => {
      await register(sampleComponent({ name: "unique-searchable-widget" }));
      await register(sampleComponent({ name: "another-thing" }));

      const result = await list({ search: "searchable" });
      expect(result.total).toBe(1);
      expect(result.components[0].name).toBe("unique-searchable-widget");
    });

    it("combines type and category filters", async () => {
      const result = await list({ type: "pattern", category: "security" });
      // Only the Rate Limiter Pattern has category=security
      expect(result.total).toBeGreaterThanOrEqual(1);
      for (const comp of result.components) {
        expect(comp.type).toBe("pattern");
        expect(comp.category).toBe("security");
      }
    });
  });
});

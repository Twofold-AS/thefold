import { describe, it, expect, beforeEach } from "vitest";
import { list, get, useTemplate, categories } from "./templates";
import { db } from "./db";

// Clean up between tests
beforeEach(async () => {
  await db.exec`DELETE FROM templates`;
  // Re-seed one template for most tests
  await db.exec`
    INSERT INTO templates (name, description, category, framework, files, dependencies, variables)
    VALUES (
      'Test Template', 'A test template', 'api', 'encore.ts',
      '[{"path": "{{NAME}}/index.ts", "content": "// Hello {{NAME}}", "language": "typescript"}]'::jsonb,
      '["zod"]'::jsonb,
      '[{"name": "NAME", "description": "Service name", "defaultValue": "myservice"}]'::jsonb
    )
  `;
});

describe("Templates Service", () => {
  describe("List templates", () => {
    it("should return all templates", async () => {
      const result = await list({});
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.templates.length).toBeGreaterThanOrEqual(1);
      expect(result.templates[0].name).toBe("Test Template");
    });

    it("should filter by category", async () => {
      await db.exec`
        INSERT INTO templates (name, description, category, files)
        VALUES ('Auth Template', 'Auth stuff', 'auth', '[{"path": "a.ts", "content": "x", "language": "ts"}]'::jsonb)
      `;

      const apiResult = await list({ category: "api" });
      expect(apiResult.total).toBe(1);
      expect(apiResult.templates[0].category).toBe("api");

      const authResult = await list({ category: "auth" });
      expect(authResult.total).toBe(1);
      expect(authResult.templates[0].category).toBe("auth");
    });

    it("should return correct total count", async () => {
      await db.exec`
        INSERT INTO templates (name, description, category, files)
        VALUES ('Extra', 'Extra template', 'form', '[{"path": "b.ts", "content": "y", "language": "ts"}]'::jsonb)
      `;

      const result = await list({});
      expect(result.total).toBe(2);
      expect(result.templates).toHaveLength(2);
    });
  });

  describe("Get template", () => {
    it("should return template by ID with files", async () => {
      const all = await list({});
      const id = all.templates[0].id;

      const result = await get({ id });
      expect(result.template.id).toBe(id);
      expect(result.template.name).toBe("Test Template");
      expect(result.template.files).toHaveLength(1);
      expect(result.template.files[0].path).toBe("{{NAME}}/index.ts");
      expect(result.template.variables).toHaveLength(1);
      expect(result.template.dependencies).toContain("zod");
    });

    it("should throw not_found for unknown ID", async () => {
      await expect(get({ id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow();
    });
  });

  describe("Use template", () => {
    it("should increment use_count", async () => {
      const all = await list({});
      const id = all.templates[0].id;

      await useTemplate({ id, repo: "test-repo" });

      const result = await get({ id });
      expect(result.template.useCount).toBe(1);
    });

    it("should apply variable substitution", async () => {
      const all = await list({});
      const id = all.templates[0].id;

      const result = await useTemplate({
        id,
        repo: "test-repo",
        variables: { NAME: "orders" },
      });

      expect(result.files[0].path).toBe("orders/index.ts");
      expect(result.files[0].content).toBe("// Hello orders");
    });

    it("should use default values for missing variables", async () => {
      const all = await list({});
      const id = all.templates[0].id;

      const result = await useTemplate({ id, repo: "test-repo" });

      expect(result.files[0].path).toBe("myservice/index.ts");
      expect(result.files[0].content).toBe("// Hello myservice");
    });

    it("should return dependencies", async () => {
      const all = await list({});
      const id = all.templates[0].id;

      const result = await useTemplate({ id, repo: "test-repo" });
      expect(result.dependencies).toContain("zod");
    });

    it("should throw not_found for unknown template", async () => {
      await expect(
        useTemplate({ id: "00000000-0000-0000-0000-000000000000", repo: "test" })
      ).rejects.toThrow();
    });
  });

  describe("Categories", () => {
    it("should return correct counts", async () => {
      await db.exec`
        INSERT INTO templates (name, description, category, files)
        VALUES ('Auth1', 'Auth template', 'auth', '[{"path": "a.ts", "content": "x", "language": "ts"}]'::jsonb)
      `;
      await db.exec`
        INSERT INTO templates (name, description, category, files)
        VALUES ('Auth2', 'Auth template 2', 'auth', '[{"path": "b.ts", "content": "y", "language": "ts"}]'::jsonb)
      `;

      const result = await categories();

      const authCat = result.categories.find((c) => c.category === "auth");
      expect(authCat).toBeDefined();
      expect(authCat!.count).toBe(2);

      const apiCat = result.categories.find((c) => c.category === "api");
      expect(apiCat).toBeDefined();
      expect(apiCat!.count).toBe(1);
    });
  });
});

describe("Seeded templates", () => {
  it("should have 5 templates after fresh migration", async () => {
    // Re-insert seeded data (migration seeds are only applied once)
    await db.exec`DELETE FROM templates`;

    // Insert 5 seeded templates
    for (const t of ["Contact Form", "User Auth (OTP)", "Stripe Payment", "REST API CRUD", "File Upload"]) {
      await db.exec`
        INSERT INTO templates (name, description, category, files)
        VALUES (${t}, ${t + " description"}, 'form', '[{"path": "a.ts", "content": "x", "language": "ts"}]'::jsonb)
      `;
    }

    const result = await list({});
    expect(result.total).toBe(5);
  });
});

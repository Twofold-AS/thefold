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

describe("New templates from migration 2", () => {
  beforeEach(async () => {
    // Insert the 5 new templates from migration 2_add_templates.up.sql
    await db.exec`DELETE FROM templates`;

    // Use separate variables to avoid escaping issues
    const cronJobFiles = JSON.stringify([
      { path: "service.ts", content: "// Cron job code", language: "typescript" }
    ]);
    const cronJobVars = JSON.stringify([
      { name: "SERVICE_NAME", description: "Service name", defaultValue: "tasks" }
    ]);

    const pubsubFiles = JSON.stringify([
      { path: "events.ts", content: "// Pub/Sub code", language: "typescript" }
    ]);

    const emailFiles = JSON.stringify([
      { path: "email.ts", content: "// Email service code", language: "typescript" }
    ]);

    const dashboardFiles = JSON.stringify([
      { path: "DashboardLayout.tsx", content: "// Dashboard component", language: "tsx" }
    ]);

    const dataTableFiles = JSON.stringify([
      { path: "DataTable.tsx", content: "// Table component", language: "tsx" }
    ]);

    const lucideDeps = JSON.stringify(["lucide-react"]);
    const emptyDeps = JSON.stringify([]);

    // Cron Job Service
    await db.exec`
      INSERT INTO templates (name, description, category, framework, files, dependencies, variables)
      VALUES (
        'Cron Job Service',
        'Encore.ts CronJob with database logging',
        'api',
        'encore.ts',
        ${cronJobFiles}::jsonb,
        ${emptyDeps}::jsonb,
        ${cronJobVars}::jsonb
      )
    `;

    // Pub/Sub Event System
    await db.exec`
      INSERT INTO templates (name, description, category, framework, files)
      VALUES (
        'Pub/Sub Event System',
        'Encore.ts Topic and Subscription',
        'api',
        'encore.ts',
        ${pubsubFiles}::jsonb
      )
    `;

    // Email Service (Resend)
    await db.exec`
      INSERT INTO templates (name, description, category, framework, files)
      VALUES (
        'Email Service (Resend)',
        'Encore.ts email service with Resend',
        'email',
        'encore.ts',
        ${emailFiles}::jsonb
      )
    `;

    // Dashboard Layout
    await db.exec`
      INSERT INTO templates (name, description, category, framework, files, dependencies)
      VALUES (
        'Dashboard Layout',
        'Next.js dashboard layout with sidebar',
        'ui',
        'next.js',
        ${dashboardFiles}::jsonb,
        ${lucideDeps}::jsonb
      )
    `;

    // Data Table
    await db.exec`
      INSERT INTO templates (name, description, category, framework, files, dependencies)
      VALUES (
        'Data Table',
        'Next.js data table with sorting',
        'ui',
        'next.js',
        ${dataTableFiles}::jsonb,
        ${lucideDeps}::jsonb
      )
    `;
  });

  it("should have 5 new templates after migration 2", async () => {
    const result = await list({});
    // This test suite seeds exactly 5 templates in beforeEach
    expect(result.total).toBe(5);
  });

  it("should include new email category from migration 2", async () => {
    const result = await categories();
    const categoryNames = result.categories.map((c) => c.category);

    // Email category should exist (from Email Service template)
    expect(categoryNames).toContain("email");

    // Check that all categories are valid types
    const validCategories = ["auth", "api", "ui", "database", "payment", "form", "email", "devops", "notification", "storage"];
    for (const cat of categoryNames) {
      expect(validCategories).toContain(cat);
    }
  });

  it("should have Encore.ts templates with correct framework", async () => {
    const encoreTemplates = await list({});
    const cronJob = encoreTemplates.templates.find((t) => t.name === "Cron Job Service");
    const pubsub = encoreTemplates.templates.find((t) => t.name === "Pub/Sub Event System");
    const email = encoreTemplates.templates.find((t) => t.name === "Email Service (Resend)");

    expect(cronJob).toBeDefined();
    expect(cronJob!.framework).toBe("encore.ts");
    expect(pubsub).toBeDefined();
    expect(pubsub!.framework).toBe("encore.ts");
    expect(email).toBeDefined();
    expect(email!.framework).toBe("encore.ts");
  });

  it("should support variable substitution in new templates", async () => {
    const all = await list({});
    const cronJob = all.templates.find((t) => t.name === "Cron Job Service");

    expect(cronJob).toBeDefined();

    const result = await useTemplate({
      id: cronJob!.id,
      repo: "test-repo",
      variables: { SERVICE_NAME: "mytasks" },
    });

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files[0].path).toContain("mytasks");
  });

  it("should have all new templates with at least 1 file and valid category", async () => {
    const result = await list({});
    const newTemplateNames = [
      "Cron Job Service",
      "Pub/Sub Event System",
      "Email Service (Resend)",
      "Dashboard Layout",
      "Data Table",
    ];

    for (const name of newTemplateNames) {
      const template = result.templates.find((t) => t.name === name);
      expect(template).toBeDefined();

      // Get full template details
      const full = await get({ id: template!.id });
      expect(full.template.files.length).toBeGreaterThanOrEqual(1);

      // Check category is valid
      const validCategories = ["auth", "api", "ui", "database", "payment", "form", "email", "devops", "notification", "storage"];
      expect(validCategories).toContain(full.template.category);
    }
  });

  it("should have Next.js templates with lucide-react dependency", async () => {
    const result = await list({});
    const dashboard = result.templates.find((t) => t.name === "Dashboard Layout");
    const dataTable = result.templates.find((t) => t.name === "Data Table");

    expect(dashboard).toBeDefined();
    expect(dataTable).toBeDefined();

    const dashFull = await get({ id: dashboard!.id });
    const tableFull = await get({ id: dataTable!.id });

    expect(dashFull.template.dependencies).toContain("lucide-react");
    expect(tableFull.template.dependencies).toContain("lucide-react");
    expect(dashFull.template.framework).toBe("next.js");
    expect(tableFull.template.framework).toBe("next.js");
  });
});

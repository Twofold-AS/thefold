import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import {
  analyzeDependencies, extractImports, resolveImport,
  topologicalSort, getRelevantContext,
} from "./graph";
import type { BuildPlanStep, BuildStrategy, DependencyGraph } from "./types";

// Inline selectStrategy to avoid importing phases.ts (has ~encore/clients dependency)
function selectStrategy(steps: BuildPlanStep[], graph: Record<string, string[]>): BuildStrategy {
  const fileSteps = steps.filter(s => s.action === "create_file" || s.action === "modify_file");
  const hasInit = steps.some(s => s.action === "run_command" && s.command?.includes("init"));
  const hasPackageJson = fileSteps.some(s => s.filePath === "package.json");
  if (hasInit || (hasPackageJson && fileSteps.length > 5)) return "scaffold_first";
  const hasDeps = Object.values(graph).some(deps => deps.length > 0);
  if (hasDeps && fileSteps.length > 3) return "dependency_order";
  return "sequential";
}

// Direct DB reference for testing
const db = new SQLDatabase("builder", { migrations: "./migrations" });

// --- GRAPH TESTS ---

describe("Dependency Graph", () => {
  describe("extractImports", () => {
    it("should extract ES6 imports", () => {
      const content = `
import { foo } from "./utils";
import bar from "../lib/bar";
import * as baz from "./baz";
      `;
      const imports = extractImports(content);
      expect(imports).toContain("./utils");
      expect(imports).toContain("../lib/bar");
      expect(imports).toContain("./baz");
    });

    it("should extract require calls", () => {
      const content = `
const x = require("./helper");
const y = require("../config");
      `;
      const imports = extractImports(content);
      expect(imports).toContain("./helper");
      expect(imports).toContain("../config");
    });

    it("should extract export from", () => {
      const content = `export { default } from "./types";`;
      const imports = extractImports(content);
      expect(imports).toContain("./types");
    });

    it("should ignore non-relative imports", () => {
      const content = `
import { api } from "encore.dev/api";
import React from "react";
import { foo } from "~encore/clients";
import { bar } from "./local";
      `;
      const imports = extractImports(content);
      expect(imports).toHaveLength(1);
      expect(imports).toContain("./local");
    });

    it("should handle dynamic imports", () => {
      const content = `const mod = await import("./dynamic");`;
      const imports = extractImports(content);
      expect(imports).toContain("./dynamic");
    });
  });

  describe("resolveImport", () => {
    const knownFiles = new Set([
      "src/utils.ts",
      "src/lib/bar.ts",
      "src/types.ts",
      "src/components/index.ts",
    ]);

    it("should resolve .ts extension", () => {
      expect(resolveImport("src/app.ts", "./utils", knownFiles)).toBe("src/utils.ts");
    });

    it("should resolve parent directory", () => {
      expect(resolveImport("src/lib/helper.ts", "../types", knownFiles)).toBe("src/types.ts");
    });

    it("should resolve index.ts in directory", () => {
      expect(resolveImport("src/app.ts", "./components", knownFiles)).toBe("src/components/index.ts");
    });

    it("should return null for unknown imports", () => {
      expect(resolveImport("src/app.ts", "./unknown", knownFiles)).toBeNull();
    });

    it("should not self-reference", () => {
      // resolveImport won't itself prevent self-refs, but analyzeDependencies does
      const result = resolveImport("src/utils.ts", "./utils", knownFiles);
      expect(result).toBe("src/utils.ts"); // resolver just resolves
    });
  });

  describe("analyzeDependencies", () => {
    it("should build graph from plan steps with imports", () => {
      const steps: BuildPlanStep[] = [
        { action: "create_file", filePath: "src/types.ts", content: `export interface Foo { name: string; }` },
        { action: "create_file", filePath: "src/utils.ts", content: `import { Foo } from "./types";\nexport function parse(f: Foo) {}` },
        { action: "create_file", filePath: "src/app.ts", content: `import { parse } from "./utils";\nimport { Foo } from "./types";\nparse({} as Foo);` },
      ];

      const graph = analyzeDependencies(steps);
      expect(graph["src/types.ts"]).toEqual([]);
      expect(graph["src/utils.ts"]).toContain("src/types.ts");
      expect(graph["src/app.ts"]).toContain("src/utils.ts");
      expect(graph["src/app.ts"]).toContain("src/types.ts");
    });

    it("should detect dependencies from descriptions", () => {
      const steps: BuildPlanStep[] = [
        { action: "create_file", filePath: "src/database.ts", content: "" },
        { action: "create_file", filePath: "src/service.ts", content: "", description: "Service that uses database" },
      ];

      const graph = analyzeDependencies(steps);
      expect(graph["src/service.ts"]).toContain("src/database.ts");
    });

    it("should ignore delete and run_command steps", () => {
      const steps: BuildPlanStep[] = [
        { action: "create_file", filePath: "src/app.ts", content: "" },
        { action: "delete_file", filePath: "src/old.ts" },
        { action: "run_command", command: "npm install" },
      ];

      const graph = analyzeDependencies(steps);
      expect(Object.keys(graph)).toEqual(["src/app.ts"]);
    });

    it("should handle 5+ files with complex dependencies", () => {
      const steps: BuildPlanStep[] = [
        { action: "create_file", filePath: "src/types.ts", content: `export interface Config {}` },
        { action: "create_file", filePath: "src/config.ts", content: `import { Config } from "./types";\nexport const cfg: Config = {};` },
        { action: "create_file", filePath: "src/db.ts", content: `import { Config } from "./types";\nexport class DB {}` },
        { action: "create_file", filePath: "src/service.ts", content: `import { DB } from "./db";\nimport { Config } from "./types";\nexport class Service {}` },
        { action: "create_file", filePath: "src/api.ts", content: `import { Service } from "./service";\nimport { Config } from "./types";\nexport function handler() {}` },
        { action: "create_file", filePath: "src/index.ts", content: `import { handler } from "./api";\nimport { cfg } from "./config";\nexport { handler, cfg };` },
      ];

      const graph = analyzeDependencies(steps);

      // types.ts has no deps
      expect(graph["src/types.ts"]).toEqual([]);
      // config depends on types
      expect(graph["src/config.ts"]).toContain("src/types.ts");
      // db depends on types
      expect(graph["src/db.ts"]).toContain("src/types.ts");
      // service depends on db and types
      expect(graph["src/service.ts"]).toContain("src/db.ts");
      expect(graph["src/service.ts"]).toContain("src/types.ts");
      // api depends on service and types
      expect(graph["src/api.ts"]).toContain("src/service.ts");
      expect(graph["src/api.ts"]).toContain("src/types.ts");
      // index depends on api and config
      expect(graph["src/index.ts"]).toContain("src/api.ts");
      expect(graph["src/index.ts"]).toContain("src/config.ts");
    });
  });

  describe("topologicalSort", () => {
    it("should sort linear dependencies", () => {
      const graph: DependencyGraph = {
        "a.ts": [],
        "b.ts": ["a.ts"],
        "c.ts": ["b.ts"],
      };

      const sorted = topologicalSort(graph);
      expect(sorted.indexOf("a.ts")).toBeLessThan(sorted.indexOf("b.ts"));
      expect(sorted.indexOf("b.ts")).toBeLessThan(sorted.indexOf("c.ts"));
    });

    it("should sort diamond dependencies", () => {
      const graph: DependencyGraph = {
        "types.ts": [],
        "utils.ts": ["types.ts"],
        "db.ts": ["types.ts"],
        "app.ts": ["utils.ts", "db.ts"],
      };

      const sorted = topologicalSort(graph);
      expect(sorted.indexOf("types.ts")).toBeLessThan(sorted.indexOf("utils.ts"));
      expect(sorted.indexOf("types.ts")).toBeLessThan(sorted.indexOf("db.ts"));
      expect(sorted.indexOf("utils.ts")).toBeLessThan(sorted.indexOf("app.ts"));
      expect(sorted.indexOf("db.ts")).toBeLessThan(sorted.indexOf("app.ts"));
    });

    it("should handle independent files", () => {
      const graph: DependencyGraph = {
        "a.ts": [],
        "b.ts": [],
        "c.ts": [],
      };

      const sorted = topologicalSort(graph);
      expect(sorted).toHaveLength(3);
      expect(sorted).toContain("a.ts");
      expect(sorted).toContain("b.ts");
      expect(sorted).toContain("c.ts");
    });

    it("should throw on circular dependencies", () => {
      const graph: DependencyGraph = {
        "a.ts": ["b.ts"],
        "b.ts": ["c.ts"],
        "c.ts": ["a.ts"],
      };

      expect(() => topologicalSort(graph)).toThrow("Cycle detected");
    });

    it("should throw on self-referencing cycle", () => {
      const graph: DependencyGraph = {
        "a.ts": ["a.ts"],
      };

      expect(() => topologicalSort(graph)).toThrow("Cycle detected");
    });

    it("should sort complex 6-file graph correctly", () => {
      const graph: DependencyGraph = {
        "src/types.ts": [],
        "src/config.ts": ["src/types.ts"],
        "src/db.ts": ["src/types.ts"],
        "src/service.ts": ["src/db.ts", "src/types.ts"],
        "src/api.ts": ["src/service.ts", "src/types.ts"],
        "src/index.ts": ["src/api.ts", "src/config.ts"],
      };

      const sorted = topologicalSort(graph);
      expect(sorted).toHaveLength(6);
      // types must be first
      expect(sorted[0]).toBe("src/types.ts");
      // index must be last
      expect(sorted[sorted.length - 1]).toBe("src/index.ts");
      // service must come after db
      expect(sorted.indexOf("src/service.ts")).toBeGreaterThan(sorted.indexOf("src/db.ts"));
      // api must come after service
      expect(sorted.indexOf("src/api.ts")).toBeGreaterThan(sorted.indexOf("src/service.ts"));
    });
  });

  describe("getRelevantContext", () => {
    it("should return direct dependencies from context window", () => {
      const contextWindow = {
        "types.ts": "export interface X {}",
        "utils.ts": "import { X } from './types';",
        "other.ts": "unrelated",
      };
      const graph: DependencyGraph = {
        "types.ts": [],
        "utils.ts": ["types.ts"],
        "app.ts": ["utils.ts"],
        "other.ts": [],
      };

      const relevant = getRelevantContext("app.ts", contextWindow, graph);
      expect(relevant["utils.ts"]).toBeDefined();
      expect(relevant["types.ts"]).toBeDefined();
      expect(relevant["other.ts"]).toBeUndefined();
    });

    it("should return transitive dependencies", () => {
      const contextWindow = {
        "a.ts": "base",
        "b.ts": "mid",
        "c.ts": "top",
      };
      const graph: DependencyGraph = {
        "a.ts": [],
        "b.ts": ["a.ts"],
        "c.ts": ["b.ts"],
        "d.ts": ["c.ts"],
      };

      const relevant = getRelevantContext("d.ts", contextWindow, graph);
      expect(Object.keys(relevant)).toHaveLength(3);
      expect(relevant["a.ts"]).toBe("base");
      expect(relevant["b.ts"]).toBe("mid");
      expect(relevant["c.ts"]).toBe("top");
    });

    it("should handle missing context entries", () => {
      const contextWindow = { "a.ts": "content" };
      const graph: DependencyGraph = {
        "a.ts": [],
        "b.ts": ["a.ts"],
        "c.ts": ["b.ts"], // b.ts not in context yet
      };

      const relevant = getRelevantContext("c.ts", contextWindow, graph);
      expect(relevant["a.ts"]).toBe("content");
      expect(relevant["b.ts"]).toBeUndefined();
    });

    it("should handle files with no dependencies", () => {
      const contextWindow = { "other.ts": "content" };
      const graph: DependencyGraph = {
        "standalone.ts": [],
        "other.ts": [],
      };

      const relevant = getRelevantContext("standalone.ts", contextWindow, graph);
      expect(Object.keys(relevant)).toHaveLength(0);
    });
  });
});

// --- STRATEGY SELECTION ---

describe("Strategy Selection", () => {
  it("should select scaffold_first for projects with npm init", () => {
    const steps: BuildPlanStep[] = [
      { action: "run_command", command: "npm init -y" },
      { action: "create_file", filePath: "package.json", content: "{}" },
      { action: "create_file", filePath: "src/index.ts", content: "" },
      { action: "create_file", filePath: "src/app.ts", content: "" },
      { action: "create_file", filePath: "src/db.ts", content: "" },
      { action: "create_file", filePath: "src/types.ts", content: "" },
      { action: "create_file", filePath: "tsconfig.json", content: "" },
    ];
    const graph: DependencyGraph = {};

    expect(selectStrategy(steps, graph)).toBe("scaffold_first");
  });

  it("should select scaffold_first for package.json with many files", () => {
    const steps: BuildPlanStep[] = [
      { action: "create_file", filePath: "package.json", content: "{}" },
      { action: "create_file", filePath: "src/a.ts", content: "" },
      { action: "create_file", filePath: "src/b.ts", content: "" },
      { action: "create_file", filePath: "src/c.ts", content: "" },
      { action: "create_file", filePath: "src/d.ts", content: "" },
      { action: "create_file", filePath: "src/e.ts", content: "" },
      { action: "create_file", filePath: "src/f.ts", content: "" },
    ];
    const graph: DependencyGraph = {};

    expect(selectStrategy(steps, graph)).toBe("scaffold_first");
  });

  it("should select dependency_order for complex dependency graphs", () => {
    const steps: BuildPlanStep[] = [
      { action: "create_file", filePath: "src/types.ts", content: "" },
      { action: "create_file", filePath: "src/db.ts", content: "" },
      { action: "create_file", filePath: "src/service.ts", content: "" },
      { action: "create_file", filePath: "src/api.ts", content: "" },
    ];
    const graph: DependencyGraph = {
      "src/types.ts": [],
      "src/db.ts": ["src/types.ts"],
      "src/service.ts": ["src/db.ts"],
      "src/api.ts": ["src/service.ts"],
    };

    expect(selectStrategy(steps, graph)).toBe("dependency_order");
  });

  it("should select sequential for simple plans", () => {
    const steps: BuildPlanStep[] = [
      { action: "create_file", filePath: "src/app.ts", content: "" },
      { action: "create_file", filePath: "src/types.ts", content: "" },
    ];
    const graph: DependencyGraph = {};

    expect(selectStrategy(steps, graph)).toBe("sequential");
  });

  it("should select sequential for small plan even with deps", () => {
    const steps: BuildPlanStep[] = [
      { action: "create_file", filePath: "src/types.ts", content: "" },
      { action: "create_file", filePath: "src/app.ts", content: "" },
    ];
    const graph: DependencyGraph = {
      "src/types.ts": [],
      "src/app.ts": ["src/types.ts"],
    };

    // Only 2 file steps, needs > 3 for dependency_order
    expect(selectStrategy(steps, graph)).toBe("sequential");
  });
});

// --- DATABASE TESTS ---

describe("Builder Database", () => {
  beforeEach(async () => {
    await db.exec`DELETE FROM build_steps`;
    await db.exec`DELETE FROM builder_jobs`;
  });

  describe("builder_jobs table", () => {
    it("should insert a job with defaults", async () => {
      const row = await db.queryRow<{
        id: string; task_id: string; status: string;
      }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-1', '{"description":"test","repo":"r","repoOwner":"o","repoName":"n","model":"m","steps":[]}'::jsonb, 'pending')
        RETURNING id, task_id, status
      `;

      expect(row).toBeDefined();
      expect(row!.task_id).toBe("task-1");
      expect(row!.status).toBe("pending");
    });

    it("should store and retrieve JSONB plan", async () => {
      const plan = {
        description: "Build a feature",
        repo: "test/repo",
        repoOwner: "test",
        repoName: "repo",
        model: "claude-sonnet",
        steps: [
          { action: "create_file", filePath: "src/app.ts", content: "console.log('hi')" },
        ],
      };

      const row = await db.queryRow<{ id: string; plan: string | object }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-2', ${JSON.stringify(plan)}::jsonb, 'pending')
        RETURNING id, plan
      `;

      expect(row).toBeDefined();
      const parsed = typeof row!.plan === "string" ? JSON.parse(row!.plan) : row!.plan;
      expect(parsed.description).toBe("Build a feature");
      expect(parsed.steps).toHaveLength(1);
      expect(parsed.steps[0].filePath).toBe("src/app.ts");
    });

    it("should update job status with timestamps", async () => {
      const inserted = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-3', '{}'::jsonb, 'pending')
        RETURNING id
      `;

      await db.exec`
        UPDATE builder_jobs
        SET status = 'complete', completed_at = NOW()
        WHERE id = ${inserted!.id}::uuid
      `;

      const row = await db.queryRow<{ status: string; completed_at: string | null }>`
        SELECT status, completed_at FROM builder_jobs WHERE id = ${inserted!.id}::uuid
      `;

      expect(row!.status).toBe("complete");
      expect(row!.completed_at).not.toBeNull();
    });

    it("should store files_written as JSONB", async () => {
      const filesWritten = [
        { path: "src/app.ts", status: "success", attempts: 1, errors: [] },
        { path: "src/db.ts", status: "failed", attempts: 3, errors: ["type error"] },
      ];

      const row = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status, files_written)
        VALUES ('task-4', '{}'::jsonb, 'building', ${JSON.stringify(filesWritten)}::jsonb)
        RETURNING id
      `;

      const retrieved = await db.queryRow<{ files_written: string | object }>`
        SELECT files_written FROM builder_jobs WHERE id = ${row!.id}::uuid
      `;

      const parsed = typeof retrieved!.files_written === "string"
        ? JSON.parse(retrieved!.files_written)
        : retrieved!.files_written;

      expect(parsed).toHaveLength(2);
      expect(parsed[0].path).toBe("src/app.ts");
      expect(parsed[1].errors).toContain("type error");
    });

    it("should store context_window as JSONB", async () => {
      const contextWindow = {
        "src/types.ts": "export interface Foo {}",
        "src/app.ts": "import { Foo } from './types';",
      };

      const row = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status, context_window)
        VALUES ('task-5', '{}'::jsonb, 'building', ${JSON.stringify(contextWindow)}::jsonb)
        RETURNING id
      `;

      const retrieved = await db.queryRow<{ context_window: string | object }>`
        SELECT context_window FROM builder_jobs WHERE id = ${row!.id}::uuid
      `;

      const parsed = typeof retrieved!.context_window === "string"
        ? JSON.parse(retrieved!.context_window)
        : retrieved!.context_window;

      expect(parsed["src/types.ts"]).toBe("export interface Foo {}");
      expect(parsed["src/app.ts"]).toBe("import { Foo } from './types';");
    });

    it("should track cost and tokens", async () => {
      const row = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status, total_tokens_used, total_cost_usd)
        VALUES ('task-6', '{}'::jsonb, 'building', 15000, 0.045)
        RETURNING id
      `;

      await db.exec`
        UPDATE builder_jobs
        SET total_tokens_used = 30000, total_cost_usd = 0.09
        WHERE id = ${row!.id}::uuid
      `;

      const retrieved = await db.queryRow<{ total_tokens_used: number; total_cost_usd: number }>`
        SELECT total_tokens_used, total_cost_usd::float FROM builder_jobs WHERE id = ${row!.id}::uuid
      `;

      expect(retrieved!.total_tokens_used).toBe(30000);
      expect(retrieved!.total_cost_usd).toBeCloseTo(0.09, 4);
    });
  });

  describe("build_steps table", () => {
    it("should insert a build step linked to a job", async () => {
      const job = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-steps', '{}'::jsonb, 'building')
        RETURNING id
      `;

      const step = await db.queryRow<{
        id: string; step_number: number; phase: string; action: string; status: string;
      }>`
        INSERT INTO build_steps (job_id, step_number, phase, action, file_path, status)
        VALUES (${job!.id}::uuid, 1, 'implement', 'create_file', 'src/app.ts', 'success')
        RETURNING id, step_number, phase, action, status
      `;

      expect(step).toBeDefined();
      expect(step!.step_number).toBe(1);
      expect(step!.phase).toBe("implement");
      expect(step!.action).toBe("create_file");
      expect(step!.status).toBe("success");
    });

    it("should store validation_result as JSONB", async () => {
      const job = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-val', '{}'::jsonb, 'validating')
        RETURNING id
      `;

      const validationResult = {
        errors: ["TS2304: Cannot find name 'Foo'", "TS2322: Type mismatch"],
      };

      await db.exec`
        INSERT INTO build_steps (job_id, step_number, phase, action, file_path, status, validation_result)
        VALUES (${job!.id}::uuid, 1, 'implement', 'create_file', 'src/app.ts', 'failed',
                ${JSON.stringify(validationResult)}::jsonb)
      `;

      const step = await db.queryRow<{ validation_result: string | object }>`
        SELECT validation_result FROM build_steps
        WHERE job_id = ${job!.id}::uuid AND step_number = 1
      `;

      const parsed = typeof step!.validation_result === "string"
        ? JSON.parse(step!.validation_result)
        : step!.validation_result;

      expect(parsed.errors).toHaveLength(2);
      expect(parsed.errors[0]).toContain("TS2304");
    });

    it("should query steps by job in order", async () => {
      const job = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-order', '{}'::jsonb, 'building')
        RETURNING id
      `;

      // Insert 3 steps out of order
      await db.exec`INSERT INTO build_steps (job_id, step_number, phase, action, status) VALUES (${job!.id}::uuid, 3, 'implement', 'create_file', 'success')`;
      await db.exec`INSERT INTO build_steps (job_id, step_number, phase, action, status) VALUES (${job!.id}::uuid, 1, 'init', 'run_command', 'success')`;
      await db.exec`INSERT INTO build_steps (job_id, step_number, phase, action, status) VALUES (${job!.id}::uuid, 2, 'scaffold', 'run_command', 'success')`;

      const steps: { step_number: number; phase: string }[] = [];
      const rows = await db.query<{ step_number: number; phase: string }>`
        SELECT step_number, phase FROM build_steps
        WHERE job_id = ${job!.id}::uuid ORDER BY step_number
      `;
      for await (const row of rows) steps.push(row);

      expect(steps).toHaveLength(3);
      expect(steps[0].step_number).toBe(1);
      expect(steps[1].step_number).toBe(2);
      expect(steps[2].step_number).toBe(3);
    });

    it("should cascade delete steps when job deleted", async () => {
      const job = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-cascade', '{}'::jsonb, 'building')
        RETURNING id
      `;

      await db.exec`INSERT INTO build_steps (job_id, step_number, phase, action, status) VALUES (${job!.id}::uuid, 1, 'init', 'run_command', 'success')`;
      await db.exec`INSERT INTO build_steps (job_id, step_number, phase, action, status) VALUES (${job!.id}::uuid, 2, 'implement', 'create_file', 'success')`;

      await db.exec`DELETE FROM builder_jobs WHERE id = ${job!.id}::uuid`;

      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM build_steps WHERE job_id = ${job!.id}::uuid
      `;
      expect(count!.count).toBe(0);
    });
  });

  describe("job status queries", () => {
    it("should filter jobs by status", async () => {
      await db.exec`INSERT INTO builder_jobs (task_id, plan, status) VALUES ('t1', '{}'::jsonb, 'pending')`;
      await db.exec`INSERT INTO builder_jobs (task_id, plan, status) VALUES ('t2', '{}'::jsonb, 'building')`;
      await db.exec`INSERT INTO builder_jobs (task_id, plan, status) VALUES ('t3', '{}'::jsonb, 'complete')`;
      await db.exec`INSERT INTO builder_jobs (task_id, plan, status) VALUES ('t4', '{}'::jsonb, 'pending')`;

      const pending: { task_id: string }[] = [];
      const rows = await db.query<{ task_id: string }>`
        SELECT task_id FROM builder_jobs WHERE status = 'pending' ORDER BY created_at
      `;
      for await (const row of rows) pending.push(row);

      expect(pending).toHaveLength(2);
      expect(pending[0].task_id).toBe("t1");
      expect(pending[1].task_id).toBe("t4");
    });

    it("should filter jobs by task_id", async () => {
      await db.exec`INSERT INTO builder_jobs (task_id, plan, status) VALUES ('task-A', '{}'::jsonb, 'pending')`;
      await db.exec`INSERT INTO builder_jobs (task_id, plan, status) VALUES ('task-A', '{}'::jsonb, 'complete')`;
      await db.exec`INSERT INTO builder_jobs (task_id, plan, status) VALUES ('task-B', '{}'::jsonb, 'pending')`;

      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM builder_jobs WHERE task_id = 'task-A'
      `;
      expect(count!.count).toBe(2);
    });

    it("should update phase progression", async () => {
      const job = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status)
        VALUES ('task-phase', '{}'::jsonb, 'pending')
        RETURNING id
      `;

      const phases = ["init", "scaffold", "dependencies", "implement", "integrate", "finalize"];
      for (const phase of phases) {
        await db.exec`UPDATE builder_jobs SET current_phase = ${phase} WHERE id = ${job!.id}::uuid`;
      }

      const row = await db.queryRow<{ current_phase: string }>`
        SELECT current_phase FROM builder_jobs WHERE id = ${job!.id}::uuid
      `;
      expect(row!.current_phase).toBe("finalize");
    });
  });

  describe("dependency graph JSONB", () => {
    it("should round-trip dependency graph through JSONB", async () => {
      const graph: DependencyGraph = {
        "src/types.ts": [],
        "src/db.ts": ["src/types.ts"],
        "src/api.ts": ["src/db.ts", "src/types.ts"],
      };

      const row = await db.queryRow<{ id: string }>`
        INSERT INTO builder_jobs (task_id, plan, status, dependency_graph)
        VALUES ('task-graph', '{}'::jsonb, 'pending', ${JSON.stringify(graph)}::jsonb)
        RETURNING id
      `;

      const retrieved = await db.queryRow<{ dependency_graph: string | object }>`
        SELECT dependency_graph FROM builder_jobs WHERE id = ${row!.id}::uuid
      `;

      const parsed = typeof retrieved!.dependency_graph === "string"
        ? JSON.parse(retrieved!.dependency_graph)
        : retrieved!.dependency_graph;

      expect(parsed["src/types.ts"]).toEqual([]);
      expect(parsed["src/db.ts"]).toEqual(["src/types.ts"]);
      expect(parsed["src/api.ts"]).toContain("src/db.ts");
      expect(parsed["src/api.ts"]).toContain("src/types.ts");
    });
  });
});

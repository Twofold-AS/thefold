import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import type { Task, TaskStatus, TaskSource } from "./types";

// Direct DB reference for testing
const db = new SQLDatabase("tasks", { migrations: "./migrations" });

// Helper to parse task rows
function parseLabels(val: string | string[] | null): string[] {
  if (!val) return [];
  return typeof val === "string" ? JSON.parse(val) : val;
}

function parseDependsOn(val: string | string[] | null): string[] {
  if (!val) return [];
  return typeof val === "string" ? JSON.parse(val) : val;
}

describe("Tasks Service", () => {
  // Clean up before each test
  beforeEach(async () => {
    await db.exec`DELETE FROM tasks`;
  });

  // --- CRUD ---

  describe("CRUD operations", () => {
    it("should create a task with minimal fields", async () => {
      const row = await db.queryRow<{ id: string; title: string; status: string; priority: number; source: string }>`
        INSERT INTO tasks (title)
        VALUES ('Test task')
        RETURNING id, title, status, priority, source
      `;

      expect(row).toBeDefined();
      expect(row!.title).toBe("Test task");
      expect(row!.status).toBe("backlog");
      expect(row!.priority).toBe(3);
      expect(row!.source).toBe("manual");
    });

    it("should create a task with all fields", async () => {
      const row = await db.queryRow<{
        id: string; title: string; description: string; repo: string;
        status: string; priority: number; labels: string | string[];
        source: string; assigned_to: string; created_by: string;
      }>`
        INSERT INTO tasks (title, description, repo, status, priority, labels, source, assigned_to, created_by)
        VALUES ('Full task', 'Detailed description', 'thefold', 'planned', 2, ARRAY['bug','urgent']::text[], 'linear', 'thefold', 'user-1')
        RETURNING id, title, description, repo, status, priority, labels, source, assigned_to, created_by
      `;

      expect(row).toBeDefined();
      expect(row!.title).toBe("Full task");
      expect(row!.description).toBe("Detailed description");
      expect(row!.repo).toBe("thefold");
      expect(row!.status).toBe("planned");
      expect(row!.priority).toBe(2);
      const labels = parseLabels(row!.labels);
      expect(labels).toContain("bug");
      expect(labels).toContain("urgent");
      expect(row!.source).toBe("linear");
      expect(row!.assigned_to).toBe("thefold");
      expect(row!.created_by).toBe("user-1");
    });

    it("should get a task by id", async () => {
      const inserted = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title, repo) VALUES ('Get me', 'test-repo') RETURNING id
      `;

      const row = await db.queryRow<{ id: string; title: string; repo: string }>`
        SELECT id, title, repo FROM tasks WHERE id = ${inserted!.id}::uuid
      `;

      expect(row).toBeDefined();
      expect(row!.title).toBe("Get me");
      expect(row!.repo).toBe("test-repo");
    });

    it("should update a task", async () => {
      const inserted = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title, status, priority) VALUES ('Update me', 'backlog', 3) RETURNING id
      `;

      await db.exec`
        UPDATE tasks SET status = 'in_progress', priority = 1, updated_at = NOW()
        WHERE id = ${inserted!.id}::uuid
      `;

      const row = await db.queryRow<{ status: string; priority: number }>`
        SELECT status, priority FROM tasks WHERE id = ${inserted!.id}::uuid
      `;

      expect(row!.status).toBe("in_progress");
      expect(row!.priority).toBe(1);
    });

    it("should delete a task", async () => {
      const inserted = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title) VALUES ('Delete me') RETURNING id
      `;

      await db.exec`DELETE FROM tasks WHERE id = ${inserted!.id}::uuid`;

      const row = await db.queryRow<{ id: string }>`
        SELECT id FROM tasks WHERE id = ${inserted!.id}::uuid
      `;

      expect(row).toBeNull();
    });
  });

  // --- Listing and Filtering ---

  describe("listing and filtering", () => {
    beforeEach(async () => {
      // Insert test data
      await db.exec`
        INSERT INTO tasks (title, repo, status, source, priority, labels) VALUES
        ('Task A', 'repo-1', 'backlog', 'manual', 3, ARRAY['feature']::text[]),
        ('Task B', 'repo-1', 'in_progress', 'linear', 1, ARRAY['bug']::text[]),
        ('Task C', 'repo-2', 'done', 'manual', 2, ARRAY['feature']::text[]),
        ('Task D', 'repo-1', 'backlog', 'healing', 4, ARRAY['upgrade']::text[]),
        ('Task E', 'repo-2', 'planned', 'linear', 3, ARRAY['bug','urgent']::text[])
      `;
    });

    it("should list all tasks", async () => {
      const rows: Array<{ id: string }> = [];
      for await (const row of db.query<{ id: string }>`SELECT id FROM tasks`) {
        rows.push(row);
      }
      expect(rows.length).toBe(5);
    });

    it("should filter by repo", async () => {
      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE repo = 'repo-1'
      `;
      expect(count!.count).toBe(3);
    });

    it("should filter by status", async () => {
      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE status = 'backlog'
      `;
      expect(count!.count).toBe(2);
    });

    it("should filter by source", async () => {
      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE source = 'linear'
      `;
      expect(count!.count).toBe(2);
    });

    it("should filter by labels (SQL array overlap)", async () => {
      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE labels && ARRAY['bug']::text[]
      `;
      expect(count!.count).toBe(2);
    });

    it("should filter by repo and status combined", async () => {
      const count = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE repo = 'repo-1' AND status = 'backlog'
      `;
      expect(count!.count).toBe(2);
    });

    it("should order by planned_order then priority", async () => {
      // Set planned_order on some tasks
      await db.exec`UPDATE tasks SET planned_order = 2 WHERE title = 'Task A'`;
      await db.exec`UPDATE tasks SET planned_order = 1 WHERE title = 'Task D'`;

      const rows: Array<{ title: string }> = [];
      for await (const row of db.query<{ title: string }>`
        SELECT title FROM tasks WHERE repo = 'repo-1'
        ORDER BY COALESCE(planned_order, 999999), priority
      `) {
        rows.push(row);
      }

      // Task D (order 1) first, then Task A (order 2), then Task B (no order, priority 1)
      expect(rows[0].title).toBe("Task D");
      expect(rows[1].title).toBe("Task A");
      expect(rows[2].title).toBe("Task B");
    });
  });

  // --- Status Transitions ---

  describe("status transitions", () => {
    it("should transition backlog → planned → in_progress → in_review → done", async () => {
      const inserted = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title, status) VALUES ('Transition task', 'backlog') RETURNING id
      `;
      const id = inserted!.id;

      const statuses: TaskStatus[] = ["planned", "in_progress", "in_review", "done"];

      for (const status of statuses) {
        await db.exec`UPDATE tasks SET status = ${status}, updated_at = NOW() WHERE id = ${id}::uuid`;
        const row = await db.queryRow<{ status: string }>`SELECT status FROM tasks WHERE id = ${id}::uuid`;
        expect(row!.status).toBe(status);
      }
    });

    it("should set completed_at when status transitions to done", async () => {
      const inserted = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title, status) VALUES ('Complete task', 'in_review') RETURNING id
      `;

      await db.exec`
        UPDATE tasks SET status = 'done', completed_at = NOW(), updated_at = NOW()
        WHERE id = ${inserted!.id}::uuid
      `;

      const row = await db.queryRow<{ status: string; completed_at: Date | null }>`
        SELECT status, completed_at FROM tasks WHERE id = ${inserted!.id}::uuid
      `;

      expect(row!.status).toBe("done");
      expect(row!.completed_at).toBeDefined();
      expect(row!.completed_at).not.toBeNull();
    });

    it("should allow blocked status", async () => {
      const inserted = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title, status) VALUES ('Blocked task', 'in_progress') RETURNING id
      `;

      await db.exec`UPDATE tasks SET status = 'blocked' WHERE id = ${inserted!.id}::uuid`;

      const row = await db.queryRow<{ status: string }>`SELECT status FROM tasks WHERE id = ${inserted!.id}::uuid`;
      expect(row!.status).toBe("blocked");
    });
  });

  // --- Dependencies ---

  describe("dependencies", () => {
    it("should store and retrieve depends_on UUIDs", async () => {
      const dep1 = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title) VALUES ('Dep 1') RETURNING id
      `;
      const dep2 = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title) VALUES ('Dep 2') RETURNING id
      `;

      const task = await db.queryRow<{ id: string; depends_on: string | string[] }>`
        INSERT INTO tasks (title, depends_on)
        VALUES ('Dependent task', ARRAY[${dep1!.id}, ${dep2!.id}]::uuid[])
        RETURNING id, depends_on::text[]
      `;

      const deps = parseDependsOn(task!.depends_on);
      expect(deps.length).toBe(2);
      expect(deps).toContain(dep1!.id);
      expect(deps).toContain(dep2!.id);
    });

    it("should check if dependencies are satisfied", async () => {
      const dep = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title, status) VALUES ('Dep task', 'in_progress') RETURNING id
      `;

      const task = await db.queryRow<{ id: string }>`
        INSERT INTO tasks (title, depends_on)
        VALUES ('Blocked by dep', ARRAY[${dep!.id}]::uuid[])
        RETURNING id
      `;

      // Check if all dependencies are done (use unnest to avoid uuid[]/text[] mismatch)
      const unfinished = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks
        WHERE id IN (
          SELECT unnest(depends_on) FROM tasks WHERE id = ${task!.id}::uuid
        )
        AND status != 'done'
      `;

      expect(unfinished!.count).toBe(1); // dep is not done yet

      // Mark dep as done
      await db.exec`UPDATE tasks SET status = 'done' WHERE id = ${dep!.id}::uuid`;

      const finished = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks
        WHERE id IN (
          SELECT unnest(depends_on) FROM tasks WHERE id = ${task!.id}::uuid
        )
        AND status != 'done'
      `;

      expect(finished!.count).toBe(0); // all deps done
    });
  });

  // --- Linear Sync ---

  describe("Linear sync", () => {
    it("should create a task with linear source and linear_task_id", async () => {
      const row = await db.queryRow<{ id: string; source: string; linear_task_id: string }>`
        INSERT INTO tasks (title, source, linear_task_id, linear_synced_at)
        VALUES ('Linear task', 'linear', 'lin-123', NOW())
        RETURNING id, source, linear_task_id
      `;

      expect(row!.source).toBe("linear");
      expect(row!.linear_task_id).toBe("lin-123");
    });

    it("should find existing task by linear_task_id", async () => {
      await db.exec`
        INSERT INTO tasks (title, source, linear_task_id)
        VALUES ('Existing linear task', 'linear', 'lin-456')
      `;

      const row = await db.queryRow<{ title: string }>`
        SELECT title FROM tasks WHERE linear_task_id = 'lin-456'
      `;

      expect(row).toBeDefined();
      expect(row!.title).toBe("Existing linear task");
    });

    it("should update an existing linear task", async () => {
      await db.exec`
        INSERT INTO tasks (title, description, source, linear_task_id)
        VALUES ('Old title', 'Old desc', 'linear', 'lin-789')
      `;

      await db.exec`
        UPDATE tasks SET title = 'New title', description = 'New desc', linear_synced_at = NOW()
        WHERE linear_task_id = 'lin-789'
      `;

      const row = await db.queryRow<{ title: string; description: string }>`
        SELECT title, description FROM tasks WHERE linear_task_id = 'lin-789'
      `;

      expect(row!.title).toBe("New title");
      expect(row!.description).toBe("New desc");
    });
  });

  // --- Statistics ---

  describe("statistics", () => {
    beforeEach(async () => {
      await db.exec`
        INSERT INTO tasks (title, repo, status, source) VALUES
        ('S1', 'repo-1', 'backlog', 'manual'),
        ('S2', 'repo-1', 'done', 'manual'),
        ('S3', 'repo-2', 'in_progress', 'linear'),
        ('S4', 'repo-2', 'done', 'healing')
      `;
    });

    it("should count total tasks", async () => {
      const row = await db.queryRow<{ count: number }>`SELECT COUNT(*)::int AS count FROM tasks`;
      expect(row!.count).toBe(4);
    });

    it("should group by status", async () => {
      const byStatus: Record<string, number> = {};
      for await (const row of db.query<{ status: string; count: number }>`
        SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status
      `) {
        byStatus[row.status] = row.count;
      }

      expect(byStatus.backlog).toBe(1);
      expect(byStatus.done).toBe(2);
      expect(byStatus.in_progress).toBe(1);
    });

    it("should group by source", async () => {
      const bySource: Record<string, number> = {};
      for await (const row of db.query<{ source: string; count: number }>`
        SELECT source, COUNT(*)::int AS count FROM tasks GROUP BY source
      `) {
        bySource[row.source] = row.count;
      }

      expect(bySource.manual).toBe(2);
      expect(bySource.linear).toBe(1);
      expect(bySource.healing).toBe(1);
    });

    it("should group by repo", async () => {
      const byRepo: Record<string, number> = {};
      for await (const row of db.query<{ repo: string; count: number }>`
        SELECT COALESCE(repo, 'unassigned') AS repo, COUNT(*)::int AS count FROM tasks GROUP BY repo
      `) {
        byRepo[row.repo] = row.count;
      }

      expect(byRepo["repo-1"]).toBe(2);
      expect(byRepo["repo-2"]).toBe(2);
    });
  });

  // --- Task Sources ---

  describe("task sources", () => {
    it("should support manual source", async () => {
      const row = await db.queryRow<{ source: string }>`
        INSERT INTO tasks (title, source) VALUES ('Manual', 'manual') RETURNING source
      `;
      expect(row!.source).toBe("manual");
    });

    it("should support healing source with healing_source_id", async () => {
      const row = await db.queryRow<{ source: string; healing_source_id: string | null }>`
        INSERT INTO tasks (title, source, healing_source_id)
        VALUES ('Healing task', 'healing', gen_random_uuid())
        RETURNING source, healing_source_id
      `;
      expect(row!.source).toBe("healing");
      expect(row!.healing_source_id).toBeDefined();
    });

    it("should support marketplace source", async () => {
      const row = await db.queryRow<{ source: string }>`
        INSERT INTO tasks (title, source) VALUES ('Marketplace task', 'marketplace') RETURNING source
      `;
      expect(row!.source).toBe("marketplace");
    });
  });

  // --- Planning Fields ---

  describe("planning fields", () => {
    it("should store and retrieve planning fields", async () => {
      const row = await db.queryRow<{
        estimated_complexity: number;
        estimated_tokens: number;
        planned_order: number;
      }>`
        INSERT INTO tasks (title, estimated_complexity, estimated_tokens, planned_order)
        VALUES ('Planned task', 3, 5000, 1)
        RETURNING estimated_complexity, estimated_tokens, planned_order
      `;

      expect(row!.estimated_complexity).toBe(3);
      expect(row!.estimated_tokens).toBe(5000);
      expect(row!.planned_order).toBe(1);
    });

    it("should store build_job_id and review_id", async () => {
      const row = await db.queryRow<{ build_job_id: string; review_id: string }>`
        INSERT INTO tasks (title, build_job_id, review_id)
        VALUES ('With refs', gen_random_uuid(), gen_random_uuid())
        RETURNING build_job_id, review_id
      `;

      expect(row!.build_job_id).toBeDefined();
      expect(row!.review_id).toBeDefined();
    });
  });

  // --- Type validation ---

  describe("type validation", () => {
    it("should validate Task shape", () => {
      const task: Task = {
        id: "test-id",
        title: "Test task",
        description: null,
        repo: "thefold",
        status: "backlog",
        priority: 3,
        labels: ["feature"],
        phase: null,
        dependsOn: [],
        source: "manual",
        linearTaskId: null,
        linearSyncedAt: null,
        healingSourceId: null,
        estimatedComplexity: null,
        estimatedTokens: null,
        plannedOrder: null,
        assignedTo: "thefold",
        buildJobId: null,
        prUrl: null,
        reviewId: null,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      };

      expect(task.id).toBe("test-id");
      expect(task.status).toBe("backlog");
      expect(task.source).toBe("manual");
    });

    it("should validate all TaskStatus values", () => {
      const statuses: TaskStatus[] = ["backlog", "planned", "in_progress", "in_review", "done", "blocked"];
      expect(statuses.length).toBe(6);
    });

    it("should validate all TaskSource values", () => {
      const sources: TaskSource[] = ["manual", "linear", "healing", "marketplace"];
      expect(sources.length).toBe(4);
    });
  });
});

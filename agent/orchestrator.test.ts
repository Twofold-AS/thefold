import { describe, it, expect } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import type {
  ProjectPlan,
  ProjectPhase,
  ProjectTask,
  CuratedContext,
  DecomposeProjectRequest,
  DecomposeProjectResponse,
} from "./types";

const db = new SQLDatabase("agent", { migrations: "./migrations" });

// --- DEL 6.1: Type export tests ---

describe("Project Orchestrator Types", () => {
  it("ProjectPlan has all required fields", () => {
    const plan: ProjectPlan = {
      id: "test-id",
      conversationId: "conv-1",
      userRequest: "Build a TODO app",
      status: "planning",
      currentPhase: 0,
      phases: [],
      conventions: "",
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      totalCostUsd: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(plan.id).toBe("test-id");
    expect(plan.status).toBe("planning");
  });

  it("ProjectPhase has correct structure", () => {
    const phase: ProjectPhase = {
      phase: 0,
      name: "Foundation",
      description: "Data models and schemas",
      tasks: [],
    };
    expect(phase.phase).toBe(0);
    expect(phase.name).toBe("Foundation");
  });

  it("ProjectTask has all required fields", () => {
    const task: ProjectTask = {
      id: "task-1",
      projectId: "proj-1",
      phase: 0,
      taskOrder: 0,
      title: "Create user model",
      description: "Build the user model with migrations",
      status: "pending",
      dependsOn: [],
      outputFiles: [],
      outputTypes: [],
      contextHints: ["needs database schema conventions"],
      costUsd: 0,
      attemptCount: 0,
    };
    expect(task.status).toBe("pending");
    expect(task.contextHints).toHaveLength(1);
  });

  it("CuratedContext has correct shape", () => {
    const ctx: CuratedContext = {
      relevantFiles: [{ path: "src/user.ts", content: "export class User {}" }],
      dependencyOutputs: [{ taskTitle: "Create models", files: ["user.ts"], types: ["User"] }],
      memoryContext: ["User model uses UUID primary keys"],
      docsContext: ["Encore.ts SQLDatabase docs"],
      conventions: "# Conventions\nUse camelCase",
      tokenEstimate: 1500,
    };
    expect(ctx.relevantFiles).toHaveLength(1);
    expect(ctx.tokenEstimate).toBe(1500);
  });

  it("DecomposeProjectRequest has correct shape", () => {
    const req: DecomposeProjectRequest = {
      userMessage: "Build a TODO app with auth",
      repoOwner: "test-org",
      repoName: "test-repo",
      projectStructure: "src/\n  index.ts",
    };
    expect(req.userMessage).toBe("Build a TODO app with auth");
  });

  it("DecomposeProjectResponse has phases and conventions", () => {
    const resp: DecomposeProjectResponse = {
      phases: [
        {
          name: "Foundation",
          description: "Set up base",
          tasks: [
            {
              title: "Create schema",
              description: "Database schema",
              dependsOnIndices: [],
              contextHints: [],
            },
          ],
        },
      ],
      conventions: "# Conventions",
      reasoning: "Split into 2 phases",
      estimatedTotalTasks: 1,
    };
    expect(resp.phases).toHaveLength(1);
    expect(resp.phases[0].tasks).toHaveLength(1);
    expect(resp.conventions.length).toBeLessThan(8000);
  });

  it("ProjectTask status union covers all states", () => {
    const statuses: ProjectTask["status"][] = ["pending", "running", "completed", "failed", "skipped"];
    expect(statuses).toHaveLength(5);
  });

  it("ProjectPlan status union covers all states", () => {
    const statuses: ProjectPlan["status"][] = ["planning", "executing", "paused", "completed", "failed"];
    expect(statuses).toHaveLength(5);
  });
});

// --- DEL 6.2: Database tests ---

describe("Project Orchestrator Database", () => {
  it("can insert and query a project plan", async () => {
    const result = await db.queryRow<{ id: string; status: string; user_request: string }>`
      INSERT INTO project_plans (conversation_id, user_request, status)
      VALUES ('test-conv-1', 'Build a TODO app', 'planning')
      RETURNING id, status, user_request
    `;
    expect(result).not.toBeNull();
    expect(result!.status).toBe("planning");
    expect(result!.user_request).toBe("Build a TODO app");

    // Query back
    const fetched = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM project_plans WHERE id = ${result!.id}
    `;
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(result!.id);
  });

  it("can update project plan status", async () => {
    const inserted = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request, status)
      VALUES ('test-conv-2', 'Build auth system', 'planning')
      RETURNING id
    `;

    await db.exec`
      UPDATE project_plans
      SET status = 'executing', current_phase = 1, updated_at = NOW()
      WHERE id = ${inserted!.id}
    `;

    const updated = await db.queryRow<{ status: string; current_phase: number }>`
      SELECT status, current_phase FROM project_plans WHERE id = ${inserted!.id}
    `;
    expect(updated!.status).toBe("executing");
    expect(updated!.current_phase).toBe(1);
  });

  it("can insert project tasks with foreign key", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request)
      VALUES ('test-conv-3', 'Build teams feature')
      RETURNING id
    `;

    const task = await db.queryRow<{ id: string; title: string; phase: number }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description, context_hints)
      VALUES (${plan!.id}, 0, 0, 'Create team model', 'Build the team model with migrations', ARRAY['needs db conventions'])
      RETURNING id, title, phase
    `;
    expect(task).not.toBeNull();
    expect(task!.title).toBe("Create team model");
    expect(task!.phase).toBe(0);
  });

  it("cascades delete from project to tasks", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request)
      VALUES ('test-conv-4', 'Delete cascade test')
      RETURNING id
    `;

    await db.exec`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 0, 'Task A', 'Description A')
    `;
    await db.exec`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 1, 'Task B', 'Description B')
    `;

    // Verify tasks exist
    const countBefore = await db.queryRow<{ count: string }>`
      SELECT COUNT(*)::text as count FROM project_tasks WHERE project_id = ${plan!.id}
    `;
    expect(parseInt(countBefore!.count)).toBe(2);

    // Delete plan — tasks should cascade
    await db.exec`DELETE FROM project_plans WHERE id = ${plan!.id}`;

    const countAfter = await db.queryRow<{ count: string }>`
      SELECT COUNT(*)::text as count FROM project_tasks WHERE project_id = ${plan!.id}
    `;
    expect(parseInt(countAfter!.count)).toBe(0);
  });

  it("can update task status and track attempts", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request)
      VALUES ('test-conv-5', 'Status update test')
      RETURNING id
    `;

    const task = await db.queryRow<{ id: string }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 0, 'Test task', 'Test description')
      RETURNING id
    `;

    // Mark as running
    await db.exec`
      UPDATE project_tasks
      SET status = 'running', started_at = NOW(), attempt_count = attempt_count + 1
      WHERE id = ${task!.id}
    `;

    const running = await db.queryRow<{ status: string; attempt_count: number }>`
      SELECT status, attempt_count FROM project_tasks WHERE id = ${task!.id}
    `;
    expect(running!.status).toBe("running");
    expect(running!.attempt_count).toBe(1);

    // Mark as completed
    await db.exec`
      UPDATE project_tasks
      SET status = 'completed', completed_at = NOW(), output_files = ARRAY['src/model.ts', 'src/api.ts']
      WHERE id = ${task!.id}
    `;

    const completed = await db.queryRow<{ status: string; output_files: string[] }>`
      SELECT status, output_files FROM project_tasks WHERE id = ${task!.id}
    `;
    expect(completed!.status).toBe("completed");
    expect(completed!.output_files).toContain("src/model.ts");
  });

  it("supports JSONB plan_data", async () => {
    const planData = {
      phases: [{ name: "Foundation", taskCount: 3 }],
      metadata: { version: 1 },
    };

    const plan = await db.queryRow<{ id: string; plan_data: string }>`
      INSERT INTO project_plans (conversation_id, user_request, plan_data)
      VALUES ('test-conv-6', 'JSONB test', ${JSON.stringify(planData)}::jsonb)
      RETURNING id, plan_data
    `;
    // SQLDatabase returns JSONB as string — parse it
    const parsed = typeof plan!.plan_data === "string"
      ? JSON.parse(plan!.plan_data)
      : plan!.plan_data;
    expect(parsed).toEqual(planData);
  });

  it("queries tasks by phase order", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request)
      VALUES ('test-conv-7', 'Phase order test')
      RETURNING id
    `;

    // Insert tasks in different order
    await db.exec`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES
        (${plan!.id}, 1, 1, 'Phase 1 Task 2', 'desc'),
        (${plan!.id}, 0, 0, 'Phase 0 Task 1', 'desc'),
        (${plan!.id}, 1, 0, 'Phase 1 Task 1', 'desc'),
        (${plan!.id}, 0, 1, 'Phase 0 Task 2', 'desc')
    `;

    const tasks: Array<{ title: string; phase: number; task_order: number }> = [];
    const rows = await db.query<{ title: string; phase: number; task_order: number }>`
      SELECT title, phase, task_order FROM project_tasks
      WHERE project_id = ${plan!.id}
      ORDER BY phase, task_order
    `;
    for await (const row of rows) {
      tasks.push(row);
    }

    expect(tasks).toHaveLength(4);
    expect(tasks[0].title).toBe("Phase 0 Task 1");
    expect(tasks[1].title).toBe("Phase 0 Task 2");
    expect(tasks[2].title).toBe("Phase 1 Task 1");
    expect(tasks[3].title).toBe("Phase 1 Task 2");
  });
});

// --- DEL 6.3: Orchestrator Database Integration Tests ---

describe("Project Orchestrator - Execution DB Operations", () => {
  it("can create plan and tasks, then update status through lifecycle", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request, status, total_tasks, conventions)
      VALUES ('test-exec-1', 'Build user system', 'planning', 3, '# Conventions')
      RETURNING id
    `;
    expect(plan).not.toBeNull();

    const task1 = await db.queryRow<{ id: string }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 0, 'Create user model', 'User model desc')
      RETURNING id
    `;

    // planning → executing
    await db.exec`
      UPDATE project_plans SET status = 'executing', updated_at = NOW()
      WHERE id = ${plan!.id}
    `;

    // Task: pending → running → completed
    await db.exec`
      UPDATE project_tasks SET status = 'running', started_at = NOW()
      WHERE id = ${task1!.id}
    `;
    await db.exec`
      UPDATE project_tasks SET status = 'completed', completed_at = NOW(),
        output_files = ARRAY['users/model.ts']
      WHERE id = ${task1!.id}
    `;
    await db.exec`
      UPDATE project_plans SET completed_tasks = 1 WHERE id = ${plan!.id}
    `;

    const updatedPlan = await db.queryRow<{ completed_tasks: number; status: string }>`
      SELECT completed_tasks, status FROM project_plans WHERE id = ${plan!.id}
    `;
    expect(updatedPlan!.completed_tasks).toBe(1);
    expect(updatedPlan!.status).toBe("executing");
  });

  it("can store tasks with depends_on UUIDs", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request)
      VALUES ('test-exec-2', 'Dependency test')
      RETURNING id
    `;

    const t1 = await db.queryRow<{ id: string }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 0, 'Task A', 'desc')
      RETURNING id
    `;
    const t2 = await db.queryRow<{ id: string }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 1, 'Task B', 'desc')
      RETURNING id
    `;
    const t3 = await db.queryRow<{ id: string }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description, depends_on)
      VALUES (${plan!.id}, 1, 0, 'Task C', 'desc', ARRAY[${t1!.id}, ${t2!.id}]::uuid[])
      RETURNING id
    `;

    // Encore SQLDatabase can't parse uuid[] directly — cast to text[]
    const taskC = await db.queryRow<{ dep_count: number; dep_text: string }>`
      SELECT array_length(depends_on, 1) as dep_count,
             depends_on::text[] as dep_text
      FROM project_tasks WHERE id = ${t3!.id}
    `;
    expect(taskC!.dep_count).toBe(2);
  });

  it("can mark task as failed with error message", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request)
      VALUES ('test-exec-3', 'Failure test')
      RETURNING id
    `;

    const task = await db.queryRow<{ id: string }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 0, 'Failing task', 'desc')
      RETURNING id
    `;

    await db.exec`
      UPDATE project_tasks
      SET status = 'failed', error_message = 'Validation failed: type error on line 42'
      WHERE id = ${task!.id}
    `;

    const failed = await db.queryRow<{ status: string; error_message: string }>`
      SELECT status, error_message FROM project_tasks WHERE id = ${task!.id}
    `;
    expect(failed!.status).toBe("failed");
    expect(failed!.error_message).toContain("type error");
  });

  it("can pause and resume project", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request, status)
      VALUES ('test-exec-4', 'Pause test', 'executing')
      RETURNING id
    `;

    await db.exec`UPDATE project_plans SET status = 'paused' WHERE id = ${plan!.id}`;
    const paused = await db.queryRow<{ status: string }>`
      SELECT status FROM project_plans WHERE id = ${plan!.id}
    `;
    expect(paused!.status).toBe("paused");

    await db.exec`UPDATE project_plans SET status = 'executing' WHERE id = ${plan!.id}`;
    const resumed = await db.queryRow<{ status: string }>`
      SELECT status FROM project_plans WHERE id = ${plan!.id}
    `;
    expect(resumed!.status).toBe("executing");
  });

  it("tracks cost across tasks", async () => {
    const plan = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request, total_cost_usd)
      VALUES ('test-exec-5', 'Cost test', 0)
      RETURNING id
    `;

    await db.exec`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description, status, cost_usd)
      VALUES (${plan!.id}, 0, 0, 'Task 1', 'desc', 'completed', 0.0523)
    `;

    const totalCost = 0.0523;
    await db.exec`UPDATE project_plans SET total_cost_usd = ${totalCost} WHERE id = ${plan!.id}`;

    const updated = await db.queryRow<{ total_cost_usd: number }>`
      SELECT total_cost_usd::numeric as total_cost_usd FROM project_plans WHERE id = ${plan!.id}
    `;
    expect(Number(updated!.total_cost_usd)).toBeCloseTo(0.0523, 3);
  });
});

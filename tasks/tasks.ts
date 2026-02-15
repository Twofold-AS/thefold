import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic } from "encore.dev/pubsub";
import { linear } from "~encore/clients";
import { ai } from "~encore/clients";
import type { Task, TaskStatus, TaskSource } from "./types";

// --- Database ---

const db = new SQLDatabase("tasks", { migrations: "./migrations" });

// --- Pub/Sub ---

export interface TaskEvent {
  taskId: string;
  action: "created" | "updated" | "started" | "completed" | "blocked" | "synced";
  repo: string | null;
  source: TaskSource;
  timestamp: string;
}

export const taskEvents = new Topic<TaskEvent>("task-events", {
  deliveryGuarantee: "at-least-once",
});

// --- Row parsing helper ---

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  repo: string | null;
  status: string;
  priority: number;
  labels: string | string[] | null;
  phase: string | null;
  depends_on: string | string[] | null;
  source: string;
  linear_task_id: string | null;
  linear_synced_at: Date | null;
  healing_source_id: string | null;
  estimated_complexity: number | null;
  estimated_tokens: number | null;
  planned_order: number | null;
  assigned_to: string;
  build_job_id: string | null;
  pr_url: string | null;
  review_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

function parseTask(row: TaskRow): Task {
  const labels = row.labels
    ? typeof row.labels === "string" ? JSON.parse(row.labels) : row.labels
    : [];
  const dependsOn = row.depends_on
    ? typeof row.depends_on === "string" ? JSON.parse(row.depends_on) : row.depends_on
    : [];

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    repo: row.repo,
    status: row.status as TaskStatus,
    priority: row.priority,
    labels,
    phase: row.phase,
    dependsOn,
    source: row.source as TaskSource,
    linearTaskId: row.linear_task_id,
    linearSyncedAt: row.linear_synced_at?.toISOString() ?? null,
    healingSourceId: row.healing_source_id,
    estimatedComplexity: row.estimated_complexity,
    estimatedTokens: row.estimated_tokens,
    plannedOrder: row.planned_order,
    assignedTo: row.assigned_to,
    buildJobId: row.build_job_id,
    prUrl: row.pr_url,
    reviewId: row.review_id,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}

// --- CRUD Endpoints ---

interface CreateTaskRequest {
  title: string;
  description?: string;
  repo?: string;
  labels?: string[];
  priority?: number;
  phase?: string;
  dependsOn?: string[];
  source?: TaskSource;
  linearTaskId?: string;
  assignedTo?: string;
  createdBy?: string;
}

interface CreateTaskResponse {
  task: Task;
}

export const createTask = api(
  { method: "POST", path: "/tasks/create", expose: true, auth: true },
  async (req: CreateTaskRequest): Promise<CreateTaskResponse> => {
    if (!req.title || req.title.trim().length === 0) {
      throw APIError.invalidArgument("title is required");
    }

    const row = await db.queryRow<TaskRow>`
      INSERT INTO tasks (title, description, repo, labels, priority, phase, depends_on, source, linear_task_id, assigned_to, created_by)
      VALUES (
        ${req.title},
        ${req.description ?? null},
        ${req.repo ?? null},
        ${req.labels ?? []}::text[],
        ${req.priority ?? 3},
        ${req.phase ?? null},
        ${req.dependsOn ?? []}::uuid[],
        ${req.source ?? "manual"},
        ${req.linearTaskId ?? null},
        ${req.assignedTo ?? "thefold"},
        ${req.createdBy ?? null}
      )
      RETURNING id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at
    `;

    const task = parseTask(row!);

    await taskEvents.publish({
      taskId: task.id,
      action: "created",
      repo: task.repo,
      source: task.source,
      timestamp: new Date().toISOString(),
    });

    return { task };
  }
);

interface UpdateTaskRequest {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  labels?: string[];
  phase?: string;
  dependsOn?: string[];
  assignedTo?: string;
  prUrl?: string;
  reviewId?: string;
  buildJobId?: string;
  estimatedComplexity?: number;
  estimatedTokens?: number;
  plannedOrder?: number;
}

interface UpdateTaskResponse {
  task: Task;
}

export const updateTask = api(
  { method: "POST", path: "/tasks/update", expose: true, auth: true },
  async (req: UpdateTaskRequest): Promise<UpdateTaskResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");

    // Check task exists
    const existing = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM tasks WHERE id = ${req.id}::uuid
    `;
    if (!existing) throw APIError.notFound("task not found");

    // Build dynamic SET clause parts
    const sets: string[] = ["updated_at = NOW()"];
    if (req.title !== undefined) sets.push(`title = '${req.title.replace(/'/g, "''")}'`);
    if (req.description !== undefined) sets.push(`description = '${(req.description ?? "").replace(/'/g, "''")}'`);
    if (req.priority !== undefined) sets.push(`priority = ${req.priority}`);
    if (req.phase !== undefined) sets.push(`phase = '${(req.phase ?? "").replace(/'/g, "''")}'`);
    if (req.assignedTo !== undefined) sets.push(`assigned_to = '${req.assignedTo.replace(/'/g, "''")}'`);
    if (req.prUrl !== undefined) sets.push(`pr_url = '${(req.prUrl ?? "").replace(/'/g, "''")}'`);

    // Use parameterized queries for complex fields
    // Since Encore template literals don't support dynamic SET, we update fields individually
    if (req.status !== undefined) {
      const completedAt = req.status === "done" ? "NOW()" : "NULL";
      await db.exec`
        UPDATE tasks SET status = ${req.status}, completed_at = ${req.status === "done" ? new Date() : null}, updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }
    if (req.title !== undefined) {
      await db.exec`UPDATE tasks SET title = ${req.title}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.description !== undefined) {
      await db.exec`UPDATE tasks SET description = ${req.description}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.priority !== undefined) {
      await db.exec`UPDATE tasks SET priority = ${req.priority}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.labels !== undefined) {
      await db.exec`UPDATE tasks SET labels = ${req.labels}::text[], updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.phase !== undefined) {
      await db.exec`UPDATE tasks SET phase = ${req.phase}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.dependsOn !== undefined) {
      await db.exec`UPDATE tasks SET depends_on = ${req.dependsOn}::uuid[], updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.assignedTo !== undefined) {
      await db.exec`UPDATE tasks SET assigned_to = ${req.assignedTo}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.prUrl !== undefined) {
      await db.exec`UPDATE tasks SET pr_url = ${req.prUrl}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.reviewId !== undefined) {
      await db.exec`UPDATE tasks SET review_id = ${req.reviewId}::uuid, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.buildJobId !== undefined) {
      await db.exec`UPDATE tasks SET build_job_id = ${req.buildJobId}::uuid, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.estimatedComplexity !== undefined) {
      await db.exec`UPDATE tasks SET estimated_complexity = ${req.estimatedComplexity}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.estimatedTokens !== undefined) {
      await db.exec`UPDATE tasks SET estimated_tokens = ${req.estimatedTokens}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }
    if (req.plannedOrder !== undefined) {
      await db.exec`UPDATE tasks SET planned_order = ${req.plannedOrder}, updated_at = NOW() WHERE id = ${req.id}::uuid`;
    }

    // Fetch updated task
    const row = await db.queryRow<TaskRow>`SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE id = ${req.id}::uuid`;
    const task = parseTask(row!);

    // Determine event action
    let action: TaskEvent["action"] = "updated";
    if (req.status === "in_progress") action = "started";
    else if (req.status === "done") action = "completed";
    else if (req.status === "blocked") action = "blocked";

    await taskEvents.publish({
      taskId: task.id,
      action,
      repo: task.repo,
      source: task.source,
      timestamp: new Date().toISOString(),
    });

    return { task };
  }
);

interface DeleteTaskRequest {
  id: string;
}

interface DeleteTaskResponse {
  deleted: boolean;
}

export const deleteTask = api(
  { method: "POST", path: "/tasks/delete", expose: true, auth: true },
  async (req: DeleteTaskRequest): Promise<DeleteTaskResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");
    await db.exec`DELETE FROM tasks WHERE id = ${req.id}::uuid`;
    return { deleted: true };
  }
);

interface GetTaskRequest {
  id: string;
}

interface GetTaskResponse {
  task: Task;
}

export const getTask = api(
  { method: "GET", path: "/tasks/get", expose: true, auth: true },
  async (req: GetTaskRequest): Promise<GetTaskResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");
    const row = await db.queryRow<TaskRow>`SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE id = ${req.id}::uuid`;
    if (!row) throw APIError.notFound("task not found");
    return { task: parseTask(row) };
  }
);

// Internal getTask for service-to-service calls (no auth required)
export const getTaskInternal = api(
  { method: "POST", path: "/tasks/get-internal", expose: false },
  async (req: GetTaskRequest): Promise<GetTaskResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");
    const row = await db.queryRow<TaskRow>`SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE id = ${req.id}::uuid`;
    if (!row) throw APIError.notFound("task not found");
    return { task: parseTask(row) };
  }
);

interface ListTasksRequest {
  repo?: string;
  status?: TaskStatus;
  source?: TaskSource;
  labels?: string[];
  priority?: number;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}

interface ListTasksResponse {
  tasks: Task[];
  total: number;
}

export const listTasks = api(
  { method: "POST", path: "/tasks/list", expose: true, auth: true },
  async (req: ListTasksRequest): Promise<ListTasksResponse> => {
    const limit = Math.min(req.limit ?? 50, 100);
    const offset = req.offset ?? 0;

    // Build query with filters
    // We need separate queries for count and data due to Encore template literal constraints
    let tasks: Task[] = [];
    let total = 0;

    if (req.repo && req.status && req.source) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE repo = ${req.repo} AND status = ${req.status} AND source = ${req.source}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE repo = ${req.repo} AND status = ${req.status} AND source = ${req.source}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else if (req.repo && req.status) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE repo = ${req.repo} AND status = ${req.status}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE repo = ${req.repo} AND status = ${req.status}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else if (req.repo && req.source) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE repo = ${req.repo} AND source = ${req.source}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE repo = ${req.repo} AND source = ${req.source}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else if (req.status && req.source) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE status = ${req.status} AND source = ${req.source}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE status = ${req.status} AND source = ${req.source}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else if (req.repo) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE repo = ${req.repo}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE repo = ${req.repo}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else if (req.status) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE status = ${req.status}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE status = ${req.status}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else if (req.source) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE source = ${req.source}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE source = ${req.source}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else if (req.priority) {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks WHERE priority = ${req.priority}
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE priority = ${req.priority}
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    } else {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM tasks
      `;
      total = countRow?.count ?? 0;
      const rows = db.query<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks
        ORDER BY COALESCE(planned_order, 999999), priority, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) tasks.push(parseTask(row));
    }

    // Post-filter by labels if specified (in-memory, since TEXT[] matching is complex)
    if (req.labels && req.labels.length > 0) {
      tasks = tasks.filter(t =>
        req.labels!.some(label => t.labels.includes(label))
      );
    }

    // Post-filter by assignedTo if specified
    if (req.assignedTo) {
      tasks = tasks.filter(t => t.assignedTo === req.assignedTo);
    }

    return { tasks, total };
  }
);

// --- Linear Sync ---

interface SyncLinearRequest {
  labels?: string[];
}

interface SyncLinearResponse {
  created: number;
  updated: number;
  unchanged: number;
}

export const syncLinear = api(
  { method: "POST", path: "/tasks/sync-linear", expose: true, auth: true },
  async (req: SyncLinearRequest): Promise<SyncLinearResponse> => {
    // 1. Get tasks from Linear
    const linearResult = await linear.getAssignedTasks();
    const linearTasks = linearResult.tasks;

    // Optionally filter by labels
    const filtered = req.labels && req.labels.length > 0
      ? linearTasks.filter(lt => lt.labels.some(l => req.labels!.includes(l)))
      : linearTasks;

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const lt of filtered) {
      // Check if this Linear task already exists in TheFold
      const existing = await db.queryRow<TaskRow>`
        SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE linear_task_id = ${lt.id}
      `;

      if (!existing) {
        // New task — create it
        const mapLinearStatus = (state: string): TaskStatus => {
          const lower = state.toLowerCase();
          if (lower === "done" || lower === "completed") return "done";
          if (lower === "in progress" || lower === "started") return "in_progress";
          if (lower === "in review") return "in_review";
          if (lower === "blocked" || lower === "cancelled" || lower === "canceled") return "blocked";
          return "backlog";
        };

        await db.exec`
          INSERT INTO tasks (title, description, labels, priority, source, linear_task_id, linear_synced_at, status)
          VALUES (
            ${lt.title},
            ${lt.description || null},
            ${lt.labels}::text[],
            ${lt.priority || 3},
            'linear',
            ${lt.id},
            NOW(),
            ${mapLinearStatus(lt.state)}
          )
        `;
        created++;
      } else {
        // Existing task — check if anything changed
        const titleChanged = existing.title !== lt.title;
        const descChanged = existing.description !== (lt.description || null);

        if (titleChanged || descChanged) {
          await db.exec`
            UPDATE tasks SET
              title = ${lt.title},
              description = ${lt.description || null},
              linear_synced_at = NOW(),
              updated_at = NOW()
            WHERE linear_task_id = ${lt.id}
          `;
          updated++;
        } else {
          // Just update sync timestamp
          await db.exec`
            UPDATE tasks SET linear_synced_at = NOW() WHERE linear_task_id = ${lt.id}
          `;
          unchanged++;
        }
      }
    }

    // Publish sync event
    await taskEvents.publish({
      taskId: "sync",
      action: "synced",
      repo: null,
      source: "linear",
      timestamp: new Date().toISOString(),
    });

    return { created, updated, unchanged };
  }
);

interface PushToLinearRequest {
  taskIds?: string[];
}

interface PushToLinearResponse {
  pushed: number;
  failed: number;
}

export const pushToLinear = api(
  { method: "POST", path: "/tasks/push-to-linear", expose: true, auth: true },
  async (req: PushToLinearRequest): Promise<PushToLinearResponse> => {
    let pushed = 0;
    let failed = 0;

    // Get tasks with linear_task_id that need to be synced
    const rows = req.taskIds && req.taskIds.length > 0
      ? db.query<TaskRow>`SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE linear_task_id IS NOT NULL AND id = ANY(${req.taskIds}::uuid[])`
      : db.query<TaskRow>`SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks WHERE linear_task_id IS NOT NULL`;

    for await (const row of rows) {
      const task = parseTask(row);
      if (!task.linearTaskId) continue;

      try {
        // Map TheFold status to Linear state
        const statusToLinearState: Record<TaskStatus, string> = {
          backlog: "Backlog",
          planned: "Todo",
          in_progress: "In Progress",
          in_review: "In Review",
          done: "Done",
          blocked: "Cancelled",
        };

        await linear.updateTask({
          taskId: task.linearTaskId,
          state: statusToLinearState[task.status],
          comment: task.prUrl ? `PR: ${task.prUrl}` : undefined,
        });

        await db.exec`
          UPDATE tasks SET linear_synced_at = NOW() WHERE id = ${task.id}::uuid
        `;

        pushed++;
      } catch {
        failed++;
      }
    }

    return { pushed, failed };
  }
);

// --- Task Planning (AI-powered) ---

interface PlanOrderRequest {
  repo: string;
}

interface PlanOrderResponse {
  planned: number;
  tasks: Array<{ id: string; plannedOrder: number; estimatedComplexity: number; reasoning: string }>;
}

export const planOrder = api(
  { method: "POST", path: "/tasks/plan-order", expose: true, auth: true },
  async (req: PlanOrderRequest): Promise<PlanOrderResponse> => {
    if (!req.repo) throw APIError.invalidArgument("repo is required");

    // Get backlog and planned tasks for this repo
    const taskList: Task[] = [];
    const rows = db.query<TaskRow>`
      SELECT id, title, description, repo, status, priority, labels::text[] as labels, phase, depends_on::text[] as depends_on, source, linear_task_id, linear_synced_at, healing_source_id, estimated_complexity, estimated_tokens, planned_order, assigned_to, build_job_id, pr_url, review_id, created_by, created_at, updated_at, completed_at FROM tasks
      WHERE repo = ${req.repo} AND status IN ('backlog', 'planned')
      ORDER BY priority, created_at
    `;
    for await (const row of rows) {
      taskList.push(parseTask(row));
    }

    if (taskList.length === 0) {
      return { planned: 0, tasks: [] };
    }

    // Call AI to plan task order
    const result = await ai.planTaskOrder({
      tasks: taskList.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        labels: t.labels,
        dependsOn: t.dependsOn,
      })),
      repo: req.repo,
    });

    // Update tasks with planned order and estimated complexity
    for (const ordered of result.orderedTasks) {
      await db.exec`
        UPDATE tasks SET
          planned_order = ${ordered.plannedOrder},
          estimated_complexity = ${ordered.estimatedComplexity},
          status = 'planned',
          updated_at = NOW()
        WHERE id = ${ordered.id}::uuid
      `;
    }

    return {
      planned: result.orderedTasks.length,
      tasks: result.orderedTasks,
    };
  }
);

// --- Statistics ---

interface StatsResponse {
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byRepo: Record<string, number>;
}

export const getStats = api(
  { method: "GET", path: "/tasks/stats", expose: true, auth: true },
  async (): Promise<StatsResponse> => {
    const totalRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM tasks
    `;

    const byStatus: Record<string, number> = {};
    const statusRows = db.query<{ status: string; count: number }>`
      SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status
    `;
    for await (const row of statusRows) {
      byStatus[row.status] = row.count;
    }

    const bySource: Record<string, number> = {};
    const sourceRows = db.query<{ source: string; count: number }>`
      SELECT source, COUNT(*)::int AS count FROM tasks GROUP BY source
    `;
    for await (const row of sourceRows) {
      bySource[row.source] = row.count;
    }

    const byRepo: Record<string, number> = {};
    const repoRows = db.query<{ repo: string; count: number }>`
      SELECT COALESCE(repo, 'unassigned') AS repo, COUNT(*)::int AS count FROM tasks GROUP BY repo
    `;
    for await (const row of repoRows) {
      byRepo[row.repo] = row.count;
    }

    return {
      total: totalRow?.count ?? 0,
      byStatus,
      bySource,
      byRepo,
    };
  }
);

// --- Internal: Update task from agent ---

interface UpdateTaskStatusRequest {
  id: string;
  status: TaskStatus;
  prUrl?: string;
  reviewId?: string;
}

export const updateTaskStatus = api(
  { method: "POST", path: "/tasks/update-status", expose: false },
  async (req: UpdateTaskStatusRequest): Promise<{ success: boolean }> => {
    await db.exec`
      UPDATE tasks SET
        status = ${req.status},
        pr_url = COALESCE(${req.prUrl ?? null}, pr_url),
        review_id = COALESCE(${req.reviewId ?? null}::uuid, review_id),
        completed_at = ${req.status === "done" ? new Date() : null},
        updated_at = NOW()
      WHERE id = ${req.id}::uuid
    `;

    let action: TaskEvent["action"] = "updated";
    if (req.status === "in_progress") action = "started";
    else if (req.status === "done") action = "completed";
    else if (req.status === "blocked") action = "blocked";

    const row = await db.queryRow<{ repo: string | null; source: string }>`
      SELECT repo, source FROM tasks WHERE id = ${req.id}::uuid
    `;

    if (row) {
      await taskEvents.publish({
        taskId: req.id,
        action,
        repo: row.repo,
        source: row.source as TaskSource,
        timestamp: new Date().toISOString(),
      });
    }

    return { success: true };
  }
);

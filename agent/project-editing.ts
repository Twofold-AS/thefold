// --- Project-task editing endpoints (Fase D, Commits 23–26) ---
// Internal endpoints for mutating individual tasks inside an active
// project_plan. Called from the tools under ai/tools/project/.
//
// These endpoints edit a SINGLE task in an existing plan; they do NOT create
// new plans and do NOT interact with the supersede mechanism from Commit 4.
// The plan stays the same, only its constituent tasks change.

import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { db } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function assertPlanActive(planId: string): Promise<void> {
  const row = await db.queryRow<{ status: string; superseded_by_project_id: string | null }>`
    SELECT status, superseded_by_project_id
    FROM project_plans
    WHERE id = ${planId}::uuid
  `;
  if (!row) throw APIError.notFound("plan not found");
  if (row.superseded_by_project_id) {
    throw APIError.failedPrecondition("plan is superseded");
  }
  if (row.status === "completed" || row.status === "failed") {
    throw APIError.failedPrecondition(`plan is ${row.status}`);
  }
}

async function assertTaskPending(taskId: string): Promise<{
  id: string;
  project_id: string;
  status: string;
  phase: number;
}> {
  const row = await db.queryRow<{
    id: string;
    project_id: string;
    status: string;
    phase: number;
  }>`
    SELECT id, project_id, status, phase
    FROM project_tasks
    WHERE id = ${taskId}::uuid
  `;
  if (!row) throw APIError.notFound("task not found");
  if (row.status !== "pending") {
    throw APIError.failedPrecondition(
      `task has status '${row.status}' — only 'pending' tasks can be edited`,
    );
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit 23 — add task to plan
// ─────────────────────────────────────────────────────────────────────────────

interface AddTaskRequest {
  planId: string;
  phaseIndex: number;
  title: string;
  description: string;
  dependsOn?: string[];
}

interface AddTaskResponse {
  taskId: string;
  title: string;
  phaseIndex: number;
  taskOrder: number;
}

export const addTaskToPlan = api(
  { method: "POST", path: "/agent/project/add-task", expose: false },
  async (req: AddTaskRequest): Promise<AddTaskResponse> => {
    await assertPlanActive(req.planId);

    // Compute next task_order = max(existing in phase) + 1
    const lastOrder = await db.queryRow<{ max_order: number | null }>`
      SELECT MAX(task_order) as max_order
      FROM project_tasks
      WHERE project_id = ${req.planId}::uuid AND phase = ${req.phaseIndex}
    `;
    const nextOrder = (lastOrder?.max_order ?? -1) + 1;

    const deps = req.dependsOn ?? [];

    const inserted = await db.queryRow<{ id: string }>`
      INSERT INTO project_tasks (
        project_id, phase, task_order, title, description,
        depends_on, status
      ) VALUES (
        ${req.planId}::uuid,
        ${req.phaseIndex},
        ${nextOrder},
        ${req.title},
        ${req.description},
        ${deps}::uuid[],
        'pending'
      )
      RETURNING id
    `;
    if (!inserted) throw APIError.internal("failed to insert task");

    // Keep total_tasks counter in sync
    await db.exec`
      UPDATE project_plans
      SET total_tasks = total_tasks + 1, updated_at = NOW()
      WHERE id = ${req.planId}::uuid
    `;

    log.info("project task added", {
      planId: req.planId,
      taskId: inserted.id,
      phase: req.phaseIndex,
      order: nextOrder,
    });

    return {
      taskId: inserted.id,
      title: req.title,
      phaseIndex: req.phaseIndex,
      taskOrder: nextOrder,
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Commit 24 — edit task
// ─────────────────────────────────────────────────────────────────────────────

interface EditTaskRequest {
  taskId: string;
  title?: string;
  description?: string;
  dependsOn?: string[];
}

interface EditTaskResponse {
  taskId: string;
  updated: string[];
}

export const editProjectTask = api(
  { method: "POST", path: "/agent/project/edit-task", expose: false },
  async (req: EditTaskRequest): Promise<EditTaskResponse> => {
    const task = await assertTaskPending(req.taskId);
    const updated: string[] = [];

    if (typeof req.title === "string" && req.title.trim().length > 0) {
      await db.exec`
        UPDATE project_tasks SET title = ${req.title} WHERE id = ${task.id}::uuid
      `;
      updated.push("title");
    }
    if (typeof req.description === "string" && req.description.trim().length > 0) {
      await db.exec`
        UPDATE project_tasks SET description = ${req.description} WHERE id = ${task.id}::uuid
      `;
      updated.push("description");
    }
    if (Array.isArray(req.dependsOn)) {
      await db.exec`
        UPDATE project_tasks SET depends_on = ${req.dependsOn}::uuid[]
        WHERE id = ${task.id}::uuid
      `;
      updated.push("dependsOn");
    }

    if (updated.length === 0) {
      throw APIError.invalidArgument("no changes supplied");
    }

    log.info("project task edited", { taskId: task.id, fields: updated });
    return { taskId: task.id, updated };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Commit 25 — reorder tasks within a phase
// ─────────────────────────────────────────────────────────────────────────────

interface ReorderTasksRequest {
  planId: string;
  phaseIndex: number;
  /** Task IDs in the desired new order (pending tasks only) */
  newOrder: string[];
}

interface ReorderTasksResponse {
  planId: string;
  phaseIndex: number;
  reordered: number;
  pinnedTasks: Array<{ id: string; status: string; order: number }>;
}

export const reorderProjectTasks = api(
  { method: "POST", path: "/agent/project/reorder-tasks", expose: false },
  async (req: ReorderTasksRequest): Promise<ReorderTasksResponse> => {
    await assertPlanActive(req.planId);

    // Fetch all tasks in the phase
    const rows = await db.query<{ id: string; status: string; task_order: number }>`
      SELECT id, status, task_order
      FROM project_tasks
      WHERE project_id = ${req.planId}::uuid AND phase = ${req.phaseIndex}
      ORDER BY task_order ASC
    `;

    const all: Array<{ id: string; status: string; order: number }> = [];
    for await (const r of rows) {
      all.push({ id: r.id, status: r.status, order: r.task_order });
    }

    const pendingById = new Map(
      all.filter((t) => t.status === "pending").map((t) => [t.id, t]),
    );
    const pinned = all.filter((t) => t.status !== "pending");

    // Validate: every ID in newOrder must be a pending task in this phase
    const unknown = req.newOrder.filter((id) => !pendingById.has(id));
    if (unknown.length > 0) {
      throw APIError.invalidArgument(
        `unknown or non-pending task IDs: ${unknown.join(", ")}`,
      );
    }
    // Missing pending IDs aren't allowed — the caller must provide the full
    // ordering of pending tasks so we know exactly where to place each one.
    if (req.newOrder.length !== pendingById.size) {
      throw APIError.invalidArgument(
        `newOrder must include all ${pendingById.size} pending tasks in phase ${req.phaseIndex} (got ${req.newOrder.length})`,
      );
    }

    // Assign new order numbers. Pinned tasks keep their current order;
    // pending tasks fill the remaining slots in the caller's supplied order.
    const pinnedOrders = new Set(pinned.map((t) => t.order));
    let cursor = 0;
    const updates: Array<{ id: string; order: number }> = [];
    for (const id of req.newOrder) {
      while (pinnedOrders.has(cursor)) cursor++;
      updates.push({ id, order: cursor });
      cursor++;
    }

    // Two-phase rewrite to avoid unique-index collisions (none exists on
    // task_order today, but the sequence future-proofs the change).
    await db.exec`
      UPDATE project_tasks
      SET task_order = -1 * (task_order + 1)
      WHERE id = ANY(${req.newOrder}::uuid[])
    `;
    for (const u of updates) {
      await db.exec`
        UPDATE project_tasks SET task_order = ${u.order}
        WHERE id = ${u.id}::uuid
      `;
    }

    log.info("project tasks reordered", {
      planId: req.planId,
      phase: req.phaseIndex,
      reordered: updates.length,
      pinned: pinned.length,
    });

    return {
      planId: req.planId,
      phaseIndex: req.phaseIndex,
      reordered: updates.length,
      pinnedTasks: pinned,
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Commit 26 — remove task
// ─────────────────────────────────────────────────────────────────────────────

interface RemoveTaskRequest {
  taskId: string;
  reason: string;
}

interface RemoveTaskResponse {
  taskId: string;
  removed: boolean;
  dependents?: Array<{ id: string; title: string }>;
}

export const removeProjectTask = api(
  { method: "POST", path: "/agent/project/remove-task", expose: false },
  async (req: RemoveTaskRequest): Promise<RemoveTaskResponse> => {
    const task = await assertTaskPending(req.taskId);

    // Block removal if other tasks depend on this one — caller must resolve
    // the graph first (edit_task or remove_task on the dependents).
    const dependents: Array<{ id: string; title: string }> = [];
    const depRows = await db.query<{ id: string; title: string }>`
      SELECT id, title
      FROM project_tasks
      WHERE project_id = ${task.project_id}::uuid
        AND ${task.id}::uuid = ANY(depends_on)
    `;
    for await (const r of depRows) {
      dependents.push({ id: r.id, title: r.title });
    }
    if (dependents.length > 0) {
      return {
        taskId: task.id,
        removed: false,
        dependents,
      };
    }

    await db.exec`
      DELETE FROM project_tasks WHERE id = ${task.id}::uuid
    `;

    // Keep total_tasks counter in sync
    await db.exec`
      UPDATE project_plans
      SET total_tasks = GREATEST(0, total_tasks - 1), updated_at = NOW()
      WHERE id = ${task.project_id}::uuid
    `;

    log.info("project task removed", {
      taskId: task.id,
      planId: task.project_id,
      reason: req.reason,
    });

    return { taskId: task.id, removed: true };
  },
);

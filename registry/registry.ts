import { api, APIError } from "encore.dev/api";
import { Topic, Subscription } from "encore.dev/pubsub";
import { db } from "./db";
import { tasks } from "~encore/clients";
import type {
  Component,
  ComponentFile,
  HealingEvent,
  RegisterComponentRequest,
  GetComponentRequest,
  ListComponentsRequest,
  SearchComponentsRequest,
  UseComponentRequest,
  FindForTaskRequest,
  TriggerHealingRequest,
  HealingStatusRequest,
  HealingNotification,
} from "./types";

// --- Pub/Sub ---

export const healingEvents = new Topic<HealingNotification>("healing-events", {
  deliveryGuarantee: "at-least-once",
});

// --- Helpers ---

function parseComponent(row: Record<string, unknown>): Component {
  const files = typeof row.files === "string" ? JSON.parse(row.files) : row.files;
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    category: (row.category as Component["category"]) ?? null,
    version: (row.version as string) ?? "1.0.0",
    previousVersionId: (row.previous_version_id as string) ?? null,
    files: files as ComponentFile[],
    entryPoint: (row.entry_point as string) ?? null,
    dependencies: (row.dependencies as string[]) ?? [],
    sourceRepo: row.source_repo as string,
    sourceTaskId: (row.source_task_id as string) ?? null,
    extractedBy: (row.extracted_by as string) ?? "thefold",
    usedByRepos: (row.used_by_repos as string[]) ?? [],
    timesUsed: (row.times_used as number) ?? 0,
    testCoverage: (row.test_coverage as number) ?? null,
    validationStatus: (row.validation_status as Component["validationStatus"]) ?? "pending",
    tags: (row.tags as string[]) ?? [],
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function parseHealingEvent(row: Record<string, unknown>): HealingEvent {
  return {
    id: row.id as string,
    componentId: row.component_id as string,
    oldVersion: (row.old_version as string) ?? null,
    newVersion: (row.new_version as string) ?? null,
    trigger: row.trigger as HealingEvent["trigger"],
    severity: (row.severity as HealingEvent["severity"]) ?? "normal",
    affectedRepos: (row.affected_repos as string[]) ?? [],
    tasksCreated: (row.tasks_created as string[]) ?? [],
    status: (row.status as HealingEvent["status"]) ?? "pending",
    createdAt: (row.created_at as Date).toISOString(),
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
  };
}

// ============================================
// CRUD Endpoints
// ============================================

// POST /registry/register — Register a new component (internal)
export const register = api(
  { method: "POST", path: "/registry/register", expose: false },
  async (req: RegisterComponentRequest): Promise<{ component: Component }> => {
    if (!req.name || req.name.trim().length === 0) {
      throw APIError.invalidArgument("name is required");
    }
    if (!req.files || req.files.length === 0) {
      throw APIError.invalidArgument("files are required");
    }
    if (!req.sourceRepo || req.sourceRepo.trim().length === 0) {
      throw APIError.invalidArgument("sourceRepo is required");
    }

    const filesJson = JSON.stringify(req.files);
    const deps = req.dependencies ?? [];
    const tags = req.tags ?? [];

    const row = await db.queryRow`
      INSERT INTO components (
        name, description, category, version, previous_version_id,
        files, entry_point, dependencies, source_repo, source_task_id,
        extracted_by, tags
      )
      VALUES (
        ${req.name.trim()}, ${req.description ?? null}, ${req.category ?? null},
        ${req.version ?? "1.0.0"}, ${req.previousVersionId ?? null},
        ${filesJson}::jsonb, ${req.entryPoint ?? null}, ${deps}::text[],
        ${req.sourceRepo.trim()}, ${req.sourceTaskId ?? null},
        ${req.extractedBy ?? "thefold"}, ${tags}::text[]
      )
      RETURNING *
    `;

    if (!row) throw APIError.internal("failed to register component");
    return { component: parseComponent(row) };
  }
);

// GET /registry/get — Get component by ID
export const get = api(
  { method: "GET", path: "/registry/get", expose: true, auth: true },
  async (req: GetComponentRequest): Promise<{ component: Component }> => {
    const row = await db.queryRow`
      SELECT * FROM components WHERE id = ${req.id}::uuid
    `;
    if (!row) throw APIError.notFound("component not found");
    return { component: parseComponent(row) };
  }
);

// POST /registry/list — List components with filters
export const list = api(
  { method: "POST", path: "/registry/list", expose: true, auth: true },
  async (req: ListComponentsRequest): Promise<{ components: Component[]; total: number }> => {
    const limit = req.limit ?? 50;
    const offset = req.offset ?? 0;
    const categoryFilter = req.category ?? null;
    const repoFilter = req.sourceRepo ?? null;

    const countRow = await db.queryRow`
      SELECT COUNT(*)::int as count FROM components
      WHERE (${categoryFilter}::text IS NULL OR category = ${categoryFilter})
        AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
    `;

    const rows = await db.query`
      SELECT * FROM components
      WHERE (${categoryFilter}::text IS NULL OR category = ${categoryFilter})
        AND (${repoFilter}::text IS NULL OR source_repo = ${repoFilter})
      ORDER BY times_used DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const components: Component[] = [];
    for await (const row of rows) {
      components.push(parseComponent(row));
    }

    return { components, total: (countRow?.count as number) ?? 0 };
  }
);

// POST /registry/search — Search components by query
export const search = api(
  { method: "POST", path: "/registry/search", expose: true, auth: true },
  async (req: SearchComponentsRequest): Promise<{ components: Component[] }> => {
    if (!req.query || req.query.trim().length === 0) {
      return { components: [] };
    }

    const limit = req.limit ?? 10;
    const queryPattern = `%${req.query.trim().toLowerCase()}%`;
    const categoryFilter = req.category ?? null;

    const rows = await db.query`
      SELECT * FROM components
      WHERE (
        LOWER(name) LIKE ${queryPattern}
        OR LOWER(COALESCE(description, '')) LIKE ${queryPattern}
        OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE LOWER(t) LIKE ${queryPattern})
      )
      AND (${categoryFilter}::text IS NULL OR category = ${categoryFilter})
      ORDER BY times_used DESC, created_at DESC
      LIMIT ${limit}
    `;

    const components: Component[] = [];
    for await (const row of rows) {
      components.push(parseComponent(row));
    }

    return { components };
  }
);

// ============================================
// Usage Endpoints
// ============================================

// POST /registry/use — Mark that a repo uses a component (internal)
export const use = api(
  { method: "POST", path: "/registry/use", expose: false },
  async (req: UseComponentRequest): Promise<{ success: boolean }> => {
    // Add repo to used_by_repos if not already present, increment times_used
    await db.exec`
      UPDATE components
      SET
        used_by_repos = CASE
          WHEN ${req.repo} = ANY(used_by_repos) THEN used_by_repos
          ELSE array_append(used_by_repos, ${req.repo})
        END,
        times_used = times_used + 1,
        updated_at = NOW()
      WHERE id = ${req.componentId}::uuid
    `;
    return { success: true };
  }
);

// POST /registry/use-component — Exposed wrapper for frontend marketplace
export const useComponent = api(
  { method: "POST", path: "/registry/use-component", expose: true, auth: true },
  async (req: UseComponentRequest): Promise<{ success: boolean }> => {
    if (!req.componentId || req.componentId.trim().length === 0) {
      throw APIError.invalidArgument("componentId is required");
    }
    if (!req.repo || req.repo.trim().length === 0) {
      throw APIError.invalidArgument("repo is required");
    }

    const exists = await db.queryRow`
      SELECT id FROM components WHERE id = ${req.componentId}::uuid
    `;
    if (!exists) throw APIError.notFound("component not found");

    await db.exec`
      UPDATE components
      SET
        used_by_repos = CASE
          WHEN ${req.repo} = ANY(used_by_repos) THEN used_by_repos
          ELSE array_append(used_by_repos, ${req.repo})
        END,
        times_used = times_used + 1,
        updated_at = NOW()
      WHERE id = ${req.componentId}::uuid
    `;
    return { success: true };
  }
);

// POST /registry/find-for-task — AI-assisted: find components for a task
export const findForTask = api(
  { method: "POST", path: "/registry/find-for-task", expose: false },
  async (req: FindForTaskRequest): Promise<{ components: Component[] }> => {
    const limit = req.limit ?? 5;

    // Simple keyword search on component name/description/tags
    // In the future, this will use memory.searchPatterns() for semantic matching
    const queryPattern = `%${req.taskDescription.trim().toLowerCase().substring(0, 100)}%`;

    const rows = await db.query`
      SELECT * FROM components
      WHERE validation_status != 'failed'
        AND (
          LOWER(name) LIKE ${queryPattern}
          OR LOWER(COALESCE(description, '')) LIKE ${queryPattern}
          OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE LOWER(t) LIKE ${queryPattern})
        )
      ORDER BY times_used DESC, created_at DESC
      LIMIT ${limit}
    `;

    const components: Component[] = [];
    for await (const row of rows) {
      components.push(parseComponent(row));
    }

    return { components };
  }
);

// ============================================
// Healing Endpoints
// ============================================

// POST /registry/trigger-healing — Trigger healing pipeline for a component
export const triggerHealing = api(
  { method: "POST", path: "/registry/trigger-healing", expose: false },
  async (req: TriggerHealingRequest): Promise<{ healingEventId: string; tasksCreated: number }> => {
    // 1. Get component
    const component = await db.queryRow`
      SELECT * FROM components WHERE id = ${req.componentId}::uuid
    `;
    if (!component) throw APIError.notFound("component not found");

    const parsed = parseComponent(component);
    const affectedRepos = parsed.usedByRepos;

    if (affectedRepos.length === 0) {
      // No repos to heal, but still record the event
      const eventRow = await db.queryRow`
        INSERT INTO healing_events (
          component_id, old_version, new_version, trigger, severity,
          affected_repos, tasks_created, status
        )
        VALUES (
          ${req.componentId}::uuid, ${parsed.version}, ${req.newVersion ?? null},
          ${req.trigger}, ${req.severity ?? "normal"},
          '{}'::text[], '{}'::uuid[], 'completed'
        )
        RETURNING id
      `;
      return { healingEventId: eventRow?.id as string, tasksCreated: 0 };
    }

    // 2. Create healing tasks for each affected repo
    const taskIds: string[] = [];
    for (const repo of affectedRepos) {
      try {
        const result = await tasks.createTask({
          title: `Healing: oppdater ${parsed.name} i ${repo}`,
          description: `Komponent "${parsed.name}" har blitt oppdatert (${req.trigger}). Severity: ${req.severity ?? "normal"}. Oppdater til versjon ${req.newVersion ?? "latest"}.`,
          repo,
          labels: ["healing", parsed.name],
          priority: req.severity === "critical" ? 1 : req.severity === "high" ? 2 : 3,
          source: "healing",
        });
        taskIds.push(result.task.id);
      } catch {
        // Continue — log failure but don't stop the pipeline
      }
    }

    // 3. Create healing event
    const eventRow = await db.queryRow`
      INSERT INTO healing_events (
        component_id, old_version, new_version, trigger, severity,
        affected_repos, tasks_created, status
      )
      VALUES (
        ${req.componentId}::uuid, ${parsed.version}, ${req.newVersion ?? null},
        ${req.trigger}, ${req.severity ?? "normal"},
        ${affectedRepos}::text[], ${taskIds}::uuid[], 'in_progress'
      )
      RETURNING id
    `;

    // 4. Update component version if provided
    if (req.newVersion) {
      await db.exec`
        UPDATE components SET version = ${req.newVersion}, updated_at = NOW()
        WHERE id = ${req.componentId}::uuid
      `;
    }

    // 5. Publish notification
    const healingEventId = eventRow?.id as string;
    await healingEvents.publish({
      componentId: req.componentId,
      componentName: parsed.name,
      severity: req.severity ?? "normal",
      affectedRepos,
      tasksCreated: taskIds.length,
    });

    return { healingEventId, tasksCreated: taskIds.length };
  }
);

// GET /registry/healing-status — Status for healing events
export const healingStatus = api(
  { method: "GET", path: "/registry/healing-status", expose: true, auth: true },
  async (req: HealingStatusRequest): Promise<{ events: HealingEvent[]; total: number }> => {
    const limit = req.limit ?? 20;
    const componentFilter = req.componentId ?? null;
    const statusFilter = req.status ?? null;

    const countRow = await db.queryRow`
      SELECT COUNT(*)::int as count FROM healing_events
      WHERE (${componentFilter}::uuid IS NULL OR component_id = ${componentFilter}::uuid)
        AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
    `;

    const rows = await db.query`
      SELECT * FROM healing_events
      WHERE (${componentFilter}::uuid IS NULL OR component_id = ${componentFilter}::uuid)
        AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const events: HealingEvent[] = [];
    for await (const row of rows) {
      events.push(parseHealingEvent(row));
    }

    return { events, total: (countRow?.count as number) ?? 0 };
  }
);

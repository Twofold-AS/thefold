// agent/task-log.ts
//
// Task Execution Log — persists agent events per task so the UI can render
// a full retrospective timeline after a run. Two surfaces:
//
//   1. startEventPersistence(taskId, userEmail) — subscribes to the in-memory
//      agentEventBus, mirrors audit-worthy events into `agent_task_events`
//      as they fire. Called from startTask() in agent.ts. stopEventPersistence
//      is called at task completion / failure to tear down.
//
//   2. GET /agent/task-log/:taskId — returns task metadata + chronological
//      event list + derived summary. Auth-gated by owner_email.

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { agentEventBus } from "./event-bus";
import type { AgentEvent } from "./events";

// --- DB ---

export const agentDb = SQLDatabase.named("agent");

// --- Persistence subscriber ---

/**
 * Event-types we mirror into the DB. Heartbeats + mid-stream deltas are
 * excluded to keep the table focused on audit-worthy milestones.
 */
const PERSISTED_EVENT_TYPES = new Set<string>([
  "agent.status",
  "agent.tool_use",
  "agent.tool_result",
  "agent.tool_error",
  "agent.thinking",
  "agent.error",
  "agent.done",
  "agent.progress",
  "agent.skills_active",
  "subagent.started",
  "subagent.progress",
  "subagent.status_change",
  "subagent.completed",
]);

const activeSubscriptions = new Map<string, () => void>();

/**
 * Start mirroring events for this taskId into agent_task_events. Idempotent:
 * calling twice for the same taskId replaces the previous subscription.
 */
export function startEventPersistence(taskId: string, userEmail: string): void {
  // Clear any previous subscriber for safety.
  const prev = activeSubscriptions.get(taskId);
  if (prev) prev();

  const unsubscribe = agentEventBus.subscribe(taskId, (event: AgentEvent) => {
    if (!PERSISTED_EVENT_TYPES.has(event.type)) return;
    persistEvent(taskId, userEmail, event).catch((err) => {
      log.warn("task-log: persist failed (non-critical)", {
        taskId,
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
  activeSubscriptions.set(taskId, unsubscribe);
  log.info("task-log: persistence started", { taskId });
}

/**
 * Stop mirroring for this taskId. Called at task completion / failure /
 * cancellation. Safe to call even if no subscription exists.
 */
export function stopEventPersistence(taskId: string): void {
  const unsub = activeSubscriptions.get(taskId);
  if (unsub) {
    unsub();
    activeSubscriptions.delete(taskId);
    log.info("task-log: persistence stopped", { taskId });
  }
}

/**
 * Write a single event row. Extracts `phase`, `tool_name`, `sub_agent_role`
 * from the payload when present so those are queryable without JSONB digs.
 */
async function persistEvent(taskId: string, userEmail: string, event: AgentEvent): Promise<void> {
  const payload = event.data as unknown as Record<string, unknown>;
  const phase = typeof payload.phase === "string" ? payload.phase : null;
  const toolName = typeof payload.toolName === "string" ? payload.toolName : null;
  const subAgentRole = typeof payload.role === "string" ? payload.role : null;
  await agentDb.exec`
    INSERT INTO agent_task_events (task_id, user_email, event_type, phase, tool_name, sub_agent_role, payload, created_at)
    VALUES (${taskId}, ${userEmail}, ${event.type}, ${phase}, ${toolName}, ${subAgentRole}, ${JSON.stringify(payload)}::jsonb, ${event.timestamp}::timestamptz)
  `;
}

// --- Read endpoint ---

interface TaskLogEvent {
  id: string;
  taskId: string;
  timestamp: string;
  type: string;
  phase: string | null;
  toolName: string | null;
  subAgentRole: string | null;
  payload: Record<string, unknown>;
}

interface TaskLogSummary {
  totalToolCalls: number;
  totalTokens: { input: number; output: number };
  totalCost: number;
  subAgentsUsed: string[];
  filesWritten: string[];
  validationResults: Record<string, unknown> | null;
}

interface TaskLogTaskMeta {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

interface GetTaskLogResponse {
  task: TaskLogTaskMeta;
  events: TaskLogEvent[];
  summary: TaskLogSummary;
}

/**
 * Return the full execution log for a task. Auth-gated: only the owner may
 * read. Task metadata comes from the tasks-service (via ~encore/clients);
 * events come from our local `agent_task_events`.
 */
export const getTaskLog = api(
  { method: "GET", path: "/agent/task-log/:taskId", expose: true, auth: true },
  async (req: { taskId: string }): Promise<GetTaskLogResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    // Fetch task metadata. Tasks service may not have every task (e.g. Linear-
    // sourced tasks) but for our UI the ones we render via AgentStream are
    // always in the local tasks table.
    const { tasks } = await import("~encore/clients");
    let taskMeta: TaskLogTaskMeta;
    try {
      const t = await tasks.getTaskInternal({ id: req.taskId });
      const row = t.task;
      taskMeta = {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        status: row.status,
        createdAt: row.createdAt ?? null,
        completedAt: row.completedAt ?? null,
        durationMs:
          row.createdAt && row.completedAt
            ? new Date(row.completedAt).getTime() - new Date(row.createdAt).getTime()
            : null,
      };
    } catch (err) {
      // Soft-fail: return a stub meta so the timeline still loads.
      log.warn("task-log: task metadata lookup failed", {
        taskId: req.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
      taskMeta = {
        id: req.taskId,
        title: "(task metadata unavailable)",
        description: "",
        status: "unknown",
        createdAt: null,
        completedAt: null,
        durationMs: null,
      };
    }

    // Load events. Filter on user_email for auth.
    const events: TaskLogEvent[] = [];
    const rows = agentDb.query<{
      id: string;
      task_id: string;
      event_type: string;
      phase: string | null;
      tool_name: string | null;
      sub_agent_role: string | null;
      payload: Record<string, unknown> | string;
      created_at: Date;
    }>`
      SELECT id, task_id, event_type, phase, tool_name, sub_agent_role, payload, created_at
      FROM agent_task_events
      WHERE task_id = ${req.taskId}
        AND user_email = ${auth.email}
      ORDER BY created_at ASC
    `;
    for await (const r of rows) {
      const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      events.push({
        id: r.id,
        taskId: r.task_id,
        timestamp: r.created_at.toISOString(),
        type: r.event_type,
        phase: r.phase,
        toolName: r.tool_name,
        subAgentRole: r.sub_agent_role,
        payload,
      });
    }

    // Derive summary from events + the final agent.done payload when present.
    const summary = deriveSummary(events);

    return { task: taskMeta, events, summary };
  },
);

function deriveSummary(events: TaskLogEvent[]): TaskLogSummary {
  const s: TaskLogSummary = {
    totalToolCalls: 0,
    totalTokens: { input: 0, output: 0 },
    totalCost: 0,
    subAgentsUsed: [],
    filesWritten: [],
    validationResults: null,
  };
  const subAgents = new Set<string>();
  for (const e of events) {
    if (e.type === "agent.tool_use") s.totalToolCalls += 1;
    if (e.subAgentRole) subAgents.add(e.subAgentRole);
    if (e.type === "agent.done") {
      const p = e.payload as Record<string, unknown>;
      if (typeof p.totalInputTokens === "number") s.totalTokens.input = p.totalInputTokens;
      if (typeof p.totalOutputTokens === "number") s.totalTokens.output = p.totalOutputTokens;
      if (typeof p.costUsd === "number") s.totalCost = p.costUsd;
      if (Array.isArray(p.filesChanged)) s.filesWritten = p.filesChanged.filter((x): x is string => typeof x === "string");
    }
    if (e.type === "agent.tool_result" && e.toolName === "build_validate") {
      try {
        const payload = e.payload as Record<string, unknown>;
        s.validationResults = payload;
      } catch {
        // non-critical
      }
    }
  }
  s.subAgentsUsed = [...subAgents];
  return s;
}

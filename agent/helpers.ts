import log from "encore.dev/log";
import { github, linear, sandbox, tasks } from "~encore/clients";
import { agentReports } from "../chat/events";
import { checkPermission as _checkPermission, type PermissionContext, type PermissionResult } from "./permissions";
import {
  serializeMessage,
  buildStatusMessage,
  buildThoughtMessage,
  buildReportMessage,
  buildClarificationMessage,
  type StepInfo,
  type StatusMeta,
  type AgentProgress,
  type ProgressStep,
  serializeProgress,
  useNewContract,
} from "./messages";
import type { AgentPhase } from "./state-machine";
import type { AgentExecutionContext } from "./types";
import { db } from "./db";

// Re-export circuit breakers (already in own file)
export { aiBreaker, githubBreaker, sandboxBreaker } from "./circuit-breaker";

// --- Constants ---

// REPO_OWNER and REPO_NAME removed — must come from AgentExecutionContext, never hardcoded
export const MAX_RETRIES = 5;
export const MAX_PLAN_REVISIONS = 2;

// --- Fixed phase titles for reportSteps ---

const PHASE_TITLES: Record<string, string> = {
  Forbereder: "Forbereder",
  Analyserer: "Analyserer",
  Planlegger: "Planlegger",
  Bygger: "Bygger kode",
  Reviewer: "Reviewer kode",
  Utfører: "Jobber med oppgave",
  Venter: "Trenger avklaring",
  Ferdig: "Oppgave fullført",
  Feilet: "Feil oppstod",
  Stopped: "Oppgave stoppet",
};

// --- Audit Logging ---

export interface AuditOptions {
  sessionId: string;
  actionType: string;
  details?: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
  confidenceScore?: number;
  taskId?: string;
  repoName?: string;
  durationMs?: number;
}

export async function audit(opts: AuditOptions) {
  await db.exec`
    INSERT INTO agent_audit_log (session_id, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms)
    VALUES (
      ${opts.sessionId},
      ${opts.actionType},
      ${JSON.stringify(opts.details || {})}::jsonb,
      ${opts.success ?? null},
      ${opts.errorMessage ?? null},
      ${opts.confidenceScore ?? null},
      ${opts.taskId ?? null},
      ${opts.repoName ?? null},
      ${opts.durationMs ?? null}
    )
  `;
}

// --- Helper: Report progress to chat ---

export async function report(
  ctx: AgentExecutionContext,
  content: string,
  status: "working" | "completed" | "failed" | "needs_input",
  extra?: { prUrl?: string; filesChanged?: string[] }
) {
  const msg = buildReportMessage(content, status, extra);
  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: serializeMessage(msg),
    status,
    prUrl: extra?.prUrl,
    filesChanged: extra?.filesChanged,
  });
}

// --- Helper: Report structured steps to chat (for live AgentStatus) ---

export async function reportSteps(
  ctx: AgentExecutionContext,
  phase: string,
  steps: Array<{ label: string; status: "active" | "done" | "error" | "info" }>,
  extra?: { title?: string; planProgress?: { current: number; total: number }; tasks?: Array<{ id: string; title: string; status: string }>; questions?: string[] }
) {
  // Use fixed phase title if no explicit title or plan progress, preventing title/content duplication
  const title = extra?.planProgress
    ? `Utfører plan ${extra.planProgress.current}/${extra.planProgress.total}`
    : extra?.title || PHASE_TITLES[phase] || phase;

  // Build clarification message if questions are present
  if (extra?.questions && extra.questions.length > 0) {
    const clarificationMsg = buildClarificationMessage(
      (phase as AgentPhase) || "needs_input",
      extra.questions,
      steps as StepInfo[],
    );
    await agentReports.publish({
      conversationId: ctx.conversationId,
      taskId: ctx.taskId,
      content: serializeMessage(clarificationMsg),
      status: "needs_input",
    });
    return;
  }

  const meta: StatusMeta = {
    title,
    planProgress: extra?.planProgress,
    activeTasks: extra?.tasks,
  };

  const statusMsg = buildStatusMessage(phase as AgentPhase || "building", steps as StepInfo[], meta);

  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: serializeMessage(statusMsg),
    status: phase === "Ferdig" ? "completed" : phase === "Feilet" ? "failed" : "working",
  });
}

// --- Helper: Publish a thought to chat (lightweight, non-blocking feed) ---

export async function think(ctx: AgentExecutionContext, thought: string) {
  const msg = buildThoughtMessage(thought);
  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: serializeMessage(msg),
    status: "working",
  });
}

// --- Helper: Report progress using new AgentProgress contract (Z-project) ---

export async function reportProgress(
  ctx: AgentExecutionContext,
  progress: AgentProgress,
): Promise<void> {
  if (!ctx.conversationId) return;

  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: serializeProgress(progress),
    status: progress.status === "done" ? "completed"
          : progress.status === "failed" ? "failed"
          : progress.status === "waiting" ? "needs_input"
          : "working",
  });
}

// --- Helper: Build the accumulated step list from context ---

export function buildSteps(ctx: AgentExecutionContext): ProgressStep[] {
  return ctx.progressSteps || [];
}

// --- Helper: Add or update a step in the context's progress step list ---

export function addStep(ctx: AgentExecutionContext, step: ProgressStep): void {
  if (!ctx.progressSteps) ctx.progressSteps = [];
  const existing = ctx.progressSteps.findIndex(s => s.id === step.id);
  if (existing >= 0) {
    ctx.progressSteps[existing] = step;
  } else {
    ctx.progressSteps.push(step);
  }
}

// --- Helper: Time an operation and audit it ---

export async function auditedStep<T>(
  ctx: AgentExecutionContext,
  actionType: string,
  details: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await audit({
      sessionId: ctx.conversationId,
      actionType,
      details,
      success: true,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await audit({
      sessionId: ctx.conversationId,
      actionType,
      details,
      success: false,
      errorMessage: errorMsg,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

// --- Helper: Update Linear only if task exists in Linear (skip local tasks) ---

export async function updateLinearIfExists(ctx: AgentExecutionContext, comment: string, state?: string) {
  // If thefoldTaskId matches taskId, it's a local task — skip Linear
  if (ctx.thefoldTaskId && ctx.thefoldTaskId === ctx.taskId) {
    return;
  }

  try {
    await linear.updateTask({
      taskId: ctx.taskId,
      ...(state ? { state } : {}),
      comment,
    });
  } catch (e) {
    log.warn("Linear update failed (task may not exist in Linear)", { error: String(e) });
    // Don't crash — Linear update is optional
  }
}

// --- Cancel Check ---

export async function checkCancelled(ctx: AgentExecutionContext, activeSandboxId?: string): Promise<boolean> {
  try {
    const result = await tasks.isCancelled({ taskId: ctx.taskId });
    if (result.cancelled) {
      await report(ctx, "Oppgaven ble avbrutt av bruker.", "failed");
      // Destroy sandbox if active
      if (activeSandboxId) {
        await sandbox.destroy({ sandboxId: activeSandboxId }).catch(() => { /* Intentionally silent: sandbox may already be destroyed */ });
      }
      return true;
    }
  } catch (err) {
    // Tasks service may be unavailable — continue execution rather than blocking task
    log.warn("isCancelled check failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return false;
}

// --- shouldStopTask: Check actual DB status ---

const STOPPED_STATUSES = ["backlog", "blocked", "cancelled"];

export async function shouldStopTask(ctx: AgentExecutionContext, phase: string, activeSandboxId?: string): Promise<boolean> {
  // First check in-memory cancellation
  if (await checkCancelled(ctx, activeSandboxId)) return true;

  // Then check actual DB status if we have a thefold task ID
  const taskId = ctx.thefoldTaskId || ctx.taskId;
  try {
    const taskResult = await tasks.getTaskInternal({ id: taskId });
    const status = taskResult.task.status;

    if (STOPPED_STATUSES.includes(status)) {
      const reason = status === "backlog" ? "Oppgaven ble sendt tilbake til backlog"
        : status === "blocked" ? "Oppgaven ble blokkert"
        : "Oppgaven ble avbrutt";

      await reportSteps(ctx, "Stopped", [
        { label: reason, status: "error" },
      ], { title: "Oppgave stoppet" });

      await audit({
        sessionId: ctx.conversationId,
        actionType: "task_externally_modified",
        details: {
          taskId,
          expectedStatus: "in_progress",
          actualStatus: status,
          agentPhase: phase,
        },
        success: false,
        errorMessage: reason,
        taskId: ctx.taskId,
        repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      });

      if (activeSandboxId) {
        await sandbox.destroy({ sandboxId: activeSandboxId }).catch(() => { /* Intentionally silent: sandbox may already be destroyed */ });
      }
      return true;
    }

    // Also check "done" — if someone else already completed it
    if (status === "done") {
      await reportSteps(ctx, "Stopped", [
        { label: "Oppgaven er allerede fullført", status: "info" },
      ], { title: "Oppgave stoppet" });
      return true;
    }
  } catch {
    // Task might not exist in tasks-service (Linear-only) — continue
  }
  return false;
}

// --- Permission Layer (D15) ---

/**
 * Re-export checkPermission from permissions.ts for use by agent modules.
 * Wraps the function to keep the import surface clean.
 */
export async function checkPermission(
  action: string,
  ctx: PermissionContext,
): Promise<PermissionResult> {
  return _checkPermission(action, ctx);
}

// --- GitHub scope validation (ASI02) ---

/**
 * Validates that a GitHub operation targets the repo bound to this agent context.
 * Throws if owner or repo mismatch — hard block on cross-repo writes.
 * Also checks the repo_create_pr permission via the permission layer.
 */
export function validateAgentScope(ctx: AgentExecutionContext, owner: string, repo: string): void {
  if (owner !== ctx.repoOwner || repo !== ctx.repoName) {
    throw new Error(
      `Scope violation: agent bound to ${ctx.repoOwner}/${ctx.repoName}, tried ${owner}/${repo}`
    );
  }
  // Fire-and-forget permission check for observability (grunnmur — not blocking)
  _checkPermission("repo_create_pr", {
    repoOwner: owner,
    repoName: repo,
  }).catch((err) => {
    log.warn("validateAgentScope: permission check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// --- Auto-init for empty repos ---

export async function autoInitRepo(ctx: AgentExecutionContext): Promise<void> {
  const { githubBreaker } = await import("./circuit-breaker");
  const repoName = ctx.repoName;
  const repoOwner = ctx.repoOwner;

  // 0. Ensure the repo exists on GitHub — create if not found
  try {
    const ensureResult = await githubBreaker.call(() =>
      github.ensureRepoExists({
        owner: repoOwner,
        name: repoName,
        description: `Repository for ${repoName} — managed by TheFold`,
      })
    );
    if (ensureResult.created) {
      log.info("autoInitRepo: repo created on GitHub", { owner: repoOwner, repo: repoName });
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    log.warn("autoInitRepo: ensureRepoExists failed", { error: errorMsg });
    // Continue anyway — createPR will give a clear error if repo still doesn't exist
  }

  // No separate task — autoInitRepo is an internal step of the agent's main task
  await report(ctx, "Initialiserer repo med grunnfiler...", "working");

  // Create the init files and push via createPR
  const initFiles = [
    {
      path: "README.md",
      content: `# ${repoName}\n\nProject initialized by TheFold.\n`,
      action: "create" as const,
    },
    {
      path: ".gitignore",
      content: [
        "node_modules/",
        "dist/",
        ".next/",
        "*.log",
        ".env",
        ".env.local",
        ".DS_Store",
        "coverage/",
        ".turbo/",
        "",
      ].join("\n"),
      action: "create" as const,
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: repoName.toLowerCase(),
          version: "0.1.0",
          private: true,
          scripts: {
            build: "tsc",
            dev: "tsc --watch",
            test: "echo \"No tests yet\"",
          },
          dependencies: {},
          devDependencies: {
            typescript: "^5.4.0",
          },
        },
        null,
        2,
      ) + "\n",
      action: "create" as const,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "dist",
            rootDir: ".",
            declaration: true,
          },
          include: ["**/*.ts"],
          exclude: ["node_modules", "dist"],
        },
        null,
        2,
      ) + "\n",
      action: "create" as const,
    },
  ];

  await reportSteps(ctx, "Forbereder", [
    { label: "Initialiserer tomt repo", status: "active" },
  ], { title: "Initialiserer repo" });

  try {
    // Push init-filer DIREKTE til main via Contents API — IKKE via PR.
    // Dette gjør at main har init-filene FERDIG når agentens PR åpnes.
    for (const file of initFiles) {
      try {
        await githubBreaker.call(() =>
          github.createOrUpdateFile({
            owner: repoOwner,
            repo: repoName,
            path: file.path,
            content: file.content,
            message: `init: Add ${file.path}`,
            branch: "main",
          }),
        );
      } catch (fileErr) {
        // Filen kan allerede eksistere — ikke kritisk
        const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
        if (!msg.includes("422") && !msg.includes("already exists")) {
          log.warn("autoInitRepo: failed to push file", { path: file.path, error: msg });
        }
      }
    }

    await report(ctx, "Repo initialisert med grunnfiler", "working");
    await reportSteps(ctx, "Forbereder", [
      { label: "Repo initialisert", status: "done" },
    ], { title: "Repo initialisert" });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    log.warn("autoInitRepo: init failed, continuing anyway", { error: errorMsg });
    // Don't throw — let the original task continue (it may still work)
  }
}

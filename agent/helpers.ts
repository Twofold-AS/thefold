import log from "encore.dev/log";
import { github, linear, sandbox, tasks } from "~encore/clients";
import { agentReports } from "../chat/chat";
import {
  serializeMessage,
  buildStatusMessage,
  buildThoughtMessage,
  buildReportMessage,
  buildClarificationMessage,
  type StepInfo,
  type StatusMeta,
} from "./messages";
import type { AgentPhase } from "./state-machine";
import type { AgentExecutionContext } from "./types";
import { db } from "./db";

// Re-export circuit breakers (already in own file)
export { aiBreaker, githubBreaker, sandboxBreaker } from "./circuit-breaker";

// --- Constants ---

export const REPO_OWNER = "Twofold-AS";
export const REPO_NAME = "thefold";
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

// --- GitHub scope validation (ASI02) ---

/**
 * Validates that a GitHub operation targets the repo bound to this agent context.
 * Throws if owner or repo mismatch — hard block on cross-repo writes.
 */
export function validateAgentScope(ctx: AgentExecutionContext, owner: string, repo: string): void {
  if (owner !== ctx.repoOwner || repo !== ctx.repoName) {
    throw new Error(
      `Scope violation: agent bound to ${ctx.repoOwner}/${ctx.repoName}, tried ${owner}/${repo}`
    );
  }
}

// --- Auto-init for empty repos ---

export async function autoInitRepo(ctx: AgentExecutionContext): Promise<void> {
  const { githubBreaker } = await import("./circuit-breaker");
  const repoName = ctx.repoName;
  const repoOwner = ctx.repoOwner;

  // 1. Create a visible init task
  const initTask = await tasks.createTask({
    title: `Initialiser repo: ${repoName}`,
    description: [
      `Automatisk opprettet av agenten fordi repoet ${repoOwner}/${repoName} var tomt.`,
      "",
      "Oppretter grunnleggende prosjektstruktur:",
      "- README.md med reponavn og beskrivelse",
      "- .gitignore for Node/TypeScript",
      "- package.json med grunnleggende oppsett",
      "- tsconfig.json med fornuftige defaults",
    ].join("\n"),
    repo: repoName,
    source: "chat",
    labels: ["auto-init"],
    priority: 1,
  });

  // 2. Mark as in_progress
  await tasks.updateTaskStatus({ id: initTask.task.id, status: "in_progress" });

  // 3. Create the init files and push via createPR
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

  // Report init task to AgentStatus
  await reportSteps(ctx, "Forbereder", [
    { label: "Initialiserer tomt repo", status: "active" },
  ], {
    title: "Initialiserer repo",
    tasks: [{ id: initTask.task.id, title: `Initialiser repo: ${repoName}`, status: "in_progress" }],
  });

  try {
    const pr = await githubBreaker.call(() =>
      github.createPR({
        owner: repoOwner,
        repo: repoName,
        branch: "init/project-setup",
        title: `Initialiser repo: ${repoName}`,
        body: [
          "## Automatisk repo-initialisering",
          "",
          "Opprettet av TheFold fordi repoet var tomt.",
          "",
          "**Filer:**",
          "- `README.md` — Prosjektbeskrivelse",
          "- `.gitignore` — Node/TypeScript ignores",
          "- `package.json` — Grunnleggende prosjektoppsett",
          "- `tsconfig.json` — TypeScript-konfigurasjon",
        ].join("\n"),
        files: initFiles,
      }),
    );

    // 4. Mark init task as done
    await tasks.updateTaskStatus({
      id: initTask.task.id,
      status: "done",
      prUrl: pr.url,
    });

    await reportSteps(ctx, "Forbereder", [
      { label: "Repo initialisert", status: "done" },
    ], {
      title: "Repo initialisert",
      tasks: [{ id: initTask.task.id, title: `Initialiser repo: ${repoName}`, status: "done" }],
    });
  } catch (e) {
    // Mark init task as blocked if it fails
    const errorMsg = e instanceof Error ? e.message : String(e);
    await tasks.updateTaskStatus({
      id: initTask.task.id,
      status: "blocked",
      errorMessage: `Auto-init feilet: ${errorMsg}`,
    });
    log.warn("autoInitRepo failed", { error: errorMsg });
    // Don't throw — let the original task continue (it may still work)
  }
}

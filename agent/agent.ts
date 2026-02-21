import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { github, linear, sandbox, users, tasks, mcp } from "~encore/clients";
import { agentReports } from "../chat/chat";
import { type ModelMode } from "../ai/router";
import type { AgentExecutionContext, CuratedContext } from "./types";
import { createStateMachine } from "./state-machine";
import { createPhaseTracker, savePhaseMetrics, getPhaseMetricsSummary, getTaskCostBreakdown } from "./metrics";
import type { PhaseMetricsSummary, TaskCostBreakdown } from "./metrics";
import { buildContext, filterForPhase, estimateTokens, type AgentContext } from "./context-builder";
import { assessAndRoute, type ConfidenceResult } from "./confidence";
import { executePlan, type ExecutionResult } from "./execution";
import { handleReview, type ReviewResult } from "./review-handler";
import { completeTask, type CompletionResult } from "./completion";

// --- Helpers (extracted in XK) ---
import {
  report, think, reportSteps, auditedStep, audit,
  shouldStopTask, checkCancelled, updateLinearIfExists, autoInitRepo,
  aiBreaker, githubBreaker, sandboxBreaker,
  REPO_OWNER, REPO_NAME, MAX_RETRIES, MAX_PLAN_REVISIONS,
  type AuditOptions,
} from "./helpers";
import { checkRateLimit, recordTaskStart } from "./rate-limiter";

// --- Database (shared) ---
import { db, acquireRepoLock, releaseRepoLock, createJob, startJob, updateJobCheckpoint, completeJob, failJob, findResumableJobs, expireOldJobs } from "./db";

// --- Secrets ---
const AgentPersistentJobs = secret("AgentPersistentJobs"); // "true" | "false"

// --- Types ---

export interface StartTaskRequest {
  conversationId: string;
  taskId: string;
  userMessage: string;
  userId?: string;
  modelOverride?: string;
  thefoldTaskId?: string;
  repoName?: string;
  repoOwner?: string;
}

export interface StartTaskResponse {
  status: "started" | "repo_locked";
  taskId: string;
}

type TaskContext = AgentExecutionContext;

export interface ExecuteTaskOptions {
  curatedContext?: CuratedContext;
  projectConventions?: string;
  skipLinear?: boolean;
  taskDescription?: string;
  collectOnly?: boolean;
  sandboxId?: string;
  forceContinue?: boolean;
  userClarification?: string;
  skipReview?: boolean;
}

export interface ExecuteTaskResult {
  success: boolean;
  prUrl?: string;
  filesChanged: string[];
  filesContent?: Array<{ path: string; content: string; action: string }>;
  costUsd: number;
  tokensUsed: number;
  errorMessage?: string;
  reviewId?: string;
  sandboxId?: string;
  status?: 'completed' | 'pending_review' | 'failed';
}

// --- Internal: Read task description from dual source (tasks service → Linear fallback) ---

interface TaskReadResult {
  taskTitle: string;
}

async function readTaskDescription(ctx: TaskContext, options?: ExecuteTaskOptions): Promise<TaskReadResult> {
  let taskTitle = ctx.taskId;

  if (ctx.thefoldTaskId) {
    await report(ctx, `Leser task fra TheFold...`, "working");
    const tfTask = await auditedStep(ctx, "task_read", { taskId: ctx.thefoldTaskId, source: "thefold" }, async () => {
      const result = await tasks.getTaskInternal({ id: ctx.thefoldTaskId! });
      ctx.taskDescription = result.task.title + (result.task.description ? "\n\n" + result.task.description : "");
      return result;
    });
    taskTitle = tfTask.task.title;
    await think(ctx, `Leser oppgaven... "${taskTitle}". La meg se.`);
    try { await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "in_progress" }); } catch { /* non-critical */ }
  } else if (!options?.skipLinear) {
    await report(ctx, `Leser task ${ctx.taskId}...`, "working");
    let taskFound = false;
    try {
      const localTask = await tasks.getTaskInternal({ id: ctx.taskId });
      if (localTask?.task) {
        ctx.taskDescription = localTask.task.title + (localTask.task.description ? "\n\n" + localTask.task.description : "");
        ctx.repoName = localTask.task.repo || ctx.repoName;
        taskTitle = localTask.task.title;
        taskFound = true;
        ctx.thefoldTaskId = ctx.taskId;
        try { await tasks.updateTaskStatus({ id: ctx.taskId, status: "in_progress" }); } catch { /* non-critical */ }
        await audit({ sessionId: ctx.conversationId, actionType: "task_read", details: { taskId: ctx.taskId, source: "thefold_tasks" }, success: true, taskId: ctx.taskId, repoName: `${ctx.repoOwner}/${ctx.repoName}` });
      }
    } catch { /* not in tasks service */ }

    if (!taskFound) {
      const taskDetail = await auditedStep(ctx, "task_read", { taskId: ctx.taskId, source: "linear" }, async () => {
        const detail = await linear.getTask({ taskId: ctx.taskId });
        ctx.taskDescription = detail.task.title + "\n\n" + detail.task.description;
        return detail;
      });
      taskTitle = taskDetail.task.title;
      await think(ctx, `Leser oppgaven... "${taskTitle}". La meg se.`);
    }
  } else if (options?.taskDescription) {
    ctx.taskDescription = options.taskDescription;
    taskTitle = ctx.taskDescription.split("\n")[0].substring(0, 80);
    await report(ctx, `Starter oppgave: ${taskTitle}`, "working");
    await think(ctx, `Leser oppgaven... "${taskTitle}". La meg se.`);
  }

  return { taskTitle };
}

// --- Internal: Handle task failure ---

async function handleTaskError(ctx: TaskContext, error: unknown, taskStart: number, tracker: ReturnType<typeof createPhaseTracker>, options?: ExecuteTaskOptions): Promise<ExecuteTaskResult> {
  const errorMsg = error instanceof Error ? error.message : String(error);

  if (ctx.jobId) {
    try { await savePhaseMetrics(ctx.jobId, ctx.taskId, tracker.getAll()); } catch { /* non-critical */ }
    await failJob(ctx.jobId, errorMsg.substring(0, 500)).catch(() => {});
  }

  await audit({
    sessionId: ctx.conversationId, actionType: "task_failed",
    details: { error: errorMsg, totalDurationMs: Date.now() - taskStart },
    success: false, errorMessage: errorMsg, taskId: ctx.taskId,
    repoName: `${ctx.repoOwner}/${ctx.repoName}`, durationMs: Date.now() - taskStart,
  });

  await report(ctx, `**Feil under arbeid med ${ctx.taskId}:**\n\`\`\`\n${errorMsg}\n\`\`\`\n\nJeg klarte ikke a fullfare denne oppgaven automatisk. Kan du hjelpe meg med mer kontekst, eller skal jeg prove en annen tilnarming?`, "failed");
  await reportSteps(ctx, "Feilet", [{ label: errorMsg.substring(0, 80), status: "error" }]);

  if (ctx.thefoldTaskId || ctx.taskId) {
    try { await tasks.updateTaskStatus({ id: ctx.thefoldTaskId || ctx.taskId, status: "blocked", errorMessage: errorMsg.substring(0, 500) }); } catch { /* non-critical */ }
  }
  if (!options?.skipLinear) {
    await updateLinearIfExists(ctx, `TheFold feilet på denne oppgaven: ${errorMsg}`);
  }

  return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: errorMsg };
}

// --- Internal: Set up curated context for orchestrator path ---

async function setupCuratedContext(ctx: TaskContext, options: ExecuteTaskOptions): Promise<{
  treeString: string; treeArray: string[]; packageJson: Record<string, unknown>;
  relevantFiles: Array<{ path: string; content: string }>; memoryStrings: string[]; docsStrings: string[]; taskTitle: string;
}> {
  const curated = options.curatedContext!;
  const relevantFiles = curated.relevantFiles;
  const memoryStrings = options.projectConventions
    ? [options.projectConventions, ...curated.memoryContext]
    : curated.memoryContext;
  const docsStrings = curated.docsContext;
  ctx.taskDescription = options.taskDescription || ctx.taskDescription;
  const taskTitle = ctx.taskDescription.split("\n")[0].substring(0, 80);

  let projectTree = await github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName });
  if (projectTree.empty) {
    await report(ctx, "Tomt repo oppdaget — initialiserer...", "working");
    await autoInitRepo(ctx);
    projectTree = await github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName });
  }

  try {
    const mcpResult = await mcp.installed();
    if (mcpResult.servers.length > 0) {
      const toolList = mcpResult.servers.map((s) => `- **${s.name}**: ${s.description ?? "No description"} (${s.category})`).join("\n");
      docsStrings.push(`[MCP Tools] Du har tilgang til disse verktøyene:\n${toolList}\n\nNOTE: MCP-kall routing er ikke implementert ennå. Bare vær klar over at disse verktøyene finnes.`);
    }
  } catch { /* non-critical */ }

  return { treeString: projectTree.treeString || "", treeArray: projectTree.tree, packageJson: projectTree.packageJson || {}, relevantFiles, memoryStrings, docsStrings, taskTitle };
}

// --- The Agent Loop ---

export async function executeTask(ctx: TaskContext, options?: ExecuteTaskOptions): Promise<ExecuteTaskResult> {
  const taskStart = Date.now();
  const useCurated = !!options?.curatedContext;
  const tracker = createPhaseTracker();
  tracker.start("preparing");
  const sm = createStateMachine(ctx.taskId);
  sm.transitionTo("preparing");
  ctx.phase = sm.current;

  let treeString = "", treeArray: string[] = [], memoryStrings: string[] = [], docsStrings: string[] = [];
  let relevantFiles: Array<{ path: string; content: string }> = [];
  let packageJson: Record<string, unknown> = {};
  let mcpTools: Array<{ name: string; description: string; serverName: string }> = [];
  let taskTitle = ctx.taskId;

  try {
    if (useCurated) {
      const curated = await setupCuratedContext(ctx, options!);
      treeString = curated.treeString; treeArray = curated.treeArray; packageJson = curated.packageJson;
      relevantFiles = curated.relevantFiles; memoryStrings = curated.memoryStrings; docsStrings = curated.docsStrings;
      taskTitle = curated.taskTitle;
      await report(ctx, `Starter oppgave: ${taskTitle}`, "working");
      sm.transitionTo("context"); ctx.phase = sm.current; tracker.start("context");
    } else {
      const taskRead = await readTaskDescription(ctx, options);
      taskTitle = taskRead.taskTitle;
      const ctxResult: AgentContext = await buildContext(ctx, tracker, { report, think, auditedStep, audit, autoInitRepo, githubBreaker, checkCancelled });
      treeString = ctxResult.treeString; treeArray = ctxResult.treeArray; packageJson = ctxResult.packageJson;
      relevantFiles = ctxResult.relevantFiles; memoryStrings = ctxResult.memoryStrings; docsStrings = ctxResult.docsStrings;
      mcpTools = ctxResult.mcpTools;
      sm.transitionTo("context"); ctx.phase = sm.current;
    }

    if (!useCurated) await think(ctx, "Kontekst hentet. Vurderer oppgaven...");

    if (await checkCancelled(ctx)) {
      sm.transitionTo("stopped"); ctx.phase = sm.current;
      return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "cancelled" };
    }

    // === STEP 4: Assess Confidence ===
    sm.transitionTo("confidence");
    ctx.phase = sm.current;

    // Filter context for confidence phase (YA: Phase-specific context filtering)
    const fullContext: AgentContext = { treeString, treeArray, packageJson, relevantFiles, memoryStrings, docsStrings, mcpTools };
    const fullTokens = estimateTokens(fullContext);
    const confidenceContext = filterForPhase(fullContext, "confidence");
    const filteredTokens = estimateTokens(confidenceContext);

    log.info("context filtered for phase", {
      phase: "confidence",
      fullTokens,
      filteredTokens,
      savedTokens: fullTokens - filteredTokens,
      savedPercent: Math.round((1 - filteredTokens / fullTokens) * 100),
    });

    const confidenceOutcome: ConfidenceResult = await assessAndRoute(
      ctx,
      confidenceContext,
      tracker,
      { report, think, reportSteps, auditedStep, audit },
      { forceContinue: options?.forceContinue, useCurated },
    );
    if (!confidenceOutcome.shouldContinue) {
      if (confidenceOutcome.pauseReason === "low_confidence") {
        sm.transitionTo("needs_input");
        ctx.phase = sm.current;
      }
      return confidenceOutcome.earlyReturn!;
    }

    // Cancel check before planning
    if (await checkCancelled(ctx)) {
      sm.transitionTo("stopped"); ctx.phase = sm.current;
      return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "cancelled" };
    }

    // === STEP 5-7 + retry loop ===
    sm.transitionTo("planning");
    ctx.phase = sm.current;

    // Filter context for planning phase (YA: Phase-specific context filtering)
    const planningContext = filterForPhase(fullContext, "planning");
    const planningTokens = estimateTokens(planningContext);

    log.info("context filtered for phase", {
      phase: "planning",
      fullTokens,
      filteredTokens: planningTokens,
      savedTokens: fullTokens - planningTokens,
      savedPercent: Math.round((1 - planningTokens / fullTokens) * 100),
    });

    const executionOutcome: ExecutionResult = await executePlan(
      ctx,
      planningContext,
      tracker,
      { report, think, reportSteps, auditedStep, audit, shouldStopTask, updateLinearIfExists, aiBreaker, sandboxBreaker },
      { sandboxId: options?.sandboxId },
    );

    if (executionOutcome.earlyReturn) {
      if (executionOutcome.earlyReturn.errorMessage === "stopped") {
        sm.transitionTo("stopped"); ctx.phase = sm.current;
      } else if (executionOutcome.earlyReturn.errorMessage === "impossible_task") {
        sm.transitionTo("failed"); ctx.phase = sm.current;
      }
      return executionOutcome.earlyReturn;
    }

    const allFiles = executionOutcome.filesChanged;
    const sandboxId = executionOutcome.sandboxId;

    // === collectOnly: return early with files — skip review/PR/cleanup ===
    if (options?.collectOnly) {
      await report(ctx, `Task fullført (${allFiles.length} filer) — samles for prosjekt-review`, "working");
      if (ctx.jobId) {
        try {
          tracker.end();
          await savePhaseMetrics(ctx.jobId, ctx.taskId, tracker.getAll());
        } catch { /* non-critical */ }
      }
      return {
        success: true,
        filesChanged: allFiles.map((f) => f.path),
        filesContent: allFiles,
        sandboxId,
        costUsd: ctx.totalCostUsd,
        tokensUsed: ctx.totalTokensUsed,
        status: 'completed',
      };
    }

    // === STEP 8-8.5: Review ===
    sm.transitionTo("reviewing");
    ctx.phase = sm.current;

    // Filter context for reviewing phase (YA: Phase-specific context filtering)
    const reviewingContext = filterForPhase(fullContext, "reviewing");
    const reviewingTokens = estimateTokens(reviewingContext);

    log.info("context filtered for phase", {
      phase: "reviewing",
      fullTokens,
      filteredTokens: reviewingTokens,
      savedTokens: fullTokens - reviewingTokens,
      savedPercent: Math.round((1 - reviewingTokens / fullTokens) * 100),
    });

    const reviewOutcome: ReviewResult = await handleReview(
      ctx,
      { allFiles, sandboxId, memoryStrings: reviewingContext.memoryStrings },
      tracker,
      { report, think, reportSteps, auditedStep, audit, shouldStopTask },
      { skipReview: options?.skipReview },
    );

    if (reviewOutcome.earlyReturn) {
      if (reviewOutcome.earlyReturn.errorMessage === "stopped") {
        sm.transitionTo("stopped"); ctx.phase = sm.current;
      }
      return reviewOutcome.earlyReturn;
    }

    if (reviewOutcome.shouldPause) {
      sm.transitionTo("pending_review"); ctx.phase = sm.current;
      return {
        success: true,
        reviewId: reviewOutcome.reviewId,
        status: "pending_review",
        filesChanged: allFiles.map((f) => f.path),
        costUsd: ctx.totalCostUsd,
        tokensUsed: ctx.totalTokensUsed,
      };
    }

    // === STEP 9-12: Completion (skipReview path) ===
    if (reviewOutcome.skipReview) {
      const completionOutcome: CompletionResult = await completeTask(
        ctx,
        {
          allFiles,
          sandboxId,
          documentation: reviewOutcome.documentation,
          memoriesExtracted: reviewOutcome.memoriesExtracted,
          memoryStrings,
        },
        tracker,
        { report, think, reportSteps, auditedStep, audit, updateLinearIfExists },
      );

      sm.transitionTo("completed"); ctx.phase = sm.current;
      return {
        success: completionOutcome.success,
        filesChanged: completionOutcome.filesChanged,
        costUsd: ctx.totalCostUsd,
        tokensUsed: ctx.totalTokensUsed,
        prUrl: completionOutcome.prUrl,
      };
    }

    // Persist metrics (fallthrough — shouldn't normally reach here)
    if (ctx.jobId) await savePhaseMetrics(ctx.jobId, ctx.taskId, tracker.getAll()).catch(() => {});
    if (ctx.jobId) await completeJob(ctx.jobId).catch(() => {});
    return { success: true, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed };

  } catch (error) {
    sm.transitionTo("failed"); ctx.phase = sm.current;
    tracker.end();
    return handleTaskError(ctx, error, taskStart, tracker, options);
  }
}

// --- Endpoints ---

export const startTask = api(
  { method: "POST", path: "/agent/start", expose: false },
  async (req: StartTaskRequest): Promise<StartTaskResponse> => {
    let modelMode: ModelMode = "auto";
    let subAgentsEnabled = false;
    if (req.userId) {
      try {
        const userInfo = await users.getUser({ userId: req.userId });
        const prefs = userInfo.preferences as Record<string, unknown>;
        if (prefs.modelMode && ["auto", "manual"].includes(prefs.modelMode as string)) {
          modelMode = prefs.modelMode as ModelMode;
        }
        if (prefs.subAgentsEnabled === true) {
          subAgentsEnabled = true;
        }
      } catch { /* default to auto */ }
    }

    // Rate limit check (ASI02): max 20 tasks/hour, 100/day per user
    if (req.userId) {
      const rateCheck = await checkRateLimit(req.userId);
      if (!rateCheck.allowed) {
        throw APIError.resourceExhausted(rateCheck.reason!);
      }
    }

    const ctx: TaskContext = {
      conversationId: req.conversationId,
      taskId: req.taskId,
      taskDescription: "",
      userMessage: req.userMessage,
      repoOwner: req.repoOwner || REPO_OWNER,
      repoName: req.repoName || REPO_NAME,
      branch: "main",
      thefoldTaskId: req.thefoldTaskId || req.taskId,
      modelMode,
      modelOverride: req.modelOverride,
      selectedModel: "claude-sonnet-4-5-20250929",
      totalCostUsd: 0,
      totalTokensUsed: 0,
      attemptHistory: [],
      errorPatterns: [],
      totalAttempts: 0,
      maxAttempts: MAX_RETRIES,
      planRevisions: 0,
      maxPlanRevisions: MAX_PLAN_REVISIONS,
      subAgentsEnabled,
    };

    // Acquire advisory lock
    const locked = await acquireRepoLock(ctx.repoOwner, ctx.repoName);
    if (!locked) {
      await agentReports.publish({
        conversationId: req.conversationId,
        taskId: req.taskId,
        content: `Repo ${ctx.repoOwner}/${ctx.repoName} er allerede låst av en annen oppgave. Vent til den er ferdig.`,
        status: "failed",
      });
      return { status: "repo_locked", taskId: req.taskId };
    }

    // Record rate limit usage after lock is acquired
    if (req.userId) {
      await recordTaskStart(req.userId).catch(() => { /* non-critical */ });
    }

    // Persistent job tracking
    let jobId: string | undefined;
    try {
      const persistentJobs = AgentPersistentJobs().toLowerCase() === "true";
      if (persistentJobs) {
        jobId = await createJob({
          taskId: req.taskId,
          conversationId: req.conversationId,
          repoOwner: ctx.repoOwner,
          repoName: ctx.repoName,
        });
        await startJob(jobId);
        ctx.jobId = jobId;
      }
    } catch { /* non-critical */ }

    // Fire and forget
    executeTask(ctx)
      .catch(() => {})
      .finally(() => releaseRepoLock(ctx.repoOwner, ctx.repoName));

    return { status: "started", taskId: req.taskId };
  }
);

// Manually trigger agent to pick up pending Linear tasks
export const checkPendingTasks = api(
  { method: "POST", path: "/agent/check", expose: true, auth: true },
  async (): Promise<{ tasksFound: number }> => {
    const linTasks = await linear.getAssignedTasks({});
    let started = 0;

    for (const task of linTasks.tasks) {
      if (task.labels.includes("thefold")) {
        await startTask({
          conversationId: `auto-${task.id}`,
          taskId: task.id,
          userMessage: "Auto-triggered from Linear",
        });
        started++;
      }
    }

    return { tasksFound: started };
  }
);

// --- Respond to clarification ---

export const respondToClarification = api(
  { method: "POST", path: "/agent/respond", expose: true, auth: true },
  async (req: { taskId: string; response: string; conversationId: string }): Promise<{ success: boolean }> => {
    try {
      await tasks.updateTaskStatus({ id: req.taskId, status: "in_progress" });
    } catch { /* non-critical */ }

    const taskResult = await tasks.getTaskInternal({ id: req.taskId });
    const task = taskResult.task;

    const ctx: TaskContext = {
      conversationId: req.conversationId,
      taskId: req.taskId,
      taskDescription: `${task.title}\n\n${task.description || ""}\n\n**Brukerens avklaring:** ${req.response}`,
      userMessage: req.response,
      repoOwner: REPO_OWNER,
      repoName: task.repo || REPO_NAME,
      branch: "main",
      thefoldTaskId: req.taskId,
      modelMode: "auto",
      selectedModel: "claude-sonnet-4-5-20250929",
      totalCostUsd: 0,
      totalTokensUsed: 0,
      attemptHistory: [],
      errorPatterns: [],
      totalAttempts: 0,
      maxAttempts: MAX_RETRIES,
      planRevisions: 0,
      maxPlanRevisions: MAX_PLAN_REVISIONS,
      subAgentsEnabled: false,
    };

    const repoOwner = ctx.repoOwner;
    const repoName = ctx.repoName;
    const locked = await acquireRepoLock(repoOwner, repoName);
    if (!locked) {
      await agentReports.publish({
        conversationId: req.conversationId,
        taskId: req.taskId,
        content: `Repo ${repoOwner}/${repoName} er allerede låst av en annen oppgave.`,
        status: "failed",
      });
      return { success: false };
    }

    executeTask(ctx)
      .catch(() => {})
      .finally(() => releaseRepoLock(repoOwner, repoName));

    return { success: true };
  }
);

// --- Force continue without clarification ---

export const forceContinue = api(
  { method: "POST", path: "/agent/force-continue", expose: true, auth: true },
  async (req: { taskId: string; conversationId: string }): Promise<{ success: boolean }> => {
    try {
      await tasks.updateTaskStatus({ id: req.taskId, status: "in_progress" });
    } catch { /* non-critical */ }

    const taskResult = await tasks.getTaskInternal({ id: req.taskId });
    const task = taskResult.task;

    const ctx: TaskContext = {
      conversationId: req.conversationId,
      taskId: req.taskId,
      taskDescription: task.title + (task.description ? "\n\n" + task.description : ""),
      userMessage: "Force continue — brukeren har valgt å fortsette uten avklaring",
      repoOwner: REPO_OWNER,
      repoName: task.repo || REPO_NAME,
      branch: "main",
      thefoldTaskId: req.taskId,
      modelMode: "auto",
      selectedModel: "claude-sonnet-4-5-20250929",
      totalCostUsd: 0,
      totalTokensUsed: 0,
      attemptHistory: [],
      errorPatterns: [],
      totalAttempts: 0,
      maxAttempts: MAX_RETRIES,
      planRevisions: 0,
      maxPlanRevisions: MAX_PLAN_REVISIONS,
      subAgentsEnabled: false,
    };

    const repoOwner = ctx.repoOwner;
    const repoName = ctx.repoName;
    const locked = await acquireRepoLock(repoOwner, repoName);
    if (!locked) {
      await agentReports.publish({
        conversationId: req.conversationId,
        taskId: req.taskId,
        content: `Repo ${repoOwner}/${repoName} er allerede låst av en annen oppgave.`,
        status: "failed",
      });
      return { success: false };
    }

    executeTask(ctx, { forceContinue: true, taskDescription: ctx.taskDescription })
      .catch(() => {})
      .finally(() => releaseRepoLock(repoOwner, repoName));

    return { success: true };
  }
);

// --- Agent Job Endpoints ---

export const cleanupExpiredJobs = api(
  { method: "POST", path: "/agent/jobs/cleanup", expose: false },
  async (): Promise<{ expired: number }> => {
    const count = await expireOldJobs();
    return { expired: count };
  }
);

const _agentJobsCleanupCron = new CronJob("agent-jobs-cleanup", {
  title: "Expire old agent jobs",
  every: "6h",
  endpoint: cleanupExpiredJobs,
});

export const checkStaleJobs = api(
  { method: "POST", path: "/agent/jobs/check-stale", expose: true, auth: true },
  async (): Promise<{ staleJobs: number; jobs: Array<{ id: string; taskId: string; phase: string | null }> }> => {
    const jobs = await findResumableJobs();
    if (jobs.length > 0) {
      for (const job of jobs) {
        await failJob(job.id, "Stale: process restarted before completion").catch(() => { /* non-critical */ });
      }
    }
    return {
      staleJobs: jobs.length,
      jobs: jobs.map(j => ({ id: j.id, taskId: j.taskId, phase: j.currentPhase })),
    };
  }
);

// --- Phase Metrics Endpoints ---

export const phaseMetrics = api(
  { method: "GET", path: "/agent/metrics/phases", expose: true, auth: true },
  async (req: { days?: number }): Promise<{ phases: PhaseMetricsSummary[] }> => {
    const phases = await getPhaseMetricsSummary(req.days || 7);
    return { phases };
  }
);

export const taskMetrics = api(
  { method: "POST", path: "/agent/metrics/task", expose: true, auth: true },
  async (req: { taskId: string }): Promise<{ breakdown: TaskCostBreakdown | null }> => {
    const breakdown = await getTaskCostBreakdown(req.taskId);
    return { breakdown };
  }
);

// --- Audit Log Query Endpoints ---

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  actionType: string;
  details: Record<string, unknown>;
  success: boolean | null;
  errorMessage: string | null;
  confidenceScore: number | null;
  taskId: string | null;
  repoName: string | null;
  durationMs: number | null;
}

interface AuditLogRow {
  id: string;
  session_id: string;
  timestamp: Date;
  action_type: string;
  details: Record<string, unknown>;
  success: boolean | null;
  error_message: string | null;
  confidence_score: number | null;
  task_id: string | null;
  repo_name: string | null;
  duration_ms: number | null;
}

function rowToAuditEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp.toISOString(),
    actionType: row.action_type,
    details: row.details,
    success: row.success,
    errorMessage: row.error_message,
    confidenceScore: row.confidence_score,
    taskId: row.task_id,
    repoName: row.repo_name,
    durationMs: row.duration_ms,
  };
}

interface ListAuditLogRequest {
  actionType?: string;
  taskId?: string;
  sessionId?: string;
  repoName?: string;
  successOnly?: boolean;
  failedOnly?: boolean;
  limit?: number;
  offset?: number;
}

interface ListAuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
}

export const listAuditLog = api(
  { method: "POST", path: "/agent/audit/list", expose: true, auth: true },
  async (req: ListAuditLogRequest): Promise<ListAuditLogResponse> => {
    const limit = Math.min(req.limit || 50, 200);
    const offset = req.offset || 0;

    const entries: AuditLogEntry[] = [];

    if (req.actionType) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE action_type = ${req.actionType}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) { entries.push(rowToAuditEntry(row)); }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE action_type = ${req.actionType}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.taskId) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE task_id = ${req.taskId}
        ORDER BY timestamp ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) { entries.push(rowToAuditEntry(row)); }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE task_id = ${req.taskId}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.sessionId) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE session_id = ${req.sessionId}
        ORDER BY timestamp ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) { entries.push(rowToAuditEntry(row)); }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE session_id = ${req.sessionId}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.repoName) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE repo_name = ${req.repoName}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) { entries.push(rowToAuditEntry(row)); }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE repo_name = ${req.repoName}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.failedOnly) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE success = FALSE
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) { entries.push(rowToAuditEntry(row)); }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE success = FALSE
      `;
      return { entries, total: countRow?.count || 0 };
    }

    // Default: return latest entries
    const rows = db.query<AuditLogRow>`
      SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
      FROM agent_audit_log
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    for await (const row of rows) { entries.push(rowToAuditEntry(row)); }
    const countRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM agent_audit_log
    `;
    return { entries, total: countRow?.count || 0 };
  }
);

interface GetTaskTraceRequest {
  taskId: string;
}

interface GetTaskTraceResponse {
  taskId: string;
  entries: AuditLogEntry[];
  summary: {
    totalSteps: number;
    totalDurationMs: number;
    successCount: number;
    failureCount: number;
    confidenceScore: number | null;
    outcome: "completed" | "failed" | "paused" | "in_progress";
  };
}

export const getTaskTrace = api(
  { method: "POST", path: "/agent/audit/trace", expose: true, auth: true },
  async (req: GetTaskTraceRequest): Promise<GetTaskTraceResponse> => {
    const entries: AuditLogEntry[] = [];

    const rows = db.query<AuditLogRow>`
      SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
      FROM agent_audit_log
      WHERE task_id = ${req.taskId}
      ORDER BY timestamp ASC
    `;
    for await (const row of rows) { entries.push(rowToAuditEntry(row)); }

    const successCount = entries.filter((e) => e.success === true).length;
    const failureCount = entries.filter((e) => e.success === false).length;

    const confidenceEntry = entries.find((e) => e.actionType === "confidence_details");
    const confidenceScore = confidenceEntry?.confidenceScore ?? null;

    let outcome: "completed" | "failed" | "paused" | "in_progress" = "in_progress";
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
      if (lastEntry.actionType === "task_completed") outcome = "completed";
      else if (lastEntry.actionType === "task_failed") outcome = "failed";
      else if (lastEntry.actionType === "task_paused_clarification" || lastEntry.actionType === "task_paused_breakdown") outcome = "paused";
    }

    let totalDurationMs = 0;
    if (entries.length >= 2) {
      const first = new Date(entries[0].timestamp).getTime();
      const last = new Date(entries[entries.length - 1].timestamp).getTime();
      totalDurationMs = last - first;
    }

    return {
      taskId: req.taskId,
      entries,
      summary: {
        totalSteps: entries.length,
        totalDurationMs,
        successCount,
        failureCount,
        confidenceScore,
        outcome,
      },
    };
  }
);

// Get audit log statistics
interface AuditStatsResponse {
  totalEntries: number;
  totalTasks: number;
  successRate: number;
  averageDurationMs: number;
  actionTypeCounts: Record<string, number>;
  recentFailures: AuditLogEntry[];
}

export const getAuditStats = api(
  { method: "POST", path: "/agent/audit/stats", expose: true, auth: true },
  async (): Promise<AuditStatsResponse> => {
    const totalRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM agent_audit_log
    `;

    const taskCountRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(DISTINCT task_id)::int AS count FROM agent_audit_log WHERE task_id IS NOT NULL
    `;

    const successRow = await db.queryRow<{ total: number; successes: number }>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success = TRUE)::int AS successes
      FROM agent_audit_log
      WHERE success IS NOT NULL
    `;

    const avgDurationRow = await db.queryRow<{ avg_ms: number }>`
      SELECT COALESCE(AVG(duration_ms), 0)::int AS avg_ms
      FROM agent_audit_log
      WHERE duration_ms IS NOT NULL
    `;

    const actionTypeCounts: Record<string, number> = {};
    const actionRows = db.query<{ action_type: string; count: number }>`
      SELECT action_type, COUNT(*)::int AS count
      FROM agent_audit_log
      GROUP BY action_type
      ORDER BY count DESC
    `;
    for await (const row of actionRows) {
      actionTypeCounts[row.action_type] = row.count;
    }

    const recentFailures: AuditLogEntry[] = [];
    const failRows = db.query<AuditLogRow>`
      SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
      FROM agent_audit_log
      WHERE success = FALSE
      ORDER BY timestamp DESC
      LIMIT 10
    `;
    for await (const row of failRows) {
      recentFailures.push(rowToAuditEntry(row));
    }

    const total = successRow?.total || 0;
    const successes = successRow?.successes || 0;

    return {
      totalEntries: totalRow?.count || 0,
      totalTasks: taskCountRow?.count || 0,
      successRate: total > 0 ? Math.round((successes / total) * 100) : 0,
      averageDurationMs: avgDurationRow?.avg_ms || 0,
      actionTypeCounts,
      recentFailures,
    };
  }
);

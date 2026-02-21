import log from "encore.dev/log";
import { ai, memory, sandbox, builder, tasks } from "~encore/clients";
import {
  planSubAgents,
  executeSubAgents,
  mergeResults,
  sumCosts,
  sumTokens,
} from "../ai/orchestrate-sub-agents";
import { updateJobCheckpoint } from "./db";
import { estimateTokens } from "./context-builder";
import type { AgentExecutionContext } from "./types";
import type { PhaseTracker } from "./metrics";
import type { BudgetMode } from "../ai/sub-agents";

// --- Types ---

/**
 * Kompakt kontekst for retry-forsøk (YB: Delta-kontekst i retries).
 * I stedet for å sende full context på nytt, sender vi kun delta.
 */
export interface RetryContext {
  /** 1-2 setningers oppsummering av oppgaven */
  taskSummary: string;

  /** Plan-steg som korte titler (ikke full content) */
  planSummary: string;

  /** KUN siste feilmelding — ikke alle previousErrors */
  latestError: string;

  /** KUN filer som endret seg mellom forsøk */
  changedFiles: Array<{
    path: string;
    /** Enkel diff: hva som ble endret. Ikke full filinnhold. */
    diff: string;
  }>;

  /** Diagnose-resultat fra ai.diagnoseFailure */
  diagnosis: {
    rootCause: string;
    reason?: string;
    suggestedAction?: string;
  };

  /** Forsøksnummer */
  attemptNumber: number;

  /** Total context-størrelse i estimerte tokens */
  estimatedTokens: number;
}

export interface ExecutionResult {
  success: boolean;
  filesChanged: Array<{ path: string; content: string; action: string }>;
  sandboxId: string;
  planSummary: string;
  costUsd: number;
  tokensUsed: number;
  errorMessage?: string;
  earlyReturn?: {
    success: boolean;
    filesChanged: string[];
    costUsd: number;
    tokensUsed: number;
    errorMessage: string;
  };
}

export interface ExecutionHelpers {
  report: (
    ctx: AgentExecutionContext,
    content: string,
    status: "working" | "completed" | "failed" | "needs_input",
    extra?: { prUrl?: string; filesChanged?: string[] }
  ) => Promise<void>;
  think: (ctx: AgentExecutionContext, thought: string) => Promise<void>;
  reportSteps: (
    ctx: AgentExecutionContext,
    phase: string,
    steps: Array<{ label: string; status: "active" | "done" | "error" | "info" }>,
    extra?: {
      title?: string;
      questions?: string[];
      planProgress?: { current: number; total: number };
      tasks?: Array<{ id: string; title: string; status: string }>;
    }
  ) => Promise<void>;
  auditedStep: <T>(
    ctx: AgentExecutionContext,
    action: string,
    details: Record<string, unknown>,
    fn: () => Promise<T>
  ) => Promise<T>;
  audit: (opts: {
    sessionId: string;
    actionType: string;
    details?: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
    confidenceScore?: number;
    taskId?: string;
    repoName?: string;
  }) => Promise<void>;
  shouldStopTask: (ctx: AgentExecutionContext, checkpoint: string, sandboxId?: string) => Promise<boolean>;
  updateLinearIfExists: (ctx: AgentExecutionContext, msg: string, status: string) => Promise<void>;
  aiBreaker: { call: <T>(fn: () => Promise<T>) => Promise<T> };
  sandboxBreaker: { call: <T>(fn: () => Promise<T>) => Promise<T> };
}

// --- Helper functions for YB (Delta-kontekst i retries) ---

/**
 * Enkel linje-basert diff mellom to strenger.
 * Returnerer kun endrede/nye/fjernede linjer, maks 500 tegn.
 */
export function computeSimpleDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const changes: string[] = [];

  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines && changes.length < 20; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === undefined && newLine !== undefined) {
      changes.push(`+${i + 1}: ${newLine}`);
    } else if (newLine === undefined && oldLine !== undefined) {
      changes.push(`-${i + 1}: ${oldLine}`);
    } else if (oldLine !== newLine) {
      changes.push(`~${i + 1}: ${newLine}`);
    }
  }

  if (changes.length === 0) return "[no changes detected]";

  const result = changes.join("\n");
  return result.length > 500 ? result.substring(0, 497) + "..." : result;
}

/**
 * Beregner delta-kontekst for retry.
 * Sammenligner nåværende genererte filer med forrige forsøk.
 */
export function computeRetryContext(
  ctx: AgentExecutionContext,
  currentFiles: Array<{ path: string; content: string }>,
  previousFiles: Array<{ path: string; content: string }>,
  planSummary: string,
  validationOutput: string,
  diagnosis: { rootCause: string; reason?: string; suggestedAction?: string },
): RetryContext {
  // 1. Kort oppgave-oppsummering (maks 200 tegn)
  const taskSummary = ctx.taskDescription.length > 200
    ? ctx.taskDescription.substring(0, 197) + "..."
    : ctx.taskDescription;

  // 2. Finn endrede filer
  const changedFiles: RetryContext["changedFiles"] = [];
  const prevMap = new Map(previousFiles.map(f => [f.path, f.content]));

  for (const file of currentFiles) {
    const prev = prevMap.get(file.path);
    if (!prev) {
      // Ny fil — inkluder kort sammendrag (ikke full content)
      changedFiles.push({
        path: file.path,
        diff: `[NEW FILE] ${file.content.substring(0, 500)}${file.content.length > 500 ? "..." : ""}`,
      });
    } else if (prev !== file.content) {
      // Endret fil — beregn enkel diff
      changedFiles.push({
        path: file.path,
        diff: computeSimpleDiff(prev, file.content),
      });
    }
    // Uendrede filer: IKKE inkludert (det er hele poenget)
  }

  // 3. Kun siste feilmelding (maks 1000 tegn)
  const latestError = validationOutput.length > 1000
    ? validationOutput.substring(0, 997) + "..."
    : validationOutput;

  const retryCtx: RetryContext = {
    taskSummary,
    planSummary,
    latestError,
    changedFiles,
    diagnosis,
    attemptNumber: ctx.totalAttempts,
    estimatedTokens: 0,
  };

  // Estimér token-størrelse
  const totalChars = taskSummary.length + planSummary.length + latestError.length
    + changedFiles.reduce((sum, f) => sum + f.path.length + f.diff.length, 0)
    + JSON.stringify(diagnosis).length;
  retryCtx.estimatedTokens = Math.ceil(totalChars / 4);

  return retryCtx;
}

/**
 * STEP 5-8(retry): Plan, build, validate, retry.
 *
 * Takes over from where confidence.ts ends.
 * Returns ExecutionResult with files, sandbox, and plan.
 * agent.ts handles review and completion (STEP 8+) after this.
 *
 * State machine transitions are NOT included here — they remain in agent.ts.
 * Early returns signal terminal outcomes via earlyReturn field.
 */
export async function executePlan(
  ctx: AgentExecutionContext,
  contextData: {
    treeString: string;
    treeArray: string[];
    relevantFiles: Array<{ path: string; content: string }>;
    memoryStrings: string[];
    docsStrings: string[];
  },
  tracker: PhaseTracker,
  helpers: ExecutionHelpers,
  options?: { sandboxId?: string },
): Promise<ExecutionResult> {
  const { report, think, reportSteps, auditedStep, audit, shouldStopTask, updateLinearIfExists, aiBreaker, sandboxBreaker } = helpers;
  const { treeString, relevantFiles, memoryStrings, docsStrings } = contextData;

  // === STEP 4.9: Fetch strategy hints (YE) ===
  log.info("STEP 4.9: Searching for similar strategies");
  let strategyHint = "";

  try {
    const strategies = await memory.search({
      query: ctx.taskDescription,
      limit: 3,
      memoryType: "strategy",
    });

    // Use top match if similarity > 0.3
    if (strategies.results.length > 0 && strategies.results[0].similarity > 0.3) {
      const topStrategy = strategies.results[0];
      strategyHint = `\n\n[STRATEGY HINT]\nSimilar task solved before (${(topStrategy.similarity * 100).toFixed(0)}% match):\n${topStrategy.content.substring(0, 800)}\n[END STRATEGY HINT]\n`;

      log.info("strategy hint found", {
        similarity: topStrategy.similarity,
        category: topStrategy.category,
        length: topStrategy.content.length,
      });

      await think(ctx, `Fant lignende oppgave løst før (${(topStrategy.similarity * 100).toFixed(0)}% match). Bruker som hint.`);
    } else {
      log.info("no relevant strategy found", { resultCount: strategies.results.length });
    }
  } catch (err) {
    // Non-critical — continue without strategy hint
    log.warn("strategy search failed", { error: err instanceof Error ? err.message : String(err) });
  }

  // === STEP 5: Plan the work ===
  log.info("STEP 5: Planning task");
  tracker.start("planning");

  await reportSteps(ctx, "Planlegger", [
    { label: "Planlegger arbeidet", status: "active" },
  ]);

  let plan = await auditedStep(ctx, "plan_created", {
    taskDescription: ctx.taskDescription.substring(0, 200),
    model: ctx.selectedModel,
  }, () => aiBreaker.call(() => ai.planTask({
    task: `${ctx.taskDescription}\n\nUser context: ${ctx.userMessage}${strategyHint}`,
    projectStructure: treeString,
    relevantFiles,
    memoryContext: memoryStrings,
    docsContext: docsStrings,
    model: ctx.selectedModel,
  })));

  ctx.totalCostUsd += plan.costUsd;
  ctx.totalTokensUsed += plan.tokensUsed;
  tracker.recordAICall({
    inputTokens: plan.tokensUsed || 0,
    outputTokens: 0,
    costEstimate: { totalCost: plan.costUsd || 0 },
    modelUsed: (plan as { modelUsed?: string }).modelUsed || ctx.selectedModel,
  });

  let planSummary = plan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
  const planStepCount = plan.plan.length;

  log.info("STEP 5: Plan created", { steps: planStepCount });
  await think(ctx, `Plan klar — ${planStepCount} steg.`);

  // TODO (Y-prosjekt fremtidig): Etter planning, bruk import-graf til å:
  // 1. Filtrere relevantFiles til KUN filer referert i plan-stegene
  // 2. Hente avhengigheter for nye filer planen vil opprette
  // Dette krever at buildImportGraph kjøres på plan-output, ikke bare på source.
  await reportSteps(ctx, "Planlegger", [
    { label: `Plan klar: ${planStepCount} steg`, status: "done" },
  ], { title: `Utfører plan 0/${planStepCount}`, planProgress: { current: 0, total: planStepCount } });

  // === STEP 5.5: Fetch error patterns from memory ===
  try {
    const errorPatternResults = await memory.search({
      query: `error pattern: ${ctx.taskDescription.substring(0, 200)}`,
      limit: 5,
      memoryType: "error_pattern",
    });
    ctx.errorPatterns = errorPatternResults.results.map((r) => ({
      pattern: r.content,
      frequency: r.accessCount,
      lastSeen: r.createdAt,
      knownFix: undefined,
    }));
  } catch {
    // Intentionally silent: error pattern search is optional, fallback to empty list
    ctx.errorPatterns = [];
  }

  // === STEP 5.6: Run sub-agents if enabled and complexity warrants it ===
  let subAgentContext = "";
  if (ctx.subAgentsEnabled) {
    const estimatedComplexity = Math.min(10, Math.max(1, plan.plan.length * 2));

    if (estimatedComplexity >= 5) {
      await report(ctx, "Sub-agenter aktivert — kjører spesialiserte AI-agenter parallelt...", "working");

      const budgetMode: BudgetMode = ctx.modelMode === "manual" ? "quality_first" : "balanced";
      const subPlanSummary = plan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
      const subPlan = planSubAgents(ctx.taskDescription, subPlanSummary, estimatedComplexity, budgetMode);

      if (subPlan.agents.length > 0) {
        await audit({
          sessionId: ctx.conversationId,
          actionType: "sub_agent_started",
          details: {
            agentCount: subPlan.agents.length,
            roles: subPlan.agents.map((a) => a.role),
            models: subPlan.agents.map((a) => a.model),
            complexity: estimatedComplexity,
            budgetMode,
          },
          success: true,
          taskId: ctx.taskId,
          repoName: `${ctx.repoOwner}/${ctx.repoName}`,
        });

        const subResults = await executeSubAgents(subPlan);
        const merged = await mergeResults(subResults, subPlan.mergeStrategy);

        ctx.subAgentResults = subResults;
        ctx.totalCostUsd += sumCosts(subResults);
        ctx.totalTokensUsed += sumTokens(subResults);
        subAgentContext = merged;

        const successCount = subResults.filter((r) => r.success).length;
        const failCount = subResults.filter((r) => !r.success).length;

        await audit({
          sessionId: ctx.conversationId,
          actionType: "sub_agent_completed",
          details: {
            results: subResults.map((r) => ({
              id: r.id,
              role: r.role,
              model: r.model,
              success: r.success,
              costUsd: r.costUsd,
              tokensUsed: r.tokensUsed,
              durationMs: r.durationMs,
              error: r.error,
            })),
            totalCostUsd: sumCosts(subResults),
            totalTokensUsed: sumTokens(subResults),
            successCount,
            failCount,
            mergeStrategy: subPlan.mergeStrategy,
          },
          success: true,
          taskId: ctx.taskId,
          repoName: `${ctx.repoOwner}/${ctx.repoName}`,
        });

        await report(
          ctx,
          `Sub-agenter ferdig: ${successCount}/${subResults.length} vellykket ($${sumCosts(subResults).toFixed(4)})`,
          "working"
        );
      }
    }
  }

  // Track plan progress
  let completedPlanSteps = 0;

  const planActiveTasks = plan.plan
    .filter((s: { filePath?: string }) => s.filePath)
    .map((s: { filePath?: string; action?: string; description: string }, i: number) => ({
      id: `plan-${i}`,
      title: `${s.filePath} (${s.action || "create"})`,
      status: "pending",
    }));

  await reportSteps(ctx, "Bygger", [
    { label: `Plan klar: ${planStepCount} steg`, status: "done" },
    { label: "Oppretter sandbox", status: "active" },
  ], {
    title: `Utfører plan ${completedPlanSteps}/${planStepCount}`,
    planProgress: { current: completedPlanSteps, total: planStepCount },
    tasks: planActiveTasks,
  });

  // Cancel/stop check before builder
  if (await shouldStopTask(ctx, "pre_sandbox")) {
    return {
      success: false,
      filesChanged: [],
      sandboxId: "",
      planSummary,
      costUsd: ctx.totalCostUsd,
      tokensUsed: ctx.totalTokensUsed,
      earlyReturn: { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "stopped" },
    };
  }

  // === STEP 6: Create sandbox (or reuse provided one) and execute plan via Builder ===
  log.info("STEP 6: Building in sandbox");
  tracker.start("building");

  const sandboxRef = options?.sandboxId
    ? { id: options.sandboxId }
    : await auditedStep(ctx, "sandbox_created", {
        repoOwner: ctx.repoOwner,
        repoName: ctx.repoName,
      }, () => sandboxBreaker.call(() => sandbox.create({ repoOwner: ctx.repoOwner, repoName: ctx.repoName })));

  // Checkpoint after sandbox creation
  if (ctx.jobId) {
    await updateJobCheckpoint(ctx.jobId, "building", {
      phase: "building",
      sandboxId: sandboxRef.id,
      attempt: ctx.totalAttempts,
    }).catch(() => { /* non-critical */ });
  }

  const allFiles: { path: string; content: string; action: string }[] = [];
  let lastError: string | null = null;
  const previousErrors: string[] = [];

  // YB: Track previous files for delta computation
  let previousFiles: Array<{ path: string; content: string }> = [];

  while (ctx.totalAttempts < ctx.maxAttempts) {
    // Cancel/stop check between retry attempts
    if (await shouldStopTask(ctx, "pre_builder", sandboxRef.id)) {
      return {
        success: false,
        filesChanged: allFiles,
        sandboxId: sandboxRef.id,
        planSummary,
        costUsd: ctx.totalCostUsd,
        tokensUsed: ctx.totalTokensUsed,
        earlyReturn: { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "stopped" },
      };
    }

    ctx.totalAttempts++;
    const attemptStart = Date.now();

    try {
      log.info("STEP 6: Builder running", { attempt: ctx.totalAttempts, maxAttempts: ctx.maxAttempts });
      await reportSteps(ctx, "Bygger", [
        { label: "Builder kjører", status: "active" },
        { label: `Forsøk ${ctx.totalAttempts}/${ctx.maxAttempts}`, status: "info" },
      ], {
        tasks: planActiveTasks.map((t: { id: string; title: string }) => ({
          ...t,
          status: "in_progress",
        })),
      });

      const buildResult = await auditedStep(ctx, "builder_executed", {
        taskId: ctx.taskId,
        sandboxId: sandboxRef.id,
        strategy: "auto",
        planSteps: plan.plan.length,
      }, () => {
        const enrichedDescription = subAgentContext
          ? `${ctx.taskDescription}\n\n## Sub-agent Analysis\n${subAgentContext}`
          : ctx.taskDescription;

        return aiBreaker.call(() => builder.start({
          taskId: ctx.taskId,
          sandboxId: sandboxRef.id,
          plan: {
            description: enrichedDescription,
            repo: `${ctx.repoOwner}/${ctx.repoName}`,
            repoOwner: ctx.repoOwner,
            repoName: ctx.repoName,
            model: ctx.selectedModel,
            steps: plan.plan,
          },
        }));
      });

      ctx.totalCostUsd += buildResult.result.totalCostUsd;
      ctx.totalTokensUsed += buildResult.result.totalTokensUsed;
      tracker.recordAICall({
        inputTokens: buildResult.result.totalTokensUsed || 0,
        outputTokens: 0,
        costEstimate: { totalCost: buildResult.result.totalCostUsd || 0 },
        modelUsed: ctx.selectedModel,
      });

      for (const file of buildResult.result.filesChanged) {
        allFiles.push(file);
      }

      completedPlanSteps = planStepCount;
      for (const f of buildResult.result.filesChanged) {
        await think(ctx, `Skriver ${f.path}... OK`);
      }

      const completedTasks = planActiveTasks.map((t: { id: string; title: string }) => {
        const filePath = t.title.split(" (")[0];
        const isBuilt = allFiles.some((f: { path: string }) => f.path === filePath);
        return { ...t, status: isBuilt ? "done" : "pending" };
      });

      await reportSteps(ctx, "Bygger", [
        { label: `${allFiles.length} filer skrevet`, status: "done" },
        { label: "Validerer kode", status: "active" },
      ], {
        title: `Utfører plan ${completedPlanSteps}/${planStepCount}`,
        planProgress: { current: completedPlanSteps, total: planStepCount },
        tasks: completedTasks,
      });

      ctx.attemptHistory.push({
        stepIndex: 0,
        action: "builder_complete",
        result: buildResult.result.success ? "success" : "failure",
        duration: Date.now() - attemptStart,
        tokensUsed: buildResult.result.totalTokensUsed,
      });

      // === STEP 7: Validate ===
      await reportSteps(ctx, "Reviewer", [
        { label: "Builder ferdig", status: "done" },
        { label: "Validerer kode (tsc + lint)", status: "active" },
      ]);

      const validation = await auditedStep(ctx, "validation_run", {
        attempt: ctx.totalAttempts,
        maxRetries: ctx.maxAttempts,
      }, () => sandboxBreaker.call(() => sandbox.validate({ sandboxId: sandboxRef.id })));

      if (!validation.success) {
        lastError = validation.output;
        previousErrors.push(validation.output.substring(0, 500));
        await think(ctx, `Fant problemer, fikser... (forsok ${ctx.totalAttempts})`);

        await audit({
          sessionId: ctx.conversationId,
          actionType: "validation_failed",
          details: { attempt: ctx.totalAttempts, output: validation.output.substring(0, 1000) },
          success: false,
          errorMessage: validation.output.substring(0, 500),
          taskId: ctx.taskId,
          repoName: `${ctx.repoOwner}/${ctx.repoName}`,
        });

        if (ctx.totalAttempts < ctx.maxAttempts) {
          // === META-REASONING: Diagnose the failure ===
          await report(ctx, `Analyserer feil (forsøk ${ctx.totalAttempts}/${ctx.maxAttempts})...`, "working");

          // YB: Take snapshot of current files BEFORE diagnosis (for delta computation)
          const currentFiles = allFiles.map(f => ({ path: f.path, content: f.content }));

          const diagResult = await auditedStep(ctx, "failure_diagnosed", {
            attempt: ctx.totalAttempts,
            error: validation.output.substring(0, 500),
          }, () => ai.diagnoseFailure({
            task: ctx.taskDescription,
            plan: plan.plan,
            currentStep: plan.plan.length - 1,
            error: validation.output,
            previousErrors,
            codeContext: allFiles.map((f) => `--- ${f.path} ---\n${f.content.substring(0, 1000)}`).join("\n\n"),
            model: ctx.selectedModel,
          }));

          ctx.totalCostUsd += diagResult.costUsd;
          ctx.totalTokensUsed += diagResult.tokensUsed;
          tracker.recordAICall({
            inputTokens: diagResult.tokensUsed || 0,
            outputTokens: 0,
            costEstimate: { totalCost: diagResult.costUsd || 0 },
            modelUsed: (diagResult as { modelUsed?: string }).modelUsed || ctx.selectedModel,
          });
          const diagnosis = diagResult.diagnosis;

          await audit({
            sessionId: ctx.conversationId,
            actionType: "diagnosis_result",
            details: { diagnosis },
            success: true,
            taskId: ctx.taskId,
            repoName: `${ctx.repoOwner}/${ctx.repoName}`,
          });

          // YB: Compute delta-context for retry
          const retryCtx = computeRetryContext(
            ctx,
            currentFiles,
            previousFiles,
            planSummary,
            validation.output,
            diagnosis,
          );

          // YB: Log token savings
          const fullContextTokens = estimateTokens({
            treeString,
            treeArray: [],
            packageJson: {},
            relevantFiles,
            memoryStrings,
            docsStrings,
            mcpTools: [],
          });

          log.info("retry using delta context", {
            attempt: ctx.totalAttempts,
            fullContextTokens,
            deltaTokens: retryCtx.estimatedTokens,
            savedTokens: fullContextTokens - retryCtx.estimatedTokens,
            savedPercent: Math.round((1 - retryCtx.estimatedTokens / fullContextTokens) * 100),
            changedFilesCount: retryCtx.changedFiles.length,
            rootCause: retryCtx.diagnosis.rootCause,
          });

          // Update previousFiles for next iteration
          previousFiles = currentFiles;

          if (diagnosis.rootCause === "bad_plan" && ctx.planRevisions < ctx.maxPlanRevisions) {
            await report(ctx, `Plan er feil — lager ny plan (revisjon ${ctx.planRevisions + 1})...`, "working");
            ctx.planRevisions++;

            // YB: Use delta context (task summary instead of full description)
            plan = await auditedStep(ctx, "plan_revised", {
              revision: ctx.planRevisions,
              diagnosis: diagnosis.rootCause,
            }, () => ai.revisePlan({
              task: retryCtx.taskSummary,
              originalPlan: plan.plan,
              diagnosis,
              constraints: ["avoid_previous_approach", "simpler_solution"],
              model: ctx.selectedModel,
            }));

            ctx.totalCostUsd += plan.costUsd;
            ctx.totalTokensUsed += plan.tokensUsed;
            tracker.recordAICall({
              inputTokens: plan.tokensUsed || 0,
              outputTokens: 0,
              costEstimate: { totalCost: plan.costUsd || 0 },
              modelUsed: (plan as { modelUsed?: string }).modelUsed || ctx.selectedModel,
            });
            planSummary = plan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
            allFiles.length = 0;
            tracker.start("building");
            continue;

          } else if (diagnosis.rootCause === "implementation_error" || diagnosis.suggestedAction === "fix_code") {
            await report(ctx, `Implementeringsfeil — fikser kode...`, "working");

            // YB: Use delta context — send only changed files and error, not full context
            const taskWithDiagnosis = retryCtx.diagnosis.suggestedAction
              ? `${retryCtx.taskSummary}\n\n[RETRY ${retryCtx.attemptNumber}] Diagnose: ${retryCtx.diagnosis.rootCause} — ${retryCtx.diagnosis.reason || ""}. Forslag: ${retryCtx.diagnosis.suggestedAction}`
              : retryCtx.taskSummary;

            plan = await auditedStep(ctx, "plan_retry", {
              attempt: ctx.totalAttempts,
              diagnosis: diagnosis.rootCause,
              model: ctx.selectedModel,
            }, () => ai.planTask({
              task: taskWithDiagnosis,
              projectStructure: "",  // Not needed - plan already made
              relevantFiles: retryCtx.changedFiles.map(f => ({ path: f.path, content: f.diff })),
              memoryContext: [],
              docsContext: [],
              previousAttempt: retryCtx.planSummary,
              errorMessage: retryCtx.latestError,
              model: ctx.selectedModel,
            }));

            ctx.totalCostUsd += plan.costUsd;
            ctx.totalTokensUsed += plan.tokensUsed;
            tracker.recordAICall({
              inputTokens: plan.tokensUsed || 0,
              outputTokens: 0,
              costEstimate: { totalCost: plan.costUsd || 0 },
              modelUsed: (plan as { modelUsed?: string }).modelUsed || ctx.selectedModel,
            });
            planSummary = plan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
            continue;

          } else if (diagnosis.rootCause === "missing_context") {
            await report(ctx, `Mangler kontekst — henter mer informasjon...`, "working");

            let moreMemories = { results: [] as { content: string }[] };
            try {
              moreMemories = await memory.search({
                query: `${ctx.taskDescription} ${validation.output.substring(0, 200)}`,
                limit: 10,
              });
            } catch (e) {
              log.warn("Memory search failed during missing_context retry", { error: String(e) });
            }

            plan = await auditedStep(ctx, "plan_retry_with_context", {
              extraMemories: moreMemories.results.length,
            }, () => ai.planTask({
              task: ctx.taskDescription,
              projectStructure: treeString,
              relevantFiles,
              memoryContext: moreMemories.results.map((r) => r.content),
              docsContext: docsStrings,
              errorMessage: validation.output,
              model: ctx.selectedModel,
            }));

            ctx.totalCostUsd += plan.costUsd;
            ctx.totalTokensUsed += plan.tokensUsed;
            tracker.recordAICall({
              inputTokens: plan.tokensUsed || 0,
              outputTokens: 0,
              costEstimate: { totalCost: plan.costUsd || 0 },
              modelUsed: (plan as { modelUsed?: string }).modelUsed || ctx.selectedModel,
            });
            planSummary = plan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
            tracker.start("building");
            continue;

          } else if (diagnosis.rootCause === "impossible_task") {
            await report(ctx, `Denne oppgaven ser umulig ut: ${diagnosis.reason}`, "needs_input");
            await updateLinearIfExists(ctx, `TheFold klarer ikke denne oppgaven: ${diagnosis.reason}`, "blocked");

            if (ctx.thefoldTaskId) {
              try {
                await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "blocked", errorMessage: diagnosis.reason?.substring(0, 500) });
              } catch (err) {
                log.warn("updateTaskStatus to blocked failed", { error: err instanceof Error ? err.message : String(err) });
              }
            }

            return {
              success: false,
              filesChanged: allFiles,
              sandboxId: sandboxRef.id,
              planSummary,
              costUsd: ctx.totalCostUsd,
              tokensUsed: ctx.totalTokensUsed,
              earlyReturn: { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "impossible_task" },
            };

          } else if (diagnosis.rootCause === "environment_error") {
            await report(ctx, `Miljøfeil — venter 30 sekunder og prøver igjen...`, "working");
            await new Promise((resolve) => setTimeout(resolve, 30_000));
            continue;
          }

          // Default: standard retry with delta context (YB)
          const taskWithDiagnosis = retryCtx.diagnosis.suggestedAction
            ? `${retryCtx.taskSummary}\n\n[RETRY ${retryCtx.attemptNumber}] Diagnose: ${retryCtx.diagnosis.rootCause} — ${retryCtx.diagnosis.reason || ""}. Forslag: ${retryCtx.diagnosis.suggestedAction}`
            : retryCtx.taskSummary;

          plan = await auditedStep(ctx, "plan_retry", {
            attempt: ctx.totalAttempts,
            model: ctx.selectedModel,
          }, () => ai.planTask({
            task: taskWithDiagnosis,
            projectStructure: "",
            relevantFiles: retryCtx.changedFiles.map(f => ({ path: f.path, content: f.diff })),
            memoryContext: [],
            docsContext: [],
            previousAttempt: retryCtx.planSummary,
            errorMessage: retryCtx.latestError,
            model: ctx.selectedModel,
          }));

          ctx.totalCostUsd += plan.costUsd;
          ctx.totalTokensUsed += plan.tokensUsed;
          tracker.recordAICall({
            inputTokens: plan.tokensUsed || 0,
            outputTokens: 0,
            costEstimate: { totalCost: plan.costUsd || 0 },
            modelUsed: (plan as { modelUsed?: string }).modelUsed || ctx.selectedModel,
          });
          planSummary = plan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
          tracker.start("building");
          continue;
        }

        // Max attempts reached — throw so agent.ts catch block handles cleanup
        throw new Error(`Validation failed after ${ctx.maxAttempts} attempts: ${validation.output}`);
      }

      // Validation passed!
      await think(ctx, "Ingen feil i koden!");
      break;

    } catch (error) {
      ctx.attemptHistory.push({
        stepIndex: -1,
        action: "validation",
        result: "failure",
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - attemptStart,
        tokensUsed: 0,
      });
      if (ctx.totalAttempts >= ctx.maxAttempts) throw error;
    }
  }

  // Success — return result for STEP 8+ (review, completion)
  return {
    success: true,
    filesChanged: allFiles,
    sandboxId: sandboxRef.id,
    planSummary,
    costUsd: ctx.totalCostUsd,
    tokensUsed: ctx.totalTokensUsed,
  };
}

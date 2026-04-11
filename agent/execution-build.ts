import log from "encore.dev/log";
import { ai, sandbox, builder, tasks, memory } from "~encore/clients";
import { updateJobCheckpoint } from "./db";
import { estimateTokens } from "./context-builder";
import { runHooks } from "./hooks";
import { enforcePolicy } from "./token-policy";
import { computeRetryContext } from "./execution-retry";
import type { ExecutionResult, ExecutionHelpers } from "./execution-retry";
import type { PlanPhaseResult } from "./execution-plan";
import type { AgentExecutionContext, RetryProductivity } from "./types";
import type { PhaseTracker } from "./metrics";

/**
 * STEP 6-7 (retry loop): Create sandbox, run builder, validate, diagnose, retry.
 * Receives the plan result from runPlanPhase and runs until success or max attempts.
 */
export async function runBuildLoop(
  ctx: AgentExecutionContext,
  contextData: {
    treeString: string;
    treeArray: string[];
    relevantFiles: Array<{ path: string; content: string }>;
    memoryStrings: string[];
    docsStrings: string[];
  },
  planResult: PlanPhaseResult,
  tracker: PhaseTracker,
  helpers: ExecutionHelpers,
  options?: { sandboxId?: string },
): Promise<ExecutionResult> {
  const { report, think, reportSteps, auditedStep, audit, shouldStopTask, updateLinearIfExists, aiBreaker, sandboxBreaker } = helpers;
  const { treeString, relevantFiles, memoryStrings, docsStrings } = contextData;

  // Mutable plan state (retry branches may reassign)
  let { plan, subAgentContext } = planResult;
  let planSummary = planResult.planSummary;
  const planStepCount = planResult.planStepCount;
  const planActiveTasks = planResult.planActiveTasks;

  let completedPlanSteps = 0;

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

  // === STEP 6: Create sandbox (or reuse provided one) ===
  log.info("STEP 6: Building in sandbox");
  tracker.start("building");

  const sandboxRef = options?.sandboxId
    ? { id: options.sandboxId }
    : await auditedStep(ctx, "sandbox_created", {
        repoOwner: ctx.repoOwner,
        repoName: ctx.repoName,
      }, () => sandboxBreaker.call(() => sandbox.create({ repoOwner: ctx.repoOwner, repoName: ctx.repoName })));

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
  let previousFiles: Array<{ path: string; content: string }> = [];
  let previousValidationErrorCount = 0;

  while (ctx.totalAttempts < ctx.maxAttempts) {
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

      if (ctx.thefoldTaskId && buildResult.result.filesChanged.length > 0) {
        try {
          const subTasks = buildResult.result.filesChanged
            .map((f: { path: string }) => f.path)
            .slice(0, 10);
          await tasks.updateTask({ id: ctx.thefoldTaskId, labels: subTasks });
        } catch (e) {
          log.warn("Failed to store sub-tasks in labels", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      completedPlanSteps = planStepCount;
      for (const f of buildResult.result.filesChanged) {
        await think(ctx, `Skriver ${f.path}... OK`);
      }

      await runHooks("after:building", {
        ctx,
        filesChanged: buildResult.result.filesChanged.map((f: { path: string }) => f.path),
      });

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

      // D9: Check token policy after builder
      const buildPolicyAction = enforcePolicy("building", ctx.totalTokensUsed);
      if (buildPolicyAction === "stop") {
        log.warn("Token policy: building phase exceeded 1.5x budget — escalating to impossible_task", {
          tokensUsed: ctx.totalTokensUsed,
          taskId: ctx.taskId,
        });
        await report(ctx, `Token-budsjett overskredet (bygging): oppgaven er for stor å gjennomføre.`, "needs_input");
        await updateLinearIfExists(ctx, `Token-budsjett overskredet under bygging.`, "blocked");
        if (ctx.thefoldTaskId) {
          try {
            await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "blocked", errorMessage: "Token budget exceeded during building" });
          } catch (err) {
            log.warn("updateTaskStatus to blocked failed (token budget)", { error: err instanceof Error ? err.message : String(err) });
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
      }

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

        // D9: Compute productivity metrics
        const currentValidationErrorCount = (validation.output.match(/error TS\d+|Error:|error:/gi) || []).length;
        const validationErrorsFixed = Math.max(0, previousValidationErrorCount - currentValidationErrorCount);
        const newErrorsIntroduced = Math.max(0, currentValidationErrorCount - previousValidationErrorCount);

        if (ctx.attemptHistory.length > 0) {
          const lastAttempt = ctx.attemptHistory[ctx.attemptHistory.length - 1];
          const productivity: RetryProductivity = {
            attemptNumber: ctx.totalAttempts,
            filesChanged: buildResult.result.filesChanged.length,
            validationErrorsFixed,
            newErrorsIntroduced,
            outputTokens: buildResult.result.totalTokensUsed,
          };
          lastAttempt.productivity = productivity;

          log.info("retry productivity", {
            attempt: ctx.totalAttempts,
            filesChanged: productivity.filesChanged,
            errorsFixed: productivity.validationErrorsFixed,
            newErrors: productivity.newErrorsIntroduced,
            taskId: ctx.taskId,
          });

          // D9: Early termination after 3+ attempts if stalled/regressing
          if (ctx.totalAttempts >= 3) {
            const recent = ctx.attemptHistory.slice(-2).map(a => a.productivity);
            const allStalled = recent.length === 2 && recent.every(
              p => p && p.filesChanged < 2 && p.validationErrorsFixed === 0
            );
            const regressing = productivity.newErrorsIntroduced > productivity.validationErrorsFixed;

            if (allStalled || regressing) {
              const reason = allStalled
                ? `Ingen fremgang etter ${ctx.totalAttempts} forsøk (files: ${productivity.filesChanged}, errorsFixed: ${productivity.validationErrorsFixed})`
                : `Regressjon: ${productivity.newErrorsIntroduced} nye feil introdusert vs ${productivity.validationErrorsFixed} fikset`;

              log.warn("early termination due to productivity", { reason, attempt: ctx.totalAttempts, taskId: ctx.taskId });
              await report(ctx, `Avslutter tidlig: ${reason}`, "needs_input");
              await updateLinearIfExists(ctx, `TheFold klarer ikke denne oppgaven: ${reason}`, "blocked");

              if (ctx.thefoldTaskId) {
                try {
                  await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "blocked", errorMessage: reason.substring(0, 500) });
                } catch (err) {
                  log.warn("updateTaskStatus to blocked failed (productivity)", { error: err instanceof Error ? err.message : String(err) });
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
            }
          }
        }

        previousValidationErrorCount = currentValidationErrorCount;
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
          await report(ctx, `Analyserer feil (forsøk ${ctx.totalAttempts}/${ctx.maxAttempts})...`, "working");

          // YB: Snapshot current files before diagnosis
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

          // D10: Check token policy after diagnosis
          const diagPolicyAction = enforcePolicy("validating", ctx.totalTokensUsed);
          if (diagPolicyAction === "stop") {
            log.warn("Token policy: validating phase exceeded 1.5x budget — escalating to impossible_task", {
              tokensUsed: ctx.totalTokensUsed,
              taskId: ctx.taskId,
            });
            await report(ctx, `Token-budsjett overskredet (validering): kan ikke fortsette.`, "needs_input");
            await updateLinearIfExists(ctx, `Token-budsjett overskredet under validering.`, "blocked");
            if (ctx.thefoldTaskId) {
              try {
                await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "blocked", errorMessage: "Token budget exceeded during validation" });
              } catch (err) {
                log.warn("updateTaskStatus to blocked failed (token budget diag)", { error: err instanceof Error ? err.message : String(err) });
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
          }

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

          previousFiles = currentFiles;

          if (diagnosis.rootCause === "bad_plan" && ctx.planRevisions < ctx.maxPlanRevisions) {
            await report(ctx, `Plan er feil — lager ny plan (revisjon ${ctx.planRevisions + 1})...`, "working");
            ctx.planRevisions++;

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

            const taskWithDiagnosis = retryCtx.diagnosis.suggestedAction
              ? `${retryCtx.taskSummary}\n\n[RETRY ${retryCtx.attemptNumber}] Diagnose: ${retryCtx.diagnosis.rootCause} — ${retryCtx.diagnosis.reason || ""}. Forslag: ${retryCtx.diagnosis.suggestedAction}`
              : retryCtx.taskSummary;

            plan = await auditedStep(ctx, "plan_retry", {
              attempt: ctx.totalAttempts,
              diagnosis: diagnosis.rootCause,
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

        throw new Error(`Validation failed after ${ctx.maxAttempts} attempts: ${validation.output}`);
      }

      // Validation passed!
      await think(ctx, "Ingen feil i koden!");
      // Suppress unused variable warning
      void lastError;
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

  return {
    success: true,
    filesChanged: allFiles,
    sandboxId: sandboxRef.id,
    planSummary,
    costUsd: ctx.totalCostUsd,
    tokensUsed: ctx.totalTokensUsed,
  };
}

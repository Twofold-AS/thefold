import log from "encore.dev/log";
import { ai, memory } from "~encore/clients";
import {
  planSubAgentsDynamic,
  executeSubAgents,
  mergeResults,
  sumCosts,
  sumTokens,
  createSharedAgentContext,
} from "../ai/orchestrate-sub-agents";
import { buildImportGraph, analyzeImpact } from "./code-graph";
import { addStep, reportProgress, buildSteps } from "./helpers";
import type { AgentExecutionContext } from "./types";
import type { PhaseTracker } from "./metrics";
import type { BudgetMode } from "../ai/sub-agents";
import type { ExecutionHelpers } from "./execution-retry";

export interface PlanPhaseResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plan: any;
  planSummary: string;
  planStepCount: number;
  planActiveTasks: Array<{ id: string; title: string; status: string }>;
  subAgentContext: string;
}

/**
 * STEP 4.9-5.6: Strategy hint, planning, multi-plan selection, error patterns, sub-agents.
 * Called by executePlan before the build loop.
 */
export async function runPlanPhase(
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
): Promise<PlanPhaseResult> {
  const { think, reportSteps, auditedStep, audit, aiBreaker } = helpers;
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
  let planStepCount = plan.plan.length;

  log.info("STEP 5: Plan created", { steps: planStepCount });
  await think(ctx, `Plan klar — ${planStepCount} steg.`);

  // === STEP 5.2: Multi-plan generation (D28) — for complexity >= 8 ===
  const estimatedComplexityForMultiPlan = Math.min(10, Math.max(1, planStepCount * 2));
  if (estimatedComplexityForMultiPlan >= 8) {
    try {
      log.info("D28: generating alternative plan (complexity >= 8)", { estimatedComplexity: estimatedComplexityForMultiPlan });
      await think(ctx, "Kompleks oppgave — genererer alternativ plan for å velge den enkleste.");

      const altPlan = await aiBreaker.call(() => ai.planTask({
        task: `${ctx.taskDescription}\n\nUser context: ${ctx.userMessage}${strategyHint}\n\nAPPROACH: minimal changes first — prefer editing existing files over creating new ones, keep the plan as short as possible`,
        projectStructure: treeString,
        relevantFiles,
        memoryContext: memoryStrings,
        docsContext: docsStrings,
        model: ctx.selectedModel,
      }));

      ctx.totalCostUsd += altPlan.costUsd;
      ctx.totalTokensUsed += altPlan.tokensUsed;
      tracker.recordAICall({
        inputTokens: altPlan.tokensUsed || 0,
        outputTokens: 0,
        costEstimate: { totalCost: altPlan.costUsd || 0 },
        modelUsed: (altPlan as { modelUsed?: string }).modelUsed || ctx.selectedModel,
      });

      if (altPlan.plan.length < plan.plan.length) {
        log.info("D28: alternative plan is simpler, using it", {
          originalSteps: plan.plan.length,
          altSteps: altPlan.plan.length,
        });
        plan = altPlan;
        planSummary = altPlan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
        planStepCount = altPlan.plan.length;
        await think(ctx, `Alternativ plan valgt (${planStepCount} steg vs ${plan.plan.length} steg).`);
      } else {
        log.info("D28: original plan is simpler or equal, keeping it", {
          originalSteps: plan.plan.length,
          altSteps: altPlan.plan.length,
        });
      }
    } catch (err) {
      log.warn("D28: alternative plan generation failed, keeping original", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await reportSteps(ctx, "Planlegger", [
    { label: `Plan klar: ${planStepCount} steg`, status: "done" },
  ], { title: `Utfører plan 0/${planStepCount}`, planProgress: { current: 0, total: planStepCount } });

  // === STEP 5.4: Impact analysis (FASE 10.3) — analyze blast radius of planned file changes ===
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planFilePaths: string[] = (plan.plan as any[])
      .filter((s) => s.filePath && s.action !== "run_command")
      .map((s) => s.filePath as string);

    if (planFilePaths.length > 0 && contextData.relevantFiles.length > 0) {
      const graph = buildImportGraph(contextData.relevantFiles);
      const impactResults = planFilePaths.map((fp: string) => analyzeImpact(graph, fp));

      const highRiskFiles = impactResults.filter((r) => r.riskLevel === "high");
      const mediumRiskFiles = impactResults.filter((r) => r.riskLevel === "medium");
      const totalImpacted = new Set(impactResults.flatMap((r) => r.impactedFiles)).size;

      if (highRiskFiles.length > 0 || totalImpacted > 3) {
        const riskSummary = highRiskFiles.length > 0
          ? `⚠ ${highRiskFiles.length} høy-risiko fil(er) — endringer kan påvirke ${totalImpacted} andre filer`
          : `${mediumRiskFiles.length} medium-risiko fil(er) — ${totalImpacted} filer kan påvirkes`;

        await think(ctx, `Impaktanalyse: ${riskSummary}`);

        log.info("impact analysis complete", {
          planFiles: planFilePaths.length,
          totalImpacted,
          highRisk: highRiskFiles.length,
          mediumRisk: mediumRiskFiles.length,
        });
      }
    }
  } catch (err) {
    log.warn("impact analysis failed (non-critical)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

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
      const { report } = helpers;
      await report(ctx, "Sub-agenter aktivert — kjører spesialiserte AI-agenter parallelt...", "working");

      const budgetMode: BudgetMode = ctx.modelMode === "manual" ? "quality_first" : "balanced";
      const subPlanSummary = plan.plan.map((s: { description: string }, i: number) => `${i + 1}. ${s.description}`).join("\n");
      const subPlan = await planSubAgentsDynamic(ctx.taskDescription, subPlanSummary, estimatedComplexity, budgetMode);

      // Enrich researcher agents with memory and docs context (9.1)
      for (const agent of subPlan.agents) {
        if (agent.role === "researcher") {
          const memoryBlock = memoryStrings.length > 0
            ? `\n\n[MEMORY]\n${memoryStrings.slice(0, 5).join("\n---\n")}`
            : "";
          const docsBlock = docsStrings.length > 0
            ? `\n\n[DOCS]\n${docsStrings.slice(0, 3).join("\n---\n")}`
            : "";
          agent.inputContext += memoryBlock + docsBlock;
        }
      }

      if (subPlan.agents.length > 0) {
        addStep(ctx, {
          id: "sub-agents",
          label: `${subPlan.agents.length} sub-agenter`,
          detail: "Starter...",
          done: false,
        });

        // Live display state — updated per-agent for 9.3 real-time updates
        const liveDisplay = new Map(subPlan.agents.map((a) => [a.id, {
          id: a.id,
          role: a.role,
          model: a.model ? a.model.split("-").slice(0, 2).join("-") : "auto",
          status: "pending" as "pending" | "working" | "done" | "failed",
          label: `${a.role} — klar`,
        }]));

        await reportProgress(ctx, {
          status: "working",
          phase: "building",
          summary: `Bygger med ${subPlan.agents.length} agenter`,
          steps: buildSteps(ctx),
          subAgents: Array.from(liveDisplay.values()),
        });

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

        // Per-agent real-time callbacks (9.3)
        const sharedCtx = createSharedAgentContext();
        const subResults = await executeSubAgents(subPlan, sharedCtx, {
          onAgentStart: async (agent) => {
            const entry = liveDisplay.get(agent.id);
            if (entry) {
              entry.status = "working";
              entry.label = `${agent.role} — kjører...`;
            }
            await reportProgress(ctx, {
              status: "working",
              phase: "building",
              summary: `Sub-agent kjører: ${agent.role}`,
              steps: buildSteps(ctx),
              subAgents: Array.from(liveDisplay.values()),
            });
          },
          onAgentComplete: async (result) => {
            const entry = liveDisplay.get(result.id);
            if (entry) {
              entry.status = result.success ? "done" : "failed";
              entry.label = result.success
                ? `${result.role} — ferdig ($${result.costUsd.toFixed(4)})`
                : `${result.role} — feil: ${(result.error ?? "").substring(0, 40)}`;
            }
            await reportProgress(ctx, {
              status: "working",
              phase: "building",
              summary: `Sub-agent ferdig: ${result.role}`,
              steps: buildSteps(ctx),
              subAgents: Array.from(liveDisplay.values()),
            });
          },
        });
        const merged = await mergeResults(subResults, subPlan.mergeStrategy);

        ctx.subAgentResults = subResults;
        ctx.totalCostUsd += sumCosts(subResults);
        ctx.totalTokensUsed += sumTokens(subResults);
        subAgentContext = merged;

        const successCount = subResults.filter((r) => r.success).length;

        addStep(ctx, {
          id: "sub-agents",
          label: `${subPlan.agents.length} sub-agenter`,
          detail: `${successCount}/${subResults.length} OK`,
          done: true,
        });

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
            failCount: subResults.filter((r) => !r.success).length,
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

  const planActiveTasks = plan.plan
    .filter((s: { filePath?: string }) => s.filePath)
    .map((s: { filePath?: string; action?: string; description: string }, i: number) => ({
      id: `plan-${i}`,
      title: `${s.filePath} (${s.action || "create"})`,
      status: "pending",
    }));

  return { plan, planSummary, planStepCount, planActiveTasks, subAgentContext };
}

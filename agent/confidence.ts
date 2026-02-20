import log from "encore.dev/log";
import { ai, tasks } from "~encore/clients";
import { selectOptimalModel } from "../ai/router";
import { updateJobCheckpoint } from "./db";
import type { AgentExecutionContext } from "./types";
import type { PhaseTracker } from "./metrics";

// --- Types ---

export interface ConfidenceResult {
  shouldContinue: boolean;
  selectedModel: string;
  confidenceScore: number;
  complexityScore?: number;
  pauseReason?: "low_confidence" | "needs_breakdown" | "needs_model_selection";
  earlyReturn?: {
    success: boolean;
    filesChanged: string[];
    costUsd: number;
    tokensUsed: number;
    errorMessage: string;
  };
}

export interface ConfidenceHelpers {
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
    extra?: { title?: string; questions?: string[] }
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
    confidenceScore?: number;
    taskId?: string;
    repoName?: string;
  }) => Promise<void>;
}

/**
 * STEP 4 + 4.5: Assess confidence, complexity, and select model.
 *
 * Returns ConfidenceResult:
 * - shouldContinue: true  → proceed to planning with selectedModel set in ctx
 * - shouldContinue: false → early return with earlyReturn data + pauseReason
 */
export async function assessAndRoute(
  ctx: AgentExecutionContext,
  contextData: {
    treeString: string;
    treeArray: string[];
    relevantFiles: Array<{ path: string; content: string }>;
    memoryStrings: string[];
    docsStrings: string[];
  },
  tracker: PhaseTracker,
  helpers: ConfidenceHelpers,
  options?: { forceContinue?: boolean; useCurated?: boolean },
): Promise<ConfidenceResult> {
  const { report, think, reportSteps, auditedStep, audit } = helpers;
  const { treeString, treeArray, relevantFiles, memoryStrings, docsStrings } = contextData;

  // Curated or forceContinue — skip all assessment, use current/default model
  if (options?.useCurated || options?.forceContinue) {
    const defaultModel = ctx.modelOverride || ctx.selectedModel || "claude-sonnet-4-5-20250929";
    ctx.selectedModel = defaultModel;
    return { shouldContinue: true, selectedModel: defaultModel, confidenceScore: 100 };
  }

  log.info("STEP 4: Assessing confidence");

  // === STEP 4: Assess Confidence ===

  // Empty repo — no existing code to be uncertain about, skip AI assessment
  if (treeArray.length === 0) {
    await report(ctx, "Tomt repo — starter direkte uten klargjøring.", "working");
    await audit({
      sessionId: ctx.conversationId,
      actionType: "confidence_details",
      details: { overall: 90, reason: "empty_repo", recommended_action: "proceed" },
      success: true,
      confidenceScore: 90,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
    });
  } else {
    tracker.start("confidence");
    await report(ctx, "Vurderer min evne til å løse oppgaven...", "working");

    const confidenceResult = await auditedStep(ctx, "confidence_assessed", {}, async () => {
      const result = await ai.assessConfidence({
        taskDescription: ctx.taskDescription,
        projectStructure: treeString,
        relevantFiles,
        memoryContext: memoryStrings,
        docsContext: docsStrings,
      });
      return result;
    });

    const { confidence } = confidenceResult;
    tracker.recordAICall({
      inputTokens: (confidenceResult as { tokensUsed?: number }).tokensUsed || 0,
      outputTokens: 0,
      costEstimate: { totalCost: (confidenceResult as { costUsd?: number }).costUsd || 0 },
      modelUsed: (confidenceResult as { modelUsed?: string }).modelUsed || "",
    });

    await audit({
      sessionId: ctx.conversationId,
      actionType: "confidence_details",
      details: {
        overall: confidence.overall,
        breakdown: (confidence as { breakdown?: unknown }).breakdown,
        recommended_action: confidence.recommended_action,
        uncertainties: confidence.uncertainties,
      },
      success: true,
      confidenceScore: confidence.overall,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
    });

    if (confidence.overall < 90) {
      // Build clarification message
      let msg = `Jeg er usikker (${confidence.overall}% sikker) og trenger avklaringer:\n\n`;
      msg += `**Usikkerheter:**\n`;
      confidence.uncertainties.forEach((u: string, i: number) => {
        msg += `${i + 1}. ${u}\n`;
      });
      if (confidence.clarifying_questions && confidence.clarifying_questions.length > 0) {
        msg += `\n**Spørsmål:**\n`;
        confidence.clarifying_questions.forEach((q: string, i: number) => {
          msg += `${i + 1}. ${q}\n`;
        });
      }
      msg += `\nVennligst gi mer informasjon før jeg starter.`;

      await audit({
        sessionId: ctx.conversationId,
        actionType: "task_paused_clarification",
        details: { confidence: confidence.overall, reason: "low_confidence" },
        success: true,
        confidenceScore: confidence.overall,
        taskId: ctx.taskId,
        repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      });

      // Build questions list for frontend AgentClarification component
      const clarificationQuestions = [
        ...(confidence.uncertainties || []),
        ...(confidence.clarifying_questions || []),
      ];

      await reportSteps(ctx, "Venter", [
        { label: `Konfidenssjekk: ${confidence.overall}%`, status: "done" },
      ], {
        title: "Trenger avklaring",
        questions: clarificationQuestions.length > 0 ? clarificationQuestions : [msg],
      });

      // Update task status for chat routing
      if (ctx.thefoldTaskId) {
        try {
          await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "needs_input", errorMessage: "Trenger avklaring" });
        } catch { /* non-critical */ }
      }

      return {
        shouldContinue: false,
        selectedModel: ctx.selectedModel,
        confidenceScore: confidence.overall,
        pauseReason: "low_confidence",
        earlyReturn: { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "low_confidence" },
      };
    }

    if (confidence.overall < 75 || confidence.recommended_action === "break_down") {
      let msg = `Dette ser komplekst ut (${confidence.overall}% sikker). `;
      msg += `Jeg anbefaler å dele det opp:\n\n`;
      if (confidence.suggested_subtasks && confidence.suggested_subtasks.length > 0) {
        confidence.suggested_subtasks.forEach((t: string, i: number) => {
          msg += `${i + 1}. ${t}\n`;
        });
      }
      msg += `\nVil du at jeg skal fortsette likevel, eller dele det opp?`;

      await audit({
        sessionId: ctx.conversationId,
        actionType: "task_paused_breakdown",
        details: { confidence: confidence.overall, subtasks: confidence.suggested_subtasks },
        success: true,
        confidenceScore: confidence.overall,
        taskId: ctx.taskId,
        repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      });

      await report(ctx, msg, "needs_input");

      return {
        shouldContinue: false,
        selectedModel: ctx.selectedModel,
        confidenceScore: confidence.overall,
        pauseReason: "needs_breakdown",
        earlyReturn: { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "needs_breakdown" },
      };
    }

    await report(
      ctx,
      `Jeg er ${confidence.overall}% sikker på å løse dette. Starter arbeid...`,
      "working"
    );
  }

  // Checkpoint after STEP 4
  if (ctx.jobId) {
    await updateJobCheckpoint(ctx.jobId, "confidence", {
      phase: "confidence",
    }).catch(() => { /* non-critical */ });
  }

  // === STEP 4.5: Assess complexity and select model ===
  log.info("STEP 4.5: Selecting model");
  let selectedModel: string;

  if (ctx.modelOverride) {
    selectedModel = ctx.modelOverride;
  } else if (ctx.modelMode === "manual") {
    await report(ctx, "Hvilken modell vil du bruke?", "needs_input");
    return {
      shouldContinue: false,
      selectedModel: ctx.selectedModel,
      confidenceScore: 90,
      pauseReason: "needs_model_selection",
      earlyReturn: { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "needs_model_selection" },
    };
  } else {
    const complexityResult = await auditedStep(ctx, "complexity_assessed", {
      modelMode: ctx.modelMode,
    }, () => ai.assessComplexity({
      taskDescription: ctx.taskDescription,
      projectStructure: treeString.substring(0, 2000),
      fileCount: treeArray.length,
    }));

    tracker.recordAICall({
      inputTokens: (complexityResult as { tokensUsed?: number }).tokensUsed || 0,
      outputTokens: 0,
      costEstimate: { totalCost: (complexityResult as { costUsd?: number }).costUsd || 0 },
      modelUsed: (complexityResult as { modelUsed?: string }).modelUsed || "",
    });

    selectedModel = selectOptimalModel(complexityResult.complexity, "auto");

    await audit({
      sessionId: ctx.conversationId,
      actionType: "model_selected",
      details: {
        complexity: complexityResult.complexity,
        reasoning: complexityResult.reasoning,
        modelMode: ctx.modelMode,
        selectedModel,
        suggestedModel: complexityResult.suggestedModel,
      },
      success: true,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
    });

    await report(
      ctx,
      `Kompleksitet: ${complexityResult.complexity}/10 → Bruker ${selectedModel} (auto modus)`,
      "working"
    );
  }

  ctx.selectedModel = selectedModel;

  return {
    shouldContinue: true,
    selectedModel,
    confidenceScore: treeArray.length === 0 ? 90 : 100,
  };
}

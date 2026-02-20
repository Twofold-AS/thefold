import log from "encore.dev/log";
import { ai, sandbox, tasks } from "~encore/clients";
import { submitReviewInternal } from "./review";
import { savePhaseMetrics } from "./metrics";
import { completeJob } from "./db";
import type { AgentExecutionContext, AIReviewData } from "./types";
import type { PhaseTracker } from "./metrics";

// --- Types ---

export interface ReviewResult {
  shouldPause: boolean;   // true = agent pauses for user review
  reviewId?: string;      // ID from submitReviewInternal
  documentation: string;
  qualityScore: number;
  concerns: string[];
  memoriesExtracted: string[];
  skipReview: boolean;    // true = review was skipped entirely
  earlyReturn?: {
    success: false;
    filesChanged: string[];
    costUsd: number;
    tokensUsed: number;
    errorMessage: string;
  };
}

export interface ReviewHelpers {
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
    details: Record<string, unknown>;
    success: boolean;
    taskId?: string;
    repoName?: string;
  }) => Promise<void>;
  shouldStopTask: (ctx: AgentExecutionContext, checkpoint: string, sandboxId?: string) => Promise<boolean>;
}

/**
 * STEP 8-8.5: AI review of own work + submit for user review.
 *
 * Called from agent.ts after executePlan() succeeds.
 * State machine transitions remain in agent.ts.
 * earlyReturn signals stopped — agent.ts handles the sm.transitionTo("stopped").
 */
export async function handleReview(
  ctx: AgentExecutionContext,
  executionData: {
    allFiles: Array<{ path: string; content: string; action: string }>;
    sandboxId: string;
    memoryStrings: string[];
  },
  tracker: PhaseTracker,
  helpers: ReviewHelpers,
  options?: { skipReview?: boolean },
): Promise<ReviewResult> {
  const { report, think, reportSteps, auditedStep, audit, shouldStopTask } = helpers;
  const { allFiles, sandboxId, memoryStrings } = executionData;

  // skipReview path — skip AI review and submission entirely
  if (options?.skipReview) {
    return {
      shouldPause: false,
      skipReview: true,
      documentation: "",
      qualityScore: 0,
      concerns: [],
      memoriesExtracted: [],
    };
  }

  // === Stop check before review ===
  if (await shouldStopTask(ctx, "pre_review", sandboxId)) {
    return {
      shouldPause: false,
      skipReview: false,
      documentation: "",
      qualityScore: 0,
      concerns: [],
      memoriesExtracted: [],
      earlyReturn: {
        success: false,
        filesChanged: allFiles.map((f) => f.path),
        costUsd: ctx.totalCostUsd,
        tokensUsed: ctx.totalTokensUsed,
        errorMessage: "stopped",
      },
    };
  }

  // === STEP 8: AI review ===
  log.info("STEP 8: Reviewing own work");
  tracker.start("reviewing");

  await reportSteps(ctx, "Reviewer", [
    { label: "Alle filer skrevet", status: "done" },
    { label: "Kode validert", status: "done" },
    { label: "Reviewer kode og skriver dokumentasjon", status: "active" },
  ]);

  const validationOutput = await sandbox.validate({ sandboxId });
  const review = await auditedStep(ctx, "review_completed", {
    filesChanged: allFiles.length,
    model: ctx.selectedModel,
  }, () => ai.reviewCode({
    taskDescription: ctx.taskDescription,
    filesChanged: allFiles.map((f) => ({
      path: f.path,
      content: f.content,
      action: f.action as "create" | "modify" | "delete",
    })),
    validationOutput: validationOutput.output,
    memoryContext: memoryStrings,
    model: ctx.selectedModel,
  }));

  ctx.totalCostUsd += review.costUsd;
  ctx.totalTokensUsed += review.tokensUsed;
  tracker.recordAICall({
    inputTokens: review.tokensUsed || 0,
    outputTokens: 0,
    costEstimate: { totalCost: review.costUsd || 0 },
    modelUsed: (review as { modelUsed?: string }).modelUsed || ctx.selectedModel,
  });
  await think(ctx, `Kvalitet: ${review.qualityScore}/10.`);

  // === Stop check before submitting review ===
  if (await shouldStopTask(ctx, "pre_submit_review", sandboxId)) {
    return {
      shouldPause: false,
      skipReview: false,
      documentation: review.documentation,
      qualityScore: review.qualityScore,
      concerns: review.concerns,
      memoriesExtracted: review.memoriesExtracted,
      earlyReturn: {
        success: false,
        filesChanged: allFiles.map((f) => f.path),
        costUsd: ctx.totalCostUsd,
        tokensUsed: ctx.totalTokensUsed,
        errorMessage: "stopped",
      },
    };
  }

  // === STEP 8.5: Submit for user review ===
  log.info("STEP 8.5: Submitting for review");

  const aiReviewData: AIReviewData = {
    documentation: review.documentation,
    qualityScore: review.qualityScore,
    concerns: review.concerns,
    memoriesExtracted: review.memoriesExtracted,
  };

  await think(ctx, "Sender til review — venter pa godkjenning.");

  const reviewResult = await submitReviewInternal({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    sandboxId,
    repoName: ctx.repoName,
    filesChanged: allFiles.map((f) => ({
      path: f.path,
      content: f.content,
      action: f.action as "create" | "modify" | "delete",
    })),
    aiReview: aiReviewData,
  });

  await audit({
    sessionId: ctx.conversationId,
    actionType: "review_submitted",
    details: {
      reviewId: reviewResult.reviewId,
      qualityScore: review.qualityScore,
      filesChanged: allFiles.map((f) => f.path),
    },
    success: true,
    taskId: ctx.taskId,
    repoName: `${ctx.repoOwner}/${ctx.repoName}`,
  });

  // Update TheFold task status to in_review if applicable
  if (ctx.thefoldTaskId) {
    try {
      await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "in_review", reviewId: reviewResult.reviewId });
    } catch (err) {
      log.warn("updateTaskStatus to in_review failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Save phase metrics and mark job complete (non-critical)
  tracker.start("completing");
  tracker.end();
  if (ctx.jobId) {
    try {
      await savePhaseMetrics(ctx.jobId, ctx.taskId, tracker.getAll());
    } catch (err) {
      log.warn("savePhaseMetrics failed", { error: err instanceof Error ? err.message : String(err) });
    }
    await completeJob(ctx.jobId).catch((err) => log.warn("completeJob failed", { error: err instanceof Error ? err.message : String(err) }));
  }

  return {
    shouldPause: true,
    reviewId: reviewResult.reviewId,
    skipReview: false,
    documentation: review.documentation,
    qualityScore: review.qualityScore,
    concerns: review.concerns,
    memoriesExtracted: review.memoriesExtracted,
  };
}

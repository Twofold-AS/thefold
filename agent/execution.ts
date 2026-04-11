import type { AgentExecutionContext } from "./types";
import type { PhaseTracker } from "./metrics";
import type { ExecutionHelpers, ExecutionResult } from "./execution-retry";
import { runPlanPhase } from "./execution-plan";
import { runBuildLoop } from "./execution-build";

// Re-export all public types and utilities so existing imports are unaffected
export type { RetryContext, ExecutionResult, ExecutionHelpers } from "./execution-retry";
export { computeSimpleDiff, computeRetryContext } from "./execution-retry";

/**
 * STEP 5-7(retry): Plan, build, validate, retry.
 *
 * Orchestrates runPlanPhase (strategy hint → plan → sub-agents) and
 * runBuildLoop (sandbox → builder → validate → diagnose → retry).
 *
 * Returns ExecutionResult. agent.ts handles review and completion (STEP 8+).
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
  const planResult = await runPlanPhase(ctx, contextData, tracker, helpers);
  return runBuildLoop(ctx, contextData, planResult, tracker, helpers, options);
}

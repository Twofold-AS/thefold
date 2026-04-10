import log from "encore.dev/log";
import type { AgentPhase } from "./state-machine";

/**
 * Token budget limits per agent phase.
 * These are HARD limits — phase will be stopped if exceeded.
 */
export const PHASE_TOKEN_LIMITS: Record<string, number> = {
  context: 50_000,        // Context gathering
  confidence: 10_000,     // Confidence + complexity assessment
  planning: 30_000,       // Plan generation
  building: 200_000,      // Code generation (highest)
  validating: 50_000,     // Validation + fix-loops
  reviewing: 30_000,      // AI review
  completing: 10_000,     // PR + cleanup
  diagnosis: 20_000,      // Failure diagnosis
};

/**
 * Check if a phase has exceeded its token budget.
 * Returns true if over the limit.
 */
export function isOverTokenBudget(phase: string, tokensUsed: number): boolean {
  const limit = PHASE_TOKEN_LIMITS[phase];
  if (!limit) return false;
  return tokensUsed > limit;
}

/**
 * Alias for backward compatibility
 */
export const isOverBudget = isOverTokenBudget;

/**
 * Log a warning if the phase token budget is exceeded.
 * Called after each AI call to track spending.
 */
export function warnIfOverBudget(phase: string, tokensUsed: number, taskId?: string): void {
  if (isOverTokenBudget(phase, tokensUsed)) {
    const limit = PHASE_TOKEN_LIMITS[phase];
    log.warn("Phase token budget exceeded", {
      phase,
      tokensUsed,
      limit,
      overage: tokensUsed - limit!,
      taskId,
    });
  }
}

/**
 * Get the budget limit for a phase. Returns undefined for unknown phases.
 */
export function getBudgetLimit(phase: string): number | undefined {
  return PHASE_TOKEN_LIMITS[phase];
}

/**
 * Calculate remaining budget for a phase.
 * Returns 0 if already over budget, undefined if phase unknown.
 */
export function remainingBudget(phase: string, tokensUsed: number): number | undefined {
  const limit = PHASE_TOKEN_LIMITS[phase];
  if (limit === undefined) return undefined;
  return Math.max(0, limit - tokensUsed);
}

/**
 * Policy action returned by enforcePolicy.
 * - "continue": within budget, no action needed
 * - "warn": at or just over budget, log a warning
 * - "stop": significantly over budget (>=1.5x), stop the phase
 */
export type PolicyAction = "continue" | "warn" | "stop";

/**
 * Budget map keyed by AgentPhase — mirrors PHASE_TOKEN_LIMITS but typed to AgentPhase.
 */
const PHASE_BUDGETS: Partial<Record<AgentPhase, number>> = {
  context: 50_000,
  confidence: 10_000,
  planning: 30_000,
  building: 200_000,
  validating: 50_000,
  reviewing: 30_000,
};

/**
 * Enforce the token policy for a given phase.
 * Returns "stop" when tokensUsed >= 1.5x the budget (severe overage).
 * Returns "warn" when tokensUsed >= 1.0x the budget (at or just over limit).
 * Returns "continue" otherwise.
 */
export function enforcePolicy(phase: AgentPhase, tokensUsed: number): PolicyAction {
  const budget = PHASE_BUDGETS[phase];
  if (!budget) return "continue";
  const ratio = tokensUsed / budget;
  if (ratio >= 1.5) return "stop";
  if (ratio >= 1.0) return "warn";
  return "continue";
}

import log from "encore.dev/log";

/**
 * Token budget limits per agent phase.
 * For now: logging only (warning when exceeded).
 * Hard enforcement deferred to a future prompt.
 */
export const PHASE_TOKEN_LIMITS: Record<string, number> = {
  confidence: 2_000,
  planning: 8_000,
  building: 50_000,
  diagnosis: 4_000,
  review: 8_000,
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
      overage: tokensUsed - limit,
      taskId,
    });
  }
}

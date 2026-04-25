// agent/plan-coordinator.ts
//
// In-memory coordinator for Runde 3-A (plan-preview) and 3-B (interrupt).
// Both flows use the same pattern: a master-task ID maps to a Promise the
// iterator awaits, plus a timer that auto-resolves the wait. Confirmation
// or interrupt endpoints resolve the Promise from outside the iterator.
//
// State lives in module-level Maps. Single-process for now (Encore.ts
// runtime is single-node); horizontal scale would need a Pub/Sub or DB
// signal — not on the roadmap yet.

import log from "encore.dev/log";

export type PlanResolution = "confirmed" | "cancelled";

interface PlanWaitEntry {
  resolve: (r: PlanResolution) => void;
  timer: ReturnType<typeof setTimeout> | null;
  /** Increments each time a plan-edit triggers a re-emit. */
  iteration: number;
}

const planWaits = new Map<string, PlanWaitEntry>();

/**
 * Wait for plan confirmation (or cancellation) for a master task. Resolves
 * with `"confirmed"` when `confirmPlan(masterId)` is called, the timer
 * elapses (auto-confirm), OR the master is part of an externally cancelled
 * conversation. Resolves `"cancelled"` when `cancelPlan(masterId)` is called.
 */
export function waitForPlanConfirm(
  masterId: string,
  countdownMs: number,
): Promise<PlanResolution> {
  return new Promise<PlanResolution>((resolve) => {
    // Clean up any earlier wait (shouldn't happen — defensive).
    const existing = planWaits.get(masterId);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      log.info("plan-coordinator: auto-confirm fired", { masterId, countdownMs });
      const entry = planWaits.get(masterId);
      planWaits.delete(masterId);
      entry?.resolve("confirmed");
    }, countdownMs);

    planWaits.set(masterId, { resolve, timer, iteration: 1 });
  });
}

/** Confirm a pending plan immediately (user clicked "Kjør i gang"). */
export function confirmPlan(masterId: string): boolean {
  const entry = planWaits.get(masterId);
  if (!entry) return false;
  if (entry.timer) clearTimeout(entry.timer);
  planWaits.delete(masterId);
  entry.resolve("confirmed");
  return true;
}

/** Cancel a pending plan (user clicked "Avbryt"). */
export function cancelPlan(masterId: string): boolean {
  const entry = planWaits.get(masterId);
  if (!entry) return false;
  if (entry.timer) clearTimeout(entry.timer);
  planWaits.delete(masterId);
  entry.resolve("cancelled");
  return true;
}

/**
 * Reset the auto-confirm timer when the user is editing the plan via chat.
 * Returns the new iteration counter (lets the new plan_ready event tag
 * "iteration: N" so frontend resets countdown UI).
 */
export function resetPlanCountdown(masterId: string, countdownMs: number): number {
  const entry = planWaits.get(masterId);
  if (!entry) return 0;
  if (entry.timer) clearTimeout(entry.timer);
  entry.iteration += 1;
  entry.timer = setTimeout(() => {
    log.info("plan-coordinator: auto-confirm fired (post-edit)", { masterId, countdownMs });
    const e = planWaits.get(masterId);
    planWaits.delete(masterId);
    e?.resolve("confirmed");
  }, countdownMs);
  return entry.iteration;
}

/** True if there's a plan currently awaiting user confirmation. */
export function isPlanPending(masterId: string): boolean {
  return planWaits.has(masterId);
}

// ─────────────────────────────────────────────────────────────────────────
// Runde 3-B — interrupt flag.
// Iterator polls this between sub-task transitions. Set via
// /agent/interrupt-master endpoint, cleared on resume.

const interruptFlags = new Map<string, string>();

/** Mark a master as interrupted. Stored user message becomes the prompt
 *  for the agent's response when it stops. */
export function setInterrupt(masterId: string, userMessage: string): void {
  interruptFlags.set(masterId, userMessage);
}

/** Read + clear interrupt flag. Returns the user message that triggered
 *  it, or undefined if none. Iterator calls this between phases. */
export function consumeInterrupt(masterId: string): string | undefined {
  const msg = interruptFlags.get(masterId);
  if (msg !== undefined) interruptFlags.delete(masterId);
  return msg;
}

/** True if a master is currently flagged for interrupt (for UI checks). */
export function isInterrupted(masterId: string): boolean {
  return interruptFlags.has(masterId);
}

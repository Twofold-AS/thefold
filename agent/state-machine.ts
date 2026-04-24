import log from "encore.dev/log";

// All legal phases
export type AgentPhase =
  | "idle"
  | "preparing"
  | "context"
  | "confidence"
  | "needs_input"
  | "planning"
  | "building"
  | "validating"
  | "reviewing"
  | "pending_review"
  | "creating_pr"
  | "completed"
  | "failed"
  | "stopped";

// Legal transitions.
//
// This matrix reflects ALL real code paths in the agent — including the
// tool-loop-driven flow where planning → reviewing (skipping building/
// validating because the AI orchestrates those internally via tools),
// the fast-path context → planning (skips confidence when a cached decision
// with confidence > 0.85 exists), and skipReview completion paths.
//
// Every active phase allows transitions to "failed" (recoverable) and
// "stopped" (user cancellation) so cancel-mid-run works from anywhere.
// "needs_input" can go back to "confidence" if the user's clarification
// triggers a re-assessment rather than immediately resuming.
export const VALID_TRANSITIONS: Record<AgentPhase, AgentPhase[]> = {
  idle:           ["preparing"],
  preparing:      ["context", "failed", "stopped"],
  context:        ["confidence", "planning", "failed", "stopped"], // planning = fast-path skip
  confidence:     ["planning", "needs_input", "failed", "stopped"],
  needs_input:    ["confidence", "planning", "stopped"],             // confidence = re-assess
  planning:       ["building", "reviewing", "completed", "failed", "stopped"], // reviewing = tool-loop direct; completed = collectOnly
  building:       ["validating", "reviewing", "failed", "stopped"],   // reviewing = tool-loop direct
  validating:     ["reviewing", "building", "failed", "stopped"],     // building = retry
  reviewing:      ["pending_review", "completed", "failed", "stopped"], // completed = skipReview
  pending_review: ["creating_pr", "building", "failed", "stopped"],   // building = request changes
  creating_pr:    ["completed", "failed", "stopped"],
  completed:      ["idle"],
  failed:         ["idle"],
  stopped:        ["idle"],
};

export interface TransitionResult {
  allowed: boolean;
  from: AgentPhase;
  to: AgentPhase;
  reason?: string;
}

export interface AgentStateMachine {
  current: AgentPhase;
  taskId: string;
  history: Array<{ from: AgentPhase; to: AgentPhase; timestamp: number }>;
  transitionTo(next: AgentPhase): TransitionResult;
  canTransitionTo(next: AgentPhase): boolean;
  reset(): void;
}

export function createStateMachine(taskId: string): AgentStateMachine {
  let current: AgentPhase = "idle";
  const history: Array<{ from: AgentPhase; to: AgentPhase; timestamp: number }> = [];

  const sm: AgentStateMachine = {
    get current() {
      return current;
    },
    set current(_val: AgentPhase) {
      // Read-only from outside — use transitionTo()
    },
    taskId,
    history,

    transitionTo(next: AgentPhase): TransitionResult {
      const from = current;
      const allowed = VALID_TRANSITIONS[from]?.includes(next) ?? false;

      if (!allowed) {
        log.warn(`[STATE-MACHINE] Illegal transition: ${from} -> ${next} for task ${taskId}`);
        return {
          allowed: false,
          from,
          to: next,
          reason: `Illegal transition: ${from} -> ${next}`,
        };
      }

      current = next;
      history.push({ from, to: next, timestamp: Date.now() });
      return { allowed: true, from, to: next };
    },

    canTransitionTo(next: AgentPhase): boolean {
      return VALID_TRANSITIONS[current]?.includes(next) ?? false;
    },

    reset(): void {
      current = "idle";
      history.length = 0;
    },
  };

  return sm;
}

// Helper to validate an entire sequence (used in tests)
export function validateSequence(phases: AgentPhase[]): { valid: boolean; failedAt?: number } {
  for (let i = 1; i < phases.length; i++) {
    const from = phases[i - 1];
    const to = phases[i];
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      return { valid: false, failedAt: i };
    }
  }
  return { valid: true };
}

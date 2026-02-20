import { secret } from "encore.dev/config";
import log from "encore.dev/log";

// Feature flag — Encore secret (package level)
const AgentStateMachineStrict = secret("AgentStateMachineStrict");

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

// Legal transitions
export const VALID_TRANSITIONS: Record<AgentPhase, AgentPhase[]> = {
  idle:           ["preparing"],
  preparing:      ["context", "failed"],
  context:        ["confidence", "failed"],
  confidence:     ["planning", "needs_input", "failed"],
  needs_input:    ["planning", "stopped"],
  planning:       ["building", "failed"],
  building:       ["validating", "failed", "stopped"],
  validating:     ["reviewing", "building", "failed"],  // building = retry
  reviewing:      ["pending_review", "failed"],
  pending_review: ["creating_pr", "building", "stopped"], // building = request changes
  creating_pr:    ["completed", "failed"],
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

function isStrictMode(): boolean {
  try {
    return AgentStateMachineStrict() === "true";
  } catch {
    // Secret not set or error reading — default to permissive mode
    return false;
  }
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

        if (isStrictMode()) {
          return {
            allowed: false,
            from,
            to: next,
            reason: `Illegal transition: ${from} -> ${next}`,
          };
        }

        // Permissive mode: allow but log
        current = next;
        history.push({ from, to: next, timestamp: Date.now() });
        return { allowed: true, from, to: next };
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

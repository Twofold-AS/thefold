import { describe, it, expect } from "vitest";
import { createStateMachine, validateSequence, VALID_TRANSITIONS, type AgentPhase } from "./state-machine";

// Helper: get the minimal path to reach a given phase
function getPathTo(target: AgentPhase): AgentPhase[] {
  const paths: Record<string, AgentPhase[]> = {
    preparing: ["preparing"],
    context: ["preparing", "context"],
    confidence: ["preparing", "context", "confidence"],
    needs_input: ["preparing", "context", "confidence", "needs_input"],
    planning: ["preparing", "context", "confidence", "planning"],
    building: ["preparing", "context", "confidence", "planning", "building"],
    validating: ["preparing", "context", "confidence", "planning", "building", "validating"],
    reviewing: ["preparing", "context", "confidence", "planning", "building", "validating", "reviewing"],
    pending_review: ["preparing", "context", "confidence", "planning", "building", "validating", "reviewing", "pending_review"],
    creating_pr: ["preparing", "context", "confidence", "planning", "building", "validating", "reviewing", "pending_review", "creating_pr"],
    completed: ["preparing", "context", "confidence", "planning", "building", "validating", "reviewing", "pending_review", "creating_pr", "completed"],
    failed: ["preparing", "failed"],
    stopped: ["preparing", "context", "confidence", "needs_input", "stopped"],
  };
  return paths[target] || [];
}

describe("Agent State Machine", () => {
  // Test 1: Happy path — full cycle
  it("should allow complete happy path", () => {
    const sm = createStateMachine("test-1");
    const phases: AgentPhase[] = [
      "preparing", "context", "confidence", "planning",
      "building", "validating", "reviewing", "pending_review",
      "creating_pr", "completed", "idle",
    ];
    for (const phase of phases) {
      const result = sm.transitionTo(phase);
      expect(result.allowed).toBe(true);
    }
    expect(sm.current).toBe("idle");
    expect(sm.history).toHaveLength(phases.length);
  });

  // Test 2: Retry path — validating → building → validating
  it("should allow retry loop", () => {
    const sm = createStateMachine("test-2");
    sm.transitionTo("preparing");
    sm.transitionTo("context");
    sm.transitionTo("confidence");
    sm.transitionTo("planning");
    sm.transitionTo("building");
    sm.transitionTo("validating");
    // Retry
    const retry = sm.transitionTo("building");
    expect(retry.allowed).toBe(true);
    expect(sm.current).toBe("building");
  });

  // Test 3: Needs_input path
  it("should allow needs_input flow", () => {
    const sm = createStateMachine("test-3");
    sm.transitionTo("preparing");
    sm.transitionTo("context");
    sm.transitionTo("confidence");
    const needsInput = sm.transitionTo("needs_input");
    expect(needsInput.allowed).toBe(true);
    // User responds → planning
    const resume = sm.transitionTo("planning");
    expect(resume.allowed).toBe(true);
  });

  // Test 4: Illegal transition detected
  it("should detect illegal transitions", () => {
    const sm = createStateMachine("test-4");
    // idle → building is not legal (must go through preparing, context, etc.)
    expect(sm.canTransitionTo("building")).toBe(false);
  });

  // Test 5: Failed from any active phase
  it("should allow transition to failed from any active phase", () => {
    const activePhases: AgentPhase[] = [
      "preparing", "context", "confidence", "planning",
      "building", "validating", "reviewing", "creating_pr",
    ];
    for (const phase of activePhases) {
      const sm = createStateMachine(`test-fail-${phase}`);
      // Navigate to the phase
      const path = getPathTo(phase);
      for (const p of path) sm.transitionTo(p);
      // Should be able to fail
      const result = sm.transitionTo("failed");
      expect(result.allowed).toBe(true);
      expect(sm.current).toBe("failed");
    }
  });

  // Test 6: Stopped from building/needs_input/pending_review
  it("should allow stopped from stoppable phases", () => {
    const stoppablePhases: AgentPhase[] = ["building", "needs_input", "pending_review"];
    for (const phase of stoppablePhases) {
      const sm = createStateMachine(`test-stop-${phase}`);
      const path = getPathTo(phase);
      for (const p of path) sm.transitionTo(p);
      const result = sm.transitionTo("stopped");
      expect(result.allowed).toBe(true);
    }
  });

  // Test 7: History tracking
  it("should track transition history with timestamps", () => {
    const sm = createStateMachine("test-history");
    sm.transitionTo("preparing");
    sm.transitionTo("context");
    expect(sm.history).toHaveLength(2);
    expect(sm.history[0].from).toBe("idle");
    expect(sm.history[0].to).toBe("preparing");
    expect(sm.history[1].from).toBe("preparing");
    expect(sm.history[1].to).toBe("context");
    expect(typeof sm.history[0].timestamp).toBe("number");
  });

  // Test 8: Reset
  it("should reset to idle and clear history", () => {
    const sm = createStateMachine("test-reset");
    sm.transitionTo("preparing");
    sm.transitionTo("context");
    sm.reset();
    expect(sm.current).toBe("idle");
    expect(sm.history).toHaveLength(0);
  });

  // Test 9: validateSequence helper
  it("should validate complete sequences", () => {
    expect(validateSequence(["idle", "preparing", "context", "confidence", "planning"]).valid).toBe(true);
    expect(validateSequence(["idle", "building"]).valid).toBe(false);
    expect(validateSequence(["idle", "building"]).failedAt).toBe(1);
  });

  // Test 10: Request changes path (pending_review → building)
  it("should allow request changes flow", () => {
    const sm = createStateMachine("test-changes");
    for (const p of getPathTo("pending_review")) sm.transitionTo(p);
    const result = sm.transitionTo("building");
    expect(result.allowed).toBe(true);
  });

  // Test 11: All transitions in VALID_TRANSITIONS are reachable
  it("should have all phases in VALID_TRANSITIONS", () => {
    const allPhases: AgentPhase[] = [
      "idle", "preparing", "context", "confidence", "needs_input",
      "planning", "building", "validating", "reviewing", "pending_review",
      "creating_pr", "completed", "failed", "stopped",
    ];
    for (const phase of allPhases) {
      expect(VALID_TRANSITIONS).toHaveProperty(phase);
    }
  });

  // Test 12: skipReview path (reviewing → pending_review → creating_pr)
  it("should allow skipReview path", () => {
    const sm = createStateMachine("test-skip-review");
    for (const p of getPathTo("validating")) sm.transitionTo(p);
    sm.transitionTo("reviewing");
    // skipReview still goes through pending_review → creating_pr
    sm.transitionTo("pending_review");
    const result = sm.transitionTo("creating_pr");
    expect(result.allowed).toBe(true);
  });
});

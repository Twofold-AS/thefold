import { describe, it, expect } from "vitest";
import { isOverTokenBudget, PHASE_TOKEN_LIMITS, warnIfOverBudget } from "./token-policy";

describe("token-policy", () => {
  it("should return false for tokens under limit", () => {
    expect(isOverTokenBudget("building", 30000)).toBe(false);
  });

  it("should return true for tokens over limit", () => {
    expect(isOverTokenBudget("building", 60000)).toBe(true);
  });

  it("should return false for unknown phase", () => {
    expect(isOverTokenBudget("unknown_phase", 999999)).toBe(false);
  });

  it("should have limits for all expected phases", () => {
    expect(PHASE_TOKEN_LIMITS.confidence).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.planning).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.building).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.diagnosis).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.review).toBeDefined();
  });

  it("should return true for tokens exactly at limit + 1", () => {
    const limit = PHASE_TOKEN_LIMITS.confidence;
    expect(isOverTokenBudget("confidence", limit)).toBe(false);
    expect(isOverTokenBudget("confidence", limit + 1)).toBe(true);
  });

  it("warnIfOverBudget should not throw", () => {
    // Just verify it doesn't throw — logging is side-effect only
    expect(() => warnIfOverBudget("building", 100000, "task-123")).not.toThrow();
    expect(() => warnIfOverBudget("building", 1000, "task-123")).not.toThrow();
    expect(() => warnIfOverBudget("unknown", 999999)).not.toThrow();
  });
});

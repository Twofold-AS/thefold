import { describe, it, expect } from "vitest";
import { isOverTokenBudget, isOverBudget, getBudgetLimit, remainingBudget, PHASE_TOKEN_LIMITS, warnIfOverBudget } from "./token-policy";

describe("token-policy", () => {
  it("isOverTokenBudget returns true when over limit", () => {
    expect(isOverTokenBudget("confidence", 15_000)).toBe(true);
    expect(isOverTokenBudget("building", 250_000)).toBe(true);
  });

  it("isOverTokenBudget returns false when under limit", () => {
    expect(isOverTokenBudget("confidence", 5_000)).toBe(false);
    expect(isOverTokenBudget("building", 100_000)).toBe(false);
  });

  it("isOverTokenBudget returns false for unknown phase", () => {
    expect(isOverTokenBudget("unknown_phase", 999_999)).toBe(false);
  });

  it("isOverBudget is alias for isOverTokenBudget", () => {
    expect(isOverBudget("confidence", 15_000)).toBe(true);
    expect(isOverBudget("confidence", 5_000)).toBe(false);
  });

  it("building phase has highest limit", () => {
    const max = Math.max(...Object.values(PHASE_TOKEN_LIMITS));
    expect(PHASE_TOKEN_LIMITS.building).toBe(max);
    expect(PHASE_TOKEN_LIMITS.building).toBe(200_000);
  });

  it("getBudgetLimit returns correct limits", () => {
    expect(getBudgetLimit("confidence")).toBe(10_000);
    expect(getBudgetLimit("building")).toBe(200_000);
    expect(getBudgetLimit("unknown")).toBeUndefined();
  });

  it("remainingBudget calculates correctly", () => {
    expect(remainingBudget("building", 150_000)).toBe(50_000);
    expect(remainingBudget("building", 250_000)).toBe(0);
    expect(remainingBudget("unknown", 100)).toBeUndefined();
  });

  it("warnIfOverBudget should not throw", () => {
    // Just verify it doesn't throw — logging is side-effect only
    expect(() => warnIfOverBudget("building", 300_000, "task-123")).not.toThrow();
    expect(() => warnIfOverBudget("building", 1_000, "task-123")).not.toThrow();
    expect(() => warnIfOverBudget("unknown", 999_999)).not.toThrow();
  });

  it("should have limits for all expected phases", () => {
    expect(PHASE_TOKEN_LIMITS.context).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.confidence).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.planning).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.building).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.validating).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.reviewing).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.completing).toBeDefined();
    expect(PHASE_TOKEN_LIMITS.diagnosis).toBeDefined();
  });
});

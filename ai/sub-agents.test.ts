import { describe, it, expect, vi } from "vitest";
import {
  getModelForRole,
  getSystemPromptForRole,
  getMaxTokensForRole,
  ROLE_MODEL_MAP,
  type SubAgentRole,
  type BudgetMode,
} from "./sub-agents";
import {
  planSubAgents,
  executeSubAgents,
  mergeResults,
  sumCosts,
  sumTokens,
  estimateSubAgentCostPreview,
  type SubAgentPlan,
} from "./orchestrate-sub-agents";

// --- getModelForRole ---

describe("getModelForRole", () => {
  it("returns correct models for balanced mode", () => {
    expect(getModelForRole("planner", "balanced")).toBe("claude-sonnet-4-5-20250929");
    expect(getModelForRole("implementer", "balanced")).toBe("claude-sonnet-4-5-20250929");
    expect(getModelForRole("tester", "balanced")).toBe("claude-haiku-4-5-20251001");
    expect(getModelForRole("reviewer", "balanced")).toBe("claude-sonnet-4-5-20250929");
    expect(getModelForRole("documenter", "balanced")).toBe("claude-haiku-4-5-20251001");
    expect(getModelForRole("researcher", "balanced")).toBe("claude-haiku-4-5-20251001");
  });

  it("respects quality_first mode", () => {
    expect(getModelForRole("implementer", "quality_first")).toBe("claude-opus-4-5-20251101");
    expect(getModelForRole("reviewer", "quality_first")).toBe("claude-opus-4-5-20251101");
    expect(getModelForRole("tester", "quality_first")).toBe("claude-sonnet-4-5-20250929");
  });

  it("respects aggressive_save mode", () => {
    const roles: SubAgentRole[] = ["planner", "implementer", "tester", "reviewer", "documenter", "researcher"];
    for (const role of roles) {
      expect(getModelForRole(role, "aggressive_save")).toBe("claude-haiku-4-5-20251001");
    }
  });

  it("defaults to balanced when no mode specified", () => {
    expect(getModelForRole("planner")).toBe("claude-sonnet-4-5-20250929");
    expect(getModelForRole("tester")).toBe("claude-haiku-4-5-20251001");
  });
});

// --- getSystemPromptForRole ---

describe("getSystemPromptForRole", () => {
  it("returns non-empty prompts for all roles", () => {
    const roles: SubAgentRole[] = ["planner", "implementer", "tester", "reviewer", "documenter", "researcher"];
    for (const role of roles) {
      const prompt = getSystemPromptForRole(role);
      expect(prompt.length).toBeGreaterThan(50);
    }
  });

  it("includes role-specific content", () => {
    expect(getSystemPromptForRole("tester")).toContain("test");
    expect(getSystemPromptForRole("reviewer")).toContain("review");
    expect(getSystemPromptForRole("implementer")).toContain("implementation");
  });
});

// --- planSubAgents ---

describe("planSubAgents", () => {
  it("returns empty plan for complexity < 5", () => {
    const plan = planSubAgents("task", "plan", 4);
    expect(plan.agents).toHaveLength(0);
    expect(plan.mergeStrategy).toBe("concatenate");
  });

  it("returns empty plan for complexity 1", () => {
    const plan = planSubAgents("task", "plan", 1);
    expect(plan.agents).toHaveLength(0);
  });

  it("returns implementer + tester for complexity 5-7", () => {
    const plan = planSubAgents("build a feature", "1. create file", 6);
    expect(plan.agents).toHaveLength(2);
    const roles = plan.agents.map((a) => a.role);
    expect(roles).toContain("implementer");
    expect(roles).toContain("tester");
    expect(plan.mergeStrategy).toBe("concatenate");
  });

  it("returns full team for complexity 8-9", () => {
    const plan = planSubAgents("complex refactor", "many steps", 9);
    expect(plan.agents.length).toBeGreaterThanOrEqual(4);
    const roles = plan.agents.map((a) => a.role);
    expect(roles).toContain("planner");
    expect(roles).toContain("implementer");
    expect(roles).toContain("tester");
    expect(roles).toContain("reviewer");
    expect(plan.mergeStrategy).toBe("ai_merge");
  });

  it("includes documenter at complexity 10", () => {
    const plan = planSubAgents("huge task", "many steps", 10);
    const roles = plan.agents.map((a) => a.role);
    expect(roles).toContain("documenter");
  });

  it("does not include documenter at complexity 9", () => {
    const plan = planSubAgents("complex task", "many steps", 9);
    const roles = plan.agents.map((a) => a.role);
    expect(roles).not.toContain("documenter");
  });

  it("sets correct dependencies for complexity 8+", () => {
    const plan = planSubAgents("task", "plan", 8);
    const planner = plan.agents.find((a) => a.role === "planner");
    expect(planner).toBeDefined();
    expect(planner!.dependsOn).toHaveLength(0);

    const implementer = plan.agents.find((a) => a.role === "implementer");
    expect(implementer!.dependsOn).toContain(planner!.id);
  });

  it("budget mode affects model selection", () => {
    const balanced = planSubAgents("task", "plan", 6, "balanced");
    const aggressive = planSubAgents("task", "plan", 6, "aggressive_save");

    const balancedModels = balanced.agents.map((a) => a.model);
    const aggressiveModels = aggressive.agents.map((a) => a.model);

    // Balanced uses sonnet for implementer, aggressive uses haiku
    expect(balancedModels).toContain("claude-sonnet-4-5-20250929");
    expect(aggressiveModels.every((m) => m === "claude-haiku-4-5-20251001")).toBe(true);
  });
});

// --- executeSubAgents ---

describe("executeSubAgents", () => {
  it("returns empty results for empty plan", async () => {
    const results = await executeSubAgents({ agents: [], mergeStrategy: "concatenate" });
    expect(results).toHaveLength(0);
  });

  // Integration tests that call real AI are skipped in unit tests
  // These would need mocking of callAIWithFallback
});

// --- mergeResults ---

describe("mergeResults", () => {
  it("concatenate joins results with role headers", async () => {
    const results = [
      { id: "1", role: "implementer" as SubAgentRole, model: "sonnet", output: "code here", costUsd: 0.01, tokensUsed: 100, durationMs: 500, success: true },
      { id: "2", role: "tester" as SubAgentRole, model: "haiku", output: "tests here", costUsd: 0.005, tokensUsed: 50, durationMs: 300, success: true },
    ];

    const merged = await mergeResults(results, "concatenate");
    expect(merged).toContain("implementer");
    expect(merged).toContain("code here");
    expect(merged).toContain("tester");
    expect(merged).toContain("tests here");
  });

  it("concatenate skips failed results", async () => {
    const results = [
      { id: "1", role: "implementer" as SubAgentRole, model: "sonnet", output: "code", costUsd: 0.01, tokensUsed: 100, durationMs: 500, success: true },
      { id: "2", role: "tester" as SubAgentRole, model: "haiku", output: "", costUsd: 0, tokensUsed: 0, durationMs: 100, success: false, error: "failed" },
    ];

    const merged = await mergeResults(results, "concatenate");
    expect(merged).toContain("code");
    expect(merged).not.toContain("tester");
  });

  it("returns empty string when all results failed", async () => {
    const results = [
      { id: "1", role: "implementer" as SubAgentRole, model: "sonnet", output: "", costUsd: 0, tokensUsed: 0, durationMs: 100, success: false, error: "err" },
    ];

    const merged = await mergeResults(results, "concatenate");
    expect(merged).toBe("");
  });
});

// --- Cost helpers ---

describe("cost tracking", () => {
  it("sumCosts accumulates correctly", () => {
    const results = [
      { id: "1", role: "implementer" as SubAgentRole, model: "m", output: "", costUsd: 0.05, tokensUsed: 500, durationMs: 100, success: true },
      { id: "2", role: "tester" as SubAgentRole, model: "m", output: "", costUsd: 0.02, tokensUsed: 200, durationMs: 100, success: true },
      { id: "3", role: "reviewer" as SubAgentRole, model: "m", output: "", costUsd: 0.03, tokensUsed: 300, durationMs: 100, success: false },
    ];

    expect(sumCosts(results)).toBeCloseTo(0.10, 5);
    expect(sumTokens(results)).toBe(1000);
  });
});

// --- Cost estimation preview ---

describe("estimateSubAgentCostPreview", () => {
  it("returns equal costs for low complexity (no sub-agents)", () => {
    const preview = estimateSubAgentCostPreview(3);
    expect(preview.agents).toHaveLength(0);
    expect(preview.withSubAgents).toBe(preview.withoutSubAgents);
    expect(preview.speedupEstimate).toBe("1x");
  });

  it("returns agent breakdown for medium complexity", () => {
    const preview = estimateSubAgentCostPreview(6);
    expect(preview.agents.length).toBeGreaterThan(0);
    expect(preview.agents.every((a) => a.estimatedCostUsd > 0)).toBe(true);
  });

  it("returns more agents for high complexity", () => {
    const medium = estimateSubAgentCostPreview(6);
    const high = estimateSubAgentCostPreview(9);
    expect(high.agents.length).toBeGreaterThan(medium.agents.length);
  });

  it("budget mode affects cost estimates", () => {
    const balanced = estimateSubAgentCostPreview(7, "balanced");
    const aggressive = estimateSubAgentCostPreview(7, "aggressive_save");
    // Aggressive save should be cheaper
    expect(aggressive.withSubAgents).toBeLessThanOrEqual(balanced.withSubAgents);
  });
});

// --- getMaxTokensForRole ---

describe("getMaxTokensForRole", () => {
  it("returns higher tokens for implementer than documenter", () => {
    expect(getMaxTokensForRole("implementer")).toBeGreaterThan(getMaxTokensForRole("documenter"));
  });

  it("returns positive values for all roles", () => {
    const roles: SubAgentRole[] = ["planner", "implementer", "tester", "reviewer", "documenter", "researcher"];
    for (const role of roles) {
      expect(getMaxTokensForRole(role)).toBeGreaterThan(0);
    }
  });
});

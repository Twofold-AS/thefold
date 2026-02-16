import { describe, it, expect } from "vitest";
import {
  selectOptimalModel,
  getUpgradeModel,
  estimateCost,
  calculateSavings,
  getModelInfo,
  listModels,
} from "./router";

describe("AI Router", () => {
  describe("selectOptimalModel", () => {
    it("auto mode picks moonshot for simple tasks", () => {
      const model = selectOptimalModel(2, "auto");
      expect(model).toBe("moonshot-v1-128k");
    });

    it("auto mode picks sonnet for medium tasks", () => {
      const model = selectOptimalModel(5, "auto");
      expect(model).toBe("claude-sonnet-4-5-20250929");
    });

    it("auto mode picks opus for complex tasks", () => {
      const model = selectOptimalModel(9, "auto");
      expect(model).toBe("claude-opus-4-5-20251101");
    });

    it("manual mode respects override", () => {
      const model = selectOptimalModel(2, "manual", "claude-opus-4-5-20251101");
      expect(model).toBe("claude-opus-4-5-20251101");
    });

    it("auto mode boundary: complexity 3 uses moonshot", () => {
      expect(selectOptimalModel(3, "auto")).toBe("moonshot-v1-128k");
    });

    it("auto mode boundary: complexity 4 uses sonnet", () => {
      expect(selectOptimalModel(4, "auto")).toBe("claude-sonnet-4-5-20250929");
    });

    it("auto mode boundary: complexity 7 uses sonnet", () => {
      expect(selectOptimalModel(7, "auto")).toBe("claude-sonnet-4-5-20250929");
    });

    it("auto mode boundary: complexity 8 uses opus", () => {
      expect(selectOptimalModel(8, "auto")).toBe("claude-opus-4-5-20251101");
    });

    it("defaults to auto mode when not specified", () => {
      expect(selectOptimalModel(1)).toBe("moonshot-v1-128k");
      expect(selectOptimalModel(5)).toBe("claude-sonnet-4-5-20250929");
      expect(selectOptimalModel(8)).toBe("claude-opus-4-5-20251101");
    });

    it("manual mode without override falls back to auto logic", () => {
      const model = selectOptimalModel(5, "manual");
      expect(model).toBe("claude-sonnet-4-5-20250929");
    });
  });

  describe("getUpgradeModel", () => {
    // Tier-based upgrade with provider affinity:
    // tier 1 → tier 2 → tier 3 → tier 5

    it("should upgrade kimi 32k to haiku (next tier up)", () => {
      expect(getUpgradeModel("moonshot-v1-32k")).toBe("claude-haiku-4-5-20251001");
    });

    it("should upgrade kimi 128k to haiku", () => {
      expect(getUpgradeModel("moonshot-v1-128k")).toBe("claude-haiku-4-5-20251001");
    });

    it("should upgrade haiku to sonnet (provider affinity)", () => {
      expect(getUpgradeModel("claude-haiku-4-5-20251001")).toBe("claude-sonnet-4-5-20250929");
    });

    it("should upgrade sonnet to opus", () => {
      expect(getUpgradeModel("claude-sonnet-4-5-20250929")).toBe("claude-opus-4-5-20251101");
    });

    it("should return null for opus (already highest)", () => {
      expect(getUpgradeModel("claude-opus-4-5-20251101")).toBeNull();
    });

    it("should upgrade gpt-4o-mini to haiku (next tier up)", () => {
      expect(getUpgradeModel("gpt-4o-mini")).toBe("claude-haiku-4-5-20251001");
    });

    it("should upgrade gpt-4o to opus", () => {
      expect(getUpgradeModel("gpt-4o")).toBe("claude-opus-4-5-20251101");
    });

    it("should return null for unknown models", () => {
      expect(getUpgradeModel("unknown-model")).toBeNull();
    });
  });

  describe("estimateCost", () => {
    it("should calculate cost for sonnet correctly", () => {
      const cost = estimateCost(1_000_000, 500_000, "claude-sonnet-4-5-20250929");
      expect(cost.model).toBe("claude-sonnet-4-5-20250929");
      expect(cost.inputTokens).toBe(1_000_000);
      expect(cost.outputTokens).toBe(500_000);
      expect(cost.inputCost).toBe(3.00); // $3/1M input
      expect(cost.outputCost).toBe(7.50); // $15/1M * 0.5M
      expect(cost.totalCost).toBe(10.50);
    });

    it("should calculate cost for moonshot", () => {
      const cost = estimateCost(1_000_000, 500_000, "moonshot-v1-128k");
      // $0.60/1M input, $2.00/1M output
      expect(cost.inputCost).toBeCloseTo(0.60, 10);
      expect(cost.outputCost).toBeCloseTo(1.00, 10);
      expect(cost.totalCost).toBeCloseTo(1.60, 10);
    });

    it("should return zero cost for unknown models", () => {
      const cost = estimateCost(1_000_000, 500_000, "unknown-model");
      expect(cost.totalCost).toBe(0);
    });

    it("should handle zero tokens", () => {
      const cost = estimateCost(0, 0, "claude-sonnet-4-5-20250929");
      expect(cost.totalCost).toBe(0);
    });
  });

  describe("calculateSavings", () => {
    it("should show savings when using moonshot vs opus", () => {
      const savings = calculateSavings(100_000, 50_000, "moonshot-v1-128k");
      expect(savings.actualCost).toBeGreaterThan(0);
      expect(savings.opusCost).toBeGreaterThan(savings.actualCost);
      expect(savings.savedUsd).toBeGreaterThan(0);
      expect(savings.savedPercent).toBeGreaterThan(0);
    });

    it("should show zero savings when using opus", () => {
      const savings = calculateSavings(100_000, 50_000, "claude-opus-4-5-20251101");
      expect(savings.savedUsd).toBe(0);
      expect(savings.savedPercent).toBe(0);
    });

    it("should calculate correct percentage", () => {
      const savings = calculateSavings(1_000_000, 0, "moonshot-v1-128k");
      // Moonshot: $0.60, Opus: $15.00
      // Savings: $14.40 / $15.00 = 96%
      expect(savings.savedPercent).toBeGreaterThan(90);
    });
  });

  describe("getModelInfo", () => {
    it("should return info for known models", () => {
      const info = getModelInfo("claude-sonnet-4-5-20250929");
      expect(info).not.toBeNull();
      expect(info!.displayName).toBe("Claude Sonnet 4.5");
      expect(info!.tier).toBe(3);
      expect(info!.provider).toBe("anthropic");
    });

    it("should return info for moonshot models", () => {
      const info = getModelInfo("moonshot-v1-128k");
      expect(info).not.toBeNull();
      expect(info!.displayName).toBe("Kimi K2.5");
      expect(info!.provider).toBe("moonshot");
    });

    it("should return null for unknown models", () => {
      expect(getModelInfo("nonexistent")).toBeNull();
    });
  });

  describe("listModels", () => {
    it("should return all registered models", () => {
      const models = listModels();
      expect(models.length).toBeGreaterThanOrEqual(7);
    });

    it("should include required fields on each model", () => {
      const models = listModels();
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.displayName).toBeDefined();
        expect(model.tier).toBeGreaterThanOrEqual(1);
        expect(model.inputCostPer1M).toBeGreaterThan(0);
        expect(model.outputCostPer1M).toBeGreaterThan(0);
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.strengths.length).toBeGreaterThan(0);
        expect(model.bestFor.length).toBeGreaterThan(0);
      }
    });

    it("should include moonshot, anthropic, and openai models", () => {
      const models = listModels();
      const providers = new Set(models.map((m) => m.provider));
      expect(providers.has("moonshot")).toBe(true);
      expect(providers.has("anthropic")).toBe(true);
      expect(providers.has("openai")).toBe(true);
    });
  });
});

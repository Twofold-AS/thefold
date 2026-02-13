import { describe, it, expect } from "vitest";
import {
  selectOptimalModel,
  getUpgradeModel,
  estimateCost,
  calculateSavings,
  getModelInfo,
  listModels,
  MODEL_REGISTRY,
} from "./router";

describe("AI Router", () => {
  describe("selectOptimalModel", () => {
    it("should return haiku for low complexity with balanced mode", () => {
      expect(selectOptimalModel(1, "balanced")).toBe("claude-haiku-4-20250514");
      expect(selectOptimalModel(2, "balanced")).toBe("claude-haiku-4-20250514");
      expect(selectOptimalModel(3, "balanced")).toBe("claude-haiku-4-20250514");
    });

    it("should return sonnet for medium complexity with balanced mode", () => {
      expect(selectOptimalModel(4, "balanced")).toBe("claude-sonnet-4-20250514");
      expect(selectOptimalModel(5, "balanced")).toBe("claude-sonnet-4-20250514");
      expect(selectOptimalModel(6, "balanced")).toBe("claude-sonnet-4-20250514");
    });

    it("should return opus for high complexity with balanced mode", () => {
      expect(selectOptimalModel(7, "balanced")).toBe("claude-opus-4-20250514");
      expect(selectOptimalModel(8, "balanced")).toBe("claude-opus-4-20250514");
      expect(selectOptimalModel(10, "balanced")).toBe("claude-opus-4-20250514");
    });

    it("should always return haiku for aggressive_save mode", () => {
      expect(selectOptimalModel(1, "aggressive_save")).toBe("claude-haiku-4-20250514");
      expect(selectOptimalModel(5, "aggressive_save")).toBe("claude-haiku-4-20250514");
      expect(selectOptimalModel(10, "aggressive_save")).toBe("claude-haiku-4-20250514");
    });

    it("should always return opus for quality_first mode", () => {
      expect(selectOptimalModel(1, "quality_first")).toBe("claude-opus-4-20250514");
      expect(selectOptimalModel(5, "quality_first")).toBe("claude-opus-4-20250514");
      expect(selectOptimalModel(10, "quality_first")).toBe("claude-opus-4-20250514");
    });

    it("should default to balanced mode when not specified", () => {
      expect(selectOptimalModel(1)).toBe("claude-haiku-4-20250514");
      expect(selectOptimalModel(5)).toBe("claude-sonnet-4-20250514");
      expect(selectOptimalModel(8)).toBe("claude-opus-4-20250514");
    });
  });

  describe("getUpgradeModel", () => {
    it("should upgrade haiku to sonnet", () => {
      expect(getUpgradeModel("claude-haiku-4-20250514")).toBe("claude-sonnet-4-20250514");
    });

    it("should upgrade sonnet to opus", () => {
      expect(getUpgradeModel("claude-sonnet-4-20250514")).toBe("claude-opus-4-20250514");
    });

    it("should return null for opus (already highest)", () => {
      expect(getUpgradeModel("claude-opus-4-20250514")).toBeNull();
    });

    it("should upgrade gpt-4o-mini to gpt-4o", () => {
      expect(getUpgradeModel("gpt-4o-mini")).toBe("gpt-4o");
    });

    it("should return null for unknown models", () => {
      expect(getUpgradeModel("unknown-model")).toBeNull();
    });
  });

  describe("estimateCost", () => {
    it("should calculate cost for sonnet correctly", () => {
      const cost = estimateCost(1_000_000, 500_000, "claude-sonnet-4-20250514");
      expect(cost.model).toBe("claude-sonnet-4-20250514");
      expect(cost.inputTokens).toBe(1_000_000);
      expect(cost.outputTokens).toBe(500_000);
      expect(cost.inputCost).toBe(3.00); // $3/1M input
      expect(cost.outputCost).toBe(7.50); // $15/1M * 0.5M
      expect(cost.totalCost).toBe(10.50);
    });

    it("should calculate cost for haiku (cheaper)", () => {
      const cost = estimateCost(1_000_000, 500_000, "claude-haiku-4-20250514");
      expect(cost.inputCost).toBe(0.80);
      expect(cost.outputCost).toBe(2.00);
      expect(cost.totalCost).toBe(2.80);
    });

    it("should return zero cost for unknown models", () => {
      const cost = estimateCost(1_000_000, 500_000, "unknown-model");
      expect(cost.totalCost).toBe(0);
    });

    it("should handle zero tokens", () => {
      const cost = estimateCost(0, 0, "claude-sonnet-4-20250514");
      expect(cost.totalCost).toBe(0);
    });
  });

  describe("calculateSavings", () => {
    it("should show savings when using haiku vs opus", () => {
      const savings = calculateSavings(100_000, 50_000, "claude-haiku-4-20250514");
      expect(savings.actualCost).toBeGreaterThan(0);
      expect(savings.opusCost).toBeGreaterThan(savings.actualCost);
      expect(savings.savedUsd).toBeGreaterThan(0);
      expect(savings.savedPercent).toBeGreaterThan(0);
    });

    it("should show zero savings when using opus", () => {
      const savings = calculateSavings(100_000, 50_000, "claude-opus-4-20250514");
      expect(savings.savedUsd).toBe(0);
      expect(savings.savedPercent).toBe(0);
    });

    it("should calculate correct percentage", () => {
      const savings = calculateSavings(1_000_000, 0, "claude-haiku-4-20250514");
      // Haiku: $0.80, Opus: $15.00
      // Savings: $14.20 / $15.00 = 94.67%
      expect(savings.savedPercent).toBeGreaterThan(90);
    });
  });

  describe("getModelInfo", () => {
    it("should return info for known models", () => {
      const info = getModelInfo("claude-sonnet-4-20250514");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("Claude Sonnet 4");
      expect(info!.tier).toBe("mid");
      expect(info!.provider).toBe("anthropic");
    });

    it("should return null for unknown models", () => {
      expect(getModelInfo("nonexistent")).toBeNull();
    });
  });

  describe("listModels", () => {
    it("should return all registered models", () => {
      const models = listModels();
      expect(models.length).toBe(Object.keys(MODEL_REGISTRY).length);
      expect(models.length).toBeGreaterThanOrEqual(5);
    });

    it("should include required fields on each model", () => {
      const models = listModels();
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.tier).toBeDefined();
        expect(model.inputCostPer1M).toBeGreaterThan(0);
        expect(model.outputCostPer1M).toBeGreaterThan(0);
        expect(model.strengths.length).toBeGreaterThan(0);
      }
    });
  });
});

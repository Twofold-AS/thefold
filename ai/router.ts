import { api } from "encore.dev/api";

// --- Types ---

export type ModelMode = "auto" | "manual";

export interface ModelInfo {
  id: string;
  provider: "anthropic" | "openai" | "moonshot";
  displayName: string;
  tier: number; // 1-5 (1 = billigst, 5 = best)
  inputCostPer1M: number;  // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  contextWindow: number;
  strengths: string[];
  bestFor: string[];
}

export interface CostEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

// --- Model Registry ---

export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  // MOONSHOT (billigst)
  "moonshot-v1-128k": {
    id: "moonshot-v1-128k",
    provider: "moonshot",
    displayName: "Moonshot Kimi v1 128K",
    tier: 1,
    inputCostPer1M: 0.30,
    outputCostPer1M: 0.30,
    contextWindow: 128000,
    strengths: ["Ekstremt rimelig", "Stor kontekst"],
    bestFor: ["Daglige oppgaver", "Dokumentasjon"],
  },

  "moonshot-v1-32k": {
    id: "moonshot-v1-32k",
    provider: "moonshot",
    displayName: "Moonshot Kimi v1 32K",
    tier: 1,
    inputCostPer1M: 0.24,
    outputCostPer1M: 0.24,
    contextWindow: 32000,
    strengths: ["Billigst", "Rask"],
    bestFor: ["Sm\u00e5 oppgaver"],
  },

  // CLAUDE 4.5 (production-ready)
  "claude-haiku-4-5-20251001": {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    displayName: "Claude Haiku 4.5",
    tier: 2,
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    contextWindow: 200000,
    strengths: ["Rask", "Rimelig"],
    bestFor: ["Enkle tasks", "Tester"],
  },

  "claude-sonnet-4-5-20250929": {
    id: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.5",
    tier: 3,
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 200000,
    strengths: ["Balansert", "P\u00e5litelig"],
    bestFor: ["De fleste oppgaver", "Produksjonskode"],
  },

  "claude-opus-4-5-20251101": {
    id: "claude-opus-4-5-20251101",
    provider: "anthropic",
    displayName: "Claude Opus 4.5",
    tier: 5,
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
    contextWindow: 200000,
    strengths: ["H\u00f8yeste kvalitet", "Komplekse problemer"],
    bestFor: ["Arkitektur", "Kritisk kode"],
  },

  // GPT (backup)
  "gpt-4o": {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    tier: 3,
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    contextWindow: 128000,
    strengths: ["Allsidig", "Kode", "Multimodal"],
    bestFor: ["Generelle oppgaver"],
  },

  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o Mini",
    tier: 1,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    contextWindow: 128000,
    strengths: ["Rask", "Billig"],
    bestFor: ["Enkle oppgaver"],
  },

  // Claude 4.6 — legg til n\u00e5r tilgjengelig:
  // "claude-sonnet-4-6-YYYYMMDD": { ... },
  // "claude-opus-4-6-YYYYMMDD": { ... },
};

// --- Tier Upgrade Path ---

const TIER_UPGRADE: Record<string, string> = {
  "moonshot-v1-32k": "moonshot-v1-128k",
  "moonshot-v1-128k": "claude-haiku-4-5-20251001",
  "claude-haiku-4-5-20251001": "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-5-20250929": "claude-opus-4-5-20251101",
  "gpt-4o-mini": "gpt-4o",
  "gpt-4o": "claude-opus-4-5-20251101",
};

// --- Core Functions ---

/**
 * Velg optimal modell basert p\u00e5 kompleksitet og modus.
 *
 * mode = "auto": AI velger basert p\u00e5 kompleksitet
 * mode = "manual": Bruker velger selv (krever manualModelId)
 *
 * Complexity scale: 1-10
 *   1-3: Enkel (formattering, renaming, sm\u00e5 fikser)
 *   4-7: Medium (feature-implementasjon, refaktorering)
 *   8-10: Kompleks (arkitektur, multi-service, debugging)
 */
export function selectOptimalModel(
  complexity: number,
  mode: ModelMode = "auto",
  manualModelId?: string
): string {
  // Manuelt valg — bruk den
  if (mode === "manual" && manualModelId) {
    return manualModelId;
  }

  // Auto: velg basert p\u00e5 kompleksitet
  if (complexity <= 3) {
    return "moonshot-v1-128k";           // Enkel → Kimi
  } else if (complexity <= 7) {
    return "claude-sonnet-4-5-20250929"; // Medium → Sonnet
  } else {
    return "claude-opus-4-5-20251101";   // Kompleks → Opus
  }
}

/**
 * Get the next tier model when current model fails.
 * Returns null if already at highest tier.
 */
export function getUpgradeModel(currentModel: string): string | null {
  return TIER_UPGRADE[currentModel] || null;
}

/**
 * Estimate cost for a given token usage and model.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string
): CostEstimate {
  const model = MODEL_REGISTRY[modelId];
  if (!model) {
    // Unknown model — return zero cost estimate
    return {
      model: modelId,
      inputTokens,
      outputTokens,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
    };
  }

  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;

  return {
    model: modelId,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Get model info by ID. Returns null for unknown models.
 */
export function getModelInfo(modelId: string): ModelInfo | null {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * List all available models.
 */
export function listModels(): ModelInfo[] {
  return Object.values(MODEL_REGISTRY);
}

/**
 * Calculate savings compared to always using Opus.
 */
export function calculateSavings(
  inputTokens: number,
  outputTokens: number,
  actualModel: string
): { actualCost: number; opusCost: number; savedUsd: number; savedPercent: number } {
  const actual = estimateCost(inputTokens, outputTokens, actualModel);
  const opus = estimateCost(inputTokens, outputTokens, "claude-opus-4-5-20251101");
  const savedUsd = opus.totalCost - actual.totalCost;
  const savedPercent = opus.totalCost > 0 ? (savedUsd / opus.totalCost) * 100 : 0;

  return {
    actualCost: actual.totalCost,
    opusCost: opus.totalCost,
    savedUsd,
    savedPercent,
  };
}

// --- Model Listing Endpoint ---

interface ListModelsResponse {
  models: ModelInfo[];
}

export const listAvailableModels = api(
  { method: "GET", path: "/ai/models", expose: true, auth: true },
  async (): Promise<ListModelsResponse> => {
    return { models: listModels() };
  }
);

// --- Cost Estimation Endpoint ---

interface EstimateCostRequest {
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}

interface EstimateCostResponse {
  estimate: CostEstimate;
  savings: { actualCost: number; opusCost: number; savedUsd: number; savedPercent: number };
}

export const getEstimatedCost = api(
  { method: "POST", path: "/ai/estimate-cost", expose: true, auth: true },
  async (req: EstimateCostRequest): Promise<EstimateCostResponse> => {
    const estimate = estimateCost(req.inputTokens, req.outputTokens, req.modelId);
    const savings = calculateSavings(req.inputTokens, req.outputTokens, req.modelId);

    return { estimate, savings };
  }
);

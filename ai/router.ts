import { api } from "encore.dev/api";
import { db } from "./db";

// --- Types ---

export type ModelMode = "auto" | "manual";

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  tier: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
  strengths: string[];
  bestFor: string[];
  supportsTools: boolean;
  supportsVision: boolean;
}

export interface CostEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

// --- Fallback Models (used before DB cache loads) ---

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", displayName: "Claude Haiku 4.5", tier: 2, inputCostPer1M: 0.80, outputCostPer1M: 4.00, contextWindow: 200000, strengths: ["fast", "cheap", "review"], bestFor: ["fast", "cheap", "review"], supportsTools: true, supportsVision: false },
  { id: "claude-sonnet-4-5-20250929", provider: "anthropic", displayName: "Claude Sonnet 4.5", tier: 3, inputCostPer1M: 3.00, outputCostPer1M: 15.00, contextWindow: 200000, strengths: ["planning", "coding", "review"], bestFor: ["planning", "coding", "review"], supportsTools: true, supportsVision: false },
  { id: "claude-opus-4-5-20251101", provider: "anthropic", displayName: "Claude Opus 4.5", tier: 5, inputCostPer1M: 15.00, outputCostPer1M: 75.00, contextWindow: 200000, strengths: ["planning", "coding", "review", "reasoning"], bestFor: ["planning", "coding", "review", "reasoning"], supportsTools: true, supportsVision: false },
];

// --- DB-backed Model Cache ---

let cachedModels: ModelInfo[] = [...FALLBACK_MODELS];
let cacheTime = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

interface DBModelRow {
  model_id: string;
  display_name: string;
  input_price: string | number;
  output_price: string | number;
  context_window: number;
  tags: string | string[];
  tier: number;
  supports_tools: boolean;
  supports_vision: boolean;
  provider_slug: string;
}

/** Refresh the in-memory model cache from DB. */
export async function refreshModelCache(): Promise<void> {
  try {
    const rows = db.query<DBModelRow>`
      SELECT m.model_id, m.display_name, m.input_price, m.output_price,
        m.context_window, m.tags, m.tier, m.supports_tools, m.supports_vision,
        p.slug AS provider_slug
      FROM ai_models m
      JOIN ai_providers p ON p.id = m.provider_id
      WHERE m.enabled = true AND p.enabled = true AND p.api_key_set = true
      ORDER BY m.tier ASC, m.input_price ASC
    `;

    const models: ModelInfo[] = [];
    for await (const row of rows) {
      const tags = typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags || []);
      models.push({
        id: row.model_id,
        provider: row.provider_slug,
        displayName: row.display_name,
        tier: row.tier,
        inputCostPer1M: Number(row.input_price),
        outputCostPer1M: Number(row.output_price),
        contextWindow: row.context_window,
        strengths: tags,
        bestFor: tags,
        supportsTools: row.supports_tools,
        supportsVision: row.supports_vision,
      });
    }

    if (models.length > 0) {
      cachedModels = models;
    }
    cacheTime = Date.now();
  } catch {
    // DB unavailable — keep current cache
  }
}

/** Trigger a non-blocking cache refresh if stale. */
function ensureCacheFresh(): void {
  if (Date.now() - cacheTime > CACHE_TTL_MS) {
    refreshModelCache().catch(() => {});
  }
}

// --- Default model IDs for auto-routing ---

const DEFAULT_SIMPLE = "claude-haiku-4-5-20251001";
const DEFAULT_MEDIUM = "claude-sonnet-4-5-20250929";
const DEFAULT_COMPLEX = "claude-opus-4-5-20251101";

// --- Core Functions ---

/**
 * Select optimal model based on context tags and mode.
 *
 * mode = "auto": picks from DB-backed cache based on tag matching
 * mode = "manual": uses manualModelId directly
 *
 * context: "chat" | "coding" | "planning" | "review" | "analysis" | "fast"
 * Models are matched by their `bestFor` tags, not by tier/cost.
 */
export function selectOptimalModel(
  complexity: number,
  mode: ModelMode = "auto",
  manualModelId?: string,
  context?: string
): string {
  if (mode === "manual" && manualModelId) {
    return manualModelId;
  }

  ensureCacheFresh();

  // Tag-based selection: find models that match the requested context
  if (context) {
    const matching = cachedModels.filter(m => m.bestFor.includes(context));
    if (matching.length > 0) {
      return matching[0].id;
    }
  }

  // No context match — use defaults based on complexity range
  let targetId: string;
  if (complexity <= 3) targetId = DEFAULT_SIMPLE;
  else if (complexity <= 7) targetId = DEFAULT_MEDIUM;
  else targetId = DEFAULT_COMPLEX;

  // Verify target exists in cache (is enabled)
  if (cachedModels.some((m) => m.id === targetId)) {
    return targetId;
  }

  // Fallback: first available model with tool support
  const withTools = cachedModels.filter(m => m.supportsTools);
  return withTools[0]?.id || cachedModels[0]?.id || targetId;
}

/**
 * Get a more capable model when current model fails.
 * Prefers same provider, picks models with more tags (broader capability).
 * Returns null if no upgrade available.
 */
export function getUpgradeModel(currentModel: string): string | null {
  ensureCacheFresh();

  const current = cachedModels.find((m) => m.id === currentModel);
  if (!current) return null;
  const currentProvider = current.provider;

  const upgrades = cachedModels
    .filter((m) => m.id !== currentModel && m.bestFor.length >= current.bestFor.length)
    .sort((a, b) => {
      // Prefer same provider
      const aSame = a.provider === currentProvider ? 0 : 1;
      const bSame = b.provider === currentProvider ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      // More capabilities = better upgrade
      return b.bestFor.length - a.bestFor.length;
    });

  return upgrades[0]?.id || null;
}

/**
 * Estimate cost for a given token usage and model.
 * Uses pricing from DB-backed cache.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string
): CostEstimate {
  ensureCacheFresh();

  const model = cachedModels.find((m) => m.id === modelId);
  if (!model) {
    return { model: modelId, inputTokens, outputTokens, inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;

  return { model: modelId, inputTokens, outputTokens, inputCost, outputCost, totalCost: inputCost + outputCost };
}

/**
 * Get model info by ID. Returns null for unknown models.
 */
export function getModelInfo(modelId: string): ModelInfo | null {
  ensureCacheFresh();
  return cachedModels.find((m) => m.id === modelId) || null;
}

/**
 * List all available models from cache.
 */
export function listModels(): ModelInfo[] {
  ensureCacheFresh();
  return cachedModels;
}

/**
 * Calculate savings compared to using the highest-tier model.
 */
export function calculateSavings(
  inputTokens: number,
  outputTokens: number,
  actualModel: string
): { actualCost: number; opusCost: number; savedUsd: number; savedPercent: number } {
  const actual = estimateCost(inputTokens, outputTokens, actualModel);

  ensureCacheFresh();
  const highestTier = cachedModels.reduce((max, m) => (m.tier > max.tier ? m : max), cachedModels[0]);
  const opus = estimateCost(inputTokens, outputTokens, highestTier?.id || "claude-opus-4-5-20251101");

  const savedUsd = opus.totalCost - actual.totalCost;
  const savedPercent = opus.totalCost > 0 ? (savedUsd / opus.totalCost) * 100 : 0;

  return { actualCost: actual.totalCost, opusCost: opus.totalCost, savedUsd, savedPercent };
}

// --- Endpoints ---

interface ListModelsResponse {
  models: ModelInfo[];
}

export const listAvailableModels = api(
  { method: "GET", path: "/ai/models", expose: true, auth: true },
  async (): Promise<ListModelsResponse> => {
    await refreshModelCache();
    return { models: cachedModels };
  }
);

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

// --- Sub-Agent Cost Estimation Endpoint ---

import {
  estimateSubAgentCostPreview,
  type SubAgentCostPreview,
} from "./orchestrate-sub-agents";
import type { BudgetMode } from "./sub-agents";

interface EstimateSubAgentCostRequest {
  complexity: number;
  budgetMode?: BudgetMode;
}

export const estimateSubAgentCost = api(
  { method: "POST", path: "/ai/estimate-sub-agent-cost", expose: true, auth: true },
  async (req: EstimateSubAgentCostRequest): Promise<SubAgentCostPreview> => {
    const complexity = Math.max(1, Math.min(10, req.complexity));
    return estimateSubAgentCostPreview(complexity, req.budgetMode || "balanced");
  }
);

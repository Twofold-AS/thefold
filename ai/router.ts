import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { db } from "./db";

// --- Model slug cache (U11) ---
// Small in-process cache so /ai/chat doesn't hit the DB for every message.
// 60-second TTL — slugs change only when an admin updates the seed.

const SLUG_CACHE_TTL_MS = 60_000;
let slugCache: Map<string, { slug: string; expiresAt: number }> = new Map();

export async function resolveModelSlug(modelId: string): Promise<string> {
  const now = Date.now();
  const hit = slugCache.get(modelId);
  if (hit && hit.expiresAt > now) return hit.slug;
  try {
    const row = await db.queryRow<{ slug: string | null; display_name: string }>`
      SELECT slug, display_name FROM ai_models WHERE model_id = ${modelId}
    `;
    const slug = row?.slug ?? row?.display_name ?? modelId;
    slugCache.set(modelId, { slug, expiresAt: now + SLUG_CACHE_TTL_MS });
    return slug;
  } catch (err) {
    log.warn("resolveModelSlug failed", {
      modelId,
      error: err instanceof Error ? err.message : String(err),
    });
    return modelId;
  }
}

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

/** Ensure the in-memory model cache is fresh; awaits the DB refresh if stale. */
async function ensureCacheFresh(): Promise<void> {
  if (Date.now() - cacheTime > CACHE_TTL_MS) {
    await refreshModelCache();
  }
}

/** Force-invalidate the in-memory model cache. Call after save/toggle/delete. */
export function invalidateModelCache(): void {
  cacheTime = 0;
}

// --- Model Capabilities (for vision/tools gating) ---
//
// Source of truth is the DB (ai_models.supports_tools / supports_vision).
// This supplement covers model IDs that haven't been added to the DB yet
// (new releases, aliased tags). getCapabilities() checks DB cache first,
// falls back to this map, and finally to a conservative all-false default.

export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  maxInput: number;
  maxOutput: number;
  provider: string;
}

const CAPABILITY_SUPPLEMENT: Record<string, ModelCapabilities> = {
  "claude-sonnet-4-6":          { vision: true,  tools: true, maxInput: 200_000,   maxOutput: 16_000, provider: "anthropic" },
  "claude-opus-4-7":            { vision: true,  tools: true, maxInput: 200_000,   maxOutput: 32_000, provider: "anthropic" },
  "claude-opus-4-7[1m]":        { vision: true,  tools: true, maxInput: 1_000_000, maxOutput: 32_000, provider: "anthropic" },
  "claude-haiku-4-5-20251001":  { vision: false, tools: true, maxInput: 200_000,   maxOutput: 8_000,  provider: "anthropic" },
  "claude-sonnet-4-5-20250929": { vision: false, tools: true, maxInput: 200_000,   maxOutput: 16_000, provider: "anthropic" },
  "claude-opus-4-5-20251101":   { vision: false, tools: true, maxInput: 200_000,   maxOutput: 32_000, provider: "anthropic" },
  "minimax-m2":                 { vision: false, tools: true, maxInput: 100_000,   maxOutput: 4_000,  provider: "minimax" },
  "gpt-4o":                     { vision: true,  tools: true, maxInput: 128_000,   maxOutput: 4_096,  provider: "openai" },
  "gpt-4o-mini":                { vision: true,  tools: true, maxInput: 128_000,   maxOutput: 16_384, provider: "openai" },
  "gemini-2.0-flash":           { vision: true,  tools: true, maxInput: 1_000_000, maxOutput: 8_192,  provider: "google" },
  "gemini-2.0-pro":             { vision: true,  tools: true, maxInput: 2_000_000, maxOutput: 8_192,  provider: "google" },
};

export function getCapabilities(modelId: string): ModelCapabilities | null {
  // Prefer DB-cached model info (has authoritative supports_vision/tools).
  const cached = cachedModels.find((m) => m.id === modelId);
  if (cached) {
    return {
      vision: cached.supportsVision,
      tools: cached.supportsTools,
      maxInput: cached.contextWindow,
      maxOutput: CAPABILITY_SUPPLEMENT[modelId]?.maxOutput ?? 4_096,
      provider: cached.provider,
    };
  }
  return CAPABILITY_SUPPLEMENT[modelId] ?? null;
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
 * When multiple candidates exist at the same tier and context, picks cheapest.
 */
export async function selectOptimalModel(
  complexity: number,
  mode: ModelMode = "auto",
  manualModelId?: string,
  context?: string
): Promise<string> {
  if (mode === "manual" && manualModelId) {
    return manualModelId;
  }

  await ensureCacheFresh();

  // Tag-based selection: find models that match the requested context
  if (context) {
    const matching = cachedModels.filter(m => m.bestFor.includes(context));
    if (matching.length > 0) {
      // When multiple candidates at same tier, pick cheapest
      if (matching.length > 1) {
        const grouped = new Map<number, typeof matching>();
        for (const m of matching) {
          if (!grouped.has(m.tier)) grouped.set(m.tier, []);
          grouped.get(m.tier)!.push(m);
        }
        // Get candidates at the highest tier that has matches
        const topTier = Math.max(...grouped.keys());
        const topTierModels = grouped.get(topTier)!;

        // Sort by total cost (input + output per 1M tokens) ascending
        topTierModels.sort((a, b) => {
          const costA = a.inputCostPer1M + a.outputCostPer1M;
          const costB = b.inputCostPer1M + b.outputCostPer1M;
          return costA - costB;
        });
        return topTierModels[0].id;
      }
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
 * Smart-select model for chat turn. Considers:
 *   - `manualModelId`: explicit user override, always wins
 *   - `needsVision`: filter to vision-capable models (framer/figma + scrape/screenshot in msg)
 *   - `context`: role-tag-based matching ("coding" | "planning" | ...)
 *   - `complexity`: fallback to tier-based default
 * Picks the cheapest (input_price) model remaining after filters.
 * Degrades gracefully: if no vision-model matches, drops the vision filter.
 */
export interface SmartSelectParams {
  manualModelId?: string | null;
  needsVision?: boolean;
  context?: string;
  complexity?: number;
}
export async function smartSelect(params: SmartSelectParams): Promise<string> {
  if (params.manualModelId) return params.manualModelId;

  await ensureCacheFresh();

  let pool = [...cachedModels];

  // Apply vision filter first (hard requirement if flagged)
  if (params.needsVision) {
    const visionPool = pool.filter((m) => m.supportsVision);
    if (visionPool.length > 0) {
      pool = visionPool;
    }
    // else: fall through without filter (can't satisfy → prefer SOMETHING over nothing)
  }

  // Apply role-tag filter on top
  if (params.context) {
    const contextPool = pool.filter((m) => m.bestFor.includes(params.context!));
    if (contextPool.length > 0) {
      pool = contextPool;
    }
  }

  // Pick cheapest by input_price
  pool.sort((a, b) => a.inputCostPer1M - b.inputCostPer1M);
  if (pool.length > 0) return pool[0].id;

  // Nothing in cache — fall back to complexity-based default
  return selectOptimalModel(params.complexity ?? 5, "auto");
}

/** Heuristic: does the user message or task description imply a need for
 *  image/vision capability? Used for auto vision-gate in framer projects. */
export function inferNeedsVision(text: string): boolean {
  return /scrape|screenshot|skjermbilde|replike|bilde|image|design|layout/i.test(text);
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
 * Find the best enabled Anthropic model that supports tool-use.
 * Returns null if no such model is in the current cache (e.g. all Anthropic models disabled).
 */
export function getAnthropicToolModel(): string | null {
  ensureCacheFresh();
  const m = cachedModels.find(m => m.provider === "anthropic" && m.supportsTools);
  return m?.id ?? null;
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

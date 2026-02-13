import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";

const anthropicKey = secret("AnthropicAPIKey");

// --- Types ---

export type BudgetMode = "aggressive_save" | "balanced" | "quality_first";

export interface ModelInfo {
  id: string;
  provider: "anthropic" | "openai" | "moonshot";
  name: string;
  tier: "low" | "mid" | "high";
  inputCostPer1M: number;  // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  maxOutputTokens: number;
  strengths: string[];
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
  "claude-haiku-4-20250514": {
    id: "claude-haiku-4-20250514",
    provider: "anthropic",
    name: "Claude Haiku 4",
    tier: "low",
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    maxOutputTokens: 8192,
    strengths: ["fast", "simple tasks", "formatting", "classification"],
  },
  "claude-sonnet-4-20250514": {
    id: "claude-sonnet-4-20250514",
    provider: "anthropic",
    name: "Claude Sonnet 4",
    tier: "mid",
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    maxOutputTokens: 16384,
    strengths: ["balanced", "code generation", "planning", "analysis"],
  },
  "claude-opus-4-20250514": {
    id: "claude-opus-4-20250514",
    provider: "anthropic",
    name: "Claude Opus 4",
    tier: "high",
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
    maxOutputTokens: 32768,
    strengths: ["complex reasoning", "architecture", "multi-step", "debugging"],
  },
  "gpt-4o": {
    id: "gpt-4o",
    provider: "openai",
    name: "GPT-4o",
    tier: "mid",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    maxOutputTokens: 16384,
    strengths: ["general purpose", "code", "multimodal"],
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    name: "GPT-4o Mini",
    tier: "low",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    maxOutputTokens: 16384,
    strengths: ["fast", "cheap", "simple tasks"],
  },
};

// --- Tier Upgrade Path ---

const TIER_UPGRADE: Record<string, string> = {
  "claude-haiku-4-20250514": "claude-sonnet-4-20250514",
  "claude-sonnet-4-20250514": "claude-opus-4-20250514",
  "gpt-4o-mini": "gpt-4o",
  "gpt-4o": "claude-opus-4-20250514",
};

// --- Core Functions ---

/**
 * Select the optimal model based on task complexity and budget mode.
 *
 * Complexity scale: 1-10
 *   1-3: Simple (formatting, renaming, small fixes)
 *   4-6: Medium (feature implementation, refactoring)
 *   7-10: Complex (architecture, multi-service, debugging)
 */
export function selectOptimalModel(
  complexity: number,
  budgetMode: BudgetMode = "balanced"
): string {
  switch (budgetMode) {
    case "aggressive_save":
      // Always start with cheapest, rely on fallback for complex tasks
      return "claude-haiku-4-20250514";

    case "quality_first":
      // Always use best model
      return "claude-opus-4-20250514";

    case "balanced":
    default:
      if (complexity <= 3) return "claude-haiku-4-20250514";
      if (complexity <= 6) return "claude-sonnet-4-20250514";
      return "claude-opus-4-20250514";
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
  const opus = estimateCost(inputTokens, outputTokens, "claude-opus-4-20250514");
  const savedUsd = opus.totalCost - actual.totalCost;
  const savedPercent = opus.totalCost > 0 ? (savedUsd / opus.totalCost) * 100 : 0;

  return {
    actualCost: actual.totalCost,
    opusCost: opus.totalCost,
    savedUsd,
    savedPercent,
  };
}

// --- Complexity Assessment Endpoint ---

interface AssessComplexityRequest {
  taskDescription: string;
  projectStructure?: string;
  fileCount?: number;
}

interface AssessComplexityResponse {
  complexity: number; // 1-10
  reasoning: string;
  suggestedModel: string;
  tokensUsed: number;
}

export const assessComplexity = api(
  { method: "POST", path: "/ai/assess-complexity", expose: false },
  async (req: AssessComplexityRequest): Promise<AssessComplexityResponse> => {
    // Use Haiku for complexity assessment itself (meta-task, should be cheap)
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: anthropicKey() });

    let prompt = `Rate the complexity of this development task on a scale of 1-10.

## Task
${req.taskDescription}
`;

    if (req.projectStructure) {
      prompt += `\n## Project Structure (${req.fileCount || "unknown"} files)\n\`\`\`\n${req.projectStructure.substring(0, 2000)}\n\`\`\`\n`;
    }

    prompt += `
## Complexity Scale
1-3: Simple (rename variable, fix typo, add field, small UI change)
4-6: Medium (new endpoint, refactor function, add feature, write tests)
7-10: Complex (new service, multi-file architecture, debugging race conditions, cross-service changes)

Respond with JSON only:
{"complexity": <number 1-10>, "reasoning": "<one sentence>"}`;

    const response = await client.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") {
      throw APIError.internal("no text in complexity assessment response");
    }

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

    try {
      // Strip markdown fences if present
      let jsonText = text.text.trim();
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText);
      const complexity = Math.max(1, Math.min(10, Math.round(parsed.complexity)));

      return {
        complexity,
        reasoning: parsed.reasoning || "",
        suggestedModel: selectOptimalModel(complexity, "balanced"),
        tokensUsed,
      };
    } catch {
      // Default to medium complexity if parsing fails
      return {
        complexity: 5,
        reasoning: "Failed to parse complexity assessment, defaulting to medium",
        suggestedModel: "claude-sonnet-4-20250514",
        tokensUsed,
      };
    }
  }
);

// --- Model Listing Endpoint ---

interface ListModelsResponse {
  models: ModelInfo[];
}

export const listAvailableModels = api(
  { method: "GET", path: "/ai/models", expose: false },
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
  { method: "POST", path: "/ai/estimate-cost", expose: false },
  async (req: EstimateCostRequest): Promise<EstimateCostResponse> => {
    const estimate = estimateCost(req.inputTokens, req.outputTokens, req.modelId);
    const savings = calculateSavings(req.inputTokens, req.outputTokens, req.modelId);

    return { estimate, savings };
  }
);

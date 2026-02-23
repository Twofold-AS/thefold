import { secret } from "encore.dev/config";
import type { AIProviderAdapter, StandardRequest, StandardResponse, ProviderRequest } from "./provider-interface";
import { anthropicProvider } from "./providers/anthropic";
import { openaiProvider } from "./providers/openai";
import { openrouterProvider } from "./providers/openrouter";
import { fireworksProvider } from "./providers/fireworks";

// --- Feature flag ---
const ZMultiProvider = secret("ZMultiProvider");

// --- API key secrets for each provider ---
const AnthropicAPIKey = secret("AnthropicAPIKey");
const OpenRouterApiKey = secret("OpenRouterApiKey");
const FireworksApiKey = secret("FireworksApiKey");
const OpenAIApiKey = secret("OpenAIAPIKey");

// --- Provider Registry ---

/**
 * Map of provider ID to AIProviderAdapter implementation.
 * New providers are added here.
 */
const PROVIDER_MAP: Record<string, AIProviderAdapter> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  openrouter: openrouterProvider,
  fireworks: fireworksProvider,
};

/**
 * Map of provider ID to the Encore secret accessor for its API key.
 * Each provider's API key is stored as an Encore secret.
 */
const API_KEY_MAP: Record<string, () => string> = {
  anthropic: AnthropicAPIKey,
  openai: OpenAIApiKey,
  openrouter: OpenRouterApiKey,
  fireworks: FireworksApiKey,
};

/**
 * Check if the multi-provider feature flag is enabled.
 * When disabled, only Anthropic is available (existing behavior).
 * When enabled, all registered providers are available.
 */
export function isMultiProviderEnabled(): boolean {
  try {
    return ZMultiProvider() === "true";
  } catch {
    return false;
  }
}

/**
 * Get provider adapter by ID.
 *
 * When ZMultiProvider is disabled, only "anthropic" is allowed.
 * When enabled, all registered providers are available.
 *
 * @throws Error if provider ID is unknown or not enabled
 */
export function getProvider(providerId: string): AIProviderAdapter {
  // When multi-provider is disabled, only Anthropic works
  if (!isMultiProviderEnabled() && providerId !== "anthropic") {
    throw new Error(
      `Provider "${providerId}" is not available. Multi-provider support is disabled (ZMultiProvider = false). Only "anthropic" is available.`
    );
  }

  const provider = PROVIDER_MAP[providerId];
  if (!provider) {
    throw new Error(
      `Unknown provider: "${providerId}". Available providers: ${Object.keys(PROVIDER_MAP).join(", ")}`
    );
  }

  return provider;
}

/**
 * Get the API key for a provider.
 * Reads from Encore secrets at runtime.
 *
 * @throws Error if the API key secret is not configured
 */
export function getProviderApiKey(providerId: string): string {
  const keyAccessor = API_KEY_MAP[providerId];
  if (!keyAccessor) {
    throw new Error(`No API key configured for provider: "${providerId}"`);
  }

  try {
    return keyAccessor();
  } catch {
    throw new Error(
      `API key not set for provider "${providerId}". Configure the ${PROVIDER_MAP[providerId]?.apiKeySecret || providerId} secret.`
    );
  }
}

/**
 * Build a provider-specific HTTP request from a StandardRequest.
 * Combines getProvider() + getProviderApiKey() + transformRequest().
 *
 * @returns ProviderRequest with url, headers, and body ready for fetch()
 */
export function buildProviderRequest(
  providerId: string,
  req: StandardRequest
): ProviderRequest {
  const provider = getProvider(providerId);
  const apiKey = getProviderApiKey(providerId);
  return provider.transformRequest(req, apiKey);
}

/**
 * Transform a raw provider response into a StandardResponse.
 *
 * @returns StandardResponse with normalized content, tokens, stop reason
 */
export function transformProviderResponse(
  providerId: string,
  rawResponse: any,
  model: string
): StandardResponse {
  const provider = getProvider(providerId);
  return provider.transformResponse(rawResponse, model);
}

/**
 * List all registered provider IDs.
 * When multi-provider is disabled, only returns ["anthropic"].
 */
export function listProviderIds(): string[] {
  if (!isMultiProviderEnabled()) {
    return ["anthropic"];
  }
  return Object.keys(PROVIDER_MAP);
}

/**
 * Resolve a model name to its provider ID.
 * Uses prefix-based detection for known providers,
 * falls back to "anthropic" if no match.
 *
 * This extends the existing getProvider() in ai.ts with support
 * for additional provider prefixes.
 */
export function resolveProviderFromModel(modelName: string): string {
  if (modelName.startsWith("claude-")) return "anthropic";
  if (modelName.startsWith("gpt-")) return "openai";
  if (modelName.startsWith("moonshot-")) return "openai"; // Moonshot uses OpenAI-compatible API
  if (modelName.startsWith("gemini-")) return "openai"; // Google uses OpenAI-compatible format via their API

  // Fireworks models use "accounts/fireworks/models/" prefix — check BEFORE "/" catch-all
  if (modelName.startsWith("accounts/")) return "fireworks";

  // OpenRouter models use "provider/model" format (e.g., "anthropic/claude-3.5-sonnet")
  if (modelName.includes("/")) return "openrouter";

  // Default: Anthropic (existing behavior)
  return "anthropic";
}

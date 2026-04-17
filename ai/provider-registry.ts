import type { AIProviderAdapter, StandardRequest, StandardResponse, ProviderRequest } from "./provider-interface";
import { anthropicProvider } from "./providers/anthropic";
import { openaiProvider } from "./providers/openai";
import { openrouterProvider } from "./providers/openrouter";
import { fireworksProvider } from "./providers/fireworks";
import { moonshotProvider } from "./providers/moonshot";
import { decryptApiKey } from "./lib/crypto";
import { db } from "./db";

// --- Provider Registry ---

/**
 * Map of provider slug to AIProviderAdapter implementation.
 * Adding a new provider: register it here + add a row in ai_providers table.
 */
const PROVIDER_MAP: Record<string, AIProviderAdapter> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  openrouter: openrouterProvider,
  fireworks: fireworksProvider,
  moonshot: moonshotProvider,
};

/**
 * Get provider adapter by slug.
 *
 * @throws Error if provider slug is unknown
 */
export function getProvider(providerId: string): AIProviderAdapter {
  const provider = PROVIDER_MAP[providerId];
  if (!provider) {
    throw new Error(
      `Unknown provider: "${providerId}". Available: ${Object.keys(PROVIDER_MAP).join(", ")}`
    );
  }
  return provider;
}

/**
 * Retrieve and decrypt the API key for a provider from the DB.
 * All provider keys are stored AES-256-CBC encrypted in ai_providers.encrypted_api_key.
 *
 * @throws Error if the provider is not found, disabled, or has no key configured
 */
export async function getProviderApiKey(providerId: string): Promise<string> {
  const row = await db.queryRow<{ encrypted_api_key: string | null; slug: string }>`
    SELECT encrypted_api_key, slug
    FROM ai_providers
    WHERE slug = ${providerId} AND enabled = true
  `;

  if (!row) {
    throw new Error(
      `Provider '${providerId}' not found or disabled. Enable it in Settings → AI-modeller.`
    );
  }

  if (!row.encrypted_api_key) {
    throw new Error(
      `No API key configured for provider '${providerId}'. ` +
      `Add it in Settings → AI-modeller → click the pencil icon next to the provider.`
    );
  }

  return decryptApiKey(row.encrypted_api_key);
}

/**
 * Build a provider-specific HTTP request from a StandardRequest.
 * Combines getProvider() + getProviderApiKey() + transformRequest().
 *
 * @returns ProviderRequest with url, headers, and body ready for fetch()
 */
export async function buildProviderRequest(
  providerId: string,
  req: StandardRequest
): Promise<ProviderRequest> {
  const provider = getProvider(providerId);
  const apiKey = await getProviderApiKey(providerId);
  return provider.transformRequest(req, apiKey);
}

/**
 * Transform a raw provider response into a StandardResponse.
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
 * List all registered provider slugs.
 */
export function listProviderIds(): string[] {
  return Object.keys(PROVIDER_MAP);
}

/**
 * Resolve a model name to its provider slug.
 * Uses prefix/format-based detection, falls back to "anthropic".
 */
export function resolveProviderFromModel(modelName: string): string {
  if (modelName.startsWith("claude-")) return "anthropic";
  if (modelName.startsWith("gpt-")) return "openai";
  if (modelName.startsWith("moonshot-")) return "moonshot"; // Moonshot AI (Kimi) — own provider slug
  if (modelName.startsWith("gemini-")) return "openai";     // Google uses OpenAI-compatible format

  // Fireworks models use "accounts/fireworks/models/" prefix — check BEFORE "/" catch-all
  if (modelName.startsWith("accounts/")) return "fireworks";

  // OpenRouter models use "provider/model" format (e.g., "anthropic/claude-3.5-sonnet")
  if (modelName.includes("/")) return "openrouter";

  // Default: Anthropic
  return "anthropic";
}

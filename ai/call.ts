// --- AI Call Layer ---
// Provider-registry based AI calls. Anthropic uses SDK streaming, others use fetch.

import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import Anthropic from "@anthropic-ai/sdk";
import log from "encore.dev/log";
import { estimateCost, getUpgradeModel } from "./router";
import { resolveProviderFromModel, buildProviderRequest, transformProviderResponse } from "./provider-registry";
import type { AICallOptions, AICallResponse } from "./types";

// --- Secrets ---
const anthropicKey = secret("AnthropicAPIKey");

// --- Constants ---
export const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_FALLBACK_UPGRADES = 2;

// --- Helper Functions ---

/**
 * Wrap a provider SDK error into a readable APIError.
 * Parses common error patterns across Anthropic, OpenAI, Fireworks, OpenRouter.
 */
export function wrapProviderError(provider: string, model: string, error: unknown): APIError {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  // Credit / billing
  if (lower.includes("credit balance") || lower.includes("billing") || lower.includes("insufficient_quota") || lower.includes("payment required") || lower.includes("402")) {
    return APIError.resourceExhausted(
      `${provider} credits er brukt opp (modell: ${model}). Fyll pa via leverandorens dashboard.`
    );
  }

  // Rate limit
  if (lower.includes("rate limit") || lower.includes("rate_limit") || lower.includes("429") || lower.includes("too many requests")) {
    return APIError.resourceExhausted(
      `${provider} rate limit nadd (modell: ${model}). Vent litt og prov igjen.`
    );
  }

  // Auth
  if (lower.includes("401") || lower.includes("authentication") || lower.includes("invalid api key") || lower.includes("invalid_api_key") || lower.includes("unauthorized")) {
    return APIError.unauthenticated(
      `${provider} API-nokkel er ugyldig eller utlopt (modell: ${model}). Sjekk AI-innstillinger.`
    );
  }

  // Overloaded / server error
  if (lower.includes("overloaded") || lower.includes("503") || lower.includes("529") || lower.includes("server error") || lower.includes("500")) {
    return APIError.unavailable(
      `${provider} er midlertidig utilgjengelig (modell: ${model}). Prov igjen om litt.`
    );
  }

  // Model not found
  if (lower.includes("model not found") || lower.includes("not_found_error") || lower.includes("does not exist")) {
    return APIError.notFound(
      `Modellen "${model}" finnes ikke hos ${provider}. Sjekk modell-ID i AI-innstillinger.`
    );
  }

  // Context length
  if (lower.includes("context length") || lower.includes("maximum context") || lower.includes("token limit") || lower.includes("too long")) {
    return APIError.invalidArgument(
      `Meldingen er for lang for ${model}. Prov en kortere melding eller en modell med storre kontekstvindu.`
    );
  }

  // Fallback
  console.error(`[AI] ${provider} error (${model}):`, msg);
  return APIError.internal(`${provider}-feil (${model}): ${msg}`);
}

export function stripMarkdownJson(text: string): string {
  let jsonText = text.trim();

  // Try code block extraction first (```json ... ``` or ``` ... ```)
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // If still not valid JSON, extract the first balanced { ... } or [ ... ]
  if (!jsonText.startsWith("{") && !jsonText.startsWith("[")) {
    const objStart = jsonText.indexOf("{");
    const arrStart = jsonText.indexOf("[");
    const start = objStart >= 0 && arrStart >= 0
      ? Math.min(objStart, arrStart)
      : objStart >= 0 ? objStart : arrStart;

    if (start >= 0) {
      const open = jsonText[start];
      const close = open === "{" ? "}" : "]";
      let depth = 0;
      let end = -1;
      let inString = false;
      let escaped = false;
      for (let i = start; i < jsonText.length; i++) {
        const ch = jsonText[i];
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === open) depth++;
        else if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > start) {
        jsonText = jsonText.substring(start, end + 1);
      }
    }
  }

  return jsonText;
}

// --- Token Tracking ---

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
  endpoint: string;
}

export function logTokenUsage(usage: TokenUsage): void {
  const cacheSavings = usage.cacheReadTokens > 0
    ? ` (cache read: ${usage.cacheReadTokens}, cache creation: ${usage.cacheCreationTokens})`
    : "";
  log.info(`[AI Token Usage] ${usage.model} via ${usage.endpoint}: ${usage.inputTokens} in / ${usage.outputTokens} out${cacheSavings}`);
}

// --- Core AI Call ---

/**
 * Call AI using provider-registry. Anthropic uses SDK streaming, others use fetch.
 */
async function callAI(options: AICallOptions): Promise<AICallResponse> {
  const providerId = resolveProviderFromModel(options.model);

  // Anthropic: use SDK with streaming (Sprint 6.24 requirement)
  if (providerId === "anthropic") {
    return callAnthropicStreaming(options);
  }

  // All other providers: use provider-registry with fetch()
  const providerReq = buildProviderRequest(providerId, {
    model: options.model,
    system: options.system,
    messages: options.messages.map(m => ({ role: m.role, content: m.content })),
    maxTokens: options.maxTokens,
  });

  const response = await fetch(providerReq.url, {
    method: "POST",
    headers: providerReq.headers,
    body: JSON.stringify(providerReq.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw wrapProviderError(providerId, options.model, new Error(`${response.status}: ${errorText}`));
  }

  const raw = await response.json();
  const std = transformProviderResponse(providerId, raw, options.model);

  logTokenUsage({
    inputTokens: std.inputTokens,
    outputTokens: std.outputTokens,
    cacheReadTokens: std.cacheReadTokens,
    cacheCreationTokens: std.cacheCreationTokens,
    model: options.model,
    endpoint: providerId,
  });

  return {
    content: std.content,
    tokensUsed: std.tokensUsed,
    stopReason: std.stopReason,
    modelUsed: options.model,
    inputTokens: std.inputTokens,
    outputTokens: std.outputTokens,
    cacheReadTokens: std.cacheReadTokens,
    cacheCreationTokens: std.cacheCreationTokens,
    costEstimate: estimateCost(std.inputTokens, std.outputTokens, options.model),
  };
}

/**
 * Anthropic: SDK with streaming (Sprint 6.24 fix — required for long-running calls)
 */
async function callAnthropicStreaming(options: AICallOptions): Promise<AICallResponse> {
  const client = new Anthropic({ apiKey: anthropicKey() });

  // Use cache_control for system prompts (stable per conversation)
  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    {
      type: "text",
      text: options.system,
      cache_control: { type: "ephemeral" },
    },
  ];

  let response;
  try {
    const stream = client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens,
      system: systemBlocks,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    response = await stream.finalMessage();
  } catch (e) {
    throw wrapProviderError("Anthropic", options.model, e);
  }

  const text = response.content.find((c) => c.type === "text");
  if (!text || text.type !== "text") {
    throw APIError.internal("no text in Anthropic response");
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadTokens = (response.usage as any).cache_read_input_tokens ?? 0;
  const cacheCreationTokens = (response.usage as any).cache_creation_input_tokens ?? 0;

  logTokenUsage({
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    model: options.model,
    endpoint: "anthropic",
  });

  return {
    content: text.text,
    tokensUsed: inputTokens + outputTokens,
    stopReason: response.stop_reason || "end_turn",
    modelUsed: options.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costEstimate: estimateCost(inputTokens, outputTokens, options.model),
  };
}

// --- Retry helpers ---

const MAX_TRANSIENT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("overloaded") ||
    lower.includes("529") ||
    lower.includes("503") ||
    lower.includes("server error") ||
    lower.includes("unavailable") ||
    lower.includes("econnreset") ||
    lower.includes("socket hang up") ||
    lower.includes("timeout")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call AI with retry + fallback.
 *
 * 1. Transient errors (overloaded, 503, timeout): retry same model up to 3 times
 *    with exponential backoff (2s, 4s, 8s).
 * 2. Non-transient errors: upgrade to next-tier model (up to MAX_FALLBACK_UPGRADES).
 */
export async function callAIWithFallback(options: AICallOptions): Promise<AICallResponse> {
  let currentModel = options.model;
  let upgradeAttempts = 0;

  while (upgradeAttempts <= MAX_FALLBACK_UPGRADES) {
    // Try current model with transient-error retries
    let lastError: unknown;
    for (let retry = 0; retry <= MAX_TRANSIENT_RETRIES; retry++) {
      try {
        return await callAI({ ...options, model: currentModel });
      } catch (error) {
        lastError = error;

        if (isTransientError(error) && retry < MAX_TRANSIENT_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retry);
          log.warn(`[AI] Transient error on ${currentModel}, retry ${retry + 1}/${MAX_TRANSIENT_RETRIES} in ${delay}ms`, {
            error: error instanceof Error ? error.message : String(error),
          });
          await sleep(delay);
          continue;
        }

        // Non-transient or retries exhausted — break to fallback
        break;
      }
    }

    // Try upgrading model
    upgradeAttempts++;
    const upgrade = getUpgradeModel(currentModel);

    if (!upgrade || upgradeAttempts > MAX_FALLBACK_UPGRADES) {
      throw lastError;
    }

    log.info(`[AI] Upgrading from ${currentModel} to ${upgrade} after error`);
    currentModel = upgrade;
  }

  throw APIError.internal("model fallback exhausted");
}

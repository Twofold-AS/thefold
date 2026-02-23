// --- Multi-AI Provider Abstraction Layer ---
// Feature flag: ZMultiProvider (default "false" — only Anthropic)
// This module defines the standard interface for AI providers.
// Each provider implements transformRequest/transformResponse to normalize
// the differences between Anthropic, OpenAI, OpenRouter, Fireworks, etc.

/**
 * Standard request format used across all providers.
 * Provider implementations transform this into their native format.
 */
export interface StandardRequest {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string | any[] }>;
  maxTokens: number;
  temperature?: number;
  tools?: any[];
}

/**
 * Standard response format returned by all providers.
 * Provider implementations transform native responses into this format.
 */
export interface StandardResponse {
  content: string;
  tokensUsed: number;
  modelUsed: string;
  costEstimate: { totalCost: number };
  stopReason: string;
  toolUse?: any[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * Provider-specific HTTP request format.
 * Produced by transformRequest(), consumed by the HTTP fetch layer.
 */
export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: any;
}

/**
 * AI Provider interface — implemented by each provider (Anthropic, OpenRouter, OpenAI, Fireworks).
 *
 * transformRequest() converts a StandardRequest into a ProviderRequest (URL + headers + body).
 * transformResponse() converts the provider's raw JSON response into a StandardResponse.
 */
export interface AIProviderAdapter {
  id: string;                    // "anthropic", "openrouter", "fireworks", "openai"
  name: string;
  baseUrl: string;
  apiKeySecret: string;          // Encore secret name
  supportedFeatures: string[];   // ["chat", "embeddings", "vision"]
  transformRequest(req: StandardRequest, apiKey: string): ProviderRequest;
  transformResponse(res: any, model: string): StandardResponse;
}

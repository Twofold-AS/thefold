import type {
  AIProviderAdapter,
  StandardRequest,
  StandardResponse,
  ProviderRequest,
} from "../provider-interface";

/**
 * OpenRouter API provider (OpenAI-compatible).
 *
 * OpenRouter aggregates many models (Anthropic, Meta, Mistral, Google, etc.)
 * behind an OpenAI-compatible API. Key differences:
 * - Base URL: https://openrouter.ai/api/v1/chat/completions
 * - Auth header: "Authorization: Bearer <key>"
 * - Extra headers: "HTTP-Referer" and "X-Title" for ranking
 * - Model IDs use "provider/model" format (e.g., "anthropic/claude-3.5-sonnet")
 * - Response format is OpenAI-compatible (choices array)
 * - Tool calls follow OpenAI format
 */
export const openrouterProvider: AIProviderAdapter = {
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api",
  apiKeySecret: "OpenRouterApiKey",
  supportedFeatures: ["chat", "vision", "tools"],

  transformRequest(req: StandardRequest, apiKey: string): ProviderRequest {
    // Build messages — system prompt is a message role (OpenAI-compatible)
    const messages: Array<{ role: string; content: string | any[] }> = [
      { role: "system", content: req.system },
      ...req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const body: Record<string, any> = {
      model: req.model,
      max_tokens: req.maxTokens,
      messages,
    };

    if (req.temperature !== undefined) {
      body.temperature = req.temperature;
    }

    // Transform tools to OpenAI function calling format
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((tool: any) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema || tool.parameters,
        },
      }));
    }

    return {
      url: `${openrouterProvider.baseUrl}/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://thefold.dev",
        "X-Title": "TheFold",
      },
      body,
    };
  },

  transformResponse(res: any, model: string): StandardResponse {
    const choice = res.choices?.[0];
    const content = choice?.message?.content || "";

    // Extract tool calls from OpenAI-compatible format
    const rawToolCalls = choice?.message?.tool_calls;
    const toolUse = rawToolCalls
      ? rawToolCalls.map((tc: any) => ({
          id: tc.id,
          name: tc.function?.name,
          input: safeJsonParse(tc.function?.arguments),
        }))
      : undefined;

    const inputTokens = res.usage?.prompt_tokens ?? 0;
    const outputTokens = res.usage?.completion_tokens ?? 0;

    // Determine stop reason — normalize tool_calls to tool_use
    let stopReason = choice?.finish_reason || "stop";
    if (stopReason === "tool_calls") {
      stopReason = "tool_use";
    }

    return {
      content,
      tokensUsed: res.usage?.total_tokens ?? inputTokens + outputTokens,
      modelUsed: model,
      costEstimate: { totalCost: 0 }, // Calculated by router.ts estimateCost()
      stopReason,
      toolUse,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  },
};

/** Safely parse JSON string, returning the raw string if parsing fails. */
function safeJsonParse(str: string | undefined): any {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

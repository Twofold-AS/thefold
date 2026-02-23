import type {
  AIProviderAdapter,
  StandardRequest,
  StandardResponse,
  ProviderRequest,
} from "../provider-interface";

/**
 * Fireworks AI API provider (OpenAI-compatible).
 *
 * Fireworks offers fast inference for open-source and custom models.
 * Key differences:
 * - Base URL: https://api.fireworks.ai/inference/v1/chat/completions
 * - Auth header: "Authorization: Bearer <key>"
 * - Model IDs use "accounts/fireworks/models/<model>" format
 * - Response format is OpenAI-compatible (choices array)
 * - Tool calls follow OpenAI format
 * - Supports function calling for select models
 */
export const fireworksProvider: AIProviderAdapter = {
  id: "fireworks",
  name: "Fireworks",
  baseUrl: "https://api.fireworks.ai/inference",
  apiKeySecret: "FireworksApiKey",
  supportedFeatures: ["chat", "tools"],

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
      url: `${fireworksProvider.baseUrl}/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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

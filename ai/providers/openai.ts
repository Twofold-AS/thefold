import type {
  AIProviderAdapter,
  StandardRequest,
  StandardResponse,
  ProviderRequest,
} from "../provider-interface";

/**
 * OpenAI Chat Completions API provider.
 *
 * Key differences from Anthropic:
 * - Base URL: https://api.openai.com/v1/chat/completions
 * - Auth header: "Authorization: Bearer <key>"
 * - "system" is a message with role: "system" (not top-level)
 * - Response uses choices[0].message.content
 * - Tool calls returned in choices[0].message.tool_calls
 */
export const openaiProvider: AIProviderAdapter = {
  id: "openai",
  name: "OpenAI",
  baseUrl: "https://api.openai.com",
  apiKeySecret: "OpenAIAPIKey",
  supportedFeatures: ["chat", "vision", "tools", "embeddings"],

  transformRequest(req: StandardRequest, apiKey: string): ProviderRequest {
    // Build messages — system prompt is a message role in OpenAI
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
      url: `${openaiProvider.baseUrl}/v1/chat/completions`,
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

    // Extract tool calls from OpenAI format
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

    // Determine stop reason — OpenAI uses "stop", "tool_calls", "length"
    let stopReason = choice?.finish_reason || "stop";
    if (stopReason === "tool_calls") {
      stopReason = "tool_use"; // Normalize to Anthropic-style stop reason
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

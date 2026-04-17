import type {
  AIProviderAdapter,
  StandardRequest,
  ProviderRequest,
} from "../provider-interface";

/**
 * Moonshot AI provider (OpenAI-compatible).
 *
 * Kimi models (moonshot-v1-32k, moonshot-v1-128k) from Moonshot AI.
 * Key differences from OpenAI:
 * - Base URL: https://api.moonshot.cn/v1/chat/completions
 * - Auth header: "Authorization: Bearer <key>"
 * - Model IDs use "moonshot-v1-*" format
 * - Response format is OpenAI-compatible (choices array)
 * - Tool calls follow OpenAI format
 */
export const moonshotProvider: AIProviderAdapter = {
  id: "moonshot",
  name: "Moonshot",
  baseUrl: "https://api.moonshot.cn",
  apiKeySecret: "MoonshotApiKey",
  supportedFeatures: ["chat", "tools"],

  transformRequest(req: StandardRequest, apiKey: string): ProviderRequest {
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
      url: `${moonshotProvider.baseUrl}/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    };
  },

  transformResponse(res: any, model: string) {
    const choice = res.choices?.[0];
    const content = choice?.message?.content || "";

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

    let stopReason = choice?.finish_reason || "stop";
    if (stopReason === "tool_calls") stopReason = "tool_use";

    return {
      content,
      tokensUsed: res.usage?.total_tokens ?? inputTokens + outputTokens,
      modelUsed: model,
      costEstimate: { totalCost: 0 },
      stopReason,
      toolUse,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  },
};

function safeJsonParse(str: string | undefined): any {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

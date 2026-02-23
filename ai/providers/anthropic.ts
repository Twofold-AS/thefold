import type {
  AIProviderAdapter,
  StandardRequest,
  StandardResponse,
  ProviderRequest,
} from "../provider-interface";

/**
 * Anthropic Messages API provider.
 *
 * Key differences from OpenAI-compatible providers:
 * - Base URL: https://api.anthropic.com/v1/messages
 * - Auth header: "x-api-key" (not "Authorization: Bearer")
 * - "system" is a top-level field (not a message role)
 * - Response uses content[] array with type: "text" blocks
 * - Supports cache_control for prompt caching
 * - Tool use returned as content blocks with type: "tool_use"
 */
export const anthropicProvider: AIProviderAdapter = {
  id: "anthropic",
  name: "Anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKeySecret: "AnthropicAPIKey",
  supportedFeatures: ["chat", "vision", "tools", "prompt_caching"],

  transformRequest(req: StandardRequest, apiKey: string): ProviderRequest {
    // Build system blocks with cache_control for prompt caching
    const systemBlocks = [
      {
        type: "text" as const,
        text: req.system,
        cache_control: { type: "ephemeral" as const },
      },
    ];

    // Build messages — Anthropic expects role: "user" | "assistant"
    const messages = req.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const body: Record<string, any> = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: systemBlocks,
      messages,
    };

    if (req.temperature !== undefined) {
      body.temperature = req.temperature;
    }

    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
    }

    return {
      url: `${anthropicProvider.baseUrl}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    };
  },

  transformResponse(res: any, model: string): StandardResponse {
    // Extract text content from content blocks
    const textBlocks = (res.content || []).filter(
      (block: any) => block.type === "text"
    );
    const content = textBlocks.map((block: any) => block.text).join("");

    // Extract tool use blocks
    const toolUseBlocks = (res.content || []).filter(
      (block: any) => block.type === "tool_use"
    );
    const toolUse =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map((block: any) => ({
            id: block.id,
            name: block.name,
            input: block.input,
          }))
        : undefined;

    const inputTokens = res.usage?.input_tokens ?? 0;
    const outputTokens = res.usage?.output_tokens ?? 0;
    const cacheReadTokens = res.usage?.cache_read_input_tokens ?? 0;
    const cacheCreationTokens = res.usage?.cache_creation_input_tokens ?? 0;

    return {
      content,
      tokensUsed: inputTokens + outputTokens,
      modelUsed: model,
      costEstimate: { totalCost: 0 }, // Calculated by router.ts estimateCost()
      stopReason: res.stop_reason || "end_turn",
      toolUse,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    };
  },
};

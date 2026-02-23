import { describe, it, expect } from "vitest";
import { anthropicProvider } from "./providers/anthropic";
import { openrouterProvider } from "./providers/openrouter";
import { openaiProvider } from "./providers/openai";
import { fireworksProvider } from "./providers/fireworks";
import type { StandardRequest } from "./provider-interface";

// --- Test fixtures ---

const SAMPLE_REQUEST: StandardRequest = {
  model: "claude-sonnet-4-5-20250929",
  system: "You are a helpful assistant.",
  messages: [
    { role: "user", content: "Hello, world!" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: "What is 2+2?" },
  ],
  maxTokens: 4096,
  temperature: 0.7,
};

const SAMPLE_REQUEST_WITH_TOOLS: StandardRequest = {
  ...SAMPLE_REQUEST,
  tools: [
    {
      name: "create_task",
      description: "Creates a new task",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title"],
      },
    },
  ],
};

const TEST_API_KEY = "test-api-key-12345";

// --- Anthropic Provider Tests ---

describe("Anthropic Provider", () => {
  it("transforms request with system as top-level field and x-api-key header", () => {
    const result = anthropicProvider.transformRequest(SAMPLE_REQUEST, TEST_API_KEY);

    // URL should point to Anthropic Messages API
    expect(result.url).toBe("https://api.anthropic.com/v1/messages");

    // Auth uses x-api-key header (NOT Authorization: Bearer)
    expect(result.headers["x-api-key"]).toBe(TEST_API_KEY);
    expect(result.headers["anthropic-version"]).toBe("2023-06-01");
    expect(result.headers["Authorization"]).toBeUndefined();

    // System is top-level (not a message)
    expect(result.body.system).toBeDefined();
    expect(result.body.system[0].type).toBe("text");
    expect(result.body.system[0].text).toBe("You are a helpful assistant.");
    expect(result.body.system[0].cache_control).toEqual({ type: "ephemeral" });

    // Messages should NOT contain a system role
    const systemMessages = result.body.messages.filter(
      (m: any) => m.role === "system"
    );
    expect(systemMessages.length).toBe(0);

    // Messages should contain the user and assistant messages
    expect(result.body.messages.length).toBe(3);
    expect(result.body.messages[0].role).toBe("user");
    expect(result.body.messages[1].role).toBe("assistant");

    // Model and maxTokens
    expect(result.body.model).toBe("claude-sonnet-4-5-20250929");
    expect(result.body.max_tokens).toBe(4096);
    expect(result.body.temperature).toBe(0.7);
  });

  it("transforms response with content array and cache tokens", () => {
    const rawResponse = {
      content: [
        { type: "text", text: "The answer is 4." },
      ],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 150,
        output_tokens: 10,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 100,
      },
    };

    const result = anthropicProvider.transformResponse(rawResponse, "claude-sonnet-4-5-20250929");

    expect(result.content).toBe("The answer is 4.");
    expect(result.stopReason).toBe("end_turn");
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(10);
    expect(result.tokensUsed).toBe(160);
    expect(result.cacheReadTokens).toBe(50);
    expect(result.cacheCreationTokens).toBe(100);
    expect(result.modelUsed).toBe("claude-sonnet-4-5-20250929");
    expect(result.toolUse).toBeUndefined();
  });

  it("transforms response with tool use blocks", () => {
    const rawResponse = {
      content: [
        { type: "text", text: "Let me create that task." },
        {
          type: "tool_use",
          id: "tool_123",
          name: "create_task",
          input: { title: "New task", description: "A test task" },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 200, output_tokens: 50 },
    };

    const result = anthropicProvider.transformResponse(rawResponse, "claude-sonnet-4-5-20250929");

    expect(result.content).toBe("Let me create that task.");
    expect(result.stopReason).toBe("tool_use");
    expect(result.toolUse).toBeDefined();
    expect(result.toolUse!.length).toBe(1);
    expect(result.toolUse![0].id).toBe("tool_123");
    expect(result.toolUse![0].name).toBe("create_task");
    expect(result.toolUse![0].input.title).toBe("New task");
  });

  it("includes tools in request body when provided", () => {
    const result = anthropicProvider.transformRequest(SAMPLE_REQUEST_WITH_TOOLS, TEST_API_KEY);

    // Anthropic passes tools directly (not wrapped in function object)
    expect(result.body.tools).toBeDefined();
    expect(result.body.tools.length).toBe(1);
    expect(result.body.tools[0].name).toBe("create_task");
  });
});

// --- OpenRouter Provider Tests ---

describe("OpenRouter Provider", () => {
  it("transforms request with system as message role and Authorization Bearer header", () => {
    const result = openrouterProvider.transformRequest(SAMPLE_REQUEST, TEST_API_KEY);

    // URL should point to OpenRouter API
    expect(result.url).toBe("https://openrouter.ai/api/v1/chat/completions");

    // Auth uses Authorization: Bearer (NOT x-api-key)
    expect(result.headers["Authorization"]).toBe(`Bearer ${TEST_API_KEY}`);
    expect(result.headers["x-api-key"]).toBeUndefined();

    // OpenRouter-specific headers
    expect(result.headers["HTTP-Referer"]).toBe("https://thefold.dev");
    expect(result.headers["X-Title"]).toBe("TheFold");

    // System is a message role (NOT top-level)
    expect(result.body.system).toBeUndefined();
    const systemMessages = result.body.messages.filter(
      (m: any) => m.role === "system"
    );
    expect(systemMessages.length).toBe(1);
    expect(systemMessages[0].content).toBe("You are a helpful assistant.");

    // Total messages: 1 system + 3 from request = 4
    expect(result.body.messages.length).toBe(4);

    // Model and maxTokens
    expect(result.body.model).toBe("claude-sonnet-4-5-20250929");
    expect(result.body.max_tokens).toBe(4096);
  });

  it("transforms response from OpenAI-compatible format", () => {
    const rawResponse = {
      choices: [
        {
          message: { role: "assistant", content: "The answer is 4." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 150, completion_tokens: 10, total_tokens: 160 },
    };

    const result = openrouterProvider.transformResponse(rawResponse, "anthropic/claude-3.5-sonnet");

    expect(result.content).toBe("The answer is 4.");
    expect(result.stopReason).toBe("stop");
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(10);
    expect(result.tokensUsed).toBe(160);
    expect(result.modelUsed).toBe("anthropic/claude-3.5-sonnet");
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
    expect(result.toolUse).toBeUndefined();
  });

  it("normalizes tool_calls stop reason to tool_use", () => {
    const rawResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_abc",
                type: "function",
                function: {
                  name: "create_task",
                  arguments: '{"title":"New task"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    };

    const result = openrouterProvider.transformResponse(rawResponse, "anthropic/claude-3.5-sonnet");

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolUse).toBeDefined();
    expect(result.toolUse!.length).toBe(1);
    expect(result.toolUse![0].name).toBe("create_task");
    expect(result.toolUse![0].input).toEqual({ title: "New task" });
  });

  it("transforms tools to OpenAI function calling format", () => {
    const result = openrouterProvider.transformRequest(SAMPLE_REQUEST_WITH_TOOLS, TEST_API_KEY);

    expect(result.body.tools).toBeDefined();
    expect(result.body.tools.length).toBe(1);
    expect(result.body.tools[0].type).toBe("function");
    expect(result.body.tools[0].function.name).toBe("create_task");
    expect(result.body.tools[0].function.parameters).toBeDefined();
  });
});

// --- OpenAI Provider Tests ---

describe("OpenAI Provider", () => {
  it("transforms request with system as message role and Authorization Bearer header", () => {
    const openaiReq: StandardRequest = {
      ...SAMPLE_REQUEST,
      model: "gpt-4o",
    };

    const result = openaiProvider.transformRequest(openaiReq, TEST_API_KEY);

    // URL should point to OpenAI API
    expect(result.url).toBe("https://api.openai.com/v1/chat/completions");

    // Auth uses Authorization: Bearer
    expect(result.headers["Authorization"]).toBe(`Bearer ${TEST_API_KEY}`);
    expect(result.headers["x-api-key"]).toBeUndefined();

    // System is a message role
    expect(result.body.system).toBeUndefined();
    const systemMessages = result.body.messages.filter(
      (m: any) => m.role === "system"
    );
    expect(systemMessages.length).toBe(1);

    // Total messages: 1 system + 3 from request = 4
    expect(result.body.messages.length).toBe(4);

    expect(result.body.model).toBe("gpt-4o");
    expect(result.body.max_tokens).toBe(4096);
    expect(result.body.temperature).toBe(0.7);
  });

  it("transforms response from OpenAI choices format", () => {
    const rawResponse = {
      choices: [
        {
          message: { role: "assistant", content: "The answer is 4." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
    };

    const result = openaiProvider.transformResponse(rawResponse, "gpt-4o");

    expect(result.content).toBe("The answer is 4.");
    expect(result.stopReason).toBe("stop");
    expect(result.inputTokens).toBe(120);
    expect(result.outputTokens).toBe(8);
    expect(result.tokensUsed).toBe(128);
    expect(result.modelUsed).toBe("gpt-4o");
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
  });

  it("transforms tools to OpenAI function calling format", () => {
    const result = openaiProvider.transformRequest(SAMPLE_REQUEST_WITH_TOOLS, TEST_API_KEY);

    expect(result.body.tools).toBeDefined();
    expect(result.body.tools.length).toBe(1);
    expect(result.body.tools[0].type).toBe("function");
    expect(result.body.tools[0].function.name).toBe("create_task");
    expect(result.body.tools[0].function.description).toBe("Creates a new task");
    expect(result.body.tools[0].function.parameters.type).toBe("object");
  });

  it("handles tool_calls in response and normalizes stop reason", () => {
    const rawResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_xyz",
                type: "function",
                function: {
                  name: "create_task",
                  arguments: '{"title":"Build feature","description":"A new feature"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
    };

    const result = openaiProvider.transformResponse(rawResponse, "gpt-4o");

    expect(result.content).toBe("");
    expect(result.stopReason).toBe("tool_use");
    expect(result.toolUse).toBeDefined();
    expect(result.toolUse!.length).toBe(1);
    expect(result.toolUse![0].id).toBe("call_xyz");
    expect(result.toolUse![0].name).toBe("create_task");
    expect(result.toolUse![0].input).toEqual({
      title: "Build feature",
      description: "A new feature",
    });
  });
});

// --- Fireworks Provider Tests ---

describe("Fireworks Provider", () => {
  it("transforms request with system as message role and Authorization Bearer header", () => {
    const fwReq: StandardRequest = {
      ...SAMPLE_REQUEST,
      model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    };

    const result = fireworksProvider.transformRequest(fwReq, TEST_API_KEY);

    // URL should point to Fireworks API
    expect(result.url).toBe(
      "https://api.fireworks.ai/inference/v1/chat/completions"
    );

    // Auth uses Authorization: Bearer
    expect(result.headers["Authorization"]).toBe(`Bearer ${TEST_API_KEY}`);
    expect(result.headers["x-api-key"]).toBeUndefined();

    // System is a message role
    expect(result.body.system).toBeUndefined();
    const systemMessages = result.body.messages.filter(
      (m: any) => m.role === "system"
    );
    expect(systemMessages.length).toBe(1);

    // Total messages: 1 system + 3 from request = 4
    expect(result.body.messages.length).toBe(4);

    expect(result.body.model).toBe(
      "accounts/fireworks/models/llama-v3p1-70b-instruct"
    );
    expect(result.body.max_tokens).toBe(4096);
  });

  it("transforms response from OpenAI-compatible format", () => {
    const rawResponse = {
      choices: [
        {
          message: { role: "assistant", content: "The answer is 4." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 8, total_tokens: 108 },
    };

    const result = fireworksProvider.transformResponse(
      rawResponse,
      "accounts/fireworks/models/llama-v3p1-70b-instruct"
    );

    expect(result.content).toBe("The answer is 4.");
    expect(result.stopReason).toBe("stop");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(8);
    expect(result.tokensUsed).toBe(108);
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
  });

  it("normalizes tool_calls stop reason to tool_use", () => {
    const rawResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_fw1",
                type: "function",
                function: {
                  name: "list_tasks",
                  arguments: "{}",
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 80, completion_tokens: 15, total_tokens: 95 },
    };

    const result = fireworksProvider.transformResponse(
      rawResponse,
      "accounts/fireworks/models/llama-v3p1-70b-instruct"
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolUse).toBeDefined();
    expect(result.toolUse!.length).toBe(1);
    expect(result.toolUse![0].name).toBe("list_tasks");
    expect(result.toolUse![0].input).toEqual({});
  });
});

// --- Provider Registry Tests ---
// These tests verify the getProvider function from the registry.
// Since provider-registry.ts uses Encore secrets, we test the provider
// implementations directly and verify the registry logic separately.

describe("Provider Registry Logic", () => {
  it("each provider has a unique ID", () => {
    const ids = [
      anthropicProvider.id,
      openaiProvider.id,
      openrouterProvider.id,
      fireworksProvider.id,
    ];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("each provider has required fields", () => {
    for (const provider of [
      anthropicProvider,
      openaiProvider,
      openrouterProvider,
      fireworksProvider,
    ]) {
      expect(provider.id).toBeTruthy();
      expect(provider.name).toBeTruthy();
      expect(provider.baseUrl).toBeTruthy();
      expect(provider.apiKeySecret).toBeTruthy();
      expect(provider.supportedFeatures.length).toBeGreaterThan(0);
      expect(typeof provider.transformRequest).toBe("function");
      expect(typeof provider.transformResponse).toBe("function");
    }
  });

  it("anthropic provider has correct ID and features", () => {
    expect(anthropicProvider.id).toBe("anthropic");
    expect(anthropicProvider.supportedFeatures).toContain("chat");
    expect(anthropicProvider.supportedFeatures).toContain("prompt_caching");
  });

  it("openrouter provider has correct ID", () => {
    expect(openrouterProvider.id).toBe("openrouter");
  });

  it("openai provider has correct ID", () => {
    expect(openaiProvider.id).toBe("openai");
  });

  it("fireworks provider has correct ID", () => {
    expect(fireworksProvider.id).toBe("fireworks");
  });
});

// --- Edge Cases ---

describe("Edge Cases", () => {
  it("handles request without temperature", () => {
    const reqNoTemp: StandardRequest = {
      model: "claude-sonnet-4-5-20250929",
      system: "You are a helper.",
      messages: [{ role: "user", content: "Hi" }],
      maxTokens: 1024,
    };

    const result = anthropicProvider.transformRequest(reqNoTemp, TEST_API_KEY);
    expect(result.body.temperature).toBeUndefined();
  });

  it("handles request without tools", () => {
    const result = openaiProvider.transformRequest(SAMPLE_REQUEST, TEST_API_KEY);
    expect(result.body.tools).toBeUndefined();
  });

  it("handles empty response content gracefully", () => {
    const emptyResponse = {
      choices: [
        {
          message: { role: "assistant", content: null },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
    };

    const result = openaiProvider.transformResponse(emptyResponse, "gpt-4o");
    expect(result.content).toBe("");
  });

  it("handles missing usage fields in Anthropic response", () => {
    const noUsageResponse = {
      content: [{ type: "text", text: "Hello" }],
      stop_reason: "end_turn",
      usage: {},
    };

    const result = anthropicProvider.transformResponse(noUsageResponse, "claude-sonnet-4-5-20250929");
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
  });

  it("handles malformed tool arguments in OpenAI response", () => {
    const badToolResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_bad",
                type: "function",
                function: {
                  name: "test_tool",
                  arguments: "not valid json{{{",
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
    };

    // Should not throw — safeJsonParse returns the raw string
    const result = openaiProvider.transformResponse(badToolResponse, "gpt-4o");
    expect(result.toolUse).toBeDefined();
    expect(result.toolUse![0].name).toBe("test_tool");
    expect(result.toolUse![0].input).toBe("not valid json{{{");
  });
});

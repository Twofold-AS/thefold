// --- OpenAI-Compatible Tool-Use Loop ---
// Used by Moonshot, OpenAI, OpenRouter, Fireworks and any other provider
// that exposes an OpenAI-compatible /v1/chat/completions endpoint.
// The executeToolFn is passed in by the caller to avoid circular imports with tools.ts.

import log from "encore.dev/log";
import { estimateCost } from "./router";
import { getProviderApiKey, getProvider, resolveProviderFromModel } from "./provider-registry";
import { logTokenUsage, wrapProviderError } from "./call";
import type { ToolCallOptions, ToolCallResponse } from "./tools";

type ExecuteToolFn = (
  name: string,
  input: Record<string, unknown>,
  repoName?: string,
  conversationId?: string,
  repoOwner?: string,
  assessComplexityFn?: ToolCallOptions["assessComplexityFn"],
) => Promise<Record<string, unknown>>;

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

function safeParseArgs(args: string | undefined): Record<string, unknown> {
  if (!args) return {};
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}

export async function callOpenAIWithTools(
  options: ToolCallOptions,
  executeToolFn: ExecuteToolFn,
): Promise<ToolCallResponse> {
  const providerId = resolveProviderFromModel(options.model);
  const apiKey = await getProviderApiKey(providerId);
  const provider = getProvider(providerId);

  // Build initial message list with system as first message
  const messages: OpenAIMessage[] = [
    { role: "system", content: options.system },
    ...options.messages.map((m) => ({
      role: m.role,
      content: m.content as string,
    })),
  ];

  // Format tools in OpenAI function-calling format
  const tools = options.tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));

  const allToolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastCreatedTaskId: string | null = null;
  let lastStartedTaskId: string | null = null;

  const MAX_TOOL_LOOPS = 10;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    console.log(`[DEBUG-OPENAI] Loop ${loop + 1}, provider: ${providerId}, model: ${options.model}`);

    const body: Record<string, any> = {
      model: options.model,
      max_tokens: options.maxTokens,
      messages,
      tools,
      tool_choice: "auto",
    };

    let response: Response;
    try {
      response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw wrapProviderError(providerId, options.model, e);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw wrapProviderError(
        providerId,
        options.model,
        new Error(`${response.status}: ${errorText}`),
      );
    }

    const raw = await response.json();
    const choice = raw.choices?.[0];

    totalInputTokens += raw.usage?.prompt_tokens ?? 0;
    totalOutputTokens += raw.usage?.completion_tokens ?? 0;

    const finishReason = choice?.finish_reason;
    const toolCalls: typeof choice.message.tool_calls = choice?.message?.tool_calls;

    console.log(
      `[DEBUG-OPENAI] finish_reason: ${finishReason}, tool_calls: ${toolCalls?.length ?? 0}`,
    );

    // No tool calls — return final response
    if (finishReason !== "tool_calls" || !toolCalls?.length) {
      const content = choice?.message?.content || "";

      logTokenUsage({
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        model: options.model,
        endpoint: `${providerId}-tools`,
      });

      return {
        content,
        tokensUsed: totalInputTokens + totalOutputTokens,
        stopReason: finishReason || "stop",
        modelUsed: options.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costEstimate: estimateCost(totalInputTokens, totalOutputTokens, options.model),
        toolsUsed: allToolsUsed,
        lastCreatedTaskId: lastCreatedTaskId || undefined,
        lastStartedTaskId: lastStartedTaskId || undefined,
      };
    }

    // Append the assistant message with tool call requests
    messages.push({
      role: "assistant",
      content: choice.message.content || null,
      tool_calls: toolCalls,
    });

    // Execute each tool call and collect results
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      const toolInput = safeParseArgs(tc.function.arguments);

      console.log(`[DEBUG-OPENAI] Executing tool: ${toolName}, input: ${JSON.stringify(toolInput).substring(0, 200)}`);
      allToolsUsed.push(toolName);

      // Pass lastCreatedTaskId automatically to start_task
      if (toolName === "start_task" && lastCreatedTaskId) {
        console.log(`[DEBUG-OPENAI] start_task: injecting lastCreatedTaskId: ${lastCreatedTaskId}`);
        toolInput.taskId = lastCreatedTaskId;
      }

      let result: Record<string, unknown>;

      try {
        // Block duplicate create_task calls in the same session
        if (toolName === "create_task" && lastCreatedTaskId) {
          result = {
            success: false,
            message:
              "Du har allerede opprettet en oppgave i denne samtalen. Beskriv alt i én oppgave.",
          };
        } else {
          result = await executeToolFn(
            toolName,
            toolInput,
            options.repoName,
            options.conversationId,
            options.repoOwner,
            options.assessComplexityFn,
          );

          if (toolName === "create_task" && result?.taskId) {
            lastCreatedTaskId = result.taskId as string;
            console.log(`[DEBUG-OPENAI] lastCreatedTaskId: ${lastCreatedTaskId}`);
          }

          if (toolName === "start_task" && result?.success && result?.taskId) {
            lastStartedTaskId = result.taskId as string;
            console.log(`[DEBUG-OPENAI] lastStartedTaskId: ${lastStartedTaskId}`);

            // Emit SSE so frontend can connect to the agent's stream
            if (options.conversationId) {
              try {
                const { agent } = await import("~encore/clients");
                await agent.emitChatEvent({
                  streamKey: options.conversationId,
                  eventType: "agent.status",
                  data: { status: "agent_started", phase: lastStartedTaskId },
                });
              } catch (e) {
                log.warn("emitChatEvent (agent_started) failed", {
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            }
          }
        }
      } catch (e) {
        console.error(`[DEBUG-OPENAI] Tool ${toolName} FAILED:`, e);
        result = { error: String(e) };
      }

      console.log(
        `[DEBUG-OPENAI] Tool ${toolName} result: ${JSON.stringify(result).substring(0, 200)}`,
      );

      // Append tool result as a "tool" role message
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      } as OpenAIMessage);
    }

    console.log(
      `[DEBUG-OPENAI] Loop ${loop + 1} complete, tools so far: ${allToolsUsed.join(", ")}`,
    );
  }

  // Max loops reached — return truncated response
  console.warn("[DEBUG-OPENAI] Max tool loops reached!");

  logTokenUsage({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    model: options.model,
    endpoint: `${providerId}-tools`,
  });

  return {
    content:
      "Beklager, for mange verktøy-kall. Prøv igjen med en enklere forespørsel.",
    tokensUsed: totalInputTokens + totalOutputTokens,
    stopReason: "max_loops",
    modelUsed: options.model,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costEstimate: estimateCost(totalInputTokens, totalOutputTokens, options.model),
    toolsUsed: allToolsUsed,
    lastCreatedTaskId: lastCreatedTaskId || undefined,
    lastStartedTaskId: lastStartedTaskId || undefined,
  };
}

// --- OpenAI-Compatible Tool-Use Loop ---
// Used by Moonshot, OpenAI, OpenRouter, Fireworks and any other provider
// that exposes an OpenAI-compatible /v1/chat/completions endpoint.
// Tool execution goes through toolRegistry.execute().

import log from "encore.dev/log";
import { estimateCost } from "./router";
import { getProviderApiKey, getProvider, resolveProviderFromModel } from "./provider-registry";
import { logTokenUsage, wrapProviderError } from "./call";
import type { ToolCallOptions, ToolCallResponse } from "./tools";
import { toolRegistry } from "./tools/index";
import type { ToolContext } from "./tools/index";
import { isDebugEnabled } from "./system-settings";

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
  const debug = await isDebugEnabled();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    if (debug) console.log(`[DEBUG-OPENAI] Loop ${loop + 1}, provider: ${providerId}, model: ${options.model}`);

    // Fireworks rejects max_tokens > 4096 for non-streaming requests
    const maxTokensForBody = providerId === "fireworks"
      ? Math.min(options.maxTokens ?? 2048, 4096)
      : (options.maxTokens ?? 4096);

    const body: Record<string, any> = {
      model: options.model,
      max_tokens: maxTokensForBody,
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

    if (debug) console.log(
      `[DEBUG-OPENAI] finish_reason: ${finishReason}, tool_calls: ${toolCalls?.length ?? 0}`,
    );

    // No tool calls — return final response
    if (finishReason !== "tool_calls" || !toolCalls?.length) {
      const rawContent = choice?.message?.content || "";
      // MiniMax / Moonshot and some other non-native tool-use models leak their
      // native XML tool-call syntax into the `content` field even when the
      // OpenAI-compat shim has parsed tool_calls correctly. Strip empty/self-
      // closing <tool_calls> blocks so the UI never shows them. The regex
      // catches both `<tool_calls></tool_calls>` and bare `</tool_calls>`.
      const content = rawContent
        .replace(/<tool_calls>\s*<\/tool_calls>/g, "")
        .replace(/<\/tool_calls>/g, "")
        .replace(/<tool_calls>/g, "")
        .replace(/<end_turn>/g, "")
        .replace(/<\/end_turn>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

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

    // Execute each tool call and collect results.
    // Some providers (notably Moonshot) emit the same tool_call twice in a single response.
    // Dedup by tool_call_id within this iteration so we never run the same call twice.
    const executedToolCallIds = new Set<string>();

    for (const tc of toolCalls) {
      if (executedToolCallIds.has(tc.id)) {
        log.warn("Skipping duplicate tool_call", { id: tc.id, name: tc.function.name });
        continue;
      }
      executedToolCallIds.add(tc.id);

      const toolName = tc.function.name;
      const toolInput = safeParseArgs(tc.function.arguments);

      if (debug) console.log(`[DEBUG-OPENAI] Executing tool: ${toolName}, input: ${JSON.stringify(toolInput).substring(0, 200)}`);
      allToolsUsed.push(toolName);

      // Pass lastCreatedTaskId automatically to start_task
      if (toolName === "start_task" && lastCreatedTaskId) {
        if (debug) console.log(`[DEBUG-OPENAI] start_task: injecting lastCreatedTaskId: ${lastCreatedTaskId}`);
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
          const ctx: ToolContext = {
            userId: "system",
            userEmail: options.userEmail,
            conversationId: options.conversationId,
            repoName: options.repoName,
            repoOwner: options.repoOwner,
            lastCreatedTaskId,
            lastStartedTaskId,
            emit: () => {},
            log,
          };
          const toolResult = await toolRegistry.execute(toolName, toolInput, ctx);
          result = toolResult as unknown as Record<string, unknown>;

          // Commit 20b: handler returned success: false — surface per-tool error.
          if (!toolResult.success && options.conversationId) {
            try {
              const { agent } = await import("~encore/clients");
              await agent.emitChatEvent({
                streamKey: options.conversationId,
                eventType: "agent.tool_error",
                data: {
                  toolName,
                  toolCallId: tc.id,
                  error: toolResult.message ?? "Tool failed",
                  phase: "executing_tools",
                  recoverable: true,
                },
              });
            } catch (e) {
              log.warn("emitChatEvent (tool_error) failed", { error: e instanceof Error ? e.message : String(e) });
            }
          }

          if (toolName === "create_task" && toolResult?.success && toolResult?.taskId) {
            lastCreatedTaskId = toolResult.taskId;
            if (debug) console.log(`[DEBUG-OPENAI] lastCreatedTaskId: ${lastCreatedTaskId}`);
          }

          if (toolName === "start_task" && toolResult?.success && toolResult?.startedTaskId) {
            lastStartedTaskId = toolResult.startedTaskId;
            if (debug) console.log(`[DEBUG-OPENAI] lastStartedTaskId: ${lastStartedTaskId}`);

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
        if (debug) console.error(`[DEBUG-OPENAI] Tool ${toolName} FAILED:`, e);
        // Commit 20b: emit per-tool error SSE; loop continues.
        if (options.conversationId) {
          try {
            const { agent } = await import("~encore/clients");
            await agent.emitChatEvent({
              streamKey: options.conversationId,
              eventType: "agent.tool_error",
              data: {
                toolName,
                toolCallId: tc.id,
                error: e instanceof Error ? e.message : String(e),
                phase: "executing_tools",
                recoverable: true,
              },
            });
          } catch (emitErr) {
            log.warn("emitChatEvent (tool_error) failed", { error: emitErr instanceof Error ? emitErr.message : String(emitErr) });
          }
        }
        result = { error: String(e) };
      }

      if (debug) console.log(
        `[DEBUG-OPENAI] Tool ${toolName} result: ${JSON.stringify(result).substring(0, 200)}`,
      );

      // Append tool result as a "tool" role message
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      } as OpenAIMessage);
    }

    if (debug) console.log(
      `[DEBUG-OPENAI] Loop ${loop + 1} complete, tools so far: ${allToolsUsed.join(", ")}`,
    );
  }

  // Max loops reached — return truncated response
  if (debug) console.warn("[DEBUG-OPENAI] Max tool loops reached!");

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

// --- Chat Tool-Use (Function Calling) ---
// Provider-agnostic tool-use loop using the new ToolRegistry (ai/tools/).
// Backward-compatible CHAT_TOOLS export computed from registry.
// Currently Anthropic-only via SDK streaming for tool-use; non-Anthropic
// providers route to ai/tools-openai.ts.

import Anthropic from "@anthropic-ai/sdk";
import log from "encore.dev/log";
import { estimateCost } from "./router";
import { resolveProviderFromModel, getProviderApiKey } from "./provider-registry";
import { logTokenUsage } from "./call";
import type { AICallOptions, AICallResponse } from "./types";
import { toolRegistry } from "./tools/index";
import type { ToolContext } from "./tools/index";
import { isDebugEnabled } from "./system-settings";

// --- Tool Definitions ---
// Computed view from ToolRegistry — backward-compat shape for legacy callers.
// New code should call `toolRegistry.filtered({ surface, activePlan })` directly.
export const CHAT_TOOLS: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = toolRegistry
  .toAnthropicFormat(toolRegistry.forSurface("chat"))
  .map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Record<string, unknown>,
  }));

// --- Helpers ---

/** Build a ToolContext for registry.execute(). Loop-state fields like
 * lastCreatedTaskId/lastStartedTaskId are filled in per loop iteration. */
function buildToolContext(opts: {
  conversationId?: string;
  repoName?: string;
  repoOwner?: string;
  userEmail?: string;
  lastCreatedTaskId?: string | null;
  lastStartedTaskId?: string | null;
}): ToolContext {
  return {
    userId: "system", // legacy callers don't pass userId; OK for chat tools
    userEmail: opts.userEmail,
    conversationId: opts.conversationId,
    repoName: opts.repoName,
    repoOwner: opts.repoOwner,
    lastCreatedTaskId: opts.lastCreatedTaskId,
    lastStartedTaskId: opts.lastStartedTaskId,
    emit: () => {
      // No-op for legacy callers; tools that need SSE call agent.emitChatEvent directly
    },
    log,
  };
}

// --- Provider-agnostic Tool-Use Loop ---
// Currently Anthropic-only (SDK streaming required for tool-use per Sprint 6.24).
// Other providers will use fetch + provider-registry when tool-use support is added.

export interface ToolCallOptions extends AICallOptions {
  tools: typeof CHAT_TOOLS;
  repoName?: string;
  repoOwner?: string;
  conversationId?: string;
  userEmail?: string;
  assessComplexityFn?: (req: { taskDescription: string; projectStructure: string; fileCount: number }) => Promise<{ complexity: number; tokensUsed: number }>;
}

export interface ToolCallResponse extends AICallResponse {
  toolsUsed: string[];
  lastCreatedTaskId?: string;
  lastStartedTaskId?: string;
}

export async function callWithTools(options: ToolCallOptions): Promise<ToolCallResponse> {
  const providerId = resolveProviderFromModel(options.model);

  // Non-Anthropic providers use OpenAI-compatible tool-use loop (Moonshot, OpenAI, OpenRouter, Fireworks, etc.)
  if (providerId !== "anthropic") {
    log.info("Tool-use: routing to OpenAI-compat loop", {
      provider: providerId,
      model: options.model,
    });
    const { callOpenAIWithTools } = await import("./tools-openai");
    return callOpenAIWithTools(options);
  }

  return callAnthropicWithToolsSDK(options);
}

async function callAnthropicWithToolsSDK(options: ToolCallOptions): Promise<ToolCallResponse> {
  const apiKey = await getProviderApiKey("anthropic");
  const client = new Anthropic({ apiKey });

  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    { type: "text", text: options.system, cache_control: { type: "ephemeral" } },
  ];

  const allToolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastCreatedTaskId: string | null = null;
  let lastStartedTaskId: string | null = null;

  const messages: Array<{ role: "user" | "assistant"; content: string | any[] }> = [
    ...options.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const MAX_TOOL_LOOPS = 10;
  const debug = await isDebugEnabled();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    if (debug) console.log(`[DEBUG-AH] Tool loop iteration ${loop + 1}`);

    const responseStream = client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens,
      system: systemBlocks,
      messages,
      tools: options.tools as any,
    });
    const response = await responseStream.finalMessage();

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (debug) console.log(`[DEBUG-AH] Stop reason: ${response.stop_reason}, content blocks: ${response.content.length}`);

    if (response.stop_reason !== "tool_use") {
      const textContent = response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");

      if (debug) console.log(`[DEBUG-AH] Final content length: ${textContent.length}`);

      const cacheReadTokens = (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
      const cacheCreationTokens = (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;

      logTokenUsage({
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        model: options.model,
        endpoint: "anthropic-tools",
      });

      return {
        content: textContent,
        tokensUsed: totalInputTokens + totalOutputTokens,
        stopReason: response.stop_reason || "end_turn",
        modelUsed: options.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        costEstimate: estimateCost(totalInputTokens, totalOutputTokens, options.model),
        toolsUsed: allToolsUsed,
        lastCreatedTaskId: lastCreatedTaskId || undefined,
        lastStartedTaskId: lastStartedTaskId || undefined,
      };
    }

    // stop_reason === "tool_use" — execute tools
    const toolUseBlocks = response.content.filter((block: any) => block.type === "tool_use");
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];

    // Dedup by tool_use_id within this iteration: the Anthropic SDK can deliver
    // the same tool_use block twice in a single response (rare, but observed).
    // Skip duplicates so we never run the same call twice.
    const executedToolUseIds = new Set<string>();

    for (const toolBlock of toolUseBlocks) {
      const blockId = (toolBlock as any).id as string;
      if (executedToolUseIds.has(blockId)) {
        log.warn("Skipping duplicate tool_use", { id: blockId, name: (toolBlock as any).name });
        continue;
      }
      executedToolUseIds.add(blockId);

      const toolName = (toolBlock as any).name;
      const toolInput = { ...(toolBlock as any).input } as Record<string, unknown>;

      if (debug) console.log(`[DEBUG-AH] Executing tool: ${toolName}, input: ${JSON.stringify(toolInput).substring(0, 300)}`);
      allToolsUsed.push(toolName);

      if (toolName === "start_task" && lastCreatedTaskId) {
        if (debug) console.log(`[DEBUG-AH] start_task: overriding taskId ${toolInput.taskId} → ${lastCreatedTaskId}`);
        toolInput.taskId = lastCreatedTaskId;
      }

      try {
        // MCP tool call
        if (toolName.startsWith("mcp_")) {
          const parts = toolName.split("_");
          if (parts.length >= 3) {
            const serverName = parts[1];
            const actualToolName = parts.slice(2).join("_");

            if (debug) console.log(`[DEBUG-AH] MCP tool call: ${serverName}/${actualToolName}`);

            try {
              const { mcp } = await import("~encore/clients");
              const mcpResult = await mcp.callTool({
                serverName,
                toolName: actualToolName,
                args: toolInput,
              });

              const resultText = mcpResult.result.content
                .map((c: any) => c.text ?? "")
                .filter(Boolean)
                .join("\n");

              toolResults.push({
                type: "tool_result",
                tool_use_id: (toolBlock as any).id,
                content: resultText || "OK",
                is_error: mcpResult.result.isError ?? false,
              });

              if (debug) console.log(`[DEBUG-AH] MCP tool result: ${resultText.substring(0, 200)}`);
            } catch (mcpErr) {
              if (debug) console.error(`[DEBUG-AH] MCP tool ${toolName} FAILED:`, mcpErr);
              toolResults.push({
                type: "tool_result",
                tool_use_id: (toolBlock as any).id,
                content: `MCP tool call failed: ${String(mcpErr)}`,
                is_error: true,
              });
            }
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: (toolBlock as any).id,
              content: `Invalid MCP tool name format: ${toolName}`,
              is_error: true,
            });
          }
        } else {
          // Block multiple create_task calls
          if (toolName === "create_task" && lastCreatedTaskId) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: (toolBlock as any).id,
              content: JSON.stringify({
                success: false,
                message: "Du har allerede opprettet en oppgave i denne samtalen. Beskriv alt i én oppgave i stedet for flere.",
              }),
            });
            continue;
          }

          // Regular tool call via registry
          const ctx = buildToolContext({
            conversationId: options.conversationId,
            repoName: options.repoName,
            repoOwner: options.repoOwner,
            userEmail: options.userEmail,
            lastCreatedTaskId,
            lastStartedTaskId,
          });
          const result = await toolRegistry.execute(toolName, toolInput, ctx);

          // Commit 20b: surface handler-level failures (success: false) as a
          // per-tool SSE event so the UI can show which call failed without
          // halting the whole chat loop.
          if (!result.success && options.conversationId) {
            try {
              const { agent } = await import("~encore/clients");
              await agent.emitChatEvent({
                streamKey: options.conversationId,
                eventType: "agent.tool_error",
                data: {
                  toolName,
                  toolCallId: (toolBlock as any).id,
                  error: result.message ?? "Tool failed",
                  phase: "executing_tools",
                  recoverable: true,
                },
              });
            } catch (e) {
              log.warn("emitChatEvent (tool_error) failed", { error: e instanceof Error ? e.message : String(e) });
            }
          }

          if (toolName === "create_task" && result?.success && result?.taskId) {
            lastCreatedTaskId = result.taskId;
            if (debug) console.log(`[DEBUG-AH] lastCreatedTaskId: ${lastCreatedTaskId}`);
          }

          if (toolName === "start_task" && result?.success && result?.startedTaskId) {
            lastStartedTaskId = result.startedTaskId;
            if (debug) console.log(`[DEBUG-AH] lastStartedTaskId: ${lastStartedTaskId}`);
            // Notify frontend via SSE so it can connect to the agent's stream
            if (options.conversationId) {
              try {
                const { agent } = await import("~encore/clients");
                await agent.emitChatEvent({
                  streamKey: options.conversationId,
                  eventType: "agent.status",
                  data: { status: "agent_started", phase: lastStartedTaskId },
                });
              } catch (e) {
                log.warn("emitChatEvent (agent_started) failed", { error: e instanceof Error ? e.message : String(e) });
              }
            }
          }

          if (debug) console.log(`[DEBUG-AH] Tool ${toolName} result: ${JSON.stringify(result).substring(0, 200)}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: (toolBlock as any).id,
            content: JSON.stringify(result),
          });
        }
      } catch (e) {
        if (debug) console.error(`[DEBUG-AH] Tool ${toolName} FAILED:`, e);
        // Commit 20b: emit per-tool error SSE so the UI can mark exactly
        // which call failed. Loop continues — the AI sees the error_result
        // and can retry with adjusted input.
        if (options.conversationId) {
          try {
            const { agent } = await import("~encore/clients");
            await agent.emitChatEvent({
              streamKey: options.conversationId,
              eventType: "agent.tool_error",
              data: {
                toolName,
                toolCallId: (toolBlock as any).id,
                error: e instanceof Error ? e.message : String(e),
                phase: "executing_tools",
                recoverable: true,
              },
            });
          } catch (emitErr) {
            log.warn("emitChatEvent (tool_error) failed", { error: emitErr instanceof Error ? emitErr.message : String(emitErr) });
          }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: (toolBlock as any).id,
          content: JSON.stringify({ error: String(e) }),
          is_error: true,
        });
      }
    }

    messages.push({
      role: "assistant",
      content: response.content as any,
    });
    messages.push({
      role: "user",
      content: toolResults,
    });

    if (debug) console.log(`[DEBUG-AH] Sent tool results back, looping... (tools so far: ${allToolsUsed.join(", ")})`);
  }

  // Max loops reached
  if (debug) console.warn("[DEBUG-AH] Max tool loops reached!");

  logTokenUsage({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    model: options.model,
    endpoint: "anthropic-tools",
  });

  return {
    content: "Beklager, for mange verktøy-kall. Prøv igjen med en enklere forespørsel.",
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

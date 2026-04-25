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

/**
 * Detect runaway repetition in model output and trim to the first occurrence.
 * Triggered by Kimi/MiniMax sometimes entering a repeat-loop after a failed
 * tool call — produced responses of "same paragraph × 40 copies" in a
 * single final message. Heuristic: if the first 200 chars of any paragraph
 * appear 3+ consecutive times, truncate to the first copy + a short note.
 * Tokenless — runs on the text content only.
 */
function trimRepetitionLoop(text: string): string {
  if (!text || text.length < 400) return text;
  // Split on double-newlines (paragraph boundaries) — common for Norwegian
  // prose replies. Falls back to single \n if the response never does
  // blank-line separation (streaming-level runaway).
  let paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length < 3) {
    paragraphs = text.split(/\n/).map((p) => p.trim()).filter(Boolean);
  }
  if (paragraphs.length < 3) return text;

  const fingerprint = (s: string) => s.slice(0, 200).replace(/\s+/g, " ").toLowerCase();
  let repeatStart = -1;
  let repeatCount = 1;
  for (let i = 1; i < paragraphs.length; i++) {
    if (fingerprint(paragraphs[i]) === fingerprint(paragraphs[i - 1])) {
      repeatCount += 1;
      if (repeatCount === 3) {
        repeatStart = i - 2; // index of first copy in the run of dupes
        break;
      }
    } else {
      repeatCount = 1;
    }
  }
  if (repeatStart < 0) return text;

  const kept = paragraphs.slice(0, repeatStart + 1).join("\n\n");
  log.warn("tools.ts: repetition-loop detected, trimming response", {
    totalParagraphs: paragraphs.length,
    repeatStart,
    originalLength: text.length,
    trimmedLength: kept.length,
  });
  return `${kept}\n\n[Svaret gjentok seg — avkortet automatisk.]`;
}

/** Build a ToolContext for registry.execute(). Loop-state fields like
 * lastCreatedTaskId/lastStartedTaskId are filled in per loop iteration. */
function buildToolContext(opts: {
  conversationId?: string;
  repoName?: string;
  repoOwner?: string;
  userEmail?: string;
  lastCreatedTaskId?: string | null;
  lastStartedTaskId?: string | null;
  projectId?: string;
  projectType?: "code" | "framer" | "figma" | "framer_figma";
}): ToolContext {
  return {
    userId: "system", // legacy callers don't pass userId; OK for chat tools
    userEmail: opts.userEmail,
    conversationId: opts.conversationId,
    repoName: opts.repoName,
    repoOwner: opts.repoOwner,
    lastCreatedTaskId: opts.lastCreatedTaskId,
    lastStartedTaskId: opts.lastStartedTaskId,
    projectId: opts.projectId,
    projectType: opts.projectType,
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
  /** Runde 5 — Active project (UUID). Threaded into every ToolContext
   *  so create_task / framer_* / repo_* tools can resolve the canonical
   *  project repo via projects.ensureProjectRepo. */
  projectId?: string;
  /** Runde 5 — Mirror of projectType from chat. */
  projectType?: "code" | "framer" | "figma" | "framer_figma";
  assessComplexityFn?: (req: { taskDescription: string; projectStructure: string; fileCount: number }) => Promise<{ complexity: number; tokensUsed: number }>;
}

export interface ToolCallResponse extends AICallResponse {
  toolsUsed: string[];
  lastCreatedTaskId?: string;
  lastStartedTaskId?: string;
  /** Set when a tool emitted `bailOut` — loop terminated with a user-facing
   *  error. The caller should render `userMessage` as the assistant reply
   *  and set done-reason = "tool_failure". */
  bailOut?: { reason: string; userMessage: string };
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
  // Circuit-break if the model calls non-existent tools 2 iterations in a
  // row. Prevents pathological spirals where the AI hallucinates a tool
  // name, gets "Unknown tool" back, apologises, tries another hallucinated
  // name, repeat — wasting the full MAX_TOOL_LOOPS budget + potentially
  // triggering repetition-loops in the final text response.
  const MAX_CONSECUTIVE_UNKNOWN_TOOLS = 2;
  let consecutiveUnknownToolErrors = 0;
  let bailOut: { reason: string; userMessage: string } | null = null;
  const debug = await isDebugEnabled();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    if (debug) console.log(`[DEBUG-AH] Tool loop iteration ${loop + 1}`);

    // Cancel-checkpoint: if the user clicked Stopp while we were running a
    // tool or waiting for the previous AI response, bail out before the
    // next expensive generation. Peeks the cancel-flag without consuming
    // it — chat.ts end-of-turn cleanup still consumes it.
    if (options.conversationId) {
      try {
        const { chat } = await import("~encore/clients");
        const res = await chat.peekCancellation({ conversationId: options.conversationId });
        if (res.cancelled) {
          log.info("tools.ts: cancel detected mid-loop, breaking", {
            conversationId: options.conversationId,
            loop,
          });
          return {
            content: "Generering avbrutt.",
            tokensUsed: totalInputTokens + totalOutputTokens,
            stopReason: "user_cancelled",
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
      } catch (err) {
        log.warn("tools.ts: peekCancellation failed (continuing)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Sprint A — cache_control på siste tool i array. Anthropic cacher
    // tools-defs (4-6k tokens) → 90% rabatt på iter 2+.
    const cachedTools: typeof options.tools = options.tools.length > 0
      ? [
          ...options.tools.slice(0, -1),
          { ...options.tools[options.tools.length - 1], cache_control: { type: "ephemeral" } } as typeof options.tools[number],
        ]
      : options.tools;

    const responseStream = client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens,
      system: systemBlocks,
      messages,
      tools: cachedTools as any,
    });
    const response = await responseStream.finalMessage();

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (debug) console.log(`[DEBUG-AH] Stop reason: ${response.stop_reason}, content blocks: ${response.content.length}`);

    if (response.stop_reason !== "tool_use") {
      const rawText = response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");
      // Defensive trim — experimental models sometimes emit 40× the same
      // paragraph in a single response after a failed tool_use.
      let textContent = trimRepetitionLoop(rawText);

      // Anti-hallucination safety net (2026-04-24). When the model has just
      // called start_task, the resulting agent task runs asynchronously in
      // the background — the MODEL has not done any building yet. Any
      // claim like "jeg har bygget Header, Hero..." is a lie. We detect
      // that pattern and replace with an honest canonical message. The
      // frontend will update the bubble live via SSE as the agent actually
      // makes progress.
      if (lastStartedTaskId) {
        const lower = textContent.toLowerCase();
        const LYING_CLAIMS = [
          /\bjeg har (bygget|hentet|opprettet|skrevet|implementert|lagt til)\b/,
          /\bjeg bygger\s+(header|hero|footer|komponent|fil)/,
          /\bi have (built|created|written|fetched|implemented|added)\b/,
          /\boppdaterer deg når jeg er ferdig\b/,
          /\bagenten jobber nå med å bygge\b/,
        ];
        const hasClaim = LYING_CLAIMS.some((r) => r.test(lower));
        // Also treat very long (>400 chars) post-start_task responses as
        // suspicious — the model tends to enumerate components there.
        const suspiciouslyLong = textContent.length > 400;
        if (hasClaim || suspiciouslyLong) {
          log.warn("tools.ts: overriding post-start_task hallucination", {
            startedTaskId: lastStartedTaskId,
            hasClaim,
            suspiciouslyLong,
            originalLen: textContent.length,
            originalPreview: textContent.slice(0, 120),
          });
          textContent = "Oppgaven er startet. Agenten jobber nå i bakgrunnen — jeg oppdaterer deg her etter hvert som konkrete filer blir bygget.";
        }
      }

      if (debug) console.log(`[DEBUG-AH] Final content length: ${textContent.length}${rawText.length !== textContent.length ? ` (trimmed from ${rawText.length})` : ""}`);

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
            projectId: options.projectId,
            projectType: options.projectType,
            lastCreatedTaskId,
            lastStartedTaskId,
          });
          const result = await toolRegistry.execute(toolName, toolInput, ctx);
          // Track hallucinated tool-names. registry.execute returns
          // { success: false, message: "Unknown tool: X" } for unknown
          // names — we count consecutive occurrences and break the loop
          // below if the model keeps calling non-existent tools.
          if (!result.success && typeof result.message === "string" && result.message.startsWith("Unknown tool:")) {
            consecutiveUnknownToolErrors += 1;
          } else {
            consecutiveUnknownToolErrors = 0;
          }

          // Unrecoverable tool-failure (e.g. 403/404/auth/DNS). The tool
          // flagged bailOut — we capture the signal, push the tool_result
          // back to the model (so the model knows something went wrong),
          // but break the loop after this iteration with a canonical
          // user-facing message instead of letting the model spin.
          if (result.bailOut) {
            bailOut = result.bailOut;
            log.warn("tools.ts: tool bail-out triggered", {
              tool: toolName,
              reason: result.bailOut.reason,
            });
          }

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

    // Tool-bailout: a tool flagged unrecoverable failure (auth, 404, etc.).
    // Break the loop with a canonical user message so the UI shows the
    // failure instead of the model spinning on retry attempts.
    if (bailOut) {
      log.warn("tools.ts: breaking loop after tool bailOut", {
        reason: bailOut.reason,
        loop,
      });
      return {
        content: bailOut.userMessage,
        tokensUsed: totalInputTokens + totalOutputTokens,
        stopReason: "tool_bailout",
        modelUsed: options.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costEstimate: estimateCost(totalInputTokens, totalOutputTokens, options.model),
        toolsUsed: allToolsUsed,
        lastCreatedTaskId: lastCreatedTaskId || undefined,
        lastStartedTaskId: lastStartedTaskId || undefined,
        bailOut,
      };
    }

    // Circuit break: N consecutive Unknown-tool errors → bail out with a
    // clear message instead of letting the model keep hallucinating names.
    if (consecutiveUnknownToolErrors >= MAX_CONSECUTIVE_UNKNOWN_TOOLS) {
      log.warn("tools.ts: breaking loop after consecutive unknown-tool errors", {
        consecutiveUnknownToolErrors,
        loop,
        toolsSoFar: allToolsUsed.join(", "),
      });
      return {
        content: "Beklager — jeg forsøkte å kalle et verktøy som ikke finnes. Kan du omformulere spørsmålet?",
        tokensUsed: totalInputTokens + totalOutputTokens,
        stopReason: "unknown_tool_circuit_break",
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

// --- Agent Tool Loop ---
// AI-driven autonomous tool loop for the agent execution pipeline.
// The AI calls tools iteratively until the task is complete or MAX_LOOPS is hit.
//
// All agent tools live in the central ToolRegistry (ai/tools/index.ts) with
// surfaces: ["agent"]. This loop dispatches each tool_use block directly
// through toolRegistry.execute(), serialising the structured ToolResult.data
// back to a JSON string for the AI.
//
//   - MAX_LOOPS = 20 (vs 10 in chat)
//   - Tracks files written (repo_write_file) and sandbox created (build_create_sandbox)
//   - Emits SSE events for status / tool_use / tool_result / error / done

import Anthropic from "@anthropic-ai/sdk";
import log from "encore.dev/log";
import { estimateCost } from "../ai/router";
import { logTokenUsage } from "../ai/call";
import type { AgentToolContext } from "./agent-tool-types";
import { agentEventBus } from "./event-bus";
import { createAgentEvent } from "./events";
import {
  resolveProviderFromModel,
  getProvider,
  getProviderApiKey,
} from "../ai/provider-registry";
import { toolRegistry } from "../ai/tools/index";
import type { ToolContext } from "../ai/tools/index";

// Internal shape returned by the dispatcher.
interface DispatcherResult {
  content: string;
  isError?: boolean;
  /** Signal propagated from the tool handler to pause the loop. */
  stopReason?: "paused_for_clarification";
  /** Data accompanying the pause signal (e.g. the clarification question). */
  pauseData?: { question: string; context?: string };
}

// Route every tool call through toolRegistry.execute(). Serialises the
// structured ToolResult.data into a JSON string so the AI sees the same shape
// as before the migration. On error (thrown exception OR { success: false }),
// emits an agent.tool_error SSE event with the toolCallId so the frontend can
// mark that specific call failed — the loop always continues so the AI can
// observe the error and react. (Commit 20b)
async function executeViaDispatcher(
  name: string,
  input: Record<string, unknown>,
  toolCtx: AgentToolContext,
  toolCallId: string,
): Promise<DispatcherResult> {
  const streamKey = toolCtx.thefoldTaskId || toolCtx.conversationId;
  const emitToolError = (error: string) => {
    agentEventBus.emit(
      streamKey,
      createAgentEvent("agent.tool_error", {
        toolName: name,
        toolCallId,
        error,
        phase: "executing_tools",
        recoverable: true,
      }),
    );
  };
  const ctx: ToolContext = {
    userId: toolCtx.thefoldTaskId || "agent",
    taskId: toolCtx.thefoldTaskId,
    conversationId: toolCtx.conversationId,
    repoName: toolCtx.repoName,
    repoOwner: toolCtx.repoOwner,
    emit: (eventType: string, data: unknown) => {
      agentEventBus.emit(
        streamKey,
        createAgentEvent(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eventType as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data as any,
        ),
      );
    },
    log,
  };
  try {
    const result = await toolRegistry.execute(name, input, ctx);
    if (result.success) {
      const payload = result.data ?? { message: result.message ?? "OK" };
      return {
        content: JSON.stringify(payload),
        stopReason: result.stopReason,
        pauseData: result.pauseData,
      };
    }
    // Handler returned { success: false } — surface the tool-level error
    // without aborting the loop.
    const errorMsg = result.message ?? "Tool failed";
    emitToolError(errorMsg);
    return {
      content: JSON.stringify({ error: errorMsg }),
      isError: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("tool-loop: registry execute failed", { tool: name, error: msg });
    emitToolError(msg);
    return {
      content: JSON.stringify({ error: msg }),
      isError: true,
    };
  }
}

// --- Constants ---
export const MAX_TOOL_LOOPS = 20;

// --- Types ---

export interface ToolLoopMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

export interface ToolLoopOptions {
  /** Anthropic model ID */
  model: string;
  /** System prompt (cached as ephemeral) */
  system: string;
  /** Initial message history. Mutated internally — pass a copy if reuse is needed. */
  messages: ToolLoopMessage[];
  /** Per-task service routing context */
  toolContext: AgentToolContext;
  /** Override max loops (default: MAX_TOOL_LOOPS = 20) */
  maxLoops?: number;
}

export interface ToolLoopResult {
  /** Final text response from the AI (after all tool calls completed) */
  finalText: string;
  /** Ordered list of tool names called during the loop */
  toolsUsed: string[];
  /** All files written via repo_write_file, in call order */
  filesWritten: Array<{ path: string; content: string }>;
  /** Sandbox ID created via build_create_sandbox (last one wins if called multiple times) */
  sandboxId?: string;
  /** Accumulated input token count */
  totalInputTokens: number;
  /** Accumulated output token count */
  totalOutputTokens: number;
  /** Total cost in USD */
  costUsd: number;
  /** Model used */
  modelUsed: string;
  /** Number of loop iterations consumed */
  loopsUsed: number;
  /** true = loop was cut short by MAX_LOOPS, not by end_turn */
  stoppedAtMaxLoops: boolean;
  /**
   * Set when a tool handler asked to pause the loop (e.g. request_human_clarification).
   * When present, the orchestrator should treat this as an early-exit pause, not a
   * failure — task status is already "needs_input" and respondToClarification resumes.
   */
  pauseReason?: "paused_for_clarification";
  /** Accompanying question + context surfaced to the user. */
  pauseData?: { question: string; context?: string };
}

// --- Tool Loop ---

/**
 * Run an AI-driven tool loop.
 *
 * The AI receives AGENT_TOOLS and may call any of them in sequence to complete
 * the task described in `options.messages`. The loop continues until:
 *   (a) the AI responds with stop_reason !== "tool_use" (task done), or
 *   (b) `maxLoops` iterations are exhausted.
 *
 * Side effects tracked in the result:
 *   - `filesWritten` accumulates every repo_write_file call
 *   - `sandboxId`    is set on every build_create_sandbox call (last wins)
 */
export async function runAgentToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const providerId = resolveProviderFromModel(options.model);

  log.info("agent tool loop: provider routed", {
    model: options.model,
    provider: providerId,
  });

  if (providerId === "anthropic") {
    return runAnthropicAgentToolLoop(options);
  }
  return runOpenAICompatAgentToolLoop(options, providerId);
}

/**
 * Anthropic-native tool loop: streams text deltas via SSE, uses input_schema tool format.
 */
async function runAnthropicAgentToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const apiKey = await getProviderApiKey("anthropic");
  const client = new Anthropic({ apiKey });
  const maxLoops = options.maxLoops ?? MAX_TOOL_LOOPS;

  // SSE routing key: prefer the TheFold task ID, fall back to conversation ID
  const streamKey = options.toolContext.thefoldTaskId || options.toolContext.conversationId;

  // Accumulators
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: string[] = [];
  const filesWritten: Array<{ path: string; content: string }> = [];
  let sandboxId: string | undefined;

  agentEventBus.emit(streamKey, createAgentEvent("agent.status", { status: "running", phase: "tool_loop", message: "AI tool loop started" }));

  // Working message list (mutated as we append assistant + tool_result turns)
  const messages: Anthropic.MessageParam[] = options.messages as Anthropic.MessageParam[];

  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: options.system, cache_control: { type: "ephemeral" } },
  ];

  // All agent tools now registry-backed (Commit 12c).
  const combinedAnthropicTools = toolRegistry.toAnthropicFormat(
    toolRegistry.forSurface("agent"),
  ) as Anthropic.Tool[];

  for (let loop = 0; loop < maxLoops; loop++) {
    log.info("agent tool loop: iteration", {
      loop: loop + 1,
      maxLoops,
      toolsSoFar: toolsUsed.length,
      conversationId: options.toolContext.conversationId,
    });

    // --- Call AI ---
    let response: Anthropic.Message;

    try {
      const stream = client.messages.stream({
        model: options.model,
        max_tokens: 8192,
        system: systemBlocks,
        messages,
        tools: combinedAnthropicTools,
      });

      // Emit text deltas as they arrive so the frontend can render streaming text
      stream.on("text", (text) => {
        agentEventBus.emit(streamKey, createAgentEvent("agent.message", { delta: text, role: "assistant", content: "" }));
      });

      response = await stream.finalMessage();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("agent tool loop: AI call failed", { loop, error: msg });
      agentEventBus.emit(streamKey, createAgentEvent("agent.error", { message: msg, code: "ai_call_failed", recoverable: true }));
      throw err;
    }

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    log.info("agent tool loop: response", {
      loop: loop + 1,
      stopReason: response.stop_reason,
      contentBlocks: response.content.length,
    });

    // --- Done (no more tool calls) ---
    if (response.stop_reason !== "tool_use") {
      const finalText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      const usageExt = response.usage as Anthropic.Usage & {
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      const cacheReadTokens = usageExt.cache_read_input_tokens ?? 0;
      const cacheCreationTokens = usageExt.cache_creation_input_tokens ?? 0;

      logTokenUsage({
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        model: options.model,
        endpoint: "agent-tool-loop",
      });

      agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
        finalText,
        toolsUsed,
        filesChanged: filesWritten.map((f) => f.path),
        filesWritten: filesWritten.length,
        totalInputTokens,
        totalOutputTokens,
        costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
        loopsUsed: loop + 1,
        stoppedAtMaxLoops: false,
      }));

      return {
        finalText,
        toolsUsed,
        filesWritten,
        sandboxId,
        totalInputTokens,
        totalOutputTokens,
        costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
        modelUsed: options.model,
        loopsUsed: loop + 1,
        stoppedAtMaxLoops: false,
      };
    }

    // --- Execute tool calls ---
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const toolName = block.name;
      const toolInput = { ...(block.input as Record<string, unknown>) };

      log.info("agent tool loop: executing tool", {
        loop: loop + 1,
        tool: toolName,
        conversationId: options.toolContext.conversationId,
      });

      toolsUsed.push(toolName);

      agentEventBus.emit(streamKey, createAgentEvent("agent.tool_use", { toolName, toolUseId: block.id, input: toolInput, loopIteration: loop + 1 }));

      const toolCallStart = Date.now();
      const result = await executeViaDispatcher(toolName, toolInput, options.toolContext, block.id);
      const toolDurationMs = Date.now() - toolCallStart;

      agentEventBus.emit(streamKey, createAgentEvent("agent.tool_result", {
        toolUseId: block.id,
        toolName,
        content: result.content,
        isError: result.isError ?? false,
        durationMs: toolDurationMs,
      }));

      // Track side-effects for ExecutionResult mapping in D7
      if (toolName === "repo_write_file" && !result.isError) {
        try {
          const parsed = JSON.parse(result.content) as { ok?: boolean; path?: string };
          if (parsed.ok && parsed.path) {
            filesWritten.push({
              path: parsed.path,
              content: (toolInput.content as string) || "",
            });
          }
        } catch { /* non-critical */ }
      }

      if (toolName === "build_create_sandbox" && !result.isError) {
        try {
          const parsed = JSON.parse(result.content) as { sandboxId?: string };
          if (parsed.sandboxId) sandboxId = parsed.sandboxId;
        } catch { /* non-critical */ }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError,
      });

      // Commit 20: a tool handler asked to pause the loop. Finish appending
      // the tool result to the message history, then return early so the
      // orchestrator can move the task into "needs_input" state.
      if (result.stopReason === "paused_for_clarification") {
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });

        agentEventBus.emit(streamKey, createAgentEvent("agent.status", {
          status: "paused",
          phase: "clarification",
          message: result.pauseData?.question ?? "Awaiting user clarification",
        }));

        logTokenUsage({
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          model: options.model,
          endpoint: "agent-tool-loop",
        });

        return {
          finalText: `Paused for user clarification: ${result.pauseData?.question ?? ""}`,
          toolsUsed,
          filesWritten,
          sandboxId,
          totalInputTokens,
          totalOutputTokens,
          costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
          modelUsed: options.model,
          loopsUsed: loop + 1,
          stoppedAtMaxLoops: false,
          pauseReason: "paused_for_clarification",
          pauseData: result.pauseData,
        };
      }
    }

    // Append assistant turn + tool results before next iteration
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // --- Max loops reached ---
  log.warn("agent tool loop: max loops reached", {
    maxLoops,
    toolsUsed: toolsUsed.join(", "),
    conversationId: options.toolContext.conversationId,
  });

  logTokenUsage({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    model: options.model,
    endpoint: "agent-tool-loop",
  });

  agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
    finalText: `[Tool loop stopped after ${maxLoops} iterations. Tools used: ${toolsUsed.join(", ")}]`,
    toolsUsed,
    filesChanged: filesWritten.map((f) => f.path),
    filesWritten: filesWritten.length,
    totalInputTokens,
    totalOutputTokens,
    costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
    loopsUsed: maxLoops,
    stoppedAtMaxLoops: true,
  }));

  return {
    finalText: `[Tool loop stopped after ${maxLoops} iterations. Tools used: ${toolsUsed.join(", ")}]`,
    toolsUsed,
    filesWritten,
    sandboxId,
    totalInputTokens,
    totalOutputTokens,
    costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
    modelUsed: options.model,
    loopsUsed: maxLoops,
    stoppedAtMaxLoops: true,
  };
}

/**
 * OpenAI-compatible tool loop for non-Anthropic providers (OpenAI, Moonshot, OpenRouter,
 * Fireworks). Uses fetch against /v1/chat/completions and converts AGENT_TOOLS from
 * Anthropic's `input_schema` format to OpenAI's `function.parameters` format.
 *
 * Streaming text deltas are not emitted (provider streams differ); the final assistant
 * text is delivered at end-of-loop via `agent.done`.
 */
async function runOpenAICompatAgentToolLoop(
  options: ToolLoopOptions,
  providerId: string,
): Promise<ToolLoopResult> {
  const apiKey = await getProviderApiKey(providerId);
  const provider = getProvider(providerId);
  const maxLoops = options.maxLoops ?? MAX_TOOL_LOOPS;
  const streamKey = options.toolContext.thefoldTaskId || options.toolContext.conversationId;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: string[] = [];
  const filesWritten: Array<{ path: string; content: string }> = [];
  let sandboxId: string | undefined;

  agentEventBus.emit(streamKey, createAgentEvent("agent.status", {
    status: "running",
    phase: "tool_loop",
    message: `AI tool loop started (provider=${providerId})`,
  }));

  // All agent tools registry-backed (Commit 12c).
  const tools = toolRegistry.toOpenAIFormat(
    toolRegistry.forSurface("agent"),
  );

  type OAIMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  };

  const oaiMessages: OAIMessage[] = [{ role: "system", content: options.system }];
  for (const m of options.messages) {
    oaiMessages.push({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    });
  }

  // Fireworks rejects max_tokens > 4096 for non-streaming requests
  const maxTokens = providerId === "fireworks" ? 4096 : 8192;

  for (let loop = 0; loop < maxLoops; loop++) {
    log.info("agent tool loop: iteration", {
      loop: loop + 1,
      maxLoops,
      provider: providerId,
      toolsSoFar: toolsUsed.length,
      conversationId: options.toolContext.conversationId,
    });

    const body = {
      model: options.model,
      max_tokens: maxTokens,
      messages: oaiMessages,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("agent tool loop: fetch failed", { loop, provider: providerId, error: msg });
      agentEventBus.emit(streamKey, createAgentEvent("agent.error", {
        message: msg, code: "ai_call_failed", recoverable: true,
      }));
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const msg = `${providerId} ${response.status}: ${errorText}`;
      log.error("agent tool loop: provider error", { loop, status: response.status });
      agentEventBus.emit(streamKey, createAgentEvent("agent.error", {
        message: msg, code: "ai_call_failed", recoverable: response.status >= 500,
      }));
      throw new Error(msg);
    }

    const raw = await response.json();
    const choice = raw.choices?.[0];

    totalInputTokens += raw.usage?.prompt_tokens ?? 0;
    totalOutputTokens += raw.usage?.completion_tokens ?? 0;

    const finishReason = choice?.finish_reason;
    const toolCalls = choice?.message?.tool_calls as
      | Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>
      | undefined;

    log.info("agent tool loop: response", {
      loop: loop + 1,
      finishReason,
      toolCalls: toolCalls?.length ?? 0,
    });

    // Done — no more tool calls
    if (finishReason !== "tool_calls" || !toolCalls?.length) {
      const rawText = choice?.message?.content || "";
      // Strip leaked XML tool-call syntax from non-native tool-use models
      // (MiniMax, Moonshot etc.) whose OpenAI-compat shim sometimes leaves
      // empty <tool_calls> tags in the text content.
      const finalText = rawText
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
        endpoint: "agent-tool-loop",
      });

      agentEventBus.emit(streamKey, createAgentEvent("agent.message", {
        delta: finalText, role: "assistant", content: finalText,
      }));
      agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
        finalText,
        toolsUsed,
        filesChanged: filesWritten.map((f) => f.path),
        filesWritten: filesWritten.length,
        totalInputTokens,
        totalOutputTokens,
        costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
        loopsUsed: loop + 1,
        stoppedAtMaxLoops: false,
      }));

      return {
        finalText,
        toolsUsed,
        filesWritten,
        sandboxId,
        totalInputTokens,
        totalOutputTokens,
        costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
        modelUsed: options.model,
        loopsUsed: loop + 1,
        stoppedAtMaxLoops: false,
      };
    }

    // Append assistant turn with tool_calls
    oaiMessages.push({
      role: "assistant",
      content: choice.message.content || null,
      tool_calls: toolCalls,
    });

    // Dedup by tool_call_id within this iteration (some providers emit duplicates)
    const executedToolCallIds = new Set<string>();

    for (const tc of toolCalls) {
      if (executedToolCallIds.has(tc.id)) {
        log.warn("agent tool loop: skipping duplicate tool_call", {
          id: tc.id, name: tc.function.name,
        });
        continue;
      }
      executedToolCallIds.add(tc.id);

      const toolName = tc.function.name;
      let toolInput: Record<string, unknown> = {};
      try {
        toolInput = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        toolInput = {};
      }

      log.info("agent tool loop: executing tool", {
        loop: loop + 1,
        tool: toolName,
        provider: providerId,
        conversationId: options.toolContext.conversationId,
      });

      toolsUsed.push(toolName);

      agentEventBus.emit(streamKey, createAgentEvent("agent.tool_use", {
        toolName, toolUseId: tc.id, input: toolInput, loopIteration: loop + 1,
      }));

      const toolCallStart = Date.now();
      const result = await executeViaDispatcher(toolName, toolInput, options.toolContext, tc.id);
      const toolDurationMs = Date.now() - toolCallStart;

      agentEventBus.emit(streamKey, createAgentEvent("agent.tool_result", {
        toolUseId: tc.id,
        toolName,
        content: result.content,
        isError: result.isError ?? false,
        durationMs: toolDurationMs,
      }));

      // Track side-effects for ExecutionResult mapping
      if (toolName === "repo_write_file" && !result.isError) {
        try {
          const parsed = JSON.parse(result.content) as { ok?: boolean; path?: string };
          if (parsed.ok && parsed.path) {
            filesWritten.push({
              path: parsed.path,
              content: (toolInput.content as string) || "",
            });
          }
        } catch { /* non-critical */ }
      }
      if (toolName === "build_create_sandbox" && !result.isError) {
        try {
          const parsed = JSON.parse(result.content) as { sandboxId?: string };
          if (parsed.sandboxId) sandboxId = parsed.sandboxId;
        } catch { /* non-critical */ }
      }

      oaiMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.content,
      });

      // Commit 20: pause signal from tool handler — exit the loop cleanly.
      if (result.stopReason === "paused_for_clarification") {
        agentEventBus.emit(streamKey, createAgentEvent("agent.status", {
          status: "paused",
          phase: "clarification",
          message: result.pauseData?.question ?? "Awaiting user clarification",
        }));

        logTokenUsage({
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          model: options.model,
          endpoint: "agent-tool-loop",
        });

        return {
          finalText: `Paused for user clarification: ${result.pauseData?.question ?? ""}`,
          toolsUsed,
          filesWritten,
          sandboxId,
          totalInputTokens,
          totalOutputTokens,
          costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
          modelUsed: options.model,
          loopsUsed: loop + 1,
          stoppedAtMaxLoops: false,
          pauseReason: "paused_for_clarification",
          pauseData: result.pauseData,
        };
      }
    }
  }

  // Max loops reached
  log.warn("agent tool loop: max loops reached", {
    maxLoops, provider: providerId,
    toolsUsed: toolsUsed.join(", "),
    conversationId: options.toolContext.conversationId,
  });

  logTokenUsage({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    model: options.model,
    endpoint: "agent-tool-loop",
  });

  const finalText = `[Tool loop stopped after ${maxLoops} iterations. Tools used: ${toolsUsed.join(", ")}]`;

  agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
    finalText,
    toolsUsed,
    filesChanged: filesWritten.map((f) => f.path),
    filesWritten: filesWritten.length,
    totalInputTokens,
    totalOutputTokens,
    costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
    loopsUsed: maxLoops,
    stoppedAtMaxLoops: true,
  }));

  return {
    finalText,
    toolsUsed,
    filesWritten,
    sandboxId,
    totalInputTokens,
    totalOutputTokens,
    costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
    modelUsed: options.model,
    loopsUsed: maxLoops,
    stoppedAtMaxLoops: true,
  };
}

// --- Helpers ---

/**
 * Build the initial user message for a tool loop from task context.
 * Keeps the message concise — the AI will use tools to fetch more details.
 */
export function buildToolLoopInitialMessage(opts: {
  taskDescription: string;
  repoOwner: string;
  repoName: string;
  treeString?: string;
  memoryContext?: string[];
}): string {
  let msg = `## Task\n${opts.taskDescription}\n\n`;
  msg += `## Repository\n${opts.repoOwner}/${opts.repoName}\n\n`;

  if (opts.treeString) {
    // Limit tree to first 100 lines to avoid overwhelming the initial context
    const lines = opts.treeString.split("\n").slice(0, 100);
    msg += `## File Tree (first ${lines.length} entries)\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n\n`;
  }

  if (opts.memoryContext && opts.memoryContext.length > 0) {
    msg += `## Relevant memories from previous tasks\n`;
    opts.memoryContext.slice(0, 5).forEach((m, i) => {
      msg += `${i + 1}. ${m}\n`;
    });
    msg += "\n";
  }

  msg += `Use the available tools to complete this task. When done, summarize what was accomplished.`;
  return msg;
}

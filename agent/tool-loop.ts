// --- Agent Tool Loop ---
// AI-driven autonomous tool loop for the agent execution pipeline.
// The AI calls tools iteratively until the task is complete or MAX_LOOPS is hit.
//
// Pattern mirrors callAnthropicWithToolsSDK in ai/tools.ts, but:
//   - Uses AGENT_TOOLS (17 tools across 4 categories) instead of CHAT_TOOLS
//   - Tracks files written and sandbox created for ExecutionResult compatibility
//   - MAX_LOOPS = 20 (vs 10 in chat)
//   - Logs to agent audit trail via passed-in log context

import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { estimateCost } from "../ai/router";
import { logTokenUsage } from "../ai/call";
import { AGENT_TOOLS } from "./agent-tools";
import type { AgentToolName } from "./agent-tools";
import { executeAgentTool } from "./agent-tool-executor";
import type { AgentToolContext } from "./agent-tool-executor";
import { agentEventBus } from "./event-bus";
import { createAgentEvent } from "./events";

// --- Secrets ---
const anthropicKey = secret("AnthropicAPIKey");

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
  const client = new Anthropic({ apiKey: anthropicKey() });
  const maxLoops = options.maxLoops ?? MAX_TOOL_LOOPS;

  // Accumulators
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: string[] = [];
  const filesWritten: Array<{ path: string; content: string }> = [];
  let sandboxId: string | undefined;

  // Working message list (mutated as we append assistant + tool_result turns)
  const messages: Anthropic.MessageParam[] = options.messages as Anthropic.MessageParam[];

  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: options.system, cache_control: { type: "ephemeral" } },
  ];

  const taskId = options.toolContext.conversationId;

  for (let loop = 0; loop < maxLoops; loop++) {
    log.info("agent tool loop: iteration", {
      loop: loop + 1,
      maxLoops,
      toolsSoFar: toolsUsed.length,
      conversationId: taskId,
    });

    // Emit status at the start of each iteration
    agentEventBus.emit(taskId, createAgentEvent("agent.status", {
      status: "running",
      phase: "tool-loop",
      message: `Iteration ${loop + 1} of ${maxLoops}`,
      loop: loop + 1,
    }));

    // --- Call AI ---
    let response: Anthropic.Message;

    try {
      const stream = client.messages.stream({
        model: options.model,
        max_tokens: 8192,
        system: systemBlocks,
        messages,
        tools: AGENT_TOOLS as Anthropic.Tool[],
      });

      // Stream text deltas to SSE clients as they arrive
      stream.on("text", (delta) => {
        agentEventBus.emit(taskId, createAgentEvent("agent.message", {
          role: "assistant",
          content: "",
          delta,
          model: options.model,
        }));
      });

      response = await stream.finalMessage();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("agent tool loop: AI call failed", { loop, error: msg });
      agentEventBus.emit(taskId, createAgentEvent("agent.error", {
        message: msg,
        code: "ai_error",
        recoverable: false,
      }));
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

      const result: ToolLoopResult = {
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

      // Emit final message and done event
      if (finalText) {
        agentEventBus.emit(taskId, createAgentEvent("agent.message", {
          role: "assistant",
          content: finalText,
          model: options.model,
        }));
      }
      agentEventBus.emit(taskId, createAgentEvent("agent.done", {
        finalText,
        toolsUsed,
        filesWritten: filesWritten.length,
        totalInputTokens,
        totalOutputTokens,
        costUsd: result.costUsd,
        loopsUsed: loop + 1,
        stoppedAtMaxLoops: false,
      }));

      return result;
    }

    // --- Execute tool calls ---
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const toolName = block.name as AgentToolName;
      const toolInput = { ...(block.input as Record<string, unknown>) };

      log.info("agent tool loop: executing tool", {
        loop: loop + 1,
        tool: toolName,
        conversationId: taskId,
      });

      toolsUsed.push(toolName);

      // Emit before tool call
      agentEventBus.emit(taskId, createAgentEvent("agent.tool_use", {
        toolName,
        toolUseId: block.id,
        input: toolInput,
        loopIteration: loop + 1,
      }));

      const toolStart = Date.now();
      const result = await executeAgentTool(toolName, toolInput, options.toolContext);
      const toolDurationMs = Date.now() - toolStart;

      // Emit after tool call
      agentEventBus.emit(taskId, createAgentEvent("agent.tool_result", {
        toolName,
        toolUseId: block.id,
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
    }

    // Append assistant turn + tool results before next iteration
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // --- Max loops reached ---
  log.warn("agent tool loop: max loops reached", {
    maxLoops,
    toolsUsed: toolsUsed.join(", "),
    conversationId: taskId,
  });

  agentEventBus.emit(taskId, createAgentEvent("agent.error", {
    message: `Tool loop stopped after ${maxLoops} iterations`,
    code: "max_loops",
    recoverable: false,
  }));

  logTokenUsage({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    model: options.model,
    endpoint: "agent-tool-loop",
  });

  const costUsd = estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost;
  const finalText = `[Tool loop stopped after ${maxLoops} iterations. Tools used: ${toolsUsed.join(", ")}]`;

  agentEventBus.emit(taskId, createAgentEvent("agent.done", {
    finalText,
    toolsUsed,
    filesWritten: filesWritten.length,
    totalInputTokens,
    totalOutputTokens,
    costUsd,
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
    costUsd,
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

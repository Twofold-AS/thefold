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
import { estimateCost, getCapabilities } from "../ai/router";
import { logTokenUsage } from "../ai/call";
import { formatImageBlock } from "../ai/vision";
import type { AgentToolContext } from "./agent-tool-types";
import { agentEventBus } from "./event-bus";
import { createAgentEvent } from "./events";
import {
  resolveProviderFromModel,
  getProvider,
  getProviderApiKey,
} from "../ai/provider-registry";
import { toolRegistry } from "../ai/tools/index";
import type { Tool, ToolContext } from "../ai/tools/index";

/**
 * Filter the agent tool-registry based on projectType. Keeps tool surface
 * aligned with what the project can actually accept:
 *
 *   - code         → all tools except framer_*
 *   - framer       → all tools except repo_* and github-write tools
 *                    (framer projects have no companion repo yet — a lazy
 *                     ensureProjectRepo happens inside repo_write_file if
 *                     the agent ever calls it, but by default we steer the
 *                     AI away from that path)
 *   - framer_figma → both framer_* and repo_* available (hybrid)
 *   - figma        → no framer_* (figma has its own MCP), repo_* allowed
 *   - undefined    → no filter applied (legacy behaviour)
 *
 * The REPO_WRITE_TOOLS list is small because most "other code tools"
 * (read-file, search-code, get-tree) are safe to keep available on framer
 * projects — the AI might want to inspect an existing repo for reference.
 * The write-side is what we gate.
 */
const REPO_WRITE_TOOLS = new Set<string>([
  "repo_write_file",
  "repo_create_pr",
]);

const FRAMER_TOOLS_PREFIX = "framer_";

function filterByProjectType(
  tools: Tool<unknown>[],
  projectType: "code" | "framer" | "figma" | "framer_figma" | undefined,
): Tool<unknown>[] {
  if (!projectType) return tools;
  return tools.filter((t) => {
    const isFramerTool = t.name.startsWith(FRAMER_TOOLS_PREFIX);
    const isRepoWriteTool = REPO_WRITE_TOOLS.has(t.name);

    switch (projectType) {
      case "code":
        return !isFramerTool;
      case "framer":
        return !isRepoWriteTool;
      case "framer_figma":
        return true; // hybrid — both sets available
      case "figma":
        return !isFramerTool;
      default:
        return true;
    }
  });
}

/**
 * Mode-based tool filter. Layered on top of filterByProjectType.
 *
 *  - "auto": hide request_human_clarification so the agent runs end-to-end
 *  - "plan": only task_plan is visible — no side-effects, plan is the deliverable
 *  - "incognito": read-only. Strip every persisting tool (writes, publishes,
 *    memory saves, task create/start, plan mutations)
 *  - "agents"/"default"/undefined: no filter
 */
const INCOGNITO_WRITE_TOOLS = new Set<string>([
  "repo_write_file",
  "repo_create_pr",
  "framer_create_code_file",
  "framer_set_file_content",
  "framer_publish",
  "framer_deploy",
  "create_task",
  "start_task",
  "save_insight",
  "save_decision",
  "memory_store",
  "execute_project_plan",
  "revise_project_plan",
]);

function filterByMode(
  tools: Tool<unknown>[],
  mode: "auto" | "plan" | "agents" | "incognito" | "default" | undefined,
): Tool<unknown>[] {
  if (!mode || mode === "default" || mode === "agents") return tools;
  if (mode === "auto") {
    return tools.filter((t) => t.name !== "request_human_clarification");
  }
  if (mode === "plan") {
    return tools.filter((t) => t.name === "task_plan");
  }
  if (mode === "incognito") {
    return tools.filter((t) => !INCOGNITO_WRITE_TOOLS.has(t.name));
  }
  return tools;
}

/**
 * Parse a JSON tool-result payload and return any image URLs the tool
 * emitted. web_scrape emits `screenshotUrl` + `images[]`; future preview
 * tools (Round 4d) may emit `previewScreenshotUrl` etc. Anything falsy is
 * dropped. Caps at 3 images to keep the next turn from ballooning.
 */
function extractImageUrlsFromResult(resultJson: string): string[] {
  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    const urls: string[] = [];
    for (const key of ["screenshotUrl", "previewScreenshotUrl"]) {
      const v = parsed[key];
      if (typeof v === "string" && v.startsWith("http")) urls.push(v);
    }
    const imgs = parsed.images;
    if (Array.isArray(imgs)) {
      for (const u of imgs.slice(0, 2)) {
        if (typeof u === "string" && u.startsWith("http")) urls.push(u);
      }
    }
    return urls.slice(0, 3);
  } catch {
    return [];
  }
}

// Internal shape returned by the dispatcher.
interface DispatcherResult {
  content: string;
  isError?: boolean;
  /** Signal propagated from the tool handler to pause the loop. */
  stopReason?: "paused_for_clarification";
  /** Data accompanying the pause signal (e.g. the clarification question). */
  pauseData?: { question: string; context?: string };
  /** Signal an unrecoverable tool failure; loop should break with user message. */
  bailOut?: { reason: string; userMessage: string };
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
    masterTaskId: toolCtx.masterTaskId,
    conversationId: toolCtx.conversationId,
    repoName: toolCtx.repoName,
    repoOwner: toolCtx.repoOwner,
    projectId: toolCtx.projectId,
    projectType: toolCtx.projectType,
    mode: toolCtx.mode,
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
    // without aborting the loop. If the tool flagged bailOut, propagate
    // that signal up so the loop can terminate with a clear user message.
    const errorMsg = result.message ?? "Tool failed";
    emitToolError(errorMsg);
    return {
      content: JSON.stringify({ error: errorMsg }),
      isError: true,
      bailOut: result.bailOut,
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

/**
 * Warn when cumulative message history grows past this threshold (in approx tokens).
 * 1 token ≈ 4 chars. 150k tokens ≈ 600k chars — well above cache-friendly range.
 * This helps diagnose monolithic-call blowups (e.g. the 946k-token events seen
 * when the AI reads many large files and their full contents accumulate as
 * tool_result blocks in the message history).
 */
const MESSAGE_HISTORY_WARN_TOKENS = 150_000;

function estimateMessageTokens(messages: unknown[]): number {
  let chars = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const msg = m as { content?: unknown };
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (typeof b === "string") chars += b.length;
        else if (b && typeof b === "object") chars += JSON.stringify(b).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

// --- Types ---

export interface ToolLoopMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

/** Split system prompt på project-bundle-markøren slik at vi kan plassere
 *  to cache_control-breakpoints: én på CORE+skills+helpers (sjelden endrer
 *  seg), én på project_bundle (endrer seg når project_facts oppdateres,
 *  men er stabil innen task). Anthropic tillater inntil 4 breakpoints
 *  totalt — vi bruker 3 av dem (system core, project bundle, tools). */
function splitSystemForCaching(systemStr: string): Anthropic.TextBlockParam[] {
  // Markører injiseres av context-builder ved project_facts/inheritedScrapes.
  // Hvis prompten ikke har dem (single-task uten projectId), returner én blokk.
  const facts = "[Project Facts]";
  const scrapes = "[Already-scraped sources]";
  const splitIdx = (() => {
    const factIdx = systemStr.indexOf(facts);
    const scrapeIdx = systemStr.indexOf(scrapes);
    if (factIdx === -1 && scrapeIdx === -1) return -1;
    if (factIdx === -1) return scrapeIdx;
    if (scrapeIdx === -1) return factIdx;
    return Math.min(factIdx, scrapeIdx);
  })();
  if (splitIdx <= 0) {
    return [{ type: "text", text: systemStr, cache_control: { type: "ephemeral" } }];
  }
  const corePrompt = systemStr.slice(0, splitIdx).trimEnd();
  const projectBundle = systemStr.slice(splitIdx).trimStart();
  return [
    { type: "text", text: corePrompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: projectBundle, cache_control: { type: "ephemeral" } },
  ];
}

export interface ToolLoopOptions {
  /** Anthropic model ID */
  model: string;
  /** System prompt (cached as ephemeral, split på [Project Facts]-markør) */
  system: string;
  /** Initial message history. Mutated internally — pass a copy if reuse is needed. */
  messages: ToolLoopMessage[];
  /** Per-task service routing context */
  toolContext: AgentToolContext;
  /** Override max loops (default: MAX_TOOL_LOOPS = 20) */
  maxLoops?: number;
  /** When false, strip web_scrape tool from the tool list for this task.
   *  Default: undefined → keep the tool available. Matches chat.firecrawlEnabled. */
  firecrawlEnabled?: boolean;
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

  // Sprint A-finalisering — 3. cache-breakpoint på project-bundle.
  // splitSystemForCaching deler system-prompten ved [Project Facts]- eller
  // [Already-scraped sources]-markøren slik at CORE+skills caches separat
  // fra project-bundle. Hvis ingen markør finnes, returneres én blokk
  // (samme som før).
  const systemBlocks: Anthropic.TextBlockParam[] = splitSystemForCaching(options.system);

  // All agent tools now registry-backed (Commit 12c).
  // Strip web_scrape when user has explicitly disabled it — prevents the AI
  // from trying to call a tool it can't actually use.
  let agentTools = toolRegistry.forSurface("agent");
  if (options.firecrawlEnabled === false) {
    agentTools = agentTools.filter((t) => t.name !== "web_scrape");
  }
  // Filter by projectType — framer-only projects hide repo_write_*, code
  // projects hide framer_*, framer_figma keeps both.
  agentTools = filterByProjectType(agentTools, options.toolContext.projectType);
  // Mode-based filter on top (auto/plan/incognito).
  agentTools = filterByMode(agentTools, options.toolContext.mode);
  const combinedAnthropicTools = toolRegistry.toAnthropicFormat(agentTools) as Anthropic.Tool[];

  // Sprint A — cache_control på SISTE tool i array. Anthropic cacher
  // ALLE tools-definisjoner før dette punktet (inntil 4 cache-breakpoints
  // totalt på request — system-prompt bruker 1, tools tar nå 1 til).
  // Ved iter 2+ får vi 90% rabatt på de 4-6k tokens med tool-defs.
  if (combinedAnthropicTools.length > 0) {
    const lastIdx = combinedAnthropicTools.length - 1;
    combinedAnthropicTools[lastIdx] = {
      ...combinedAnthropicTools[lastIdx],
      cache_control: { type: "ephemeral" },
    } as Anthropic.Tool;
  }

  for (let loop = 0; loop < maxLoops; loop++) {
    const estInputTokens = estimateMessageTokens(messages);
    if (estInputTokens > MESSAGE_HISTORY_WARN_TOKENS) {
      log.warn("agent tool loop: message history is large", {
        loop: loop + 1,
        estInputTokens,
        messageCount: messages.length,
        toolsSoFar: toolsUsed.length,
        conversationId: options.toolContext.conversationId,
      });
    }

    log.info("agent tool loop: iteration", {
      loop: loop + 1,
      maxLoops,
      estInputTokens,
      toolsSoFar: toolsUsed.length,
      conversationId: options.toolContext.conversationId,
    });

    // --- Call AI ---
    let response: Anthropic.Message;

    try {
      // Sprint A-finalisering — context-editing beta. clear_tool_uses-
      // strategien rydder gamle tool_results server-side når kontekst
      // vokser, slik at vi slipper å bygge egen rolling-summary. Beta-
      // header context-management-2025-06-27 + edits-config aktiverer.
      // clear_at_least: 5000 sikrer at vi rydder minst 5k tokens før
      // cache invalideres — gjør cache-write verdt det.
      const stream = client.messages.stream(
        {
          model: options.model,
          max_tokens: 8192,
          system: systemBlocks,
          messages,
          tools: combinedAnthropicTools,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context_management: {
            edits: [
              {
                type: "clear_tool_uses_20250919",
                clear_at_least: 5000,
              },
            ],
          },
        } as unknown as Anthropic.MessageStreamParams,
        {
          headers: { "anthropic-beta": "context-management-2025-06-27" },
        },
      );

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
        reason: "natural",
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

      // Vision-plumbing: if the tool-result payload contains image URLs AND
      // the routed model supports vision, attach the URLs as image blocks
      // inside the tool_result content so the AI can see them on its next
      // turn. Provider-agnostic: we route through formatImageBlock() so the
      // same call site works for Anthropic, OpenAI, Moonshot, MiniMax, etc.
      // Gemini returns null from formatImageBlock (needs base64 inline bytes,
      // not URL) — in that case we keep text-only, and the URL is still
      // visible to the model as part of the JSON payload.
      let toolResultContent: Anthropic.ToolResultBlockParam["content"] = result.content;
      if (!result.isError) {
        const imageUrls = extractImageUrlsFromResult(result.content);
        if (imageUrls.length > 0 && getCapabilities(options.model)?.vision === true) {
          const imageBlocks = imageUrls
            .map((url) => formatImageBlock("anthropic", url))
            .filter((b): b is NonNullable<ReturnType<typeof formatImageBlock>> => b !== null);
          if (imageBlocks.length > 0) {
            // Anthropic tool_result content accepts a union of text + image
            // blocks. formatImageBlock("anthropic", ...) produces the exact
            // shape Anthropic expects, so the cast is safe.
            toolResultContent = [
              { type: "text", text: result.content },
              ...(imageBlocks as Anthropic.ImageBlockParam[]),
            ];
            log.info("tool-loop: attached images to tool_result", {
              toolName,
              imageCount: imageBlocks.length,
              provider: "anthropic",
              model: options.model,
            });
          }
        }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: toolResultContent,
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

      // Unrecoverable tool-failure — break loop with user-facing reason.
      if (result.bailOut) {
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });

        log.warn("agent tool-loop: breaking after tool bailOut", {
          tool: toolName,
          reason: result.bailOut.reason,
          loop,
        });

        agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
          finalText: result.bailOut.userMessage,
          toolsUsed,
          filesChanged: filesWritten.map((f) => f.path),
          filesWritten: filesWritten.length,
          totalInputTokens,
          totalOutputTokens,
          costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
          loopsUsed: loop + 1,
          stoppedAtMaxLoops: false,
          reason: "tool_failure",
          userMessage: result.bailOut.userMessage,
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
          finalText: result.bailOut.userMessage,
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

  const maxLoopsFinalText = `[Agenten stoppet etter ${maxLoops} verktøy-kall uten å fullføre oppgaven. Prøv en enklere forespørsel eller splitt opp oppgaven.]`;
  agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
    finalText: maxLoopsFinalText,
    toolsUsed,
    filesChanged: filesWritten.map((f) => f.path),
    filesWritten: filesWritten.length,
    totalInputTokens,
    totalOutputTokens,
    costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
    loopsUsed: maxLoops,
    stoppedAtMaxLoops: true,
    reason: "max_loops",
    userMessage: maxLoopsFinalText,
  }));

  return {
    finalText: maxLoopsFinalText,
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
  // Same firecrawl + projectType gates as the Anthropic path above.
  let agentToolsOai = toolRegistry.forSurface("agent");
  if (options.firecrawlEnabled === false) {
    agentToolsOai = agentToolsOai.filter((t) => t.name !== "web_scrape");
  }
  agentToolsOai = filterByProjectType(agentToolsOai, options.toolContext.projectType);
  agentToolsOai = filterByMode(agentToolsOai, options.toolContext.mode);
  const tools = toolRegistry.toOpenAIFormat(agentToolsOai);

  // OpenAI-compat accepts either plain string content OR a content array
  // of { type: "text" | "image_url", ... } blocks. The multi-part form is
  // required for vision on OpenAI, Moonshot, MiniMax, OpenRouter — tool
  // messages themselves stay string-only, so we inject images in a
  // follow-up user turn.
  type OAIMessagePart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };
  type OAIMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | OAIMessagePart[] | null;
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

  // Track single-use length-rescue budget. If a model hits max_tokens
  // mid-generation we get ONE retry before declaring the task truncated.
  let lengthRescueUsed = false;

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

    // finish_reason === "length" means the model hit max_tokens mid-
    // generation. Previously we treated this same as "stop" and returned
    // the truncated text as final — task marked complete, zero files
    // written. That's a silent failure. Instead: inject a synthetic
    // "your previous response was truncated" user message and continue
    // the loop. Gives the model a chance to recover. Only retry once
    // per run to avoid infinite loops.
    if (finishReason === "length" && !toolCalls?.length) {
      log.warn("agent tool loop: response truncated by max_tokens, retrying once", {
        loop: loop + 1,
        outputTokens: raw.usage?.completion_tokens ?? 0,
        maxTokens,
        filesWrittenSoFar: filesWritten.length,
      });
      // Append truncated assistant turn so the model sees its own cut-off
      // output, then a user nudge. Only do this rescue ONCE per run.
      if (!lengthRescueUsed) {
        lengthRescueUsed = true;
        oaiMessages.push({
          role: "assistant",
          content: choice?.message?.content ?? "",
        });
        oaiMessages.push({
          role: "user",
          content: "Your previous response was truncated by a token limit before you finished. Continue with a tool_call if that's what you intended, or finish concisely. Do NOT claim you've built anything you have not actually written via tools.",
        });
        continue;
      }
      // Already retried — break the loop with a clear truncation signal
      // in the final text instead of a silent success.
      const truncatedFinal = "[Agenten ble avbrutt midt i generering — oppgaven er ikke fullført. Prøv igjen.]";
      agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
        finalText: truncatedFinal,
        toolsUsed,
        filesChanged: filesWritten.map((f) => f.path),
        filesWritten: filesWritten.length,
        totalInputTokens,
        totalOutputTokens,
        costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
        loopsUsed: loop + 1,
        stoppedAtMaxLoops: true,
        reason: "truncated",
        userMessage: truncatedFinal,
      }));
      return {
        finalText: truncatedFinal,
        toolsUsed,
        filesWritten,
        sandboxId,
        totalInputTokens,
        totalOutputTokens,
        costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
        modelUsed: options.model,
        loopsUsed: loop + 1,
        stoppedAtMaxLoops: true,
      };
    }

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
        reason: "natural",
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

      // Vision-plumbing (provider-agnostic): tool messages in the OpenAI
      // wire format must be plain strings, so we inject a follow-up user
      // turn carrying the image blocks via formatImageBlock(). Gemini
      // returns null (needs inline base64, not URL) → fall through to
      // text-only; the URLs remain visible inside the tool JSON payload.
      if (!result.isError) {
        const imageUrls = extractImageUrlsFromResult(result.content);
        if (imageUrls.length > 0 && getCapabilities(options.model)?.vision === true) {
          const blocks = imageUrls
            .map((url) => formatImageBlock(providerId, url))
            .filter((b): b is NonNullable<ReturnType<typeof formatImageBlock>> => b !== null);
          const imageUrlBlocks = blocks.filter(
            (b): b is { type: "image_url"; image_url: { url: string } } =>
              "type" in b && b.type === "image_url",
          );
          if (imageUrlBlocks.length > 0) {
            const parts: OAIMessagePart[] = [
              { type: "text", text: `Images returned by tool "${toolName}":` },
              ...imageUrlBlocks,
            ];
            oaiMessages.push({ role: "user", content: parts });
            log.info("tool-loop: attached images via follow-up user turn", {
              toolName,
              imageCount: imageUrlBlocks.length,
              provider: providerId,
              model: options.model,
            });
          }
        }
      }

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

      // Unrecoverable tool-failure — break loop with user-facing reason.
      if (result.bailOut) {
        log.warn("agent tool-loop (openai): breaking after tool bailOut", {
          tool: toolName,
          reason: result.bailOut.reason,
          loop,
        });

        agentEventBus.emit(streamKey, createAgentEvent("agent.done", {
          finalText: result.bailOut.userMessage,
          toolsUsed,
          filesChanged: filesWritten.map((f) => f.path),
          filesWritten: filesWritten.length,
          totalInputTokens,
          totalOutputTokens,
          costUsd: estimateCost(totalInputTokens, totalOutputTokens, options.model).totalCost,
          loopsUsed: loop + 1,
          stoppedAtMaxLoops: false,
          reason: "tool_failure",
          userMessage: result.bailOut.userMessage,
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
          finalText: result.bailOut.userMessage,
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

  const finalText = `[Agenten stoppet etter ${maxLoops} verktøy-kall uten å fullføre oppgaven. Prøv en enklere forespørsel eller splitt opp oppgaven.]`;

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
    reason: "max_loops",
    userMessage: finalText,
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

  // Sprint A — Tree-duplikat fjernet. Hele treeString er allerede i
  // system-prompt-context (via buildSystemPromptWithPipeline → relevant-
  // files-blokk). Kort hint her erstatter de 1.5-2.5k tokens som ble
  // gjentatt unødvendig.
  if (opts.treeString) {
    msg += `## File Tree\n(Available in system context — call repo_get_tree for sub-paths if needed.)\n\n`;
  }

  if (opts.memoryContext && opts.memoryContext.length > 0) {
    const PER_MEMORY_CAP = 1_200;
    msg += `## Relevant memories from previous tasks\n`;
    opts.memoryContext.slice(0, 5).forEach((m, i) => {
      const capped = m.length > PER_MEMORY_CAP ? `${m.slice(0, PER_MEMORY_CAP)}…` : m;
      msg += `${i + 1}. ${capped}\n`;
    });
    msg += "\n";
  }

  msg += `Use the available tools to complete this task. When done, summarize what was accomplished.`;
  return msg;
}

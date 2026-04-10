// --- Chat Tool-Use (Function Calling) ---
// CHAT_TOOLS, executeToolCall, enrichTaskWithAI, sanitizeRepoName, callWithTools.
// Currently Anthropic-only for tool-use (SDK streaming required per Sprint 6.24).
// Provider-agnostic tool routing prepared for future providers.

import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { estimateCost } from "./router";
import { resolveProviderFromModel } from "./provider-registry";
import { logTokenUsage } from "./call";
import type { AICallOptions, AICallResponse } from "./types";

const anthropicKey = secret("AnthropicAPIKey");

// --- Tool Definitions ---

export const CHAT_TOOLS: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = [
  {
    name: "create_task",
    description: "Create a new development task. Use when the user asks you to build, fix, change, or create something in the codebase.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title — describe EVERYTHING the user asks for in one task" },
        description: { type: "string", description: "Detailed description of what needs to be done. Include all steps." },
        priority: { type: "number", enum: [1, 2, 3, 4], description: "1=Urgent, 2=High, 3=Normal, 4=Low" },
        repoName: { type: "string", description: "Which repository the task applies to" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "start_task",
    description: "Start a task — the agent begins working. Use when the user says 'start', 'run', 'go', 'yes'. Three ways to identify the task: (1) provide taskId (UUID), (2) provide query to match task title, (3) omit both to start the latest unstarted task. Prefer calling start_task directly after create_task in the same turn.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task UUID — exact ID" },
        query: { type: "string", description: "Search text to match task title, e.g. 'index' or 'style.css'" },
      },
      required: [],
    },
  },
  {
    name: "list_tasks",
    description: "List tasks for a repository. Use when the user asks about status, what remains, etc.",
    input_schema: {
      type: "object",
      properties: {
        repoName: { type: "string" },
        status: { type: "string", enum: ["backlog", "planned", "in_progress", "in_review", "done", "blocked"] },
      },
    },
  },
  {
    name: "read_file",
    description: "Read a specific file from the repository. Use when the user asks to look at a file, or when you need more context.",
    input_schema: {
      type: "object",
      properties: {
        repoName: { type: "string" },
        path: { type: "string", description: "File path in the repository" },
      },
      required: ["repoName", "path"],
    },
  },
  {
    name: "search_code",
    description: "Search for relevant files in the repository based on a description.",
    input_schema: {
      type: "object",
      properties: {
        repoName: { type: "string" },
        query: { type: "string" },
      },
      required: ["repoName", "query"],
    },
  },
];

// --- Helpers ---

// Sanitize repo name — GitHub only allows alphanumeric, hyphens, underscores, dots
function sanitizeRepoName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/[^a-zA-Z0-9._-]/g, "") // remove invalid chars
    .replace(/^[-_.]+/, "")          // don't start with special chars
    .replace(/[-_.]+$/, "")          // don't end with special chars
    .substring(0, 100);              // GitHub max 100 chars
}

// --- Tool Execution ---

async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  repoName?: string,
  conversationId?: string,
  repoOwner?: string,
  assessComplexityFn?: (req: { taskDescription: string; projectStructure: string; fileCount: number }) => Promise<{ complexity: number; tokensUsed: number }>,
): Promise<Record<string, unknown>> {
  const owner = repoOwner || "";

  switch (name) {
    case "create_task": {
      console.log("[DEBUG-AF] === CREATE_TASK TOOL ===");
      console.log("[DEBUG-AF] Input:", JSON.stringify(input).substring(0, 300));

      const { tasks: tasksClient } = await import("~encore/clients");
      let taskRepo = sanitizeRepoName((input.repoName as string) || repoName || "") || undefined;
      if (!taskRepo) {
        const repoMatch = (input.title as string).match(/repo\s+[""]?([A-Za-z0-9_-]+)[""]?/i);
        if (repoMatch) taskRepo = repoMatch[1];
      }

      // Duplicate check
      try {
        const existing = await tasksClient.listTasks({ repo: taskRepo, limit: 20 });
        const title = (input.title as string).toLowerCase();
        const duplicate = existing.tasks.find((t: { title: string; status: string; repo?: string | null }) => {
          if (["deleted", "done", "blocked", "failed"].includes(t.status)) return false;
          const existingTitle = t.title.toLowerCase();
          const titleMatch = existingTitle === title ||
            existingTitle.includes(title.substring(0, 30)) ||
            title.includes(existingTitle.substring(0, 30));
          const repoMatch2 = !taskRepo || !t.repo || t.repo === taskRepo;
          return titleMatch && repoMatch2;
        });
        if (duplicate) {
          console.log("[DEBUG-AF] Duplicate found:", duplicate.id);
          return { success: false, taskId: duplicate.id, message: `Oppgave "${input.title}" finnes allerede (ID: ${duplicate.id})` };
        }
      } catch { /* non-critical — proceed with creation */ }

      const result = await tasksClient.createTask({
        title: input.title as string,
        description: (input.description as string) || "",
        priority: (input.priority as number) || 3,
        repo: taskRepo,
        source: "chat",
      });

      console.log("[DEBUG-AF] Task created with ID:", result.task.id);

      // Fire-and-forget: enrich task with AI complexity assessment
      if (assessComplexityFn) {
        enrichTaskWithAI(result.task.id, input.title as string, (input.description as string) || "", taskRepo, assessComplexityFn).catch((e) =>
          log.error("Task enrichment failed:", { error: e instanceof Error ? e.message : String(e) })
        );
      }

      return { success: true, taskId: result.task.id, message: `Oppgave opprettet: "${input.title}". Bruk start_task for å starte den.` };
    }

    case "start_task": {
      console.log("[DEBUG-AF] === START_TASK TOOL ===");
      console.log("[DEBUG-AF] Input taskId:", input.taskId);
      console.log("[DEBUG-AF] conversationId:", conversationId);

      try {
        const { tasks: tasksClient } = await import("~encore/clients");
        let taskId = String(input.taskId || "").trim();

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (!taskId || !uuidRegex.test(taskId)) {
          console.log("[DEBUG-AF] No valid taskId provided, searching for task...");
          const taskRepo = repoName || undefined;
          const query = String(input.query || "").trim().toLowerCase();
          try {
            const existing = await tasksClient.listTasks({ repo: taskRepo, limit: 20 });
            const unstarted = existing.tasks
              .filter((t: { status: string }) =>
                ["backlog", "planned"].includes(t.status)
              )
              .sort((a: { createdAt: string }, b: { createdAt: string }) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );

            if (unstarted.length === 0) {
              return { success: false, error: "Ingen ustartet oppgave funnet. Opprett en oppgave først med create_task." };
            }

            if (query) {
              const matched = unstarted.find((t: { title: string }) =>
                t.title.toLowerCase().includes(query)
              );
              if (matched) {
                taskId = matched.id;
                console.log(`[DEBUG-AF] Query "${query}" matched task:`, taskId, `"${matched.title}"`);
              } else {
                const available = unstarted.slice(0, 5).map((t: { title: string; id: string }) => `• "${t.title}" (${t.id})`).join("\n");
                return { success: false, error: `Ingen oppgave matcher "${input.query}". Tilgjengelige oppgaver:\n${available}` };
              }
            } else {
              taskId = unstarted[0].id;
              console.log("[DEBUG-AF] Auto-resolved to latest unstarted task:", taskId, `"${unstarted[0].title}"`);
            }
          } catch (e) {
            console.log("[DEBUG-AF] Task search failed:", e);
            return { success: false, error: `Kunne ikke søke etter oppgaver: ${e instanceof Error ? e.message : String(e)}` };
          }
        }

        console.log("[DEBUG-AF] Using taskId:", taskId);

        let taskData: { repo?: string | null; title?: string | null; status?: string | null; errorMessage?: string | null } | null = null;
        try {
          const result = await tasksClient.getTaskInternal({ id: taskId });
          if (result?.task) {
            taskData = { repo: result.task.repo, title: result.task.title, status: result.task.status, errorMessage: result.task.errorMessage };
            console.log("[DEBUG-AF] Task found:", taskData.title, "status:", taskData.status, "repo:", taskData.repo);
          }
        } catch (e) {
          console.log("[DEBUG-AF] ERROR: getTaskInternal failed:", e instanceof Error ? e.message : String(e));
          taskData = null;
        }

        if (!taskData) {
          console.log("[DEBUG-AF] ERROR: Task not found:", taskId);
          return { success: false, error: `Fant ikke oppgave med ID ${taskId}` };
        }

        if (taskData.status === "blocked") {
          console.log("[DEBUG-AF] Task is blocked:", taskData.errorMessage);
          return { success: false, error: `Oppgaven "${taskData.title}" er blokkert${taskData.errorMessage ? ": " + taskData.errorMessage : ""}. Opprett en ny oppgave.` };
        }
        if (taskData.status === "done") {
          console.log("[DEBUG-AF] Task already done");
          return { success: false, error: "Oppgaven er allerede fullfort." };
        }
        if (taskData.status === "in_progress") {
          console.log("[DEBUG-AF] Task already in_progress");
          return { success: false, error: "Oppgaven kjorer allerede." };
        }

        try {
          await tasksClient.updateTaskStatus({ id: taskId, status: "in_progress" });
          console.log("[DEBUG-AF] Task status updated to in_progress");
        } catch (e) {
          console.log("[DEBUG-AF] WARNING: Failed to update task status:", e);
        }

        const { agent: agentClient } = await import("~encore/clients");
        const startPayload = {
          conversationId: conversationId || "tool-" + Date.now(),
          taskId,
          userMessage: "Start oppgave: " + taskData.title,
          thefoldTaskId: taskId,
          repoName: sanitizeRepoName(taskData.repo || repoName || ""),
          repoOwner: repoOwner || "",
        };

        console.log("[DEBUG-AF] Calling agent.startTask with:", JSON.stringify(startPayload).substring(0, 500));

        agentClient.startTask(startPayload).then(() => {
          console.log("[DEBUG-AF] agent.startTask promise resolved");
        }).catch(async (e: Error) => {
          console.error("[DEBUG-AF] ERROR: agent.startTask FAILED:", e.message);
          try {
            await tasksClient.updateTaskStatus({ id: taskId, status: "blocked", errorMessage: e.message?.substring(0, 500) });
            console.log("[DEBUG-AF] Task marked as blocked after agent failure");
          } catch { /* non-critical */ }
        });

        console.log("[DEBUG-AF] agent.startTask fired (async)");
        return { success: true, message: `Oppgave "${taskData.title || taskId}" startet. Agenten jobber na.` };
      } catch (e) {
        console.error("[DEBUG-AF] START_TASK CRASHED:", e instanceof Error ? e.message : String(e));
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "list_tasks": {
      const { tasks: tasksClient } = await import("~encore/clients");
      const result = await tasksClient.listTasks({
        repo: (input.repoName as string) || repoName || undefined,
        status: (input.status || undefined) as any,
      });
      return { tasks: result.tasks.map((t: { id: string; title: string; status: string; priority: number }) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })), total: result.total };
    }

    case "read_file": {
      const { github: ghClient } = await import("~encore/clients");
      try {
        const file = await ghClient.getFile({
          owner,
          repo: (input.repoName as string) || repoName || "",
          path: input.path as string,
        });
        return { path: input.path, content: file.content?.substring(0, 5000) };
      } catch {
        return { error: `Kunne ikke lese ${input.path}` };
      }
    }

    case "search_code": {
      const { github: ghClient } = await import("~encore/clients");
      try {
        const repo = (input.repoName as string) || repoName || "";
        const tree = await ghClient.getTree({ owner, repo });
        const relevant = await ghClient.findRelevantFiles({
          owner,
          repo,
          taskDescription: input.query as string,
          tree: tree.tree,
        });
        return { matchingFiles: relevant.paths };
      } catch {
        return { error: "Kunne ikke søke i repoet" };
      }
    }

    default:
      return { error: `Ukjent tool: ${name}` };
  }
}

/** Fire-and-forget: assess complexity and update task with enrichment data */
export async function enrichTaskWithAI(
  taskId: string,
  title: string,
  description: string,
  repoName?: string,
  assessComplexityFn?: (req: { taskDescription: string; projectStructure: string; fileCount: number }) => Promise<{ complexity: number; tokensUsed: number }>,
) {
  if (!assessComplexityFn) return;
  try {
    const { tasks: tasksClient } = await import("~encore/clients");

    const complexity = await assessComplexityFn({
      taskDescription: title + "\n" + description,
      projectStructure: "",
      fileCount: 0,
    });

    await tasksClient.updateTask({
      id: taskId,
      estimatedComplexity: complexity.complexity,
      estimatedTokens: complexity.tokensUsed,
    });
  } catch (e) {
    log.error("enrichTaskWithAI failed:", { taskId, error: e instanceof Error ? e.message : String(e) });
  }
}

// --- Provider-agnostic Tool-Use Loop ---
// Currently Anthropic-only (SDK streaming required for tool-use per Sprint 6.24).
// Other providers will use fetch + provider-registry when tool-use support is added.

export interface ToolCallOptions extends AICallOptions {
  tools: typeof CHAT_TOOLS;
  repoName?: string;
  repoOwner?: string;
  conversationId?: string;
  assessComplexityFn?: (req: { taskDescription: string; projectStructure: string; fileCount: number }) => Promise<{ complexity: number; tokensUsed: number }>;
}

export interface ToolCallResponse extends AICallResponse {
  toolsUsed: string[];
  lastCreatedTaskId?: string;
}

export async function callWithTools(options: ToolCallOptions): Promise<ToolCallResponse> {
  const providerId = resolveProviderFromModel(options.model);

  // For now, all providers use Anthropic SDK streaming for tool-use
  // Future: add fetch-based tool-use for OpenAI-compatible providers
  if (providerId !== "anthropic") {
    log.warn("Tool-use requested for non-Anthropic provider, falling back to Anthropic SDK", { provider: providerId, model: options.model });
  }

  return callAnthropicWithToolsSDK(options);
}

async function callAnthropicWithToolsSDK(options: ToolCallOptions): Promise<ToolCallResponse> {
  const client = new Anthropic({ apiKey: anthropicKey() });

  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    { type: "text", text: options.system, cache_control: { type: "ephemeral" } },
  ];

  const allToolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastCreatedTaskId: string | null = null;

  const messages: Array<{ role: "user" | "assistant"; content: string | any[] }> = [
    ...options.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const MAX_TOOL_LOOPS = 10;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    console.log(`[DEBUG-AH] Tool loop iteration ${loop + 1}`);

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

    console.log(`[DEBUG-AH] Stop reason: ${response.stop_reason}, content blocks: ${response.content.length}`);

    if (response.stop_reason !== "tool_use") {
      const textContent = response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");

      console.log(`[DEBUG-AH] Final content length: ${textContent.length}`);

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
      };
    }

    // stop_reason === "tool_use" — execute tools
    const toolUseBlocks = response.content.filter((block: any) => block.type === "tool_use");
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];

    for (const toolBlock of toolUseBlocks) {
      const toolName = (toolBlock as any).name;
      const toolInput = { ...(toolBlock as any).input } as Record<string, unknown>;

      console.log(`[DEBUG-AH] Executing tool: ${toolName}, input: ${JSON.stringify(toolInput).substring(0, 300)}`);
      allToolsUsed.push(toolName);

      if (toolName === "start_task" && lastCreatedTaskId) {
        console.log(`[DEBUG-AH] start_task: overriding taskId ${toolInput.taskId} → ${lastCreatedTaskId}`);
        toolInput.taskId = lastCreatedTaskId;
      }

      try {
        // MCP tool call
        if (toolName.startsWith("mcp_")) {
          const parts = toolName.split("_");
          if (parts.length >= 3) {
            const serverName = parts[1];
            const actualToolName = parts.slice(2).join("_");

            console.log(`[DEBUG-AH] MCP tool call: ${serverName}/${actualToolName}`);

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

              console.log(`[DEBUG-AH] MCP tool result: ${resultText.substring(0, 200)}`);
            } catch (mcpErr) {
              console.error(`[DEBUG-AH] MCP tool ${toolName} FAILED:`, mcpErr);
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

          // Regular tool call
          const result = await executeToolCall(toolName, toolInput, options.repoName, options.conversationId, options.repoOwner, options.assessComplexityFn);

          if (toolName === "create_task" && result?.taskId) {
            lastCreatedTaskId = result.taskId as string;
            console.log(`[DEBUG-AH] lastCreatedTaskId: ${lastCreatedTaskId}`);
          }

          console.log(`[DEBUG-AH] Tool ${toolName} result: ${JSON.stringify(result).substring(0, 200)}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: (toolBlock as any).id,
            content: JSON.stringify(result),
          });
        }
      } catch (e) {
        console.error(`[DEBUG-AH] Tool ${toolName} FAILED:`, e);
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

    console.log(`[DEBUG-AH] Sent tool results back, looping... (tools so far: ${allToolsUsed.join(", ")})`);
  }

  // Max loops reached
  console.warn("[DEBUG-AH] Max tool loops reached!");

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
  };
}

// ai/tools/task/start-task.ts
// Migrated from ai/tools.ts `start_task` handler.

import { z } from "zod";
import type { Tool } from "../types";

function sanitizeRepoName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[-_.]+/, "")
    .replace(/[-_.]+$/, "")
    .substring(0, 100);
}

const inputSchema = z.object({
  taskId: z.string().optional().describe("Task UUID — exact ID"),
  query: z
    .string()
    .optional()
    .describe("Search text to match task title, e.g. 'index' or 'style.css'"),
});

export const startTaskTool: Tool<z.infer<typeof inputSchema>> = {
  name: "start_task",
  description:
    "Start a task — the agent begins working. Use when the user says 'start', 'run', 'go', 'yes'. Three ways to identify the task: (1) provide taskId (UUID), (2) provide query to match task title, (3) omit both to start the latest unstarted task. Prefer calling start_task directly after create_task in the same turn.",
  category: "task",
  inputSchema,

  surfaces: ["chat"],
  costHint: "medium",
  forbiddenWithActivePlan: true,

  async handler(input, ctx) {
    try {
      const { tasks: tasksClient, agent: agentClient } = await import("~encore/clients");
      let taskId = String(input.taskId || "").trim();

      // Magic carry-over from previous tool-loop iteration (create_task → start_task)
      if ((!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) && ctx.lastCreatedTaskId) {
        taskId = ctx.lastCreatedTaskId;
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!taskId || !uuidRegex.test(taskId)) {
        const taskRepo = ctx.repoName || undefined;
        const query = String(input.query || "")
          .trim()
          .toLowerCase();
        try {
          const existing = await tasksClient.listTasks({ repo: taskRepo, limit: 20 });
          const unstarted = existing.tasks
            .filter((t: { status: string }) => ["backlog", "planned"].includes(t.status))
            .sort(
              (a: { createdAt: string }, b: { createdAt: string }) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );

          if (unstarted.length === 0) {
            return {
              success: false,
              message: "Ingen ustartet oppgave funnet. Opprett en oppgave først med create_task.",
            };
          }

          if (query) {
            const matched = unstarted.find((t: { title: string }) =>
              t.title.toLowerCase().includes(query),
            );
            if (matched) {
              taskId = matched.id;
            } else {
              const available = unstarted
                .slice(0, 5)
                .map((t: { title: string; id: string }) => `• "${t.title}" (${t.id})`)
                .join("\n");
              return {
                success: false,
                message: `Ingen oppgave matcher "${input.query}". Tilgjengelige oppgaver:\n${available}`,
              };
            }
          } else {
            taskId = unstarted[0].id;
          }
        } catch (e) {
          return {
            success: false,
            message: `Kunne ikke søke etter oppgaver: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      }

      let taskData: {
        repo?: string | null;
        title?: string | null;
        status?: string | null;
        errorMessage?: string | null;
      } | null = null;
      try {
        const result = await tasksClient.getTaskInternal({ id: taskId });
        if (result?.task) {
          taskData = {
            repo: result.task.repo,
            title: result.task.title,
            status: result.task.status,
            errorMessage: result.task.errorMessage,
          };
        }
      } catch (e) {
        ctx.log.warn("getTaskInternal failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        taskData = null;
      }

      if (!taskData) {
        return { success: false, message: `Fant ikke oppgave med ID ${taskId}` };
      }

      if (taskData.status === "blocked") {
        return {
          success: false,
          message: `Oppgaven "${taskData.title}" er blokkert${
            taskData.errorMessage ? ": " + taskData.errorMessage : ""
          }. Opprett en ny oppgave.`,
        };
      }
      if (taskData.status === "done") {
        return { success: false, message: "Oppgaven er allerede fullfort." };
      }
      if (taskData.status === "in_progress") {
        return { success: false, message: "Oppgaven kjorer allerede." };
      }

      try {
        await tasksClient.updateTaskStatus({ id: taskId, status: "in_progress" });
      } catch (e) {
        ctx.log.warn("Failed to update task status", {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const startPayload = {
        conversationId: ctx.conversationId || "tool-" + Date.now(),
        taskId,
        userMessage: "Start oppgave: " + taskData.title,
        thefoldTaskId: taskId,
        repoName: sanitizeRepoName(taskData.repo || ctx.repoName || ""),
        repoOwner: ctx.repoOwner || "",
      };

      agentClient
        .startTask(startPayload)
        .then(() => {
          /* agent.startTask fired */
        })
        .catch(async (e: Error) => {
          ctx.log.error("agent.startTask FAILED", { error: e.message });
          try {
            await tasksClient.updateTaskStatus({
              id: taskId,
              status: "blocked",
              errorMessage: e.message?.substring(0, 500),
            });
          } catch {
            /* non-critical */
          }
        });

      // Notify frontend via SSE so it can connect to the agent's stream
      if (ctx.conversationId) {
        try {
          await agentClient.emitChatEvent({
            streamKey: ctx.conversationId,
            eventType: "agent.status",
            data: { status: "agent_started", phase: taskId },
          });
        } catch (e) {
          ctx.log.warn("emitChatEvent (agent_started) failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return {
        success: true,
        startedTaskId: taskId,
        message: `Oppgave "${taskData.title || taskId}" startet. Agenten jobber na.`,
      };
    } catch (e) {
      ctx.log.error("start_task crashed", {
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

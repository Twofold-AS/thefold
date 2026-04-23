// ai/tools/task/list-tasks.ts
// Migrated from ai/tools.ts `list_tasks` handler.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  repoName: z.string().optional(),
  status: z
    .enum(["backlog", "planned", "in_progress", "in_review", "done", "blocked"])
    .optional(),
});

export const listTasksTool: Tool<z.infer<typeof inputSchema>> = {
  name: "list_tasks",
  description:
    "List tasks for a repository. Use when the user asks about status, what remains, etc.",
  category: "task",
  inputSchema,

  surfaces: ["chat"],
  costHint: "low",

  async handler(input, ctx) {
    const { tasks: tasksClient } = await import("~encore/clients");
    const result = await tasksClient.listTasks({
      repo: input.repoName || ctx.repoName || undefined,
      status: input.status,
    });
    return {
      success: true,
      data: {
        tasks: result.tasks.map(
          (t: { id: string; title: string; status: string; priority: number }) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
          }),
        ),
        total: result.total,
      },
    };
  },
};

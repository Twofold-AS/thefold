// ai/tools/task/update-status.ts
// Migrated from agent/agent-tool-executor.ts `task_update_status`.

import { z } from "zod";
import type { Tool } from "../types";

const STATUS_ENUM = [
  "backlog",
  "planned",
  "in_progress",
  "in_review",
  "done",
  "blocked",
] as const;

const inputSchema = z.object({
  taskId: z.string(),
  status: z.enum(STATUS_ENUM),
  errorMessage: z
    .string()
    .optional()
    .describe("Required when status is blocked"),
});

export const taskUpdateStatusTool: Tool<z.infer<typeof inputSchema>> = {
  name: "task_update_status",
  description:
    "Update the status of a task. Use to mark a task as in_progress when starting, or blocked when an unrecoverable error occurs.",
  category: "task",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, _ctx) {
    const { tasks } = await import("~encore/clients");
    await tasks.updateTaskStatus({
      id: input.taskId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: input.status as any,
      errorMessage: input.errorMessage || undefined,
    });
    return {
      success: true,
      data: { ok: true },
      mutationCount: 1,
    };
  },
};

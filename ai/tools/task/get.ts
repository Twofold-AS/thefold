// ai/tools/task/get.ts
// Migrated from agent/agent-tool-executor.ts `task_get`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  taskId: z.string().describe("Task UUID"),
});

export const taskGetTool: Tool<z.infer<typeof inputSchema>> = {
  name: "task_get",
  description:
    "Get the full details of a task including description, status, and metadata. Use to re-read the task after context trimming.",
  category: "task",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, _ctx) {
    const { tasks } = await import("~encore/clients");
    const result = await tasks.getTaskInternal({ id: input.taskId });
    return {
      success: true,
      data: { task: result.task },
    };
  },
};

// ai/tools/project/remove-task.ts
// Commit 26 — remove_task tool.
// Deletes a pending task from the active plan. Blocks removal when other
// tasks still depend on the target — the caller must resolve the graph first.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  taskId: z.string().describe("project_task UUID to remove"),
  reason: z
    .string()
    .min(3)
    .describe("Why the task is being removed — kept in the audit log"),
});

export const removeTaskTool: Tool<z.infer<typeof inputSchema>> = {
  name: "remove_task",
  description:
    "Remove a pending task from the active plan. Fails if the task is already running/completed, or if other tasks depend on it.",
  category: "project",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",
  maxCallsPerSession: 5,
  requiresActivePlan: true,

  async handler(input, _ctx) {
    const { agent } = await import("~encore/clients");
    const result = await agent.removeProjectTask({
      taskId: input.taskId,
      reason: input.reason,
    });

    if (!result.removed && result.dependents && result.dependents.length > 0) {
      return {
        success: false,
        message: `Cannot remove — ${result.dependents.length} task(s) depend on this one. Edit or remove those first.`,
        data: {
          dependents: result.dependents,
        },
      };
    }

    return {
      success: true,
      data: {
        taskId: result.taskId,
        removed: true,
      },
      mutationCount: 1,
    };
  },
};

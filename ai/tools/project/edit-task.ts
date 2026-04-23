// ai/tools/project/edit-task.ts
// Commit 24 — edit_task tool.
// Updates a pending project_task's title, description, or dependencies.
// Running / completed tasks are rejected by the endpoint.

import { z } from "zod";
import type { Tool } from "../types";

const changesSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(5).optional(),
  dependsOn: z.array(z.string()).optional(),
});

const inputSchema = z.object({
  taskId: z.string().describe("project_task UUID"),
  changes: changesSchema.describe("Fields to update — at least one must be set"),
});

export const editTaskTool: Tool<z.infer<typeof inputSchema>> = {
  name: "edit_task",
  description:
    "Edit a pending task inside the active plan — title, description, or dependencies. Running or completed tasks cannot be edited.",
  category: "project",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",
  maxCallsPerSession: 10,
  requiresActivePlan: true,

  async handler(input, _ctx) {
    const { agent } = await import("~encore/clients");

    if (
      input.changes.title === undefined &&
      input.changes.description === undefined &&
      input.changes.dependsOn === undefined
    ) {
      return {
        success: false,
        message: "changes must include at least one field (title, description, or dependsOn)",
      };
    }

    const result = await agent.editProjectTask({
      taskId: input.taskId,
      title: input.changes.title,
      description: input.changes.description,
      dependsOn: input.changes.dependsOn,
    });

    return {
      success: true,
      data: {
        taskId: result.taskId,
        updatedFields: result.updated,
      },
      mutationCount: 1,
    };
  },
};

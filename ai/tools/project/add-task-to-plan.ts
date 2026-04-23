// ai/tools/project/add-task-to-plan.ts
// Commit 23 — add_task_to_plan tool.
// Adds a new pending task to an existing project_plan phase. Agent-only and
// only callable while a plan is active. Does NOT create a new plan or
// interact with supersede — the existing plan just grows by one task.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  planId: z.string().describe("Project plan UUID the task belongs to"),
  phaseIndex: z
    .number()
    .int()
    .min(0)
    .describe("Zero-based index of the phase the task is added to"),
  title: z.string().min(3).describe("Short task title"),
  description: z.string().min(5).describe("Task description"),
  dependsOn: z
    .array(z.string())
    .optional()
    .describe("Other project_task IDs that must complete before this one"),
});

export const addTaskToPlanTool: Tool<z.infer<typeof inputSchema>> = {
  name: "add_task_to_plan",
  description:
    "Add a new pending task to a specific phase of the active plan. Use when the plan needs an extra step you hadn't anticipated — not for starting a new top-level task.",
  category: "project",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",
  maxCallsPerSession: 10,
  requiresActivePlan: true,

  async handler(input, _ctx) {
    const { agent } = await import("~encore/clients");
    const result = await agent.addTaskToPlan({
      planId: input.planId,
      phaseIndex: input.phaseIndex,
      title: input.title,
      description: input.description,
      dependsOn: input.dependsOn,
    });

    return {
      success: true,
      data: {
        taskId: result.taskId,
        title: result.title,
        phaseIndex: result.phaseIndex,
        taskOrder: result.taskOrder,
      },
      mutationCount: 1,
    };
  },
};

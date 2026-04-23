// ai/tools/project/reorder-tasks.ts
// Commit 25 — reorder_tasks tool.
// Rewrites task_order for pending tasks within one phase. Running and
// completed tasks keep their current order — the caller must supply the full
// list of *pending* task IDs in the new order.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  planId: z.string().describe("Project plan UUID"),
  phaseIndex: z
    .number()
    .int()
    .min(0)
    .describe("Zero-based phase index being reordered"),
  newOrder: z
    .array(z.string())
    .min(1)
    .describe(
      "All pending task IDs in the phase, listed in the desired execution order",
    ),
});

export const reorderTasksTool: Tool<z.infer<typeof inputSchema>> = {
  name: "reorder_tasks",
  description:
    "Reorder the pending tasks within one phase of the active plan. You must list every pending task ID — running/completed tasks keep their place automatically.",
  category: "project",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",
  maxCallsPerSession: 5,
  requiresActivePlan: true,

  async handler(input, _ctx) {
    const { agent } = await import("~encore/clients");
    const result = await agent.reorderProjectTasks({
      planId: input.planId,
      phaseIndex: input.phaseIndex,
      newOrder: input.newOrder,
    });

    return {
      success: true,
      data: {
        planId: result.planId,
        phaseIndex: result.phaseIndex,
        reordered: result.reordered,
        pinnedTasks: result.pinnedTasks,
      },
      mutationCount: result.reordered,
    };
  },
};

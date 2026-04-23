// ai/tools/project/revise-project-plan.ts
// Migrated from ai/tools.ts `revise_project_plan` handler.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  projectId: z.string().describe("ID of the existing plan to revise"),
  editRequest: z.string().describe("What changes to make to the plan"),
});

export const reviseProjectPlanTool: Tool<z.infer<typeof inputSchema>> = {
  name: "revise_project_plan",
  description:
    "Revise an existing project plan. Call this when the user wants to add tasks, remove tasks, change phases, or restructure the plan.",
  category: "project",
  inputSchema,

  surfaces: ["chat"],
  costHint: "medium",

  async handler(input, ctx) {
    const { ai: aiClient, agent: agentClient } = await import("~encore/clients");

    // Fetch existing plan phases so the AI has full context for the revision
    let currentPhases:
      | Array<{
          name: string;
          description: string;
          tasks: Array<{
            title: string;
            description: string;
            dependsOnIndices: number[];
          }>;
        }>
      | undefined;
    try {
      const existing = await agentClient.getProjectPlan({ projectId: input.projectId });
      currentPhases = existing.phases;
    } catch {
      // Non-critical — proceed without phases (AI will see existingPlanId only)
    }

    const revised = await aiClient.revisePlanUser({
      existingPlanId: input.projectId,
      editRequest: input.editRequest,
      currentPhases,
    });

    const stored = await agentClient.storeProjectPlan({
      conversationId: ctx.conversationId || "",
      userRequest: input.editRequest,
      repoName: ctx.repoName,
      supersededPlanId: input.projectId,
      decomposition: {
        phases: revised.phases,
        conventions: revised.conventions,
        estimatedTotalTasks: revised.totalTasks,
      },
    });

    return {
      success: true,
      message: `Plan oppdatert med ${stored.totalTasks} oppgaver.`,
      data: { projectId: stored.projectId },
    };
  },
};

// ai/tools/project/execute-project-plan.ts
// Migrated from ai/tools.ts `execute_project_plan` handler.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  projectId: z
    .string()
    .describe("ID of the plan to execute (found in the latest project_plan message)"),
  conversationId: z.string().optional(),
  repoOwner: z.string().optional(),
  repoName: z.string().optional(),
});

export const executeProjectPlanTool: Tool<z.infer<typeof inputSchema>> = {
  name: "execute_project_plan",
  description:
    "Start execution of a project plan. Call this when the user says 'kjør planen', 'start prosjektet', 'sett i gang', 'execute', or similar.",
  category: "project",
  inputSchema,

  surfaces: ["chat"],
  costHint: "high",

  async handler(input, ctx) {
    const projectId = input.projectId;
    const effectiveRepoName = input.repoName || ctx.repoName || "";
    const effectiveRepoOwner = input.repoOwner || ctx.repoOwner || "";
    if (!effectiveRepoOwner || !effectiveRepoName) {
      return {
        success: false,
        message:
          'Jeg trenger å vite hvilket repo prosjektet skal kjøres i. Kan du si meg reponavn og owner? For eksempel: "Kjør planen i repo my-org/my-repo"',
      };
    }
    const { agent: agentClient } = await import("~encore/clients");
    await agentClient.startProject({
      projectId,
      conversationId: input.conversationId || ctx.conversationId || "",
      repoOwner: effectiveRepoOwner,
      repoName: effectiveRepoName,
    });
    return {
      success: true,
      message: "Prosjektet er startet. Du vil motta oppdateringer i samtalen.",
    };
  },
};

// ai/tools/task/decompose-project.ts
// Migrated from agent/agent-tool-executor.ts `task_decompose_project`.

import { z } from "zod";
import type { Tool } from "../types";

const existingFilesSchema = z.array(
  z.object({
    path: z.string(),
    content: z.string(),
  }),
);

const inputSchema = z.object({
  userMessage: z.string().describe("The original user request"),
  repoOwner: z.string().optional(),
  repoName: z.string().optional(),
  projectStructure: z.string().describe("Existing file tree"),
  existingFiles: existingFilesSchema.optional(),
});

export const taskDecomposeProjectTool: Tool<z.infer<typeof inputSchema>> = {
  name: "task_decompose_project",
  description:
    "Decompose a large user request into phases and atomic tasks. Use when the request requires multiple systems or more than 3 files.",
  category: "task",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, ctx) {
    const { ai } = await import("~encore/clients");
    const repoOwner = input.repoOwner || ctx.repoOwner || "";
    const repoName = input.repoName || ctx.repoName || "";

    const result = await ai.decomposeProject({
      userMessage: input.userMessage,
      repoOwner,
      repoName,
      projectStructure: input.projectStructure,
      existingFiles: input.existingFiles,
    });

    return {
      success: true,
      data: {
        phases: result.phases,
        conventions: result.conventions,
        reasoning: result.reasoning,
        estimatedTotalTasks: result.estimatedTotalTasks,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      },
    };
  },
};

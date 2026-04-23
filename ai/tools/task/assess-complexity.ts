// ai/tools/task/assess-complexity.ts
// Migrated from agent/agent-tool-executor.ts `task_assess_complexity`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  taskDescription: z.string(),
  projectStructure: z.string(),
  fileCount: z
    .number()
    .optional()
    .describe("Number of files in the repository"),
});

export const taskAssessComplexityTool: Tool<z.infer<typeof inputSchema>> = {
  name: "task_assess_complexity",
  description:
    "Assess the complexity of a task (1-10) and select the appropriate AI model. Call before planning to determine resource requirements.",
  category: "task",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, _ctx) {
    const { ai } = await import("~encore/clients");
    const result = await ai.assessComplexity({
      taskDescription: input.taskDescription,
      projectStructure: input.projectStructure,
      fileCount: input.fileCount ?? 0,
    });

    return {
      success: true,
      data: {
        complexity: result.complexity,
        reasoning: result.reasoning,
        suggestedModel: result.suggestedModel,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      },
    };
  },
};

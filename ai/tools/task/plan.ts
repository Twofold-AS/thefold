// ai/tools/task/plan.ts
// Migrated from agent/agent-tool-executor.ts `task_plan`.

import { z } from "zod";
import type { Tool } from "../types";

const existingCodeSchema = z.array(
  z.object({
    path: z.string(),
    content: z.string(),
  }),
);

const inputSchema = z.object({
  taskDescription: z
    .string()
    .describe("Full task description including context"),
  projectStructure: z
    .string()
    .describe("Repository file tree as a string"),
  existingCode: existingCodeSchema
    .optional()
    .describe("Relevant existing files for context"),
  complexityHint: z
    .number()
    .optional()
    .describe("Complexity score 1-10 if already assessed"),
});

export const taskPlanTool: Tool<z.infer<typeof inputSchema>> = {
  name: "task_plan",
  description:
    "Generate a structured implementation plan for a task. Returns ordered steps with file paths and descriptions. Call this before writing any code.",
  category: "task",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, _ctx) {
    const { ai } = await import("~encore/clients");
    const result = await ai.planTask({
      task: input.taskDescription,
      projectStructure: input.projectStructure,
      relevantFiles: input.existingCode ?? [],
      memoryContext: [],
      docsContext: [],
    });

    return {
      success: true,
      data: {
        plan: result.plan,
        reasoning: result.reasoning,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      },
    };
  },
};

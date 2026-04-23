// ai/tools/memory/search-patterns.ts
// Migrated from agent/agent-tool-executor.ts `memory_search_patterns`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  errorMessage: z
    .string()
    .describe("The error message or stack trace to match"),
  language: z
    .string()
    .optional()
    .describe("Programming language or framework (e.g. TypeScript, React)"),
  limit: z.number().optional().describe("Max results (default: 5)"),
});

export const memorySearchPatternsTool: Tool<z.infer<typeof inputSchema>> = {
  name: "memory_search_patterns",
  description:
    "Search for error patterns from previous failures. Use when a validation step fails to find known fixes for similar errors.",
  category: "memory",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { memory } = await import("~encore/clients");
    const limit = input.limit ?? 5;
    // Preserve legacy scope: if language is provided, don't scope to repo
    const sourceRepo = input.language ? undefined : ctx.repoName || undefined;

    const result = await memory.searchPatterns({
      query: input.errorMessage,
      sourceRepo,
      limit,
    });

    return {
      success: true,
      data: {
        patterns: result.patterns.map(
          (p: {
            id: string;
            patternType: string;
            problemDescription: string;
            solutionDescription: string;
          }) => ({
            id: p.id,
            patternType: p.patternType,
            problemDescription: p.problemDescription,
            solutionDescription: p.solutionDescription,
          }),
        ),
      },
    };
  },
};

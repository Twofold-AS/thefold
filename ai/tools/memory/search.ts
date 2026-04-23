// ai/tools/memory/search.ts
// Migrated from agent/agent-tool-executor.ts `memory_search`.

import { z } from "zod";
import type { Tool } from "../types";

const MEMORY_TYPES = [
  "general",
  "skill",
  "task",
  "session",
  "error_pattern",
  "decision",
] as const;

const inputSchema = z.object({
  query: z
    .string()
    .describe("Semantic search query — describe what you are looking for"),
  repoName: z
    .string()
    .optional()
    .describe("Scope search to a specific repository"),
  limit: z.number().optional().describe("Max results (default: 10)"),
  types: z
    .array(z.enum(MEMORY_TYPES))
    .optional()
    .describe("Filter by memory type"),
});

export const memorySearchTool: Tool<z.infer<typeof inputSchema>> = {
  name: "memory_search",
  description:
    "Search for relevant memories from previous tasks. Use at the start of every task to retrieve known patterns, conventions, and prior solutions.",
  category: "memory",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { memory } = await import("~encore/clients");
    const limit = input.limit ?? 10;
    const repoName = input.repoName || ctx.repoName || undefined;

    const result = await memory.search({
      query: input.query,
      limit,
      sourceRepo: repoName,
      // Pass first requested type — memory.search accepts a single memoryType filter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      memoryType: input.types?.[0] as any,
    });

    return {
      success: true,
      data: {
        results: result.results.map(
          (r: {
            id: string;
            content: string;
            memoryType: string;
            similarity: number;
            decayedScore: number;
            trustLevel: string;
            tags: string[];
          }) => ({
            id: r.id,
            content: r.content,
            memoryType: r.memoryType,
            similarity: r.similarity,
            decayedScore: r.decayedScore,
            trustLevel: r.trustLevel,
            tags: r.tags,
          }),
        ),
      },
    };
  },
};

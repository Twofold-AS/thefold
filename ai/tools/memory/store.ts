// ai/tools/memory/store.ts
// Migrated from agent/agent-tool-executor.ts `memory_store`.

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
  content: z.string().describe("The information to store"),
  type: z.enum(MEMORY_TYPES).describe("Memory category"),
  repoName: z.string().optional().describe("Associate with a specific repository"),
  tags: z.array(z.string()).optional().describe("Search tags"),
  importance: z
    .number()
    .optional()
    .describe("Importance score 0-1 (default: 0.5)"),
});

export const memoryStoreTool: Tool<z.infer<typeof inputSchema>> = {
  name: "memory_store",
  description:
    "Store a memory for future tasks. Use after completing a task to record patterns, decisions, or solutions that were discovered.",
  category: "memory",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { memory } = await import("~encore/clients");
    const importance = input.importance ?? 0.5;
    const repoName = input.repoName || ctx.repoName || undefined;

    const result = await memory.store({
      content: input.content,
      category: "agent",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      memoryType: input.type as any,
      sourceRepo: repoName,
      tags: input.tags ?? [],
      conversationId: ctx.conversationId,
      // Map importance (0–1) to ttlDays: low importance → shorter TTL
      ttlDays: Math.round(30 + importance * 60), // 30–90 days
      trustLevel: "agent",
    });

    return {
      success: true,
      data: { id: result.id },
      mutationCount: 1,
    };
  },
};

// ai/tools/memory/recall.ts
// Commit 15 — recall_memory tool.
// Wrapper around memory.search + memory.searchKnowledge that lets the AI pull
// prior insights, decisions, error patterns, code patterns, and task summaries
// into the current turn.

import { z } from "zod";
import type { Tool } from "../types";

const TYPE_ENUM = [
  "insight",
  "decision",
  "error_pattern",
  "code_pattern",
  "task_summary",
] as const;

const inputSchema = z.object({
  query: z.string().describe("What to recall — natural-language query"),
  type: z
    .enum(TYPE_ENUM)
    .optional()
    .describe("Narrow the recall to a specific memory category"),
  limit: z.number().optional().describe("Max results (default: 5)"),
  repoName: z
    .string()
    .optional()
    .describe("Scope recall to a specific repository"),
});

export const recallMemoryTool: Tool<z.infer<typeof inputSchema>> = {
  name: "recall_memory",
  description:
    "Recall relevant memories from previous sessions — insights, decisions, error patterns, code patterns, or task summaries. Call when the user refers to past work or when prior knowledge could shortcut the current turn.",
  category: "memory",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { memory } = await import("~encore/clients");
    const limit = input.limit ?? 5;
    const repoName = input.repoName || ctx.repoName || undefined;

    // "insight" and "decision" live in the knowledge table; everything else
    // lives in memories. Query both surfaces when appropriate and merge.
    const isKnowledgeType = input.type === "insight" || input.type === "decision";

    const [memoryResults, knowledgeResults] = await Promise.all([
      // Memories surface — always consulted unless the caller explicitly
      // narrows to a knowledge-only type.
      isKnowledgeType
        ? Promise.resolve({ results: [] })
        : memory.search({
            query: input.query,
            limit,
            sourceRepo: repoName,
            memoryType: toMemoryType(input.type),
          }),
      // Knowledge surface — only when type is insight/decision or unspecified.
      input.type && !isKnowledgeType
        ? Promise.resolve({ results: [] })
        : memory.searchKnowledge({
            query: input.query,
            limit,
          }),
    ]);

    const hits = [
      ...(memoryResults.results ?? []).map(
        (r: {
          id: string;
          content: string;
          memoryType: string;
          similarity: number;
          tags?: string[];
        }) => ({
          source: "memory" as const,
          id: r.id,
          content: r.content,
          type: r.memoryType,
          score: r.similarity,
          tags: r.tags ?? [],
        }),
      ),
      ...(knowledgeResults.results ?? []).map(
        (r: { id: string; rule: string; category: string; confidence: number }) => ({
          source: "knowledge" as const,
          id: r.id,
          content: r.rule,
          type: r.category,
          score: r.confidence,
          tags: [],
        }),
      ),
    ];

    // Stable sort: score descending
    hits.sort((a, b) => b.score - a.score);

    return {
      success: true,
      data: {
        results: hits.slice(0, limit),
        count: hits.length,
      },
    };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMemoryType(t: string | undefined): any {
  if (!t) return undefined;
  // Map tool-facing names to the memory service's MemoryType union.
  if (t === "error_pattern" || t === "decision") return t;
  if (t === "task_summary") return "task";
  if (t === "code_pattern") return "skill";
  return undefined;
}

// ai/tools/memory/save-insight.ts
// Commit 16 — save_insight tool.
// Agent-only wrapper around memory.storeKnowledge for capturing durable
// insights (generalisable lessons, conventions, non-obvious constraints).
// Agent-generated insights start at confidence 0.4 — they strengthen over
// time via the knowledge feedback loop.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  title: z
    .string()
    .min(3)
    .describe("Short title — what the insight is about"),
  content: z
    .string()
    .min(10)
    .describe("The insight itself, written as an actionable rule or observation"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Search tags (e.g. ['encore', 'auth', 'pitfall'])"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Initial confidence 0-1 (default: 0.4 for agent-generated)"),
});

export const saveInsightTool: Tool<z.infer<typeof inputSchema>> = {
  name: "save_insight",
  description:
    "Save a durable insight discovered during this task so future work can build on it. Use when you learn something non-obvious: a hidden constraint, a working pattern, or a pitfall that isn't in the code itself.",
  category: "memory",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",
  maxCallsPerSession: 3,

  async handler(input, _ctx) {
    const { memory } = await import("~encore/clients");
    const confidence = input.confidence ?? 0.4;
    const contextLine = input.tags && input.tags.length > 0
      ? `${input.title} — tags: ${input.tags.join(", ")}`
      : input.title;

    const result = await memory.storeKnowledge({
      rule: input.content,
      category: "insight",
      context: contextLine,
      sourceModel: "agent",
      confidence,
    });

    return {
      success: true,
      data: {
        id: result.id,
        deduplicated: result.deduplicated,
      },
      mutationCount: 1,
    };
  },
};

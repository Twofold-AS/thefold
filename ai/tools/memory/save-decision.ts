// ai/tools/memory/save-decision.ts
// Commit 19 — save_decision tool.
// Agent-only wrapper around memory.storeKnowledge that records an architectural
// or strategy choice with its rationale. Starts at confidence 0.5 — decisions
// carry more initial weight than insights because they're explicit choices.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  context: z
    .string()
    .min(3)
    .describe("What problem / scope this decision applies to"),
  decision: z
    .string()
    .min(3)
    .describe("The choice made — phrased as an actionable rule"),
  rationale: z
    .string()
    .min(10)
    .describe("Why this was chosen over alternatives"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Search tags (e.g. ['architecture', 'auth', 'trade-off'])"),
});

export const saveDecisionTool: Tool<z.infer<typeof inputSchema>> = {
  name: "save_decision",
  description:
    "Record an architectural or strategy decision so future work preserves the choice. Use when committing to an approach after weighing alternatives, especially when the rationale would otherwise be lost.",
  category: "memory",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",
  maxCallsPerSession: 3,

  async handler(input, _ctx) {
    const { memory } = await import("~encore/clients");
    const tagLine = input.tags && input.tags.length > 0
      ? ` — tags: ${input.tags.join(", ")}`
      : "";

    // Encode rationale into the rule body — the knowledge table has no
    // dedicated rationale column, and keeping it adjacent to the decision
    // preserves the link when the entry is surfaced later.
    const ruleBody = `${input.decision}\n\nRationale: ${input.rationale}`;

    const result = await memory.storeKnowledge({
      rule: ruleBody,
      category: "decision",
      context: `${input.context}${tagLine}`,
      sourceModel: "agent",
      confidence: 0.5,
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

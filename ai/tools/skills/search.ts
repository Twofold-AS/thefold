// ai/tools/skills/search.ts
// Migrated from agent/agent-tool-executor.ts `search_skills`.

import { z } from "zod";
import type { Tool } from "../types";

const CONTEXT_ENUM = ["planning", "coding", "review", "chat"] as const;
const CATEGORY_ENUM = [
  "framework",
  "language",
  "security",
  "style",
  "quality",
  "general",
] as const;

const inputSchema = z.object({
  context: z
    .enum(CONTEXT_ENUM)
    .describe("Phase of work — determines which skills apply"),
  category: z
    .enum(CATEGORY_ENUM)
    .optional()
    .describe("Filter by skill category (optional)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Filter by tags (e.g. ['encore', 'typescript'])"),
  enabledOnly: z
    .boolean()
    .optional()
    .describe("Return only enabled skills (default: true)"),
});

export const searchSkillsTool: Tool<z.infer<typeof inputSchema>> = {
  name: "search_skills",
  description:
    "Search for active skills that apply to the current context. Use to discover prompt fragments and coding conventions before planning.",
  category: "skills",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { skills } = await import("~encore/clients");

    // Use skills.resolve() for routing-rule-based filtering
    const result = await skills.resolve({
      context: {
        task: input.context,
        taskType: input.context,
        repo: ctx.repoName || undefined,
        userId: ctx.userId || "agent",
        totalTokenBudget: 20_000,
      },
    });

    // Extract matched skills from the injected prompt and postRun skills
    // Return skills with truncated promptFragment (max 2000 tokens ≈ 8000 chars)
    const MAX_FRAGMENT_CHARS = 8_000;
    const injectedIds = new Set(result.result.injectedSkillIds);

    const listResult = await skills.listSkills({ enabledOnly: true });
    const matchedSkills = listResult.skills
      .filter((s: { id: string }) => injectedIds.has(s.id))
      .map(
        (s: {
          id: string;
          name: string;
          description: string;
          promptFragment: string;
          category: string;
          tags: string[];
          enabled: boolean;
          taskPhase: string;
        }) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          promptFragment:
            s.promptFragment.length > MAX_FRAGMENT_CHARS
              ? s.promptFragment.substring(0, MAX_FRAGMENT_CHARS) +
                "... [truncated]"
              : s.promptFragment,
          category: s.category,
          tags: s.tags,
          taskPhase: s.taskPhase,
        }),
      );

    return {
      success: true,
      data: {
        skills: matchedSkills,
        count: matchedSkills.length,
        tokensUsed: result.result.tokensUsed,
        injectedPrompt:
          result.result.injectedPrompt.substring(0, 500) +
          (result.result.injectedPrompt.length > 500 ? "..." : ""),
      },
    };
  },
};

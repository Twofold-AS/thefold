// ai/tools/skills/activate.ts
// Migrated from agent/agent-tool-executor.ts `activate_skill`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  id: z.string().describe("Skill UUID"),
  enabled: z.boolean().describe("true = enable, false = disable"),
});

export const activateSkillTool: Tool<z.infer<typeof inputSchema>> = {
  name: "activate_skill",
  description:
    "Enable or disable a skill by ID. Use when the user asks to turn a skill on or off, or when a skill is causing issues.",
  category: "skills",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, _ctx) {
    const { skills } = await import("~encore/clients");

    const toggleResult = await skills.toggleSkill({
      id: input.id,
      enabled: input.enabled,
    });

    // After toggle, fetch full promptFragment so AI can use it immediately
    const MAX_FRAGMENT_CHARS = 8_000;
    const listResult = await skills.listSkills({ enabledOnly: false });
    const skill = listResult.skills.find(
      (s: { id: string }) => s.id === input.id,
    );

    return {
      success: true,
      data: {
        id: toggleResult.skill.id,
        name: toggleResult.skill.name,
        enabled: toggleResult.skill.enabled,
        promptFragment: skill
          ? skill.promptFragment.length > MAX_FRAGMENT_CHARS
            ? skill.promptFragment.substring(0, MAX_FRAGMENT_CHARS) +
              "... [truncated]"
            : skill.promptFragment
          : "",
      },
      mutationCount: 1,
    };
  },
};

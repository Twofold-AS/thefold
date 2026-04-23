// ai/tools/repo/get-tree.ts
// Migrated from agent/agent-tool-executor.ts `repo_get_tree`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  owner: z.string().optional().describe("GitHub owner (user or org)"),
  repo: z.string().optional().describe("Repository name"),
});

export const repoGetTreeTool: Tool<z.infer<typeof inputSchema>> = {
  name: "repo_get_tree",
  description:
    "Get the full file tree of a repository. Use to understand project structure before reading or writing files.",
  category: "repo",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { github } = await import("~encore/clients");
    const owner = input.owner || ctx.repoOwner || "";
    const repo = input.repo || ctx.repoName || "";
    const result = await github.getTree({ owner, repo });
    return {
      success: true,
      data: { tree: result.tree },
    };
  },
};

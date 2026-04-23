// ai/tools/code/search-code.ts
// Migrated from ai/tools.ts `search_code` handler.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  repoName: z.string(),
  query: z.string(),
});

export const searchCodeTool: Tool<z.infer<typeof inputSchema>> = {
  name: "search_code",
  description:
    "Search for relevant files in the repository based on a description.",
  category: "code",
  inputSchema,

  surfaces: ["chat"],
  costHint: "medium",

  async handler(input, ctx) {
    const { github: ghClient } = await import("~encore/clients");
    const owner = ctx.repoOwner || "";
    try {
      const repo = input.repoName || ctx.repoName || "";
      const tree = await ghClient.getTree({ owner, repo });
      const relevant = await ghClient.findRelevantFiles({
        owner,
        repo,
        taskDescription: input.query,
        tree: tree.tree,
      });
      return {
        success: true,
        data: { matchingFiles: relevant.paths },
      };
    } catch {
      return { success: false, message: "Kunne ikke søke i repoet" };
    }
  },
};

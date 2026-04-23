// ai/tools/repo/find-relevant-files.ts
// Migrated from agent/agent-tool-executor.ts `repo_find_relevant_files`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  taskDescription: z
    .string()
    .describe("What the task is about — used for semantic matching"),
  tree: z
    .array(z.string())
    .optional()
    .describe("File tree from repo_get_tree. Pass this to avoid a second API call."),
});

export const repoFindRelevantFilesTool: Tool<z.infer<typeof inputSchema>> = {
  name: "repo_find_relevant_files",
  description:
    "Find files in the repository that are relevant to a task description. Returns ranked list of file paths.",
  category: "repo",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, ctx) {
    const { github } = await import("~encore/clients");
    const owner = input.owner || ctx.repoOwner || "";
    const repo = input.repo || ctx.repoName || "";

    // Reuse tree from input if the AI already fetched it; otherwise fetch now
    let tree: string[];
    if (input.tree && input.tree.length > 0) {
      tree = input.tree;
    } else {
      const treeResult = await github.getTree({ owner, repo });
      tree = treeResult.tree;
    }

    const result = await github.findRelevantFiles({
      owner,
      repo,
      taskDescription: input.taskDescription,
      tree,
    });
    return {
      success: true,
      data: { paths: result.paths },
    };
  },
};

// ai/tools/repo/read-file.ts
// Migrated from agent/agent-tool-executor.ts `repo_read_file`.
// Distinct from ai/tools/code/read-file.ts — this is the agent-surface variant.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  path: z.string().describe("File path relative to repo root"),
  ref: z
    .string()
    .optional()
    .describe("Branch or commit SHA (default: main)"),
});

export const repoReadFileTool: Tool<z.infer<typeof inputSchema>> = {
  name: "repo_read_file",
  description:
    "Read the content of a specific file from the repository. Use when you need to inspect existing code before making changes.",
  category: "repo",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { github } = await import("~encore/clients");
    const owner = input.owner || ctx.repoOwner || "";
    const repo = input.repo || ctx.repoName || "";
    // github.getFile does not accept a ref parameter — always reads head of default branch
    const result = await github.getFile({ owner, repo, path: input.path });
    return {
      success: true,
      data: {
        path: input.path,
        content: result.content,
        sha: result.sha,
      },
    };
  },
};

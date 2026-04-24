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
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Character offset to start reading from (default: 0). Use with maxChars to page through large files."),
  maxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max characters to return (default: 50000). Files larger than this are truncated — use offset to read more."),
});

const DEFAULT_MAX_CHARS = 50_000;

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

    const offset = input.offset ?? 0;
    const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
    const totalChars = result.content.length;
    const slice = result.content.slice(offset, offset + maxChars);
    const truncated = offset + maxChars < totalChars;
    const content = truncated
      ? `${slice}\n\n[...truncated at ${offset + maxChars}/${totalChars} chars — call repo_read_file again with offset=${offset + maxChars} to read more]`
      : slice;

    return {
      success: true,
      data: {
        path: input.path,
        content,
        sha: result.sha,
        totalChars,
        offset,
        truncated,
      },
    };
  },
};

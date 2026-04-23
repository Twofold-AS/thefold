// ai/tools/repo/create-pr.ts
// Migrated from agent/agent-tool-executor.ts `repo_create_pr`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  reviewId: z.string().describe("Code review ID to turn into a PR"),
  title: z.string().describe("PR title"),
  body: z.string().optional().describe("PR description (markdown)"),
  branch: z.string().optional().describe("Source branch name"),
});

export const repoCreatePrTool: Tool<z.infer<typeof inputSchema>> = {
  name: "repo_create_pr",
  description:
    "Create a pull request with all files from the approved review. Only call after the user has approved a review.",
  category: "repo",
  inputSchema,

  surfaces: ["agent"],
  costHint: "high",

  async handler(input, ctx) {
    const { agent, github } = await import("~encore/clients");
    const branch = input.branch || `thefold/${Date.now()}`;
    const body = input.body || "";

    // Load review to get files
    const { review } = await agent.getReview({ reviewId: input.reviewId });

    // Map ReviewFile[] → github.createPR files format
    const files = review.filesChanged.map(
      (f: { path: string; content: string; action: string }) => ({
        path: f.path,
        content: f.content,
        action: f.action as "create" | "modify" | "delete",
      }),
    );

    const pr = await github.createPR({
      owner: review.repoOwner || ctx.repoOwner || "",
      repo: review.repoName || ctx.repoName || "",
      branch,
      title: input.title,
      body,
      files,
    });

    return {
      success: true,
      data: { url: pr.url, number: pr.number },
      mutationCount: files.length,
    };
  },
};

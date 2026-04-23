// ai/tools/build/create-sandbox.ts
// Migrated from agent/agent-tool-executor.ts `build_create_sandbox`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  repoOwner: z.string().optional(),
  repoName: z.string().optional(),
  branch: z
    .string()
    .optional()
    .describe("Branch to clone into the sandbox (default: main)"),
});

export const buildCreateSandboxTool: Tool<z.infer<typeof inputSchema>> = {
  name: "build_create_sandbox",
  description:
    "Create an isolated sandbox environment for code execution and validation. Returns a sandboxId used by all other build tools.",
  category: "build",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, ctx) {
    const { sandbox } = await import("~encore/clients");
    const repoOwner = input.repoOwner || ctx.repoOwner || "";
    const repoName = input.repoName || ctx.repoName || "";
    const ref = input.branch || "main";

    const result = await sandbox.create({ repoOwner, repoName, ref });
    return {
      success: true,
      data: { sandboxId: result.id },
      mutationCount: 1,
    };
  },
};

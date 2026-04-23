// ai/tools/repo/write-file.ts
// Migrated from agent/agent-tool-executor.ts `repo_write_file`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  sandboxId: z.string().describe("Sandbox ID from build_create_sandbox"),
  path: z.string().describe("File path relative to workspace root"),
  content: z.string().describe("Full file content"),
});

export const repoWriteFileTool: Tool<z.infer<typeof inputSchema>> = {
  name: "repo_write_file",
  description:
    "Write or update a file in the sandbox workspace. Call this to stage changes before build_validate.",
  category: "repo",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, _ctx) {
    const { sandbox } = await import("~encore/clients");
    await sandbox.writeFile({
      sandboxId: input.sandboxId,
      path: input.path,
      content: input.content,
    });
    return {
      success: true,
      data: { ok: true, path: input.path },
      mutationCount: 1,
    };
  },
};

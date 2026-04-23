// ai/tools/build/run-command.ts
// Migrated from agent/agent-tool-executor.ts `build_run_command`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  sandboxId: z.string(),
  command: z
    .string()
    .describe("Shell command to run (e.g. 'npm install', 'ls -la')"),
  timeoutMs: z
    .number()
    .optional()
    .describe("Timeout in milliseconds (default: 30000)"),
});

export const buildRunCommandTool: Tool<z.infer<typeof inputSchema>> = {
  name: "build_run_command",
  description:
    "Run an arbitrary shell command inside the sandbox. Use for npm install, running scripts, or inspecting build output.",
  category: "build",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, _ctx) {
    const { sandbox } = await import("~encore/clients");
    const timeout = input.timeoutMs ?? 30_000;
    const result = await sandbox.runCommand({
      sandboxId: input.sandboxId,
      command: input.command,
      timeout,
    });
    return {
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
    };
  },
};

// ai/tools/build/validate.ts
// Migrated from agent/agent-tool-executor.ts `build_validate`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  sandboxId: z.string(),
  incremental: z
    .boolean()
    .optional()
    .describe(
      "Run incremental validation (only changed files). Faster but less complete (default: false).",
    ),
});

export const buildValidateTool: Tool<z.infer<typeof inputSchema>> = {
  name: "build_validate",
  description:
    "Run the full validation pipeline in the sandbox: typecheck → lint → test → snapshot → performance. Returns pass/fail per step with error details.",
  category: "build",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, _ctx) {
    const { sandbox } = await import("~encore/clients");
    // validateIncremental requires a specific filePath — use the full pipeline here
    const result = await sandbox.validate({ sandboxId: input.sandboxId });
    return {
      success: true,
      data: {
        success: result.success,
        output: result.output,
        errors: result.errors,
      },
    };
  },
};

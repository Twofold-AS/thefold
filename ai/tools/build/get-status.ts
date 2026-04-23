// ai/tools/build/get-status.ts
// Migrated from agent/agent-tool-executor.ts `build_get_status`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  jobId: z.string().describe("Builder job ID from builder.start()"),
});

export const buildGetStatusTool: Tool<z.infer<typeof inputSchema>> = {
  name: "build_get_status",
  description:
    "Get the current status and logs of a builder job. Use to check on async build progress.",
  category: "build",
  inputSchema,

  surfaces: ["agent"],
  costHint: "low",

  async handler(input, _ctx) {
    const { builder } = await import("~encore/clients");
    const result = await builder.status({ jobId: input.jobId });
    return {
      success: true,
      data: {
        status: result.job.status,
        phase: result.job.currentPhase,
        filesBuilt: result.job.filesWritten,
        tokensUsed: result.job.totalTokensUsed,
        costUsd: result.job.totalCostUsd,
        steps: result.steps,
      },
    };
  },
};

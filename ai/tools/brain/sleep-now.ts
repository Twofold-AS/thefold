// ai/tools/brain/sleep-now.ts
// Commit 21 — sleep_now tool.
// Chat-only admin tool that triggers a knowledge maintenance pass on demand.
// Per §27.8 only the global "all" scope is supported.

import { z } from "zod";
import type { Tool } from "../types";
import { isAdmin } from "../../admin";

const inputSchema = z.object({
  scope: z
    .literal("all")
    .optional()
    .describe("Scope of the sleep cycle. Only 'all' is supported (global maintenance)."),
});

export const sleepNowTool: Tool<z.infer<typeof inputSchema>> = {
  name: "sleep_now",
  description:
    "Trigger a knowledge maintenance pass immediately (archive low-confidence rules, promote strong ones, merge near-duplicates). Admin only.",
  category: "brain",
  inputSchema,

  surfaces: ["chat"],
  costHint: "medium",
  maxCallsPerSession: 1,

  async handler(_input, ctx) {
    // Commit 30: swap hardcoded email gate for real role lookup via the
    // users service (cached 3 min per email by ai/admin.ts).
    if (!ctx.userEmail || !(await isAdmin(ctx.userEmail))) {
      return {
        success: false,
        message:
          "Kun administratorer kan trigge sleep manuelt. Be en admin om å kjøre /agent/sleep/run fra dashbordet.",
      };
    }

    const { agent } = await import("~encore/clients");

    // Estimate runtime — sleep cycle scans the knowledge table and runs four
    // sequential maintenance passes. Empirically ~2-5 minutes; report 5 as a
    // conservative upper bound for the UI.
    const estimatedMinutes = 5;

    // Fire-and-forget — the cycle can take minutes; we return immediately and
    // the caller can poll /agent/sleep/logs for completion.
    agent.runSleepCycle().catch((err) => {
      ctx.log.error("sleep_now: runSleepCycle failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return {
      success: true,
      message: `Sleep cycle started (estimated ~${estimatedMinutes} min). Check /tools/brain for progress.`,
      data: {
        status: "started",
        estimatedMinutes,
      },
      mutationCount: 1,
    };
  },
};

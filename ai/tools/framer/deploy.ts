// ai/tools/framer/deploy.ts
// Promotes a previously-published preview deployment to production.
// deploymentId comes from framer_publish. This is the "go live" step —
// only call after the user has approved the preview.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  deploymentId: z
    .string()
    .min(1)
    .describe("The deploymentId returned by framer_publish. Promotes that preview to production."),
});

export const framerDeployTool: Tool<z.infer<typeof inputSchema>> = {
  name: "framer_deploy",
  description:
    "Promote a previously-published Framer preview deployment to production. Requires the deploymentId from a prior framer_publish call. ONLY call this after the user has explicitly approved the preview — this makes the site live.",
  category: "framer",
  inputSchema,
  surfaces: ["agent"],
  costHint: "high",
  requiresApproval: true,

  async handler(input, ctx) {
    if (!ctx.projectId) {
      return {
        success: false,
        message: "framer_deploy requires an active projectId — the agent did not propagate one.",
      };
    }
    const { projects } = await import("~encore/clients");
    const result = await projects.framerDeploy({
      projectId: ctx.projectId,
      deploymentId: input.deploymentId,
    });
    return {
      success: true,
      message: `Production deployed: ${result.hostnames.join(", ")}`,
      data: { hostnames: result.hostnames },
    };
  },
};

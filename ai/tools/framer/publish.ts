// ai/tools/framer/publish.ts
// Publishes a preview deployment of the Framer project. Returns the
// deploymentId (needed to promote to prod via framer_deploy) and the
// preview hostnames so the agent can share them with the user.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({});

export const framerPublishTool: Tool<z.infer<typeof inputSchema>> = {
  name: "framer_publish",
  description:
    "Publish a preview deployment of the Framer project. Returns a deploymentId (for later framer_deploy to promote to production) and the preview hostname(s). Use after creating or updating components to give the user a shareable link.",
  category: "framer",
  inputSchema,
  surfaces: ["agent"],
  costHint: "medium",

  async handler(_input, ctx) {
    if (!ctx.projectId) {
      return {
        success: false,
        message: "framer_publish requires an active projectId — the agent did not propagate one.",
      };
    }
    const { projects } = await import("~encore/clients");
    const result = await projects.framerPublish({ projectId: ctx.projectId });
    return {
      success: true,
      message: `Preview deployed: ${result.hostnames.join(", ")}`,
      data: {
        deploymentId: result.deploymentId,
        hostnames: result.hostnames,
      },
    };
  },
};

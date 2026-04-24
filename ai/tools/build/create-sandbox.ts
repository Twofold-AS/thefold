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
    const { sandbox, projects } = await import("~encore/clients");
    let repoOwner = input.repoOwner || ctx.repoOwner || "";
    let repoName = input.repoName || ctx.repoName || "";
    const ref = input.branch || "main";

    // Lazy companion-repo creation: if we have a projectId but no target
    // repo yet, ask the projects service to ensure one exists. For framer/
    // figma projects this creates `framer-<slug>`; for code projects it
    // should already have been set at project-creation time.
    if (!repoName && ctx.projectId) {
      try {
        const ensured = await projects.ensureProjectRepo({ projectId: ctx.projectId });
        if (ensured.githubRepo) {
          const [owner, name] = ensured.githubRepo.split("/");
          if (owner && name) {
            repoOwner = owner;
            repoName = name;
            ctx.log.info("build_create_sandbox: ensured companion repo", {
              projectId: ctx.projectId,
              repo: ensured.githubRepo,
              created: ensured.created,
            });
          }
        }
      } catch (err) {
        return {
          success: false,
          message: `Could not ensure companion repo for project ${ctx.projectId}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    if (!repoName) {
      return {
        success: false,
        message: "build_create_sandbox requires repoName — provide it as input, set ctx.repoName, or supply a projectId that has (or can create) a companion repo.",
      };
    }

    const result = await sandbox.create({ repoOwner, repoName, ref });
    return {
      success: true,
      data: { sandboxId: result.id, repoOwner, repoName },
      mutationCount: 1,
    };
  },
};

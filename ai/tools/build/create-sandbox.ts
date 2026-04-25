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
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `Could not ensure companion repo for project ${ctx.projectId}: ${msg}`,
          bailOut: {
            reason: "repo_ensure_failed",
            userMessage:
              "Jeg klarte ikke å opprette eller finne et GitHub-repo for prosjektet. Sjekk at GitHub-tokenet er gyldig og har riktige tilganger.",
          },
        };
      }
    }

    if (!repoName) {
      return {
        success: false,
        message: "build_create_sandbox requires repoName — provide it as input, set ctx.repoName, or supply a projectId that has (or can create) a companion repo.",
        bailOut: {
          reason: "no_repo_name",
          userMessage:
            "Jeg kan ikke lage en sandbox uten et tilknyttet GitHub-repo. Knytt prosjektet til et repo først, eller kjør dette fra et eksisterende prosjekt.",
        },
      };
    }

    try {
      const result = await sandbox.create({ repoOwner, repoName, ref });
      return {
        success: true,
        data: { sandboxId: result.id, repoOwner, repoName },
        mutationCount: 1,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("build_create_sandbox failed", { repoOwner, repoName, ref, error: msg });

      const isAuth = /401|403|unauthori[sz]ed|forbidden|bad credentials|invalid.*token/i.test(msg);
      const isMissing = /404|not found|repository.*(not found|does not exist)/i.test(msg);

      if (isAuth) {
        return {
          success: false,
          message: `Sandbox-oppretting feilet: ${msg}`,
          bailOut: {
            reason: "github_auth_failed",
            userMessage:
              "GitHub-tokenet er ugyldig eller mangler tilgang til dette reposet. Verifiser tokenet i innstillingene.",
          },
        };
      }
      if (isMissing) {
        return {
          success: false,
          message: `Sandbox-oppretting feilet: ${msg}`,
          bailOut: {
            reason: "repo_not_found",
            userMessage: `Repo ${repoOwner}/${repoName} finnes ikke eller er ikke tilgjengelig. Sjekk navn og tilganger.`,
          },
        };
      }
      return { success: false, message: `Sandbox-oppretting feilet: ${msg}` };
    }
  },
};

// ai/tools/task/create-task.ts
// Migrated from ai/tools.ts `create_task` handler.

import { z } from "zod";
import log from "encore.dev/log";
import type { Tool } from "../types";

// Sanitize repo name — GitHub only allows alphanumeric, hyphens, underscores, dots
function sanitizeRepoName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[-_.]+/, "")
    .replace(/[-_.]+$/, "")
    .substring(0, 100);
}

const inputSchema = z.object({
  title: z
    .string()
    .min(1)
    .describe("Short task title — describe EVERYTHING the user asks for in one task"),
  description: z
    .string()
    .describe("Detailed description of what needs to be done. Include all steps."),
  priority: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional()
    .describe("1=Urgent, 2=High, 3=Normal, 4=Low"),
  repoName: z
    .string()
    .optional()
    .describe("Which repository the task applies to"),
});

/** Fire-and-forget: assess complexity and update task with enrichment data */
async function enrichTaskWithAI(
  taskId: string,
  title: string,
  description: string,
): Promise<void> {
  try {
    const { ai: aiClient, tasks: tasksClient } = await import("~encore/clients");
    const complexity = await aiClient.assessComplexity({
      taskDescription: title + "\n" + description,
      projectStructure: "",
      fileCount: 0,
    });
    await tasksClient.updateTask({
      id: taskId,
      estimatedComplexity: complexity.complexity,
      estimatedTokens: complexity.tokensUsed,
    });
  } catch (e) {
    log.error("enrichTaskWithAI failed:", {
      taskId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export const createTaskTool: Tool<z.infer<typeof inputSchema>> = {
  name: "create_task",
  description:
    "Create a new development task. Use when the user asks you to build, fix, change, or create something in the codebase.",
  category: "task",
  inputSchema,

  surfaces: ["chat"],
  costHint: "low",
  forbiddenWithActivePlan: true,

  async handler(input, ctx) {
    const { tasks: tasksClient, projects: projectsClient } = await import("~encore/clients");

    // Runde 5 — repo-spawning fix.
    //
    // Before: we used `input.repoName || ctx.repoName` and the AI guessed
    // a name from the task title (e.g. "yamaha"). Each fresh chat then
    // created a new GitHub repo with that name because nothing checked
    // the project's already-allocated companion repo.
    //
    // Now: if ctx.projectId is set, ask projects.ensureProjectRepo for
    // the canonical "owner/name" (idempotent — returns existing repo on
    // subsequent calls). The project's `github_repo` column is the
    // single source of truth; we never reinvent the name.
    let taskRepo: string | undefined;
    if (ctx.projectId) {
      try {
        const ensured = await projectsClient.ensureProjectRepo({ projectId: ctx.projectId });
        if (ensured.githubRepo) {
          // ensured.githubRepo is "owner/name" — store the name part on
          // the task. ctx.repoOwner stays consistent via ToolContext.
          const nameOnly = ensured.githubRepo.split("/")[1];
          if (nameOnly) taskRepo = nameOnly;
          ctx.log.info("create_task: resolved repo via ensureProjectRepo", {
            projectId: ctx.projectId,
            githubRepo: ensured.githubRepo,
            created: ensured.created,
          });
        }
      } catch (err) {
        ctx.log.warn("create_task: ensureProjectRepo failed (falling back to ctx.repoName)", {
          projectId: ctx.projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    // Fallback chain (unchanged behaviour for tasks WITHOUT projectId):
    // input.repoName → ctx.repoName → "repo X" pattern from title.
    if (!taskRepo) {
      taskRepo = sanitizeRepoName(input.repoName || ctx.repoName || "") || undefined;
    }
    if (!taskRepo) {
      const repoMatch = input.title.match(/repo\s+[""]?([A-Za-z0-9_-]+)[""]?/i);
      if (repoMatch) taskRepo = repoMatch[1];
    }

    // Duplicate check
    try {
      const existing = await tasksClient.listTasks({ repo: taskRepo, limit: 20 });
      const title = input.title.toLowerCase();
      const duplicate = existing.tasks.find(
        (t: { title: string; status: string; repo?: string | null }) => {
          if (["deleted", "done", "blocked", "failed"].includes(t.status)) return false;
          const existingTitle = t.title.toLowerCase();
          const titleMatch =
            existingTitle === title ||
            existingTitle.includes(title.substring(0, 30)) ||
            title.includes(existingTitle.substring(0, 30));
          const repoMatch2 = !taskRepo || !t.repo || t.repo === taskRepo;
          return titleMatch && repoMatch2;
        },
      );
      if (duplicate) {
        return {
          success: false,
          taskId: duplicate.id,
          message: `Oppgave "${input.title}" finnes allerede (ID: ${duplicate.id})`,
        };
      }
    } catch {
      // non-critical — proceed with creation
    }

    // Resolve task scope from projectType for the tasks-tab filter (Runde 6).
    const taskScope: "cowork" | "designer" | undefined =
      ctx.projectType === "framer" || ctx.projectType === "figma" || ctx.projectType === "framer_figma"
        ? "designer"
        : ctx.projectType === "code"
          ? "cowork"
          : undefined;

    const result = await tasksClient.createTask({
      title: input.title,
      description: input.description || "",
      priority: input.priority || 3,
      repo: taskRepo,
      source: "chat",
      // Runde 5 — link task to project so agent.startTask can re-resolve
      // the canonical github_repo via tasks.getTaskInternal.
      projectId: ctx.projectId,
      // Runde 6 — propagate scope so the task lands in the right fane-tab.
      taskScope,
    });

    // Fire-and-forget enrichment
    enrichTaskWithAI(result.task.id, input.title, input.description || "").catch((e) =>
      ctx.log.error("Task enrichment failed:", {
        error: e instanceof Error ? e.message : String(e),
      }),
    );

    return {
      success: true,
      taskId: result.task.id,
      message: `Oppgave opprettet: "${input.title}". Kaller start_task nå.`,
    };
  },
};

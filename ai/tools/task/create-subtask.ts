// ai/tools/task/create-subtask.ts
// Hierarkisk task-dekomponering: modellen kan kalle dette under planlegging
// for å bryte en master-task ned i faser/sub-tasks. Master-task-iteratoren
// i agent-servicen leser sub-tasks via tasks.listSubTasks ved `start_task`
// og eksekverer dem sekvensielt (sorted: phase → createdAt), respekterer
// depends_on.
//
// Surfaces: chat + agent. I chat: modellen planlegger og legger ut sub-
// tasks før start_task. I agent: master-tasken kan opprette ekstra sub-
// tasks midt i kjøringen hvis planen endres.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  parentId: z
    .string()
    .describe("UUID of the master task. Required — sub-tasks must belong to a parent."),
  title: z
    .string()
    .min(1)
    .describe("Short title for this phase/sub-task (e.g. 'Phase 0: read hero.png'). Keep <80 chars."),
  description: z
    .string()
    .optional()
    .describe("Detailed description of what to do in this sub-task. Include concrete acceptance criteria."),
  phase: z
    .string()
    .optional()
    .describe(
      "Phase label — free-form but conventionally: '0-read', '1-scaffold', '2-implement', '3-test'. " +
      "Iterator sorts sub-tasks by phase first, then by creation order within a phase.",
    ),
  targetFiles: z
    .array(z.string())
    .optional()
    .describe("Files this sub-task will read or modify. Lets context-builder pre-fetch them."),
  needsVision: z
    .boolean()
    .optional()
    .describe("Set true if this sub-task requires a vision-capable model (e.g. reading screenshots)."),
  dependsOn: z
    .array(z.string())
    .optional()
    .describe("UUIDs of other sub-tasks (same parent) that must complete before this one starts."),
  priority: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional()
    .describe("1=Urgent, 2=High, 3=Normal, 4=Low. Defaults to 3."),
});

export const createSubtaskTool: Tool<z.infer<typeof inputSchema>> = {
  name: "create_subtask",
  description:
    "Break a master task into smaller phases. Call this during planning for tasks of complexity >= 4, " +
    "BEFORE calling start_task on the master. Phase 0 should typically be 'read relevant files / look at " +
    "screenshots'. Each phase should target 1-3 files with a single clear goal. Phases run sequentially; " +
    "if a phase fails, the master enters waiting_user-mode and asks you for input.",
  category: "task",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",
  forbiddenWithActivePlan: true,

  async handler(input, ctx) {
    const { tasks: tasksClient } = await import("~encore/clients");

    // Resolve the master task's repo so sub-task inherits the same target.
    let inheritedRepo: string | undefined;
    try {
      const parentRes = await tasksClient.getTaskInternal({ id: input.parentId });
      inheritedRepo = parentRes.task?.repo ?? undefined;
    } catch (err) {
      ctx.log.warn("create_subtask: could not fetch parent repo (continuing)", {
        parentId: input.parentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const result = await tasksClient.createSubTask({
        parentId: input.parentId,
        title: input.title,
        description: input.description ?? "",
        repo: inheritedRepo,
        priority: input.priority ?? 3,
        source: "chat",
        phase: input.phase,
        dependsOn: input.dependsOn,
        targetFiles: input.targetFiles,
        needsVision: input.needsVision,
      });
      return {
        success: true,
        taskId: result.task.id,
        data: {
          id: result.task.id,
          title: result.task.title,
          phase: result.task.phase ?? null,
          parentId: input.parentId,
        },
        message: `Sub-task "${input.title}" opprettet${input.phase ? ` (phase: ${input.phase})` : ""}.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("create_subtask failed", { parentId: input.parentId, title: input.title, error: msg });
      return {
        success: false,
        message: `Kunne ikke opprette sub-task: ${msg}`,
      };
    }
  },
};

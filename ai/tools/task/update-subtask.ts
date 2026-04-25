// ai/tools/task/update-subtask.ts
// Runde 3-C — partial-update av en sub-task. Brukes typisk under plan-
// preview når brukeren ber agenten justere en plan ("flytt phase 3 til
// phase 4", "endre title på phase 0", osv).

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  id: z.string().describe("Sub-task UUID"),
  title: z.string().optional().describe("Ny title"),
  description: z.string().optional().describe("Ny description"),
  phase: z.string().optional().describe("Nytt phase-label (e.g. 'phase-2')"),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  targetFiles: z.array(z.string()).optional().describe("Erstatt target-files-lista"),
  dependsOn: z.array(z.string()).optional().describe("Erstatt depends-on-lista"),
});

export const updateSubtaskTool: Tool<z.infer<typeof inputSchema>> = {
  name: "update_subtask",
  description:
    "Update fields on an existing sub-task (used during plan-revision). Pass only the fields to change.",
  category: "task",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { tasks: tasksClient } = await import("~encore/clients");
    try {
      // Sub-task labels store target-files as `target:<path>` prefix —
      // rebuild the labels array if targetFiles is supplied.
      let newLabels: string[] | undefined;
      if (input.targetFiles) {
        // Pull existing labels to preserve non-target entries.
        const existing = await tasksClient.getTaskInternal({ id: input.id });
        const otherLabels = (existing.task?.labels ?? []).filter(
          (l) => !l.startsWith("target:"),
        );
        newLabels = [...otherLabels, ...input.targetFiles.map((f) => `target:${f}`)];
      }

      const result = await tasksClient.updateTask({
        id: input.id,
        title: input.title,
        description: input.description,
        phase: input.phase,
        priority: input.priority,
        labels: newLabels,
        dependsOn: input.dependsOn,
      });
      return {
        success: true,
        message: `Sub-task ${input.id.slice(0, 8)} oppdatert.`,
        data: { id: result.task.id, title: result.task.title, phase: result.task.phase },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("update_subtask failed", { id: input.id, error: msg });
      return { success: false, message: `Kunne ikke oppdatere sub-task: ${msg}` };
    }
  },
};

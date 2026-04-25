// ai/tools/task/delete-subtask.ts
// Runde 3-C — fjern en sub-task. Hvis sub-tasken er done markeres den
// som "skipped" i description for synlighet, men selve raden flagges
// fortsatt som deleted (rootOnly + sub-task-list filtrerer den vekk).

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  id: z.string().describe("Sub-task UUID to remove"),
});

export const deleteSubtaskTool: Tool<z.infer<typeof inputSchema>> = {
  name: "delete_subtask",
  description:
    "Remove a sub-task from the plan. Use when the user asks to drop a phase. Done sub-tasks are marked skipped instead of deleted.",
  category: "task",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { tasks: tasksClient } = await import("~encore/clients");
    try {
      // Look up status — if already done, leave a "skipped"-marker in
      // description so the audit trail stays intact.
      const existing = await tasksClient.getTaskInternal({ id: input.id });
      if (existing.task?.status === "done") {
        await tasksClient.updateTask({
          id: input.id,
          description: `[skipped under plan-revision] ${existing.task.description ?? ""}`.slice(
            0,
            5000,
          ),
        });
        return {
          success: true,
          message: `Sub-task ${input.id.slice(0, 8)} var ferdig — markert som skipped.`,
        };
      }

      await tasksClient.deleteTask({ id: input.id });
      return {
        success: true,
        message: `Sub-task ${input.id.slice(0, 8)} fjernet.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("delete_subtask failed", { id: input.id, error: msg });
      return { success: false, message: `Kunne ikke fjerne sub-task: ${msg}` };
    }
  },
};

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  targetProjectId: z.string().uuid().describe("UUID of the destination project (call list_projects to look up)"),
});

export const transferConversationTool: Tool<z.infer<typeof inputSchema>> = {
  name: "transfer_conversation",
  description:
    "Move the current conversation into a specific project. Preserves all messages. Use when the user says 'lagre samtalen i <prosjekt>', 'flytt til <prosjekt>', or 'overfør denne samtalen'. After transfer the conversation's project_id + scope are updated and any uploaded files in this chat are linked to the project too.",
  category: "project",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",
  maxCallsPerSession: 3,

  async handler(input, ctx) {
    if (!ctx.conversationId) {
      return { success: false, message: "Ingen aktiv samtale å overføre." };
    }

    const { chat } = await import("~encore/clients");
    try {
      const res = await (chat as unknown as {
        transferConversation: (r: { conversationId: string; targetProjectId: string }) => Promise<{
          success: boolean; projectName: string; projectScope: "cowork" | "designer";
        }>;
      }).transferConversation({
        conversationId: ctx.conversationId,
        targetProjectId: input.targetProjectId,
      });

      return {
        success: true,
        message: `Samtalen er nå lagret i ${res.projectName} (${res.projectScope}).`,
        data: {
          projectId: input.targetProjectId,
          projectName: res.projectName,
          projectScope: res.projectScope,
          path: res.projectScope === "designer" ? `/designer?project=${input.targetProjectId}` : `/cowork?project=${input.targetProjectId}`,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("transfer_conversation failed", { conversationId: ctx.conversationId, targetProjectId: input.targetProjectId, error: msg });
      return { success: false, message: `Kunne ikke overføre: ${msg}` };
    }
  },
};

// ai/tools/memory/forget.ts
// Commit 22 — forget_memory tool.
// Chat-only wrapper around memory.deleteMemory. Lets the user ask the AI to
// drop a remembered entry by ID. MVP assumption: the user has confirmed the
// deletion in natural-language dialogue before the AI calls this — there is
// no separate UI confirmation step yet.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  id: z.string().min(8).describe("UUID of the memory entry to delete"),
  reason: z
    .string()
    .min(3)
    .describe("Why the user wants this forgotten — kept in audit log"),
});

export const forgetMemoryTool: Tool<z.infer<typeof inputSchema>> = {
  name: "forget_memory",
  description:
    "Delete a memory entry by ID. Call only when the user has explicitly asked to forget a specific memory — confirm in natural dialogue first. The deletion is permanent.",
  category: "memory",
  inputSchema,

  surfaces: ["chat"],
  costHint: "low",
  maxCallsPerSession: 5,

  async handler(input, ctx) {
    const { memory } = await import("~encore/clients");

    ctx.log.info("forget_memory: user requested deletion", {
      memoryId: input.id,
      reason: input.reason,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
    });

    try {
      await memory.deleteMemory({ id: input.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Most likely: not found (404). Surface the error so the AI can tell
      // the user the ID was wrong instead of silently claiming success.
      return {
        success: false,
        message: `Could not delete memory ${input.id}: ${msg}`,
      };
    }

    return {
      success: true,
      message: `Memory ${input.id} deleted.`,
      data: { deleted: true, id: input.id },
      mutationCount: 1,
    };
  },
};

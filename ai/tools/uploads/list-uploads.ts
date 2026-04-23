// ai/tools/uploads/list-uploads.ts
// Lists recent file-uploads for the current conversation so the AI knows
// which uploadIds to pass to `read_uploaded_content`.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  projectId: z.string().uuid().optional()
    .describe("List uploads across all conversations in this project (default: current conversation only)"),
  includeSuperseded: z.boolean().optional()
    .describe("Include older versions that have been superseded by newer uploads of the same filename (default false)"),
  limit: z.number().int().positive().optional()
    .describe("Max uploads (default 20, hard cap 100)"),
});

export const listUploadsTool: Tool<z.infer<typeof inputSchema>> = {
  name: "list_uploads",
  description:
    "List file uploads for the current conversation or entire project. Returns {uploadId, filename, version, isLatest, fileCount, createdAt}. Pass projectId to search across all conversations in the project. Pass includeSuperseded: true to see old versions. Use before read_uploaded_content or diff_uploads.",
  category: "uploads",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",
  maxCallsPerSession: 10,

  async handler(input, ctx) {
    if (!input.projectId && !ctx.conversationId) {
      return { success: false, message: "No active conversation and no projectId — cannot list uploads." };
    }

    const { chat } = await import("~encore/clients");
    try {
      const result = await (chat as unknown as {
        listUploadsByConversation: (r: {
          conversationId?: string; projectId?: string;
          includeSuperseded?: boolean; limit?: number;
        }) => Promise<{
          uploads: Array<{
            uploadId: string; filename: string; uploadType: string;
            fileCount: number; totalBytes: number; version: number; isLatest: boolean;
            conversationId: string; projectId: string | null; createdAt: string;
          }>;
        }>;
      }).listUploadsByConversation({
        conversationId: input.projectId ? undefined : ctx.conversationId,
        projectId: input.projectId,
        includeSuperseded: input.includeSuperseded,
        limit: input.limit,
      });
      return {
        success: true,
        message: `Found ${result.uploads.length} upload(s)`,
        data: { uploads: result.uploads },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("list_uploads failed", { conversationId: ctx.conversationId, projectId: input.projectId, error: msg });
      return { success: false, message: `Kunne ikke liste uploads: ${msg}` };
    }
  },
};

// ai/tools/framer/set-file-content.ts
// Overwrites the full source of an existing Framer code file. Obtain the
// fileId from framer_list_code_files or from a prior framer_create_code_file
// call in this conversation.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  fileId: z
    .string()
    .min(1)
    .describe("ID of the code file to update. Returned by framer_create_code_file or framer_list_code_files."),
  content: z
    .string()
    .describe("Full replacement source code (TSX). This overwrites the entire file — do not send a diff."),
});

export const framerSetFileContentTool: Tool<z.infer<typeof inputSchema>> = {
  name: "framer_set_file_content",
  description:
    "Overwrite the content of an existing Framer code file. Requires the fileId (from framer_list_code_files or framer_create_code_file). This replaces the entire file contents.",
  category: "framer",
  inputSchema,
  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, ctx) {
    if (!ctx.projectId) {
      return {
        success: false,
        message: "framer_set_file_content requires an active projectId — the agent did not propagate one.",
      };
    }
    const { projects } = await import("~encore/clients");
    await projects.framerSetCodeFileContent({
      projectId: ctx.projectId,
      fileId: input.fileId,
      content: input.content,
    });
    return {
      success: true,
      message: `Updated Framer code file ${input.fileId} (${input.content.length} chars)`,
      data: { fileId: input.fileId, size: input.content.length },
    };
  },
};

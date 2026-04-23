// ai/tools/uploads/read-uploaded-content.ts
// Lets the AI read content from a .zip the user uploaded via chat.
// Pair with list_uploads to discover what is available.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  uploadId: z
    .string()
    .uuid()
    .describe("UUID of the upload (from list_uploads or the most recent zip the user sent)"),
  categoryFilter: z
    .enum(["html", "css", "js", "jsx", "tsx", "md", "json", "image", "text", "other"])
    .optional()
    .describe("Only return files of this category (e.g. 'html' for design markup)"),
  maxCharsPerFile: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max characters per text file (default 20000 — trim longer content)"),
  maxFiles: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max files returned (default 50, hard cap 200)"),
});

export const readUploadedContentTool: Tool<z.infer<typeof inputSchema>> = {
  name: "read_uploaded_content",
  description:
    "Read the extracted contents of a .zip file the user uploaded. Use this after the user uploads a design bundle, code samples, or documentation zip. Returns categorized files (HTML/CSS/JS/MD/JSON/images). Text files come as `content`, binary files as truncated base64.",
  category: "uploads",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",
  maxCallsPerSession: 10,

  async handler(input, ctx) {
    const { chat } = await import("~encore/clients");

    try {
      const result = await (chat as unknown as {
        getUploadedContent: (r: {
          uploadId: string;
          categoryFilter?: string;
          maxCharsPerFile?: number;
          maxFiles?: number;
        }) => Promise<{
          uploadId: string;
          filename: string;
          filesExtracted: number;
          byCategory: Record<string, number>;
          files: Array<{
            path: string;
            category: string;
            contentType: string;
            sizeBytes: number;
            content?: string;
            base64?: string;
            truncated?: boolean;
          }>;
        }>;
      }).getUploadedContent({
        uploadId: input.uploadId,
        categoryFilter: input.categoryFilter,
        maxCharsPerFile: input.maxCharsPerFile,
        maxFiles: input.maxFiles,
      });

      return {
        success: true,
        message: `Read ${result.filesExtracted} files from ${result.filename}`,
        data: {
          uploadId: result.uploadId,
          filename: result.filename,
          filesExtracted: result.filesExtracted,
          byCategory: result.byCategory,
          files: result.files,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("read_uploaded_content failed", { uploadId: input.uploadId, error: msg });
      return {
        success: false,
        message: `Kunne ikke lese upload ${input.uploadId}: ${msg}`,
      };
    }
  },
};

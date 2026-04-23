// ai/tools/code/read-file.ts
// Migrated from ai/tools.ts `read_file` handler.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  repoName: z.string(),
  path: z.string().describe("File path in the repository"),
});

export const readFileTool: Tool<z.infer<typeof inputSchema>> = {
  name: "read_file",
  description:
    "Read a specific file from the repository. Use when the user asks to look at a file, or when you need more context.",
  category: "code",
  inputSchema,

  surfaces: ["chat"],
  costHint: "low",

  async handler(input, ctx) {
    const { github: ghClient } = await import("~encore/clients");
    const owner = ctx.repoOwner || "";
    try {
      const file = await ghClient.getFile({
        owner,
        repo: input.repoName || ctx.repoName || "",
        path: input.path,
      });
      return {
        success: true,
        data: {
          path: input.path,
          content: file.content?.substring(0, 5000),
        },
      };
    } catch {
      return { success: false, message: `Kunne ikke lese ${input.path}` };
    }
  },
};

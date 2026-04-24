// ai/tools/framer/list-code-files.ts
// Lists code files in the active Framer project. Use to discover existing
// components before modifying or creating new ones.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({});

export const framerListCodeFilesTool: Tool<z.infer<typeof inputSchema>> = {
  name: "framer_list_code_files",
  description:
    "List all code files in the active Framer project. Returns id, name, path, and size for each file. Use this to discover existing components before creating duplicates or updating content.",
  category: "framer",
  inputSchema,
  surfaces: ["agent"],
  costHint: "low",

  async handler(_input, ctx) {
    if (!ctx.projectId) {
      return {
        success: false,
        message: "framer_list_code_files requires an active projectId — the agent did not propagate one.",
      };
    }
    const { projects } = await import("~encore/clients");
    const result = await projects.framerListCodeFiles({ projectId: ctx.projectId });
    return {
      success: true,
      message: `Found ${result.files.length} Framer code file(s)`,
      data: { files: result.files, count: result.files.length },
    };
  },
};

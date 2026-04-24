// ai/tools/framer/create-code-file.ts
// Creates a new Framer code file (React component/override/etc.) in the
// active Framer project. Requires ctx.projectId + project.project_type in
// {framer, framer_figma}. Routes through projects/framer-sdk.ts which
// resolves auth from project_api_keys['framer'] with global FramerApiKey
// fallback.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("Name of the code file. Convention: PascalCase matching the component (e.g. `HeroSection`)."),
  content: z
    .string()
    .describe("Full source code of the component as a TypeScript/TSX string. Default export is the rendered component."),
  editViaPlugin: z
    .boolean()
    .optional()
    .describe("When true, Framer's 'Edit Code' UI opens the plugin that created the file. Default: false."),
});

export const framerCreateCodeFileTool: Tool<z.infer<typeof inputSchema>> = {
  name: "framer_create_code_file",
  description:
    "Create a new code file (React/TSX component) in the active Framer project. Use this instead of repo_write_file when the project is of type framer or framer_figma. The component becomes immediately available in the Framer canvas.",
  category: "framer",
  inputSchema,
  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, ctx) {
    if (!ctx.projectId) {
      return {
        success: false,
        message: "framer_create_code_file requires an active projectId — the agent did not propagate one.",
      };
    }
    const { projects } = await import("~encore/clients");
    const result = await projects.framerCreateCodeFile({
      projectId: ctx.projectId,
      name: input.name,
      content: input.content,
      editViaPlugin: input.editViaPlugin,
    });
    return {
      success: true,
      message: `Created Framer code file "${result.file.name}" (id: ${result.file.id})`,
      data: {
        fileId: result.file.id,
        name: result.file.name,
        path: result.file.path,
      },
    };
  },
};

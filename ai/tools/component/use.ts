// ai/tools/component/use.ts
// Commit 18 — use_component tool.
// Agent-only wrapper around registry.useComponentWithVars. Accepts the
// component name for ergonomic AI use; resolves to ID via registry.search
// before calling the variables-aware endpoint.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("Component name as listed in the registry"),
  vars: z
    .record(z.string())
    .optional()
    .describe("Variable substitutions (replaces {{KEY}} in files and paths)"),
});

export const useComponentTool: Tool<z.infer<typeof inputSchema>> = {
  name: "use_component",
  description:
    "Materialise a component from the registry into concrete files with variable substitution. Call after find_component has identified a good match.",
  category: "component",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",

  async handler(input, ctx) {
    const { registry } = await import("~encore/clients");

    // Resolve name → id via search (exact-name match preferred, falls back to
    // first result). Component names are effectively unique within the registry.
    const searchResult = await registry.search({
      query: input.name,
      limit: 5,
    });

    const exact = searchResult.components.find(
      (c: { name: string }) => c.name.toLowerCase() === input.name.toLowerCase(),
    );
    const component = exact ?? searchResult.components[0];

    if (!component) {
      return {
        success: false,
        message: `No component matches name "${input.name}"`,
      };
    }

    const useResult = await registry.useComponentWithVars({
      componentId: (component as { id: string }).id,
      targetRepo: ctx.repoName || undefined,
      variables: input.vars,
    });

    // Concatenate file content as a preview for the AI — keep it bounded so
    // large scaffolds don't blow the context window.
    const MAX_PREVIEW_CHARS = 8_000;
    let preview = "";
    for (const f of useResult.files) {
      const block = `// ${f.path}\n${f.content}\n\n`;
      if (preview.length + block.length > MAX_PREVIEW_CHARS) {
        preview += `// ...additional ${useResult.files.length - useResult.files.indexOf(f)} files truncated\n`;
        break;
      }
      preview += block;
    }

    return {
      success: true,
      data: {
        componentId: (component as { id: string }).id,
        componentName: (component as { name: string }).name,
        componentCode: preview,
        filesGenerated: useResult.files.map((f) => f.path),
        fileCount: useResult.files.length,
      },
      mutationCount: useResult.files.length,
    };
  },
};

// ai/tools/component/find.ts
// Commit 17 — find_component tool.
// Wrapper around registry.search + registry.findForTask. If taskDescription is
// supplied, prefers the task-aware endpoint (keyword + tag matching); else
// falls back to the general search.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Name or keyword to match. Leave blank when taskDescription is provided."),
  category: z
    .string()
    .optional()
    .describe("Filter to one category (auth, api, ui, database, payment, form, ...)"),
  taskDescription: z
    .string()
    .optional()
    .describe("Free-text description of the task — triggers AI-assisted matching"),
  limit: z
    .number()
    .optional()
    .describe("Max results (default: 5)"),
});

interface ComponentSummary {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  timesUsed: number;
  version?: string;
}

export const findComponentTool: Tool<z.infer<typeof inputSchema>> = {
  name: "find_component",
  description:
    "Search the component registry for reusable scaffolds (auth flows, forms, API shells, UI widgets). Pass a query for direct matching, or a taskDescription to let the registry's AI-assisted matcher rank candidates for the task.",
  category: "component",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",

  async handler(input, ctx) {
    const { registry } = await import("~encore/clients");
    const limit = input.limit ?? 5;

    let components: Array<Record<string, unknown>> = [];

    if (input.taskDescription && input.taskDescription.trim().length > 0) {
      const result = await registry.findForTask({
        taskDescription: input.taskDescription,
        repo: ctx.repoName || undefined,
        limit,
      });
      components = result.components as unknown as Array<Record<string, unknown>>;
    } else if (input.query && input.query.trim().length > 0) {
      const result = await registry.search({
        query: input.query,
        category: input.category,
        limit,
      });
      components = result.components as unknown as Array<Record<string, unknown>>;
    } else {
      return {
        success: false,
        message: "Provide either query or taskDescription",
      };
    }

    const summaries: ComponentSummary[] = components.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      description: c.description as string | undefined,
      category: c.category as string,
      tags: (c.tags as string[]) ?? [],
      timesUsed: (c.timesUsed as number) ?? 0,
      version: c.version as string | undefined,
    }));

    return {
      success: true,
      data: {
        components: summaries,
        count: summaries.length,
      },
    };
  },
};

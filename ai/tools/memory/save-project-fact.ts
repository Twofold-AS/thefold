// ai/tools/memory/save-project-fact.ts
//
// Sprint A — Persister stabile prosjekt-fakta (brand color, font, layout-
// pattern, design token, convention) som permanence='project_fact' memories.
// Future tasks for samme prosjekt henter disse via context-builder uten
// å re-discover.
//
// Dedup-strategi (Fix 3):
//   1. Søk etter eksisterende fact med tag `key:<input.key>` for samme
//      project_id og permanence='project_fact'.
//   2. Match found + value identisk → no-op.
//   3. Match found + value endret → update eksisterende (memory.update).
//   4. No match → insert nytt.
//
// Namespace-konvensjon (matcher .archive/design/DESIGN.md-formatet):
//   - colors.<name>      (e.g. colors.surface-container-low)
//   - typography.<name>  (e.g. typography.display-lg)
//   - rounded.<name>
//   - spacing.<name>
//   - components.<name>
//   - decisions          (free-form text in value)

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  namespace: z
    .enum(["colors", "typography", "rounded", "spacing", "components", "decisions", "external_source"])
    .describe(
      "Top-level category for this fact. Use 'colors' for brand/surface/accent colors, " +
      "'typography' for fonts (nested object: fontFamily/fontSize/fontWeight/lineHeight), " +
      "'rounded'/'spacing' for layout tokens, 'components' for component-level tokens with " +
      "references to base tokens, 'decisions' for free-form architectural decisions, " +
      "'external_source' for scraped/imported references.",
    ),
  key: z
    .string()
    .min(1)
    .describe(
      "Unique key within namespace. Conventions follow Material 3 / W3C Design Tokens: " +
      "kebab-case for color/typography/spacing keys (e.g. 'surface-container-low', " +
      "'display-lg'). For decisions, use a short slug (e.g. 'use-css-modules').",
    ),
  value: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .describe(
      "The fact value. String for simple cases ('#003399', '24px', 'Inter'). " +
      "Object for nested tokens (typography: { fontFamily: 'Inter', fontSize: '16px', ... })." +
      "For decisions, free-form prose.",
    ),
  evidence: z
    .string()
    .optional()
    .describe("Optional: where this fact was discovered (URL, file path, scrape source). Stored for audit-trail."),
  references: z
    .array(z.string())
    .optional()
    .describe(
      "Optional: template-references to other tokens this depends on " +
      "(e.g. for components.button-primary: ['{colors.primary}', '{rounded.xl}']).",
    ),
});

export const saveProjectFactTool: Tool<z.infer<typeof inputSchema>> = {
  name: "save_project_fact",
  description:
    "Persist a stable project fact (design token, brand color, font, layout pattern, " +
    "convention, architectural decision) so future tasks for the same project can use it " +
    "without re-discovering. Call this during Phase 0 / discovery when you encounter " +
    "facts that won't change between tasks. Do NOT call this for transient task outputs " +
    "(e.g. 'I edited file X'). Idempotent — calling with same key + value is a no-op.",
  category: "memory",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",

  async handler(input, ctx) {
    if (!ctx.projectId) {
      return {
        success: false,
        message: "save_project_fact requires an active project context (ctx.projectId).",
      };
    }

    const { memory: memoryClient } = await import("~encore/clients");

    // Serialize value (string passes through, object → JSON for storage).
    const valueStr =
      typeof input.value === "string" ? input.value : JSON.stringify(input.value);
    const fullKey = `${input.namespace}.${input.key}`;
    const newContent =
      `${fullKey}: ${valueStr}` +
      (input.evidence ? ` (${input.evidence})` : "") +
      (input.references && input.references.length > 0
        ? ` [refs: ${input.references.join(", ")}]`
        : "");

    // Fix 3 — Similarity-dedup. Tag-based exact-match lookup.
    try {
      const existing = await memoryClient.search({
        projectId: ctx.projectId,
        permanence: "project_fact",
        tags: [`key:${fullKey}`],
        limit: 1,
      });

      const exactMatch = existing.results?.[0];

      if (exactMatch) {
        // Compare value-portion (strip evidence + refs for canonical comparison).
        const existingValuePortion = exactMatch.content
          .slice(fullKey.length + 2)
          .split(" (")[0]
          .split(" [refs:")[0]
          .trim();
        if (existingValuePortion === valueStr) {
          ctx.log.info("save_project_fact: no-op (identical value)", {
            namespace: input.namespace,
            key: input.key,
          });
          return {
            success: true,
            message: `Already known: ${fullKey}`,
            data: { id: exactMatch.id, action: "noop", key: fullKey },
          };
        }

        // Value changed → UPDATE existing
        await memoryClient.update({
          id: exactMatch.id,
          content: newContent,
        });
        ctx.log.info("save_project_fact: updated existing fact", {
          namespace: input.namespace,
          key: input.key,
          oldValue: existingValuePortion.substring(0, 80),
          newValue: valueStr.substring(0, 80),
        });
        return {
          success: true,
          message: `Updated: ${fullKey}`,
          data: { id: exactMatch.id, action: "update", key: fullKey },
        };
      }

      // No match — INSERT new
      const result = await memoryClient.store({
        content: newContent,
        category: input.namespace,
        memoryType: "decision",
        projectId: ctx.projectId,
        sourceRepo: ctx.repoName,
        tags: [
          "project_fact",
          `namespace:${input.namespace}`,
          `key:${fullKey}`,
          ...(input.evidence ? [`evidence:${input.evidence.substring(0, 80)}`] : []),
        ],
        permanence: "project_fact",
        pinned: true,
        trustLevel: "agent",
        ttlDays: 0, // never decay; permanence-immune anyway, but explicit
      });

      ctx.log.info("save_project_fact: inserted new fact", {
        namespace: input.namespace,
        key: input.key,
        valuePreview: valueStr.substring(0, 80),
      });

      return {
        success: true,
        message: `Saved: ${fullKey}`,
        data: { id: result.id, action: "insert", key: fullKey },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("save_project_fact failed", { key: fullKey, error: msg });
      return {
        success: false,
        message: `Could not save project fact: ${msg}`,
      };
    }
  },
};

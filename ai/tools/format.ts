// ai/tools/format.ts
// Zod → JSONSchema converters for Anthropic and OpenAI tool formats.
//
// Target matters: OpenAPI 3.0 encodes `.positive()` as
// `{minimum: 0, exclusiveMinimum: true}` (boolean). Fireworks (and strict
// OpenAI-compat validators) expect JSON Schema draft 7 where
// `exclusiveMinimum` is a NUMBER. Using the wrong target causes:
//   "Error validating JSON Schema: <SchemaError: \"True is not of type 'number'\">"
//
// Anthropic accepts both formats, but we standardise on draft 7 for both
// providers so tool schemas are identical.

import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Anthropic vil ha en input_schema-objekt. JSON Schema draft 7, inline.
 *  `$refStrategy: "none"` unngår `$ref`/`definitions`-wrapper som ikke
 *  aksepteres som function-parameters. */
export function zodToAnthropicSchema(schema: z.ZodType<unknown>): object {
  return zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" });
}

/** OpenAI-compat (OpenAI, Fireworks, MiniMax, Moonshot, OpenRouter) bruker
 *  draft 7 — `exclusiveMinimum` som nummer, ikke boolean. Inline uten $ref. */
export function zodToOpenAISchema(schema: z.ZodType<unknown>): object {
  return zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" });
}

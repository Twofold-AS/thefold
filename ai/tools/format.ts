// ai/tools/format.ts
// Zod → JSONSchema converters for Anthropic and OpenAI tool formats.

import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Anthropic vil ha en input_schema-objekt. OpenAPI 3.0-kompatibelt. */
export function zodToAnthropicSchema(schema: z.ZodType<unknown>): object {
  return zodToJsonSchema(schema, { target: "openApi3" });
}

/** OpenAI bruker "parameters" — samme format. */
export function zodToOpenAISchema(schema: z.ZodType<unknown>): object {
  return zodToJsonSchema(schema, { target: "openApi3" });
}

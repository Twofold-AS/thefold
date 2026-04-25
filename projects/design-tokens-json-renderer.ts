// projects/design-tokens-json-renderer.ts
//
// Sprint B — design_tokens.json i W3C Design Tokens Community Group-format.
// Mirror av design.md sin frontmatter, men i strukturert JSON for
// design-tools (Figma-plugins, Tailwind-konfig-generatorer, osv).
//
// Format:
//   {
//     "colors": {
//       "primary": { "$type": "color", "$value": { "hex": "#003399", "components": [0.0, 0.2, 0.6], "colorSpace": "srgb" } }
//     },
//     "typography": {
//       "display-lg": { "$type": "typography", "$value": { "fontFamily": "Inter", "fontSize": "84px", "fontWeight": "700" } }
//     }
//   }

import type { ParsedFact } from "./design-md-renderer";

interface RenderTokensInput {
  projectName: string;
  facts: ParsedFact[];
}

export function renderDesignTokensJson(input: RenderTokensInput): string {
  const root: Record<string, unknown> = {
    name: { $type: "string", $value: input.projectName },
  };

  for (const f of input.facts) {
    if (!root[f.namespace]) root[f.namespace] = {};
    const namespaceObj = root[f.namespace] as Record<string, unknown>;
    namespaceObj[f.key] = serializeFactToToken(f);
  }

  return JSON.stringify(root, null, 2);
}

function serializeFactToToken(f: ParsedFact): { $type: string; $value: unknown } {
  const tokenType = inferTokenType(f.namespace, f.value);

  if (f.namespace === "colors" && typeof f.value === "string") {
    return {
      $type: "color",
      $value: {
        colorSpace: "srgb",
        components: hexToRgbComponents(f.value),
        hex: f.value,
      },
    };
  }

  // Typography: nested object preserves structure
  if (f.namespace === "typography" && typeof f.value === "object") {
    return { $type: "typography", $value: f.value };
  }

  // Components: nested object med template-refs
  if (f.namespace === "components" && typeof f.value === "object") {
    return { $type: "object", $value: f.value };
  }

  // Default: string-value med inferred type
  return { $type: tokenType, $value: f.value };
}

function inferTokenType(namespace: string, value: unknown): string {
  if (namespace === "colors") return "color";
  if (namespace === "typography") return "typography";
  if (namespace === "rounded" || namespace === "spacing") return "dimension";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  return "string";
}

/** Hex (#003399) → [r, g, b] som floats 0-1. Returnerer [0,0,0] ved feil. */
function hexToRgbComponents(hex: string): [number, number, number] {
  const cleaned = hex.replace(/^#/, "").trim();
  if (cleaned.length !== 6 && cleaned.length !== 3) return [0, 0, 0];
  const expanded =
    cleaned.length === 3
      ? cleaned.split("").map((c) => c + c).join("")
      : cleaned;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [0, 0, 0];
  return [Math.round((r / 255) * 1000) / 1000, Math.round((g / 255) * 1000) / 1000, Math.round((b / 255) * 1000) / 1000];
}

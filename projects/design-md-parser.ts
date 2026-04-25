// projects/design-md-parser.ts
//
// Sprint B — sync-back-parser. Når bruker manuelt redigerer design.md i
// repo, sync-cron leser fil, parser frontmatter (tokenene) og diff'er mot
// memories.permanence='project_fact'. INSERT for nye keys, UPDATE for
// endrede values (med trust_level: user). Slett-policy: ALDRI auto-slett
// (Fix 4 — bruker fjernet visning, ikke nødvendigvis konseptet).
//
// Format: parser KUN frontmatter-tokenene + de markerte tabell-seksjonene.
// Bruker-redigerte Decisions Log + Notes-seksjoner ignoreres for sync-back
// (de blir preservet av renderer i stedet).

import log from "encore.dev/log";

export interface ParsedDesignMd {
  frontmatter: {
    project_id?: string;
    project_name?: string;
    generated_at?: string;
    sources?: Array<{ type: string; ref: string }>;
    [k: string]: unknown;
  };
  /** Strukturert token-tre fra frontmatter ELLER fra tabell-seksjoner. */
  facts: Array<{
    namespace: string;
    key: string;
    value: string | Record<string, unknown>;
    evidence?: string;
  }>;
}

/** Parser design.md. Strikt: kun forhånds-definerte seksjoner.
 *  Bruker-tekst som ikke matcher format ignoreres (med log). */
export function parseDesignMd(content: string): ParsedDesignMd {
  const result: ParsedDesignMd = { frontmatter: {}, facts: [] };

  // 1. YAML-frontmatter mellom --- ... --- på toppen
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    result.frontmatter = parseSimpleYaml(fmMatch[1]);
  }
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;

  // 2. Brand Colors-tabell
  parseColorsTable(body, result.facts);

  // 3. Typography-tabell
  parseTypographyTable(body, result.facts);

  // 4. Layout & Shapes (rounded + spacing)
  parseRoundedTable(body, result.facts);
  parseSpacingTable(body, result.facts);

  // 5. Components-seksjonen (yaml-blocks per komponent)
  parseComponentsSection(body, result.facts);

  log.info("parseDesignMd: parsed", {
    factCount: result.facts.length,
    frontmatterKeys: Object.keys(result.frontmatter).length,
  });
  return result;
}

// --- YAML mini-parser (vi unngår ekstern dependency for enkel frontmatter) ---

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentList: Array<unknown> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;

    // List item under current key
    if (currentList !== null && line.startsWith("  - ")) {
      const value = line.slice(4).trim();
      // { type: "scrape", ref: "..." }-form
      if (value.startsWith("{") && value.endsWith("}")) {
        try {
          // Simple JSON-coerce: replace " with " on keys via lenient parse
          const lenient = value
            .replace(/(\w+):/g, '"$1":')
            .replace(/'/g, '"');
          currentList.push(JSON.parse(lenient));
        } catch {
          currentList.push(value);
        }
      } else {
        currentList.push(value.replace(/^["']|["']$/g, ""));
      }
      continue;
    }

    // Key: value
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (m) {
      currentKey = m[1];
      const valStr = m[2].trim();
      if (valStr === "") {
        // Will be filled by following list items
        const arr: unknown[] = [];
        result[currentKey] = arr;
        currentList = arr;
      } else {
        result[currentKey] = valStr.replace(/^["']|["']$/g, "");
        currentList = null;
      }
    }
  }

  return result;
}

// --- Tabell-parsers ---

function findSection(body: string, header: string): string | null {
  const re = new RegExp(`##\\s+${escapeRegex(header)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = body.match(re);
  return m ? m[1] : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTableRows(section: string): Array<{ key: string; value: string; source?: string }> {
  const rows: Array<{ key: string; value: string; source?: string }> = [];
  const lines = section.split("\n");
  for (const line of lines) {
    // Hopp over header- og separator-rader
    if (!line.includes("|")) continue;
    if (/^\s*\|[\s|-]+\|\s*$/.test(line)) continue;
    if (/Key\s*\|\s*Value/i.test(line)) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 2) continue;
    const keyCell = stripBackticks(cells[0]);
    const valueCell = stripBackticks(cells[1]);
    const sourceCell = cells[2] && cells[2] !== "—" ? cells[2] : undefined;
    if (!keyCell || !valueCell) continue;
    rows.push({ key: keyCell, value: valueCell, source: sourceCell });
  }
  return rows;
}

function stripBackticks(s: string): string {
  return s.replace(/^`|`$/g, "").trim();
}

function parseColorsTable(body: string, out: ParsedDesignMd["facts"]): void {
  const section = findSection(body, "Brand Colors");
  if (!section) return;
  for (const row of parseTableRows(section)) {
    // key er typisk "color.primary" — strip "color."-prefix
    const key = row.key.replace(/^color\./, "");
    out.push({
      namespace: "colors",
      key,
      value: row.value,
      evidence: row.source,
    });
  }
}

function parseTypographyTable(body: string, out: ParsedDesignMd["facts"]): void {
  const section = findSection(body, "Typography");
  if (!section) return;
  for (const row of parseTableRows(section)) {
    const key = row.key.replace(/^typography\./, "");
    // Value er typisk en kompakt streng "Inter, 16px, weight 400, line 1.6"
    // Vi lagrer som-er og lar AI/renderer tolke. Sync-back beholder formatet.
    out.push({
      namespace: "typography",
      key,
      value: row.value,
      evidence: row.source,
    });
  }
}

function parseRoundedTable(body: string, out: ParsedDesignMd["facts"]): void {
  const layoutSection = findSection(body, "Layout & Shapes");
  if (!layoutSection) return;
  // Sub-section "Border Radius"
  const subMatch = layoutSection.match(/###\s+Border Radius\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/);
  if (!subMatch) return;
  for (const row of parseTableRows(subMatch[1])) {
    const key = row.key.replace(/^rounded\./, "");
    out.push({
      namespace: "rounded",
      key,
      value: row.value,
      evidence: row.source,
    });
  }
}

function parseSpacingTable(body: string, out: ParsedDesignMd["facts"]): void {
  const layoutSection = findSection(body, "Layout & Shapes");
  if (!layoutSection) return;
  const subMatch = layoutSection.match(/###\s+Spacing\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/);
  if (!subMatch) return;
  for (const row of parseTableRows(subMatch[1])) {
    const key = row.key.replace(/^spacing\./, "");
    out.push({
      namespace: "spacing",
      key,
      value: row.value,
      evidence: row.source,
    });
  }
}

function parseComponentsSection(body: string, out: ParsedDesignMd["facts"]): void {
  const section = findSection(body, "Components");
  if (!section) return;
  // Hver komponent er en ### `components.<key>`-block med en yaml/code-fence
  const componentMatches = section.matchAll(
    /###\s*`components\.([a-zA-Z0-9_-]+)`\s*\n+```yaml\n([\s\S]*?)\n```/g,
  );
  for (const m of componentMatches) {
    const key = m[1];
    const yamlBody = m[2];
    const obj = parseSimpleYaml(yamlBody);
    out.push({
      namespace: "components",
      key,
      value: obj,
    });
  }
}

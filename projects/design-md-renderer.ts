// projects/design-md-renderer.ts
//
// Sprint B — design.md som menneskelesbar projeksjon av project_facts.
// Format-spec basert på .archive/design/DESIGN.md (Material 3-stil):
//   - YAML-frontmatter inneholder TOKENENE selv (ikke metadata)
//   - Markdown-body er narrativ prose (Brand & Style, Colors, Typography, Layout, ...)
//   - Auto-genererte seksjoner (frontmatter + token-tabeller) overskrives ved hver render
//   - Bruker-redigerte seksjoner (Decisions Log, Notes) preserves
//
// Single source of truth = memories.permanence='project_fact'. design.md er
// en READ-projection. Sync-back via design-md-parser.ts oppdaterer memories
// ved manuell redigering.

import log from "encore.dev/log";
// Lazy clients — self-importing the `projects` service via ~encore/clients
// at module level can deadlock the runtime during boot (projects depends
// on its own client before it has finished registering). Importing inside
// the function avoids the cycle. Same with memory (cross-service is fine,
// but kept lazy for symmetry + smaller boot graph).

// W3C-style key-konvensjon: namespace.key (kebab-case)
//   colors.surface-container-low, typography.display-lg, components.button-primary
interface ParsedFact {
  namespace: string;     // "colors" | "typography" | "rounded" | "spacing" | "components" | ...
  key: string;           // f.eks. "primary", "display-lg"
  value: string | Record<string, unknown>;  // string eller nested object
  evidence?: string;
}

interface RenderInput {
  projectName: string;
  projectId: string;
  facts: ParsedFact[];
  /** Eksisterende design.md content fra repo, hvis finnes. Brukes for å
   *  preserve user-redigerte Decisions Log + Notes-seksjoner. */
  existingMd?: string;
}

/** Hovedfunksjonen — bygger ferdig design.md-string. Idempotent: samme
 *  facts + samme existingMd → samme output. */
export function renderDesignMd(input: RenderInput): string {
  const grouped = groupFactsByNamespace(input.facts);
  const sources = extractSources(input.facts);
  const preserved = parsePreservedSections(input.existingMd);

  const frontmatter = buildFrontmatter(input.projectName, input.projectId, sources);
  const body = [
    `# ${input.projectName} Design System`,
    "",
    "> Auto-generated from project facts. Edit freely — TheFold syncs back to memory every 30 min.",
    "",
    renderColorsSection(grouped.colors ?? {}),
    renderTypographySection(grouped.typography ?? {}),
    renderShapesSection(grouped.rounded ?? {}, grouped.spacing ?? {}),
    renderComponentsSection(grouped.components ?? {}),
    renderDecisionsSection(grouped.decisions ?? {}, preserved.decisionsLog),
    renderExternalSourcesSection(grouped.external_source ?? {}),
    preserved.notes ? `## Notes\n\n${preserved.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `${frontmatter}\n\n${body.trim()}\n`;
}

// --- Public entry point: bygg design.md fra DB-state ---

export async function renderDesignMdFromDB(projectId: string, existingMd?: string): Promise<string> {
  const { memory: memoryClient, projects: projectsClient } = await import("~encore/clients");
  const project = await projectsClient.getProjectInternal({ projectId });
  if (!project.project) throw new Error(`Project ${projectId} not found`);

  const factResults = await memoryClient.search({
    projectId,
    permanence: "project_fact",
    limit: 200,
  });

  const facts: ParsedFact[] = [];
  for (const r of factResults.results ?? []) {
    const parsed = parseProjectFactMemory(r);
    if (parsed) facts.push(parsed);
  }

  return renderDesignMd({
    projectName: project.project.name,
    projectId,
    facts,
    existingMd,
  });
}

// --- Helpers ---

/** Parser et memory.content som ble skrevet av save-project-fact-tool.
 *  Format: `<namespace>.<key>: <value>` eller `<namespace>.<key>: <value> (<evidence>)`. */
function parseProjectFactMemory(memoryRow: {
  content: string;
  tags?: string[];
}): ParsedFact | null {
  const tags = memoryRow.tags ?? [];
  const keyTag = tags.find((t) => t.startsWith("key:"));
  const namespaceTag = tags.find((t) => t.startsWith("namespace:"));
  if (!keyTag) return null;

  const fullKey = keyTag.slice("key:".length);
  const dotIdx = fullKey.indexOf(".");
  let namespace: string;
  let key: string;
  if (namespaceTag) {
    namespace = namespaceTag.slice("namespace:".length);
    key = dotIdx >= 0 ? fullKey.slice(dotIdx + 1) : fullKey;
  } else if (dotIdx >= 0) {
    namespace = fullKey.slice(0, dotIdx);
    key = fullKey.slice(dotIdx + 1);
  } else {
    namespace = "general";
    key = fullKey;
  }

  // Innhold: "<fullKey>: <value> (<evidence>)" → ekstrakter value-portion
  const colonIdx = memoryRow.content.indexOf(":");
  if (colonIdx < 0) return null;
  let valuePart = memoryRow.content.slice(colonIdx + 1).trim();
  let evidence: string | undefined;
  const evidenceMatch = valuePart.match(/\s*\(([^)]+)\)\s*$/);
  if (evidenceMatch) {
    evidence = evidenceMatch[1];
    valuePart = valuePart.slice(0, evidenceMatch.index ?? valuePart.length).trim();
  }
  // Strip trailing "[refs: ...]" — kan ignoreres for renderer (bevart i memory-content)
  valuePart = valuePart.replace(/\s*\[refs:[^\]]+\]\s*$/, "").trim();

  // Forsøk å parse som JSON (typografi-objekt). Hvis ikke, bruk string.
  let value: string | Record<string, unknown> = valuePart;
  if (valuePart.startsWith("{") || valuePart.startsWith("[")) {
    try {
      value = JSON.parse(valuePart);
    } catch {
      // Plain string OK
    }
  }

  return { namespace, key, value, evidence };
}

function groupFactsByNamespace(facts: ParsedFact[]): Record<string, Record<string, ParsedFact>> {
  const grouped: Record<string, Record<string, ParsedFact>> = {};
  for (const f of facts) {
    if (!grouped[f.namespace]) grouped[f.namespace] = {};
    grouped[f.namespace][f.key] = f;
  }
  return grouped;
}

function extractSources(facts: ParsedFact[]): Array<{ type: string; ref: string }> {
  const sources = new Set<string>();
  for (const f of facts) {
    if (f.evidence) sources.add(f.evidence);
  }
  return Array.from(sources).slice(0, 10).map((ref) => {
    if (ref.startsWith("http")) return { type: "scrape", ref };
    if (ref.startsWith("design_import:")) return { type: "design_import", ref: ref.slice("design_import:".length) };
    return { type: "discovery", ref };
  });
}

function buildFrontmatter(
  projectName: string,
  projectId: string,
  sources: Array<{ type: string; ref: string }>,
): string {
  const lines = [
    "---",
    `project_id: "${projectId}"`,
    `project_name: ${JSON.stringify(projectName)}`,
    `generated_at: "${new Date().toISOString()}"`,
    `generator: "TheFold v3"`,
  ];
  if (sources.length > 0) {
    lines.push(`sources:`);
    for (const s of sources) {
      lines.push(`  - { type: ${JSON.stringify(s.type)}, ref: ${JSON.stringify(s.ref)} }`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function renderColorsSection(colors: Record<string, ParsedFact>): string {
  const keys = Object.keys(colors).sort();
  if (keys.length === 0) return "";
  const rows = keys
    .map((k) => {
      const f = colors[k];
      const value = typeof f.value === "string" ? f.value : JSON.stringify(f.value);
      const src = f.evidence ?? "—";
      return `| \`color.${k}\` | \`${value}\` | ${src} |`;
    })
    .join("\n");
  return [
    "## Brand Colors",
    "",
    "| Key | Value | Source |",
    "|---|---|---|",
    rows,
  ].join("\n");
}

function renderTypographySection(typography: Record<string, ParsedFact>): string {
  const keys = Object.keys(typography).sort();
  if (keys.length === 0) return "";
  const rows = keys
    .map((k) => {
      const f = typography[k];
      const value =
        typeof f.value === "object" && f.value !== null
          ? formatTypographyObject(f.value as Record<string, unknown>)
          : `\`${String(f.value)}\``;
      const src = f.evidence ?? "—";
      return `| \`typography.${k}\` | ${value} | ${src} |`;
    })
    .join("\n");
  return [
    "## Typography",
    "",
    "| Key | Value | Source |",
    "|---|---|---|",
    rows,
  ].join("\n");
}

function formatTypographyObject(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  if (obj.fontFamily) parts.push(String(obj.fontFamily));
  if (obj.fontSize) parts.push(String(obj.fontSize));
  if (obj.fontWeight) parts.push(`weight ${obj.fontWeight}`);
  if (obj.lineHeight) parts.push(`line ${obj.lineHeight}`);
  return parts.length > 0 ? parts.join(", ") : JSON.stringify(obj);
}

function renderShapesSection(
  rounded: Record<string, ParsedFact>,
  spacing: Record<string, ParsedFact>,
): string {
  const sections: string[] = [];
  const roundedKeys = Object.keys(rounded).sort();
  const spacingKeys = Object.keys(spacing).sort();
  if (roundedKeys.length === 0 && spacingKeys.length === 0) return "";

  sections.push("## Layout & Shapes");
  sections.push("");

  if (roundedKeys.length > 0) {
    sections.push("### Border Radius");
    sections.push("");
    sections.push("| Key | Value |");
    sections.push("|---|---|");
    for (const k of roundedKeys) {
      const v = rounded[k].value;
      sections.push(`| \`rounded.${k}\` | \`${typeof v === "string" ? v : JSON.stringify(v)}\` |`);
    }
    sections.push("");
  }

  if (spacingKeys.length > 0) {
    sections.push("### Spacing");
    sections.push("");
    sections.push("| Key | Value |");
    sections.push("|---|---|");
    for (const k of spacingKeys) {
      const v = spacing[k].value;
      sections.push(`| \`spacing.${k}\` | \`${typeof v === "string" ? v : JSON.stringify(v)}\` |`);
    }
  }

  return sections.join("\n");
}

function renderComponentsSection(components: Record<string, ParsedFact>): string {
  const keys = Object.keys(components).sort();
  if (keys.length === 0) return "";
  const lines: string[] = ["## Components", ""];
  for (const k of keys) {
    const f = components[k];
    lines.push(`### \`components.${k}\``);
    if (typeof f.value === "object" && f.value !== null) {
      lines.push("");
      lines.push("```yaml");
      for (const [propKey, propVal] of Object.entries(f.value)) {
        lines.push(`${propKey}: ${typeof propVal === "string" ? propVal : JSON.stringify(propVal)}`);
      }
      lines.push("```");
    } else {
      lines.push("");
      lines.push(String(f.value));
    }
    if (f.evidence) lines.push(`\n_Source: ${f.evidence}_`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderDecisionsSection(
  decisions: Record<string, ParsedFact>,
  preservedLog?: string,
): string {
  const keys = Object.keys(decisions).sort();
  if (keys.length === 0 && !preservedLog) return "";
  const lines: string[] = ["## Decisions Log", ""];
  if (preservedLog) {
    lines.push(preservedLog);
    lines.push("");
  }
  for (const k of keys) {
    const f = decisions[k];
    const v = typeof f.value === "string" ? f.value : JSON.stringify(f.value);
    lines.push(`- **${k}**: ${v}${f.evidence ? ` (${f.evidence})` : ""}`);
  }
  return lines.join("\n");
}

function renderExternalSourcesSection(sources: Record<string, ParsedFact>): string {
  const keys = Object.keys(sources).sort();
  if (keys.length === 0) return "";
  const lines: string[] = ["## External Sources", ""];
  for (const k of keys) {
    const f = sources[k];
    const v = typeof f.value === "string" ? f.value : JSON.stringify(f.value);
    lines.push(`- ${k}: ${v}`);
  }
  return lines.join("\n");
}

interface PreservedSections {
  decisionsLog?: string;
  notes?: string;
}

/** Hent ut Decisions Log (utenfor auto-list) og Notes-seksjonen fra
 *  eksisterende design.md, slik at vi ikke overskriver bruker-redigeringer. */
function parsePreservedSections(existingMd?: string): PreservedSections {
  if (!existingMd) return {};
  const result: PreservedSections = {};

  // Notes-seksjonen (bevart 1:1)
  const notesMatch = existingMd.match(/##\s*Notes\s*\n\n([\s\S]*?)(?=\n##\s|\n*$)/);
  if (notesMatch) {
    result.notes = notesMatch[1].trim();
  }

  // Decisions Log: bevarer bare den fri-tekst-delen FØR auto-listen.
  // Auto-listen starter med "- **<key>**:" (vår egen output-pattern).
  const decisionsMatch = existingMd.match(/##\s*Decisions Log\s*\n\n([\s\S]*?)(?=\n##\s|\n*$)/);
  if (decisionsMatch) {
    const decisionsBlock = decisionsMatch[1];
    // Splitt ved første "- **<key>**:"-linje
    const autoListMatch = decisionsBlock.match(/\n- \*\*[^*]+\*\*:/);
    const userPart = autoListMatch
      ? decisionsBlock.slice(0, autoListMatch.index ?? decisionsBlock.length).trim()
      : decisionsBlock.trim();
    if (userPart.length > 0) {
      result.decisionsLog = userPart;
    }
  }

  return result;
}

// Eksporter også parser-funksjonen for design-md-parser.ts (sync-back)
export { parseProjectFactMemory };
export type { ParsedFact };

// skills/loader.ts
// File-based SKILL.md loader — reads skills/<name>/SKILL.md, parses YAML
// frontmatter + markdown body, and upserts into the skills table.
//
// Loader is idempotent: re-running reads each file, matches by the `name`
// field from frontmatter, UPDATEs if present else INSERTs. Skills that live
// in DB but no longer have a matching file are NOT deleted — we log a
// warning so a human can decide whether to prune them.
//
// Expected frontmatter shape:
//   name: encore-api
//   description: Type-safe API endpoints
//   applies_to: [coding, review]      # default []
//   project_types: [code, framer]     # default []  (empty = all)
//   trigger_keywords: [endpoint, api] # default []  (empty = always match)
//   priority: 7                       # default 0
//   min_complexity: 0                 # default 0
//   enabled: true                     # default true

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { db } from "./skills";

// Resolve the main-repo skills/ directory. Encore runs from the repo root,
// so process.cwd() lands there. If that ever changes, respect SKILLS_DIR env.
function skillsDir(): string {
  const override = process.env.SKILLS_DIR;
  if (override && override.trim()) return override.trim();
  return path.join(process.cwd(), "skills");
}

interface SkillFrontmatter {
  name: string;
  description?: string;
  applies_to?: string[];
  project_types?: string[];
  trigger_keywords?: string[];
  priority?: number;
  min_complexity?: number;
  enabled?: boolean;
  /** When true, the resolver NEVER skips this skill on low-complexity +
   *  no-trigger-match turns. Use sparingly — every always_on skill spends
   *  prompt tokens on every chat turn, even "Hei". */
  always_on?: boolean;
}

interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  relPath: string; // relative to skills/ root, e.g. "encore-api/SKILL.md"
}

/** Split frontmatter from body. Accepts both `---` and `<!---` fences. */
function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  if (!match) return { frontmatter: "", body: text };
  return { frontmatter: match[1], body: match[2] };
}

async function readSkillFile(absPath: string, relPath: string): Promise<ParsedSkill | null> {
  const raw = await fs.readFile(absPath, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  if (!frontmatter.trim()) {
    log.warn("skills-loader: skipped file without frontmatter", { path: relPath });
    return null;
  }
  let fm: SkillFrontmatter;
  try {
    fm = parseYaml(frontmatter) as SkillFrontmatter;
  } catch (err) {
    log.warn("skills-loader: yaml parse failed", {
      path: relPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!fm || typeof fm.name !== "string" || !fm.name.trim()) {
    log.warn("skills-loader: frontmatter missing required `name`", { path: relPath });
    return null;
  }
  return { frontmatter: fm, body: body.trim(), relPath };
}

/**
 * Walk skills/ recursively, picking up every SKILL.md.
 * Returns parsed + validated entries.
 */
async function scanSkillFiles(): Promise<ParsedSkill[]> {
  const root = skillsDir();
  const results: ParsedSkill[] = [];

  let exists = false;
  try {
    const stat = await fs.stat(root);
    exists = stat.isDirectory();
  } catch {
    // skills/ may not exist yet during first boot — treat as empty set.
    exists = false;
  }
  if (!exists) {
    log.info("skills-loader: skills/ directory not found, skipping scan", { root });
    return [];
  }

  async function walk(dir: string, rel: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      log.warn("skills-loader: readdir failed", {
        dir,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(abs, r);
      } else if (e.isFile() && e.name === "SKILL.md") {
        const parsed = await readSkillFile(abs, r);
        if (parsed) results.push(parsed);
      }
    }
  }

  await walk(root, "");
  return results;
}

/** Upsert a single parsed skill into the skills table. */
async function upsertSkill(parsed: ParsedSkill): Promise<"inserted" | "updated"> {
  const fm = parsed.frontmatter;
  const name = fm.name.trim();
  const description = (fm.description ?? "").trim();
  const appliesTo = Array.isArray(fm.applies_to) ? fm.applies_to : [];
  const projectTypes = Array.isArray(fm.project_types) ? fm.project_types : [];
  const triggerKeywords = Array.isArray(fm.trigger_keywords) ? fm.trigger_keywords : [];
  const priority = typeof fm.priority === "number" ? fm.priority : 0;
  const minComplexity = typeof fm.min_complexity === "number" ? fm.min_complexity : 0;
  const enabled = fm.enabled !== false; // default true
  const alwaysOn = fm.always_on === true;

  const existing = await db.queryRow<{ id: string }>`
    SELECT id FROM skills WHERE name = ${name}
  `;

  if (existing) {
    await db.exec`
      UPDATE skills SET
        description       = ${description},
        prompt_fragment   = ${parsed.body},
        applies_to        = ${appliesTo}::text[],
        project_types     = ${projectTypes}::text[],
        trigger_keywords  = ${triggerKeywords}::text[],
        priority          = ${priority},
        min_complexity    = ${minComplexity},
        enabled           = ${enabled},
        always_on         = ${alwaysOn},
        source_file       = ${parsed.relPath},
        updated_at        = NOW()
      WHERE id = ${existing.id}
    `;
    return "updated";
  }

  await db.exec`
    INSERT INTO skills (
      name, description, prompt_fragment, applies_to, project_types,
      trigger_keywords, priority, min_complexity, enabled, always_on, source_file
    ) VALUES (
      ${name}, ${description}, ${parsed.body},
      ${appliesTo}::text[], ${projectTypes}::text[], ${triggerKeywords}::text[],
      ${priority}, ${minComplexity}, ${enabled}, ${alwaysOn}, ${parsed.relPath}
    )
  `;
  return "inserted";
}

export interface LoadSkillsResult {
  scanned: number;
  inserted: number;
  updated: number;
  orphaned: string[]; // skills in DB with source_file set but file no longer exists
  errors: Array<{ path: string; error: string }>;
}

/**
 * Scan skills/ and sync every SKILL.md into the DB. Orphaned entries (DB row
 * with source_file set but the file is gone) are NOT deleted — reported for
 * manual review.
 */
export async function loadSkillsFromFiles(): Promise<LoadSkillsResult> {
  const result: LoadSkillsResult = {
    scanned: 0,
    inserted: 0,
    updated: 0,
    orphaned: [],
    errors: [],
  };

  const parsed = await scanSkillFiles();
  result.scanned = parsed.length;
  const seenRelPaths = new Set<string>();

  for (const p of parsed) {
    seenRelPaths.add(p.relPath);
    try {
      const kind = await upsertSkill(p);
      if (kind === "inserted") result.inserted += 1;
      else result.updated += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("skills-loader: upsert failed", { path: p.relPath, error: msg });
      result.errors.push({ path: p.relPath, error: msg });
    }
  }

  // Report orphans (DB rows whose source_file no longer exists on disk).
  const orphanRows = db.query<{ name: string; source_file: string }>`
    SELECT name, source_file
    FROM skills
    WHERE source_file IS NOT NULL
  `;
  for await (const row of orphanRows) {
    if (!seenRelPaths.has(row.source_file)) {
      log.warn("skills-loader: orphaned skill (file missing)", {
        name: row.name,
        source_file: row.source_file,
      });
      result.orphaned.push(row.name);
    }
  }

  log.info("skills-loader: sync complete", {
    scanned: result.scanned,
    inserted: result.inserted,
    updated: result.updated,
    orphaned: result.orphaned.length,
    errors: result.errors.length,
  });

  return result;
}

// --- Boot-time sync ---
//
// Runs once at service init. Fail-soft: a broken loader shouldn't keep the
// skills service from starting, since existing rows in DB stay valid.
let bootLoadDone = false;
(async () => {
  if (bootLoadDone) return;
  bootLoadDone = true;
  try {
    const r = await loadSkillsFromFiles();
    log.info("skills-loader: boot-time sync", {
      scanned: r.scanned,
      inserted: r.inserted,
      updated: r.updated,
    });
  } catch (err) {
    log.warn("skills-loader: boot-time sync failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
})();

// --- Manual-reload endpoint ---
//
// Internal-only. Re-scans skills/ and upserts. Useful after `git pull` on a
// running dev instance, or in CI after content changes.
export const reloadSkills = api(
  { method: "POST", path: "/skills/reload", expose: false },
  async (): Promise<LoadSkillsResult> => {
    return await loadSkillsFromFiles();
  },
);

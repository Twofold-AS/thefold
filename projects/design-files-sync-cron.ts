// projects/design-files-sync-cron.ts
//
// Sprint B — sync-back. Hver 30 min: for hvert prosjekt med
// design_md_path satt, hent fil fra companion-repo, hash, sammenlign mot
// design_md_external_hash. Hvis forskjellig: parse, diff mot
// memories.permanence='project_fact', INSERT for nye keys, UPDATE for
// endrede values (trust_level: user). ALDRI auto-slett.

import { CronJob } from "encore.dev/cron";
import { api } from "encore.dev/api";
import log from "encore.dev/log";
import crypto from "node:crypto";
import { db } from "./db";
// Lazy clients — top-level ~encore/clients import in a module that ALSO
// declares a CronJob can lock the projects-service init at boot. Resolved
// inside the handler so the cron is registered without forcing the client
// graph during module load.
import { parseDesignMd } from "./design-md-parser";

interface SyncProjectRow {
  id: string;
  github_repo: string | null;
  design_md_path: string;
  design_md_external_hash: string | null;
  design_md_version: number;
}

interface SyncResult {
  projectsScanned: number;
  projectsUpdated: number;
  factsInserted: number;
  factsUpdated: number;
  errors: number;
}

// Public for manual trigger
export const syncDesignFilesNow = api(
  { method: "POST", path: "/projects/sync-design-files-now", expose: false },
  async (): Promise<SyncResult> => {
    return await syncAllDesignFiles();
  },
);

async function syncAllDesignFiles(): Promise<SyncResult> {
  const startMs = Date.now();
  const watchdogMs = 5 * 60_000;

  const result: SyncResult = {
    projectsScanned: 0,
    projectsUpdated: 0,
    factsInserted: 0,
    factsUpdated: 0,
    errors: 0,
  };

  const projectRows = db.query<SyncProjectRow>`
    SELECT id, github_repo, design_md_path, design_md_external_hash, design_md_version
    FROM projects
    WHERE design_md_path IS NOT NULL
      AND github_repo IS NOT NULL
      AND archived_at IS NULL
  `;

  for await (const row of projectRows) {
    if (Date.now() - startMs > watchdogMs) {
      log.warn("syncDesignFiles: watchdog timeout — partial sync", {
        scanned: result.projectsScanned,
      });
      break;
    }
    result.projectsScanned += 1;
    try {
      const updated = await syncOneProject(row);
      if (updated.changed) result.projectsUpdated += 1;
      result.factsInserted += updated.inserted;
      result.factsUpdated += updated.updated;
    } catch (err) {
      result.errors += 1;
      log.warn("syncDesignFiles: project sync failed", {
        projectId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("syncDesignFiles: completed", {
    ...result,
    durationMs: Date.now() - startMs,
  });
  return result;
}

async function syncOneProject(p: SyncProjectRow): Promise<{
  changed: boolean;
  inserted: number;
  updated: number;
}> {
  if (!p.github_repo) return { changed: false, inserted: 0, updated: 0 };
  const [owner, repo] = p.github_repo.split("/");
  if (!owner || !repo) return { changed: false, inserted: 0, updated: 0 };

  const { github: githubClient, memory: memoryClient } = await import("~encore/clients");

  // Hent fil fra repo
  let content: string;
  try {
    const fileResp = await githubClient.getFile({ owner, repo, path: p.design_md_path });
    content = fileResp.content;
  } catch (err) {
    // 404 → bruker har slettet fila. Vi gjør ingenting (ikke auto-cleanup).
    log.info("syncDesignFiles: design.md not found in repo", {
      projectId: p.id,
      path: p.design_md_path,
    });
    return { changed: false, inserted: 0, updated: 0 };
  }

  // Hash check
  const newHash = crypto.createHash("sha256").update(content).digest("hex");
  if (newHash === p.design_md_external_hash) {
    return { changed: false, inserted: 0, updated: 0 };
  }

  // Parse → diff mot memories
  const parsed = parseDesignMd(content);
  if (parsed.facts.length === 0) {
    log.warn("syncDesignFiles: parse returned 0 facts — skipping update", {
      projectId: p.id,
    });
    return { changed: false, inserted: 0, updated: 0 };
  }

  // Hent eksisterende project_facts
  const existing = await memoryClient.search({
    projectId: p.id,
    permanence: "project_fact",
    limit: 200,
  });
  // Build lookup: namespace.key → memory-row
  const existingByFullKey = new Map<string, { id: string; content: string }>();
  for (const m of existing.results ?? []) {
    const keyTag = (m.tags ?? []).find((t) => t.startsWith("key:"));
    if (keyTag) {
      existingByFullKey.set(keyTag.slice("key:".length), { id: m.id, content: m.content });
    }
  }

  let inserted = 0;
  let updated = 0;

  for (const fact of parsed.facts) {
    const fullKey = `${fact.namespace}.${fact.key}`;
    const valueStr =
      typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value);
    const newContent =
      `${fullKey}: ${valueStr}` + (fact.evidence ? ` (${fact.evidence})` : "");

    const match = existingByFullKey.get(fullKey);
    if (match) {
      // Sjekk om value er endret (strip evidence + refs for sammenligning)
      const existingValue = match.content
        .slice(fullKey.length + 2)
        .split(" (")[0]
        .split(" [refs:")[0]
        .trim();
      if (existingValue === valueStr) {
        // Identisk — no-op
        continue;
      }
      // Endret av bruker → UPDATE med trust_level: user
      try {
        await memoryClient.update({
          id: match.id,
          content: newContent,
          trustLevel: "user",
        });
        updated += 1;
        log.info("syncDesignFiles: UPDATED fact from manual edit", {
          projectId: p.id,
          fullKey,
          oldValue: existingValue.substring(0, 80),
          newValue: valueStr.substring(0, 80),
        });
      } catch (err) {
        log.warn("syncDesignFiles: update failed", {
          projectId: p.id,
          fullKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      // Ny rad → INSERT med trust_level: user (bruker la til manuelt)
      try {
        await memoryClient.store({
          content: newContent,
          category: fact.namespace,
          memoryType: "decision",
          projectId: p.id,
          tags: [
            "project_fact",
            `namespace:${fact.namespace}`,
            `key:${fullKey}`,
            ...(fact.evidence ? [`evidence:${fact.evidence.substring(0, 80)}`] : []),
          ],
          permanence: "project_fact",
          pinned: true,
          trustLevel: "user",
          ttlDays: 0,
        });
        inserted += 1;
        log.info("syncDesignFiles: INSERTED new fact from manual edit", {
          projectId: p.id,
          fullKey,
        });
      } catch (err) {
        log.warn("syncDesignFiles: insert failed", {
          projectId: p.id,
          fullKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Existing facts NOT in parsed → IKKE auto-slett (per Fix 4).
  // Logg hver "missing" så vi kan debugge hvis bruker forventet sletting.
  for (const [fullKey, match] of existingByFullKey) {
    const stillPresent = parsed.facts.some(
      (f) => `${f.namespace}.${f.key}` === fullKey,
    );
    if (!stillPresent) {
      log.warn("syncDesignFiles: fact in memory but not in design.md (NOT deleting)", {
        projectId: p.id,
        fullKey,
        contentPreview: match.content.substring(0, 80),
      });
    }
  }

  // Update tracking hash
  await db.exec`
    UPDATE projects
    SET design_md_external_hash = ${newHash}, design_md_synced_at = NOW()
    WHERE id = ${p.id}::uuid
  `;

  return { changed: inserted > 0 || updated > 0, inserted, updated };
}

// Cron — hver 30 min
const _designFilesSync = new CronJob("design-files-sync", {
  title: "Sync design.md back to memories",
  every: "30m",
  endpoint: syncDesignFilesNow,
});

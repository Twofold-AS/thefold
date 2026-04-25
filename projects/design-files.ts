// projects/design-files.ts
//
// Sprint B — endpoint for å regenerere design.md + design_tokens.json fra
// memories.permanence='project_fact'. Idempotent: sammenligner SHA-256 av
// (design.md + design_tokens.json concat) mot project.design_md_external_hash;
// hopper over commit hvis ingen endringer.
//
// Plassering per projektype:
//   - framer / framer_figma → companion-repo (root): design.md + design_tokens.json
//   - code → .thefold/design.md + .thefold/design_tokens.json
//   - figma-only → ikke skrevet (memory holder data; ingen repo-companion)
//   - incognito → aldri kalt (private chats persisterer ikke)

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import crypto from "node:crypto";
import { db } from "./db";
// Lazy clients — projects-service self-import via top-level ~encore/clients
// can deadlock the runtime at boot. Resolve inside the handler instead.
import { renderDesignMd, parseProjectFactMemory, type ParsedFact } from "./design-md-renderer";
import { renderDesignTokensJson } from "./design-tokens-json-renderer";

interface RegenerateRequest {
  projectId: string;
  /** When true, force a write even if hash unchanged. Used by manual-trigger. */
  force?: boolean;
}

interface RegenerateResponse {
  changed: boolean;
  version: number;
  designMdPath?: string;
  designTokensPath?: string;
  reason?: string;
}

const FRAMER_DESIGN_MD = "design.md";
const FRAMER_DESIGN_TOKENS = "design_tokens.json";
const CODE_DESIGN_MD = ".thefold/design.md";
const CODE_DESIGN_TOKENS = ".thefold/design_tokens.json";

export const regenerateDesignFiles = api(
  { method: "POST", path: "/projects/regenerate-design-files", expose: false },
  async (req: RegenerateRequest): Promise<RegenerateResponse> => {
    const {
      github: githubClient,
      memory: memoryClient,
      projects: projectsClient,
    } = await import("~encore/clients");
    const project = await projectsClient.getProjectInternal({ projectId: req.projectId });
    if (!project.project) {
      return { changed: false, version: 0, reason: "project not found" };
    }
    const p = project.project;

    // figma-only og incognito: ikke skriv design-files
    if (p.projectType === "figma") {
      return { changed: false, version: 0, reason: "figma-only project — design.md not generated" };
    }

    // Hent project_facts
    const factResults = await memoryClient.search({
      projectId: req.projectId,
      permanence: "project_fact",
      limit: 200,
    });
    const facts: ParsedFact[] = [];
    for (const r of factResults.results ?? []) {
      const parsed = parseProjectFactMemory(r);
      if (parsed) facts.push(parsed);
    }
    if (facts.length === 0) {
      return { changed: false, version: 0, reason: "no project_facts to render" };
    }

    // Bestem plassering
    const isFramer = p.projectType === "framer" || p.projectType === "framer_figma";
    const designMdPath = isFramer ? FRAMER_DESIGN_MD : CODE_DESIGN_MD;
    const designTokensPath = isFramer ? FRAMER_DESIGN_TOKENS : CODE_DESIGN_TOKENS;

    // Forsøk å hente eksisterende design.md fra repo (for å preserve user-redigerte
    // Decisions Log + Notes-seksjoner). Fail-soft hvis ikke finnes.
    let existingMd: string | undefined;
    try {
      if (p.githubRepo) {
        const [owner, name] = p.githubRepo.split("/");
        if (owner && name) {
          const fileResp = await githubClient.getFile({ owner, repo: name, path: designMdPath });
          existingMd = fileResp.content;
        }
      }
    } catch {
      // File doesn't exist yet — first generation. OK.
    }

    // Render
    const designMd = renderDesignMd({
      projectName: p.name,
      projectId: p.id,
      facts,
      existingMd,
    });
    const tokensJson = renderDesignTokensJson({
      projectName: p.name,
      facts,
    });

    // Hash sjekk for idempotens
    const newHash = crypto
      .createHash("sha256")
      .update(designMd + "\n---\n" + tokensJson)
      .digest("hex");

    // Hent existing hash fra projects-tabellen (egen DB-query siden Project type
    // ikke eksponerer disse feltene ennå)
    const trackingRow = await db.queryRow<{
      design_md_external_hash: string | null;
      design_md_version: number;
    }>`
      SELECT design_md_external_hash, design_md_version
      FROM projects WHERE id = ${req.projectId}::uuid
    `;
    const oldHash = trackingRow?.design_md_external_hash ?? null;
    const oldVersion = trackingRow?.design_md_version ?? 0;

    if (!req.force && oldHash === newHash) {
      log.info("regenerateDesignFiles: no changes — skipping write", {
        projectId: req.projectId,
        version: oldVersion,
      });
      return { changed: false, version: oldVersion, designMdPath, designTokensPath };
    }

    // Skriv til repo
    if (!p.githubRepo) {
      log.warn("regenerateDesignFiles: project has no github_repo — cannot write", {
        projectId: req.projectId,
      });
      return { changed: false, version: oldVersion, reason: "no github_repo" };
    }
    const [owner, repo] = p.githubRepo.split("/");
    if (!owner || !repo) {
      return { changed: false, version: oldVersion, reason: "invalid github_repo" };
    }

    try {
      await githubClient.createOrUpdateFile({
        owner,
        repo,
        path: designMdPath,
        content: designMd,
        message: `chore(design): regenerate design.md from project facts`,
        branch: "main",
      });
      await githubClient.createOrUpdateFile({
        owner,
        repo,
        path: designTokensPath,
        content: tokensJson,
        message: `chore(design): regenerate design_tokens.json (W3C format)`,
        branch: "main",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("regenerateDesignFiles: github write failed", {
        projectId: req.projectId,
        error: msg,
      });
      return { changed: false, version: oldVersion, reason: `write failed: ${msg}` };
    }

    // Update tracking
    const newVersion = oldVersion + 1;
    await db.exec`
      UPDATE projects
      SET design_md_path = ${designMdPath},
          design_md_synced_at = NOW(),
          design_md_version = ${newVersion},
          design_md_external_hash = ${newHash}
      WHERE id = ${req.projectId}::uuid
    `;

    log.info("regenerateDesignFiles: written", {
      projectId: req.projectId,
      version: newVersion,
      factsCount: facts.length,
      designMdLen: designMd.length,
      tokensJsonLen: tokensJson.length,
    });

    return {
      changed: true,
      version: newVersion,
      designMdPath,
      designTokensPath,
    };
  },
);

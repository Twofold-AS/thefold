// --- Security service aggregator (Commits 31–36) ---
// Single entry point the orchestrator calls: scanFiles({files, sandboxId?,
// runAiAudit?, runNpmAudit?}) → ScanFilesResponse with the merged findings
// from regex, AI sub-agent, secrets, and npm audit. Applies suppressions,
// computes the blocker flag per §27.5 (ALT blokkerer), and persists the
// suppression audit log.

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { scanFiles as runRegexScan } from "./scanner";
import { scanFilesForSecrets } from "./secrets";
import { runNpmAudit } from "./npm-audit";
import { applySuppressions, recordManualOverride } from "./suppressions";
import type { Finding, ScanFilesRequest, ScanFilesResponse } from "./types";

async function runAiAudit(
  files: Array<{ path: string; content: string }>,
): Promise<Finding[]> {
  // Calls the ai service's security sub-agent (Commit 32). Sub-agent returns
  // Finding[]-shaped output already. The cast tolerates encore.gen lag —
  // encore regenerates the client on `encore run`; a fresh tsc pass before
  // that regen would otherwise fail on the unknown method name.
  try {
    const { ai } = await import("~encore/clients");
    const client = ai as unknown as {
      aiSecurityAudit: (req: {
        files: Array<{ path: string; content: string }>;
      }) => Promise<{ findings: Finding[]; tokensUsed: number; costUsd: number }>;
    };
    const result = await client.aiSecurityAudit({ files });
    return result.findings;
  } catch (err) {
    log.warn("ai security audit failed — continuing without AI findings", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export const scanFiles = api(
  { method: "POST", path: "/security/scan", expose: false },
  async (req: ScanFilesRequest): Promise<ScanFilesResponse> => {
    const files = req.files ?? [];
    const fileMap = new Map<string, string>();
    for (const f of files) fileMap.set(f.path, f.content);

    // Run all enabled scanners in parallel. Errors in one don't block others.
    const [regexFindings, secretFindings, aiFindings, npmAudit] =
      await Promise.all([
        Promise.resolve(runRegexScan(files)),
        Promise.resolve(scanFilesForSecrets(files)),
        req.runAiAudit ? runAiAudit(files) : Promise.resolve([] as Finding[]),
        req.runNpmAudit && req.sandboxId
          ? runNpmAudit(req.sandboxId)
          : Promise.resolve({ findings: [] as Finding[], autoFixed: false, fixedPackages: [], summary: {} }),
      ]);

    const merged: Finding[] = [
      ...regexFindings,
      ...secretFindings,
      ...aiFindings,
      ...npmAudit.findings,
    ];

    // Apply inline suppressions. Writes audit rows for each silenced hit.
    const { active, suppressed } = await applySuppressions(merged, fileMap);

    // §27.5: ENHVER aktiv finding blokkerer. Ingen severity-terskel.
    const blocked = active.length > 0;
    const blockerReason = blocked
      ? `${active.length} aktive security-funn (${active
          .map((f) => f.severity)
          .join(", ")
          .slice(0, 120)})`
      : undefined;

    return {
      findings: active,
      blocked,
      blockerReason,
      suppressed,
      stats: {
        filesScanned: files.length,
        regexHits: regexFindings.length,
        secretHits: secretFindings.length,
        aiHits: aiFindings.length,
        npmAuditHits: npmAudit.findings.length,
        suppressedCount: suppressed.length,
      },
    };
  },
);

// --- Manual override endpoint (Commit 35) ---
// Superadmin-only. Records a suppression for every finding fingerprint listed
// so a subsequent scanFiles() pass can treat them as overridden if needed.
// Note: does NOT auto-un-block the current plan — the orchestrator decides
// whether to re-run security after override.

export interface OverrideRequest {
  findingFingerprints: string[];
  reason: string;
  planId: string;
}

export interface OverrideResponse {
  recorded: number;
  planId: string;
}

export const overrideFindings = api(
  {
    method: "POST",
    path: "/security/override",
    expose: true,
    auth: true,
  },
  async (req: OverrideRequest): Promise<OverrideResponse> => {
    const { getAuthData } = await import("~encore/auth");
    const auth = getAuthData()!;
    const { users } = await import("~encore/clients");

    const check = await users.checkAdmin({ email: auth.email });
    if (!check.isSuperadmin) {
      const { APIError } = await import("encore.dev/api");
      throw APIError.permissionDenied(
        "Kun superadministrator kan overstyre security-funn.",
      );
    }

    // Build minimal Finding objects — we only need fingerprint/file/line for
    // the audit row, but we don't have those here. Record the fingerprints
    // with placeholder metadata; UI supplies the real values if it collected
    // them client-side. For MVP, store fingerprint + reason directly.
    await recordManualOverride(
      req.findingFingerprints.map((fp) => ({
        source: "regex",
        severity: "warning",
        file: "__override__",
        line: 0,
        snippet: "",
        message: "manual override",
        fingerprint: fp,
      })),
      req.reason,
      auth.email,
    );

    log.info("security findings overridden", {
      planId: req.planId,
      count: req.findingFingerprints.length,
      superadmin: auth.email,
    });

    return { recorded: req.findingFingerprints.length, planId: req.planId };
  },
);

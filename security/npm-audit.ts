// --- npm audit integration (Commit 34) ---
// Runs `npm audit --json` inside an existing sandbox when package.json has
// changed. Parses the advisory output into Findings and optionally attempts
// a safe `npm audit fix` (semver-compatible only — never --force).

import * as crypto from "crypto";
import type { Finding, Severity } from "./types";

interface AuditAdvisory {
  name: string;
  severity: Severity;
  via: Array<string | { source: number; name: string; dependency: string; title: string; url: string }>;
  range: string;
  fixAvailable?: boolean | { name: string; version: string; isSemVerMajor: boolean };
}

interface AuditJson {
  vulnerabilities?: Record<string, AuditAdvisory>;
  metadata?: { vulnerabilities?: Record<string, number> };
}

export interface NpmAuditResult {
  findings: Finding[];
  autoFixed: boolean;
  fixedPackages: string[];
  /** Raw summary by severity for diagnostics */
  summary: Record<string, number>;
}

function fingerprint(pkg: string, cveOrTitle: string): string {
  return crypto
    .createHash("sha256")
    .update(`npm_audit|${pkg}|${cveOrTitle}`)
    .digest("hex")
    .slice(0, 16);
}

function normalizeSeverity(sev: string): Severity {
  const s = sev.toLowerCase();
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  if (s === "moderate") return "medium";
  if (s === "info") return "warning";
  return "medium";
}

/**
 * Run npm audit inside the given sandbox and convert the result to Findings.
 * Returns an empty list if no vulnerabilities or if audit cannot run.
 */
export async function runNpmAudit(sandboxId: string): Promise<NpmAuditResult> {
  const { sandbox } = await import("~encore/clients");

  const summary: Record<string, number> = {};
  const findings: Finding[] = [];
  const fixedPackages: string[] = [];

  try {
    // Run audit. --json must be paired with a reasonable timeout — large
    // lockfiles take seconds. Ignore non-zero exit codes; audit returns
    // non-zero when vulnerabilities are found, which is our happy path.
    const audit = await sandbox.runCommand({
      sandboxId,
      command: "npm audit --json --audit-level=low",
      timeout: 120_000,
    });

    if (!audit.stdout || audit.stdout.trim().length === 0) {
      return { findings: [], autoFixed: false, fixedPackages: [], summary };
    }

    let parsed: AuditJson;
    try {
      parsed = JSON.parse(audit.stdout) as AuditJson;
    } catch {
      // audit wrote something that wasn't JSON — surface as warning but don't
      // block the whole pipeline.
      return {
        findings: [
          {
            source: "npm_audit",
            severity: "warning",
            file: "package.json",
            line: 1,
            snippet: audit.stdout.slice(0, 200),
            message: "npm audit produced unparseable output.",
            fingerprint: fingerprint("__audit__", "parse-error"),
          },
        ],
        autoFixed: false,
        fixedPackages: [],
        summary,
      };
    }

    const vulns = parsed.vulnerabilities ?? {};
    const meta = parsed.metadata?.vulnerabilities ?? {};
    for (const [severity, count] of Object.entries(meta)) {
      summary[severity] = count as number;
    }

    for (const [pkg, adv] of Object.entries(vulns)) {
      const severity = normalizeSeverity(adv.severity);
      const titles = adv.via
        .map((v) => (typeof v === "string" ? v : v.title))
        .slice(0, 3)
        .join("; ");

      const fixHint = (() => {
        if (!adv.fixAvailable) return "No fix available — consider replacing the dependency.";
        if (typeof adv.fixAvailable === "boolean") return "Fix available via npm audit fix.";
        if (adv.fixAvailable.isSemVerMajor) {
          return `Breaking upgrade required — npm install ${adv.fixAvailable.name}@${adv.fixAvailable.version}.`;
        }
        return `Safe upgrade available — npm install ${adv.fixAvailable.name}@${adv.fixAvailable.version}.`;
      })();

      findings.push({
        source: "npm_audit",
        severity,
        file: "package.json",
        line: 1,
        snippet: `${pkg}@${adv.range}`,
        message: `${pkg} ${adv.range}: ${titles || "vulnerability reported"}`,
        suggestedFix: fixHint,
        fingerprint: fingerprint(pkg, titles || severity),
        ruleId: `npm:${pkg}`,
      });
    }

    // Try safe auto-fix (never --force). npm audit fix without --force
    // only applies semver-compatible upgrades. We re-run to compute the
    // delta — any package that disappears from vulns was fixed.
    const safeToAttemptFix = findings.some((f) => {
      const adv = vulns[f.ruleId?.replace(/^npm:/, "") ?? ""];
      if (!adv) return false;
      const fa = adv.fixAvailable;
      if (typeof fa === "boolean") return fa;
      return !!fa && !fa.isSemVerMajor;
    });

    if (safeToAttemptFix) {
      await sandbox.runCommand({
        sandboxId,
        command: "npm audit fix --json",
        timeout: 180_000,
      }).catch(() => {
        /* non-critical — leave findings as-is */
      });

      // Re-audit to see what's left
      const after = await sandbox.runCommand({
        sandboxId,
        command: "npm audit --json",
        timeout: 120_000,
      }).catch(() => ({ stdout: "" }));

      if (after.stdout) {
        try {
          const afterParsed = JSON.parse(after.stdout) as AuditJson;
          const remaining = new Set(Object.keys(afterParsed.vulnerabilities ?? {}));
          for (const pkg of Object.keys(vulns)) {
            if (!remaining.has(pkg)) fixedPackages.push(pkg);
          }
        } catch {
          // ignore
        }
      }
    }

    return {
      findings: findings.filter((f) => !fixedPackages.includes(f.ruleId?.replace(/^npm:/, "") ?? "")),
      autoFixed: fixedPackages.length > 0,
      fixedPackages,
      summary,
    };
  } catch (err) {
    return {
      findings: [
        {
          source: "npm_audit",
          severity: "warning",
          file: "package.json",
          line: 1,
          snippet: "",
          message: `npm audit failed: ${err instanceof Error ? err.message : String(err)}`,
          fingerprint: fingerprint("__audit__", "run-error"),
        },
      ],
      autoFixed: false,
      fixedPackages: [],
      summary,
    };
  }
}

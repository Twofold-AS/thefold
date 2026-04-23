// --- Security suppressions (Commit 36) ---
// Scans source for `// thefold-security-ignore CWE-XX: reason` directives and
// returns which findings they silence. Every recognised suppression is
// persisted to the audit table so we can prove, retroactively, who silenced
// what and why.

import log from "encore.dev/log";
import { db } from "./db";
import type { Finding } from "./types";

const SUPPRESS_PATTERN =
  /\/\/\s*thefold-security-ignore\s+([A-Z]+-\d+|[\w-]+)\s*:\s*(.+?)$/i;

export interface SuppressionDirective {
  cweOrRuleId: string;
  reason: string;
  /** Line number the directive appears on (1-indexed). Silences the line below. */
  directiveLine: number;
}

/** Extract every `// thefold-security-ignore ...` directive from a file. */
export function extractSuppressions(content: string): SuppressionDirective[] {
  const out: SuppressionDirective[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = SUPPRESS_PATTERN.exec(lines[i]);
    if (!m) continue;
    out.push({
      cweOrRuleId: m[1].toUpperCase(),
      reason: m[2].trim(),
      directiveLine: i + 1,
    });
  }
  return out;
}

/**
 * Partition findings into (active, suppressed). A finding is suppressed when
 * the line directly above matches its CWE or ruleId. Writes an audit row for
 * every suppression so traceability survives code edits.
 */
export async function applySuppressions(
  findings: Finding[],
  fileContents: Map<string, string>,
): Promise<{ active: Finding[]; suppressed: Finding[] }> {
  // Pre-index directives per file
  const byFile = new Map<string, SuppressionDirective[]>();
  for (const [path, content] of fileContents) {
    byFile.set(path, extractSuppressions(content));
  }

  const active: Finding[] = [];
  const suppressed: Finding[] = [];

  for (const f of findings) {
    const directives = byFile.get(f.file) ?? [];
    // Directive must be on the line immediately above the finding.
    const matched = directives.find(
      (d) =>
        d.directiveLine === f.line - 1 &&
        (d.cweOrRuleId === f.cwe?.toUpperCase() ||
          d.cweOrRuleId === f.ruleId?.toUpperCase()),
    );
    if (matched) {
      suppressed.push(f);
      // Audit log — idempotent on (finding_hash) via fingerprint uniqueness.
      try {
        await db.exec`
          INSERT INTO security_suppressions
            (finding_hash, cwe, rule_id, file, line, reason, suppressed_by, source)
          VALUES (
            ${f.fingerprint}, ${f.cwe ?? null}, ${f.ruleId ?? null},
            ${f.file}, ${f.line}, ${matched.reason},
            'inline-comment', 'inline'
          )
        `;
      } catch (err) {
        log.warn("suppression audit insert failed", {
          error: err instanceof Error ? err.message : String(err),
          fingerprint: f.fingerprint,
        });
      }
    } else {
      active.push(f);
    }
  }

  return { active, suppressed };
}

/**
 * Manual superadmin override — logs a specific finding as overridden.
 * Used by /agent/review/override-security.
 */
export async function recordManualOverride(
  findings: Finding[],
  reason: string,
  suppressedBy: string,
): Promise<void> {
  for (const f of findings) {
    try {
      await db.exec`
        INSERT INTO security_suppressions
          (finding_hash, cwe, rule_id, file, line, reason, suppressed_by, source)
        VALUES (
          ${f.fingerprint}, ${f.cwe ?? null}, ${f.ruleId ?? null},
          ${f.file}, ${f.line}, ${reason},
          ${suppressedBy}, 'manual_override'
        )
      `;
    } catch (err) {
      log.warn("manual override audit insert failed", {
        error: err instanceof Error ? err.message : String(err),
        fingerprint: f.fingerprint,
      });
    }
  }
}

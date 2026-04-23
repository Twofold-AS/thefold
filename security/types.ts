// --- Security service types (Fase F) ---
// Shared contract between scanner.ts, secrets.ts, npm-audit.ts, sub-agent
// output, and the orchestrator. Every finding collapses to this shape so the
// blocker rule (§27.5 — alt blokkerer) can treat them uniformly.

export type Severity = "critical" | "high" | "medium" | "low" | "warning";

export type FindingSource = "regex" | "ai" | "secrets" | "npm_audit";

export interface Finding {
  source: FindingSource;
  /** CWE identifier, e.g. "CWE-79". Not set for secret/dep findings. */
  cwe?: string;
  severity: Severity;
  file: string;
  line: number;
  col?: number;
  /** Original source snippet that triggered the finding */
  snippet: string;
  /** Human-readable explanation */
  message: string;
  /** Concrete remediation suggestion */
  suggestedFix?: string;
  /** SHA-256 fingerprint used for suppression matching + audit log */
  fingerprint: string;
  /** Optional rule ID (regex pattern name, advisory id, etc.) */
  ruleId?: string;
}

/** A scan request covers a batch of files produced by the agent */
export interface ScanFilesRequest {
  files: Array<{ path: string; content: string }>;
  /** Optional sandboxId — lets the scanner run npm audit against it */
  sandboxId?: string;
  /** Include AI sub-agent findings (slower + costs tokens) */
  runAiAudit?: boolean;
  /** Include npm audit (requires sandboxId) */
  runNpmAudit?: boolean;
}

export interface ScanFilesResponse {
  findings: Finding[];
  /** True when §27.5 blocker rule triggers (ANY finding present after suppressions) */
  blocked: boolean;
  blockerReason?: string;
  /** Findings that matched a suppression comment — tracked but not blocking */
  suppressed: Finding[];
  stats: {
    filesScanned: number;
    regexHits: number;
    secretHits: number;
    aiHits: number;
    npmAuditHits: number;
    suppressedCount: number;
  };
}

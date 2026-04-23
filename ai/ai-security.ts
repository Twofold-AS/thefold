// --- AI security audit endpoint (Commit 32) ---
// Dedicated endpoint that invokes the "security" sub-agent role against a
// batch of files and normalises the output into the shared Finding[] shape
// used by the security service.
//
// Kept here (inside ai service) because the sub-agent registry lives in
// ai/sub-agents.ts and it's natural for an AI-specific handler to bundle
// the role + prompt + model selection together.

import { api } from "encore.dev/api";
import log from "encore.dev/log";
import * as crypto from "crypto";
import { callAIWithFallback } from "./call";
import { getModelForRole, getSystemPromptForRole, getMaxTokensForRole } from "./sub-agents";
import { sanitize } from "./sanitize";

type Severity = "critical" | "high" | "medium" | "low" | "warning";
type FindingSource = "regex" | "ai" | "secrets" | "npm_audit";

interface Finding {
  source: FindingSource;
  cwe?: string;
  severity: Severity;
  file: string;
  line: number;
  col?: number;
  snippet: string;
  message: string;
  suggestedFix?: string;
  fingerprint: string;
  ruleId?: string;
}

interface AiSecurityAuditRequest {
  files: Array<{ path: string; content: string }>;
}

interface AiSecurityAuditResponse {
  findings: Finding[];
  tokensUsed: number;
  costUsd: number;
}

// Extended prompt instruction — we want the sub-agent to emit the concrete
// Finding[] shape, not the free-form vulnerability JSON from sub-agents.ts.
const OUTPUT_CONTRACT = `
Output ONLY a JSON object matching this exact shape (no markdown fences, no prose):
{
  "findings": [
    {
      "cwe": "CWE-XX (e.g. CWE-79, CWE-89, CWE-200) or null if not applicable",
      "severity": "critical" | "high" | "medium" | "low" | "warning",
      "file": "<file path>",
      "line": <1-indexed line number>,
      "snippet": "<the offending source line, max 200 chars>",
      "message": "<one-sentence description of the issue>",
      "suggestedFix": "<concrete remediation>",
      "ruleId": "<short identifier, e.g. 'missing-auth-check'>"
    }
  ]
}
Return {"findings": []} when the code is clean. Only include FINDINGS — not
information, not summaries. Focus on issues the regex scanner would miss:
- Missing authentication / authorization checks on endpoints
- Ownership checks missing before reading/writing user data (IDOR)
- Race conditions or TOCTOU bugs
- Insecure default configurations
- Cryptographic anti-patterns (weak key derivation, missing IVs, reused nonces)
- Business-logic auth bypasses
- Info leakage via error responses or logs`;

function fingerprint(f: Omit<Finding, "fingerprint" | "source">): string {
  return crypto
    .createHash("sha256")
    .update(`ai|${f.cwe ?? ""}|${f.file}|${f.line}|${f.snippet.slice(0, 120)}`)
    .digest("hex")
    .slice(0, 16);
}

function parseAiFindings(
  raw: string,
  files: Array<{ path: string }>,
): Finding[] {
  const stripped = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: { findings?: unknown };
  try {
    parsed = JSON.parse(stripped);
  } catch {
    log.warn("ai security audit: unparseable output", { preview: raw.slice(0, 200) });
    return [];
  }

  if (!parsed || !Array.isArray(parsed.findings)) return [];
  const validPaths = new Set(files.map((f) => f.path));

  const out: Finding[] = [];
  for (const item of parsed.findings as Array<Record<string, unknown>>) {
    const file = typeof item.file === "string" ? item.file : "";
    if (!file || !validPaths.has(file)) continue;
    const line = Number.isFinite(item.line) ? Number(item.line) : 1;
    const severity = (["critical", "high", "medium", "low", "warning"] as const).includes(
      (item.severity as Severity) ?? "medium",
    )
      ? ((item.severity as Severity) ?? "medium")
      : "medium";
    const snippet = typeof item.snippet === "string" ? item.snippet.slice(0, 200) : "";
    const base = {
      cwe: typeof item.cwe === "string" ? item.cwe : undefined,
      severity,
      file,
      line,
      snippet,
      message:
        typeof item.message === "string" ? item.message : "AI-flagged issue",
      suggestedFix:
        typeof item.suggestedFix === "string" ? item.suggestedFix : undefined,
      ruleId: typeof item.ruleId === "string" ? item.ruleId : undefined,
    };
    out.push({
      source: "ai",
      ...base,
      fingerprint: fingerprint(base),
    });
  }
  return out;
}

export const aiSecurityAudit = api(
  { method: "POST", path: "/ai/security-audit", expose: false },
  async (req: AiSecurityAuditRequest): Promise<AiSecurityAuditResponse> => {
    const files = (req.files ?? []).map((f) => ({
      path: f.path,
      content: sanitize(f.content, { maxLength: 20_000 }),
    }));

    if (files.length === 0) {
      return { findings: [], tokensUsed: 0, costUsd: 0 };
    }

    const systemPrompt = getSystemPromptForRole("security") + "\n\n" + OUTPUT_CONTRACT;
    const userPrompt =
      `Audit the following files for security vulnerabilities.\n\n` +
      files
        .map(
          (f) =>
            `--- ${f.path} ---\n${f.content.slice(0, 8_000)}${f.content.length > 8_000 ? "\n... [truncated]" : ""}`,
        )
        .join("\n\n");

    const response = await callAIWithFallback({
      model: getModelForRole("security"),
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: getMaxTokensForRole("security"),
    });

    const findings = parseAiFindings(response.content, files);

    log.info("ai security audit complete", {
      filesScanned: files.length,
      findings: findings.length,
      tokensUsed: response.tokensUsed,
    });

    return {
      findings,
      tokensUsed: response.tokensUsed,
      costUsd: response.costEstimate?.totalCost ?? 0,
    };
  },
);

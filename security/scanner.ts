// --- Security scanner (Commit 31) ---
// Regex-based CWE pattern matching. Fast, catches the obvious classes of bugs
// that LLMs still produce (template-string SQL, dangerouslySetInnerHTML, eval,
// child_process with interpolated user input, ...).
//
// Every hit becomes a Finding that the orchestrator treats as blocking per
// §27.5. Suppression via `// thefold-security-ignore CWE-XX: reason` comment
// on the line ABOVE (handled in security.ts).

import * as crypto from "crypto";
import type { Finding, Severity } from "./types";

interface Rule {
  id: string;
  cwe: string;
  severity: Severity;
  pattern: RegExp;
  message: string;
  suggestedFix?: string;
  /** Optional file-name filter — only run this rule against matching paths */
  fileFilter?: RegExp;
}

// Rules. Keep each pattern well-scoped — broad matches generate noise and
// the blocker rule (§27.5) means every false positive stops a PR.
const RULES: Rule[] = [
  {
    id: "xss-dangerouslySetInnerHTML",
    cwe: "CWE-79",
    severity: "high",
    pattern: /dangerouslySetInnerHTML\s*=\s*\{/,
    message: "React dangerouslySetInnerHTML renders raw HTML without escaping.",
    suggestedFix:
      "Use DOMPurify to sanitise or switch to rendering text content directly.",
    fileFilter: /\.(tsx|jsx)$/,
  },
  {
    id: "xss-innerhtml-assignment",
    cwe: "CWE-79",
    severity: "high",
    pattern: /\.innerHTML\s*=\s*(?!["'`]\s*["'`])/,
    message: "Direct innerHTML assignment bypasses the browser's XSS protections.",
    suggestedFix:
      "Use textContent for plain text, or build DOM nodes with createElement.",
  },
  {
    id: "sql-template-string-injection",
    cwe: "CWE-89",
    severity: "critical",
    pattern:
      /(?:\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b[^;`'"]*\$\{)|(?:\$\{[^}]+\}[^;`'"]*\b(?:FROM|WHERE|INSERT|UPDATE|DELETE)\b)/i,
    message:
      "Template string interpolation inside a SQL statement — risk of SQL injection.",
    suggestedFix:
      "Use Encore.ts db.query`...` tagged templates which parametrise automatically.",
    fileFilter: /\.(ts|tsx|js|jsx)$/,
  },
  {
    id: "command-injection-exec-interp",
    cwe: "CWE-78",
    severity: "critical",
    pattern: /(?:execSync|exec|spawnSync|spawn)\s*\(\s*[`"']?[^)]*\$\{/,
    message:
      "child_process call built from interpolated input — command injection risk.",
    suggestedFix:
      "Pass arguments as an array (execFile(cmd, [...args])) instead of a shell string.",
  },
  {
    id: "code-injection-eval",
    cwe: "CWE-94",
    severity: "critical",
    pattern: /\beval\s*\(|new\s+Function\s*\(/,
    message: "eval/new Function evaluates arbitrary source at runtime.",
    suggestedFix:
      "Replace with a parser or lookup table. Never eval user-provided strings.",
  },
  {
    id: "path-traversal-dotdot",
    cwe: "CWE-22",
    severity: "high",
    pattern: /\.\.\/\.\.\/|\.\.\\\\\.\.\\\\/,
    message: "Suspicious ../../ traversal in a hardcoded path.",
    suggestedFix:
      "Resolve paths with path.resolve() and validate against an allow-list root.",
  },
  {
    id: "path-traversal-user-input",
    cwe: "CWE-22",
    severity: "high",
    pattern: /path\.(?:join|resolve)\s*\([^)]*req\.(?:body|params|query|headers)/,
    message: "File path built from request input — path traversal risk.",
    suggestedFix:
      "Whitelist allowed filenames or confine with path.relative + a root check.",
  },
  {
    id: "fs-user-input",
    cwe: "CWE-22",
    severity: "high",
    pattern: /fs\.(?:readFile|writeFile|unlink|rm|readdir)[A-Za-z]*\s*\([^)]*req\.(?:body|params|query|headers)/,
    message: "fs operation uses raw request input as path.",
    suggestedFix: "Validate against an allow-list before fs access.",
  },
  {
    id: "deserialization-user-input",
    cwe: "CWE-502",
    severity: "medium",
    pattern: /JSON\.parse\s*\(\s*req\.(?:body|params|query|headers)/,
    message:
      "JSON.parse directly on request input — validate shape before trusting.",
    suggestedFix:
      "Parse through a Zod schema or validate structure before using the result.",
  },
  {
    id: "ssrf-fetch-user-input",
    cwe: "CWE-918",
    severity: "high",
    pattern: /(?:fetch|axios(?:\.get|\.post|\.put|\.delete|\.request)?)\s*\([^)]*req\.(?:body|params|query|headers)/,
    message: "Outbound HTTP call built from request input — SSRF risk.",
    suggestedFix:
      "Validate URL against an allow-list; block private/loopback addresses.",
  },
  {
    id: "info-exposure-error-stack",
    cwe: "CWE-200",
    severity: "low",
    pattern: /res\.(?:send|json|status\([^)]*\)\.(?:send|json))\s*\([^)]*\.(?:stack|message)\s*[)\}]/,
    message: "Error stack or message returned to client — information disclosure.",
    suggestedFix:
      "Log server-side via log.error and return a generic error code to the client.",
  },
  {
    id: "hardcoded-credential",
    cwe: "CWE-798",
    severity: "critical",
    pattern:
      /(?:password|passwd|api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token)\s*[:=]\s*["'`][A-Za-z0-9+/=_\-]{8,}["'`]/i,
    message: "Hardcoded credential pattern — move to secret() or env-only config.",
    suggestedFix:
      "Store in Encore.ts secret() and reference via the secret helper.",
  },
  {
    id: "weak-hash-md5",
    cwe: "CWE-327",
    severity: "medium",
    pattern: /createHash\s*\(\s*["'`]md5["'`]\s*\)|createHash\s*\(\s*["'`]sha1["'`]\s*\)/,
    message: "md5/sha1 is not collision-resistant; avoid for auth or signing.",
    suggestedFix: "Use sha256 or stronger (sha512, bcrypt for passwords).",
  },
  {
    id: "insecure-random",
    cwe: "CWE-338",
    severity: "medium",
    pattern: /Math\.random\s*\(\s*\).*(?:token|secret|password|otp|sessionId)/i,
    message: "Math.random is not cryptographically secure.",
    suggestedFix:
      "Use crypto.randomBytes() or crypto.randomUUID() for security-critical values.",
  },
];

function fingerprint(rule: Rule, file: string, line: number, snippet: string): string {
  return crypto
    .createHash("sha256")
    .update(`${rule.cwe}|${rule.id}|${file}|${line}|${snippet.trim()}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Run every rule against one file's content. Returns an array of Findings
 * (may be empty). Caller handles suppression / blocker evaluation.
 */
export function scanFile(path: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (const rule of RULES) {
    if (rule.fileFilter && !rule.fileFilter.test(path)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = rule.pattern.exec(line);
      if (!match) continue;

      findings.push({
        source: "regex",
        cwe: rule.cwe,
        severity: rule.severity,
        file: path,
        line: i + 1,
        col: match.index + 1,
        snippet: line.slice(0, 200),
        message: rule.message,
        suggestedFix: rule.suggestedFix,
        fingerprint: fingerprint(rule, path, i + 1, line),
        ruleId: rule.id,
      });
    }
  }

  return findings;
}

/** Batch wrapper for orchestrator — scans N files in one call */
export function scanFiles(
  files: Array<{ path: string; content: string }>,
): Finding[] {
  const all: Finding[] = [];
  for (const f of files) {
    all.push(...scanFile(f.path, f.content));
  }
  return all;
}

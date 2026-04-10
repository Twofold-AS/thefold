import log from "encore.dev/log";
import { agentReviewEvents } from "./event-bus";

// --- Types ---

export type FindingSeverity = "error" | "warning" | "info";

export interface ReviewFinding {
  /** Rule that triggered this finding */
  rule: string;
  severity: FindingSeverity;
  message: string;
  file: string;
  line?: number;
}

export interface SelfReviewResult {
  taskId: string;
  findings: ReviewFinding[];
  /** Highest severity across all findings */
  highestSeverity: FindingSeverity | null;
  /** true if any "error" findings were found */
  hasBlockingIssues: boolean;
}

export interface ReviewableFile {
  path: string;
  content: string;
}

// --- Rules ---

type ReviewRule = {
  id: string;
  severity: FindingSeverity;
  check: (file: ReviewableFile) => ReviewFinding[];
};

const RULES: ReviewRule[] = [
  // Unused imports: detect imports where the symbol never appears in the rest of the file
  {
    id: "unused-imports",
    severity: "warning",
    check(file) {
      const findings: ReviewFinding[] = [];
      const lines = file.content.split("\n");
      lines.forEach((line, idx) => {
        const importMatch = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/);
        if (!importMatch) return;
        const symbols = importMatch[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()!.trim());
        for (const sym of symbols) {
          if (!sym) continue;
          // Count occurrences outside the import line itself
          const rest = file.content.replace(line, "");
          // Simple word-boundary check — avoids false positives from substrings
          const used = new RegExp(`\\b${sym}\\b`).test(rest);
          if (!used) {
            findings.push({
              rule: "unused-imports",
              severity: "warning",
              message: `Unused import: '${sym}'`,
              file: file.path,
              line: idx + 1,
            });
          }
        }
      });
      return findings;
    },
  },

  // Bare catch blocks: catch(e) {} with empty body
  {
    id: "empty-catch",
    severity: "warning",
    check(file) {
      const findings: ReviewFinding[] = [];
      const lines = file.content.split("\n");
      lines.forEach((line, idx) => {
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
          findings.push({
            rule: "empty-catch",
            severity: "warning",
            message: "Empty catch block — errors are silently swallowed",
            file: file.path,
            line: idx + 1,
          });
        }
      });
      return findings;
    },
  },

  // Unhandled promise: .then() / async calls not awaited at top level
  {
    id: "unhandled-promise",
    severity: "warning",
    check(file) {
      const findings: ReviewFinding[] = [];
      const lines = file.content.split("\n");
      lines.forEach((line, idx) => {
        // Detect floating .then() / .catch() chains assigned to nothing
        const trimmed = line.trim();
        if (
          /^[a-zA-Z0-9_$.]+\.(then|catch)\(/.test(trimmed) &&
          !trimmed.startsWith("return") &&
          !trimmed.startsWith("const") &&
          !trimmed.startsWith("let") &&
          !trimmed.startsWith("await") &&
          !trimmed.startsWith("/") &&
          !trimmed.startsWith("*")
        ) {
          findings.push({
            rule: "unhandled-promise",
            severity: "warning",
            message: "Potentially unhandled promise — consider adding .catch() or await",
            file: file.path,
            line: idx + 1,
          });
        }
      });
      return findings;
    },
  },

  // Hardcoded secrets: API keys, tokens, passwords in string literals
  {
    id: "hardcoded-secrets",
    severity: "error",
    check(file) {
      const findings: ReviewFinding[] = [];
      const patterns = [
        { re: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}/i, label: "API key" },
        { re: /(?:secret|password|passwd|token)\s*[:=]\s*["'][^"']{8,}/i, label: "Secret/password" },
        { re: /sk-[A-Za-z0-9]{20,}/, label: "OpenAI API key" },
        { re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/, label: "Bearer token" },
        { re: /ghp_[A-Za-z0-9]{36,}/, label: "GitHub personal access token" },
      ];
      const lines = file.content.split("\n");
      lines.forEach((line, idx) => {
        // Skip comments
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        for (const { re, label } of patterns) {
          if (re.test(line)) {
            findings.push({
              rule: "hardcoded-secrets",
              severity: "error",
              message: `Possible hardcoded ${label} detected`,
              file: file.path,
              line: idx + 1,
            });
          }
        }
      });
      return findings;
    },
  },

  // Missing TypeScript types: explicit `any` usage
  {
    id: "explicit-any",
    severity: "warning",
    check(file) {
      if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) return [];
      const findings: ReviewFinding[] = [];
      const lines = file.content.split("\n");
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        // Match `: any` or `as any` or `<any>` — but not `// eslint-disable-line @typescript-eslint/no-explicit-any`
        if (/(?::\s*any\b|as\s+any\b|<any>)/.test(line) && !line.includes("no-explicit-any")) {
          findings.push({
            rule: "explicit-any",
            severity: "warning",
            message: "Explicit `any` type — prefer a specific type or `unknown`",
            file: file.path,
            line: idx + 1,
          });
        }
      });
      return findings;
    },
  },
];

// --- Core function ---

/**
 * Run static self-review checks on a set of generated files.
 * Emits an AgentReviewEvent via the event bus after completion.
 */
export async function runSelfReview(
  taskId: string,
  files: ReviewableFile[],
): Promise<SelfReviewResult> {
  const allFindings: ReviewFinding[] = [];

  for (const file of files) {
    // Only review source files
    if (!isSupportedFile(file.path)) continue;

    for (const rule of RULES) {
      try {
        const findings = rule.check(file);
        allFindings.push(...findings);
      } catch (err) {
        log.warn("Self-review rule failed", {
          rule: rule.id,
          file: file.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const highestSeverity = resolveHighestSeverity(allFindings);
  const hasBlockingIssues = allFindings.some(f => f.severity === "error");

  const result: SelfReviewResult = {
    taskId,
    findings: allFindings,
    highestSeverity,
    hasBlockingIssues,
  };

  log.info("Self-review complete", {
    taskId,
    filesReviewed: files.length,
    findings: allFindings.length,
    errors: allFindings.filter(f => f.severity === "error").length,
    warnings: allFindings.filter(f => f.severity === "warning").length,
  });

  // Publish to event bus (fire-and-forget — don't block task execution)
  if (allFindings.length > 0) {
    agentReviewEvents.publish({
      taskId,
      reviewId: `review-${taskId}-${Date.now()}`,
      findingCount: allFindings.length,
      highestSeverity: highestSeverity ?? "info",
      findings: allFindings.map(f => ({
        severity: f.severity,
        message: f.message,
        file: f.file,
        line: f.line,
        rule: f.rule,
      })),
      createdAt: new Date().toISOString(),
    }).catch(err => {
      log.warn("Failed to publish agent review event", {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return result;
}

// --- Helpers ---

function isSupportedFile(path: string): boolean {
  return (
    path.endsWith(".ts") ||
    path.endsWith(".tsx") ||
    path.endsWith(".js") ||
    path.endsWith(".jsx")
  );
}

function resolveHighestSeverity(findings: ReviewFinding[]): FindingSeverity | null {
  if (findings.some(f => f.severity === "error")) return "error";
  if (findings.some(f => f.severity === "warning")) return "warning";
  if (findings.length > 0) return "info";
  return null;
}

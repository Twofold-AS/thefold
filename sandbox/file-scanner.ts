export interface ScanResult {
  safe: boolean;
  warnings: string[];
}

// Patterns that indicate potentially dangerous code (advisory — not blocking)
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /process\.env\b/, message: "process.env usage (use Encore secrets instead)" },
  { pattern: /\beval\s*\(/, message: "eval() usage detected" },
  { pattern: /require\s*\(\s*['"]child_process['"]/, message: "child_process import" },
  { pattern: /\bexec\s*\(/, message: "exec() call detected" },
  { pattern: /DROP\s+TABLE\s+(?!IF\s+EXISTS)/i, message: "DROP TABLE without IF EXISTS" },
];

// Patterns that suggest hardcoded API keys (these set safe=false)
const API_KEY_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|apikey|secret[_-]?key)\s*[=:]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i,
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI key pattern
];

/**
 * Scan a single file for security issues.
 *
 * Returns safe=false only for critical issues (hardcoded API keys).
 * All other matches are advisory warnings — the write is NOT blocked.
 */
export function scanFile(filePath: string, content: string): ScanResult {
  const warnings: string[] = [];
  let safe = true;

  // Skip binary-looking content (heuristic: NUL bytes)
  if (content.includes("\x00")) {
    return { safe: true, warnings: [] };
  }

  // Check forbidden patterns (advisory)
  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(`${filePath}: ${message}`);
    }
  }

  // Check for hardcoded API keys (critical — sets safe=false)
  for (const pattern of API_KEY_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(`${filePath}: possible hardcoded API key detected`);
      safe = false;
    }
  }

  return { safe, warnings };
}

/**
 * Scan multiple files and aggregate results.
 *
 * Returns safe=false if ANY file has a critical issue.
 * Warnings are collected across all files.
 */
export function scanFiles(files: Array<{ path: string; content: string }>): ScanResult {
  const allWarnings: string[] = [];
  let allSafe = true;

  for (const file of files) {
    const result = scanFile(file.path, file.content);
    allWarnings.push(...result.warnings);
    if (!result.safe) {
      allSafe = false;
    }
  }

  return { safe: allSafe, warnings: allWarnings };
}

// --- Secret scanner (Commit 33) ---
// Regex patterns for provider-specific credential formats. Matches are treated
// as critical — a live API key leaking into a repo is worst-case.

import * as crypto from "crypto";
import type { Finding } from "./types";

interface SecretRule {
  id: string;
  label: string;
  pattern: RegExp;
}

// Patterns ordered roughly by specificity. PEM detection is separate so the
// multiline header is matched correctly.
const SECRET_RULES: SecretRule[] = [
  { id: "aws-access-key", label: "AWS access key ID", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "aws-secret-key", label: "AWS secret access key", pattern: /\b[A-Za-z0-9/+=]{40}\b(?=.*(?:secret|aws))/i },
  { id: "github-pat", label: "GitHub personal access token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: "gitlab-pat", label: "GitLab personal access token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { id: "stripe-secret", label: "Stripe secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
  { id: "stripe-restricted", label: "Stripe restricted key", pattern: /\brk_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
  { id: "anthropic-key", label: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{90,}\b/ },
  { id: "openai-key", label: "OpenAI API key", pattern: /\bsk-[A-Za-z0-9]{48}\b/ },
  { id: "openai-project-key", label: "OpenAI project key", pattern: /\bsk-proj-[A-Za-z0-9_-]{40,}\b/ },
  { id: "google-api-key", label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "twilio-sid", label: "Twilio account SID", pattern: /\bAC[a-f0-9]{32}\b/ },
  { id: "twilio-auth", label: "Twilio auth token", pattern: /\bSK[a-f0-9]{32}\b/ },
  { id: "sendgrid-key", label: "SendGrid API key", pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { id: "mailgun-key", label: "Mailgun API key", pattern: /\bkey-[a-f0-9]{32}\b/ },
  { id: "slack-bot-token", label: "Slack bot token", pattern: /\bxoxb-\d{10,}-\d{10,}-[A-Za-z0-9]{24,}\b/ },
  { id: "slack-webhook", label: "Slack incoming webhook", pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/ },
  { id: "discord-webhook", label: "Discord webhook", pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{50,}/ },
  { id: "fireworks-key", label: "Fireworks API key", pattern: /\bfw_[A-Za-z0-9]{16,}\b/ },
  { id: "moonshot-key", label: "Moonshot API key", pattern: /\bsk-[A-Za-z0-9]{40,60}\b(?=.*moonshot)/i },
  { id: "openrouter-key", label: "OpenRouter API key", pattern: /\bsk-or-[A-Za-z0-9-]{40,}\b/ },
  { id: "perplexity-key", label: "Perplexity API key", pattern: /\bpplx-[A-Za-z0-9]{40,}\b/ },
  { id: "voyage-key", label: "Voyage AI API key", pattern: /\bpa-[A-Za-z0-9_-]{40,}\b/ },
  { id: "resend-key", label: "Resend API key", pattern: /\bre_[A-Za-z0-9_-]{20,}\b/ },
  { id: "linear-key", label: "Linear API key", pattern: /\blin_api_[A-Za-z0-9_-]{40,}\b/ },
  { id: "postgres-dsn", label: "PostgreSQL DSN with credentials", pattern: /\bpostgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@/ },
  { id: "mysql-dsn", label: "MySQL DSN with credentials", pattern: /\bmysql:\/\/[^:@\s]+:[^@\s]+@/ },
  { id: "mongodb-srv", label: "MongoDB SRV connection string", pattern: /\bmongodb\+srv:\/\/[^:@\s]+:[^@\s]+@/ },
  { id: "jwt-token", label: "JSON Web Token literal", pattern: /\beyJ[A-Za-z0-9_=-]{10,}\.eyJ[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_=-]{10,}\b/ },
];

// Multiline patterns — scanned per file, not per line.
const MULTILINE_RULES: SecretRule[] = [
  {
    id: "pem-private-key",
    label: "PEM-encoded private key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  },
];

function fingerprint(ruleId: string, file: string, line: number): string {
  return crypto
    .createHash("sha256")
    .update(`secret|${ruleId}|${file}|${line}`)
    .digest("hex")
    .slice(0, 16);
}

function redact(snippet: string): string {
  // Never log the raw secret — keep first 6 chars as hint, replace rest with •.
  if (snippet.length <= 10) return "•".repeat(snippet.length);
  return snippet.slice(0, 6) + "•".repeat(Math.min(20, snippet.length - 6));
}

export function scanForSecrets(
  path: string,
  content: string,
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of SECRET_RULES) {
      const match = rule.pattern.exec(line);
      if (!match) continue;
      findings.push({
        source: "secrets",
        severity: "critical",
        file: path,
        line: i + 1,
        col: match.index + 1,
        snippet: redact(match[0]),
        message: `${rule.label} detected — remove and rotate the credential.`,
        suggestedFix:
          "Move to Encore.ts secret() helper. Rotate the key immediately — assume it has been exposed.",
        fingerprint: fingerprint(rule.id, path, i + 1),
        ruleId: rule.id,
      });
    }
  }

  // Multiline — single match per file is enough (PEM blocks are a few lines)
  for (const rule of MULTILINE_RULES) {
    const match = rule.pattern.exec(content);
    if (!match) continue;
    // Compute approximate line number from byte offset
    const prefix = content.slice(0, match.index);
    const line = prefix.split("\n").length;
    findings.push({
      source: "secrets",
      severity: "critical",
      file: path,
      line,
      snippet: "-----BEGIN ... (redacted)",
      message: `${rule.label} detected — never commit private keys.`,
      suggestedFix:
        "Remove the key block from source. Rotate the keypair. Store in secret() or an external KMS.",
      fingerprint: fingerprint(rule.id, path, line),
      ruleId: rule.id,
    });
  }

  return findings;
}

/** Batch wrapper for orchestrator */
export function scanFilesForSecrets(
  files: Array<{ path: string; content: string }>,
): Finding[] {
  const all: Finding[] = [];
  for (const f of files) {
    all.push(...scanForSecrets(f.path, f.content));
  }
  return all;
}

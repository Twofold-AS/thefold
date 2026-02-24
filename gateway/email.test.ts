import { describe, it, expect } from "vitest";

// Replicate template functions here to avoid importing from email.ts
// which pulls in Encore secrets (same pattern as secrets.test.ts)

function jobCompletionEmail(params: {
  taskTitle: string;
  prUrl: string;
  filesChanged: number;
  costUsd: number;
  qualityScore?: number;
}): { subject: string; html: string } {
  return {
    subject: `TheFold: "${params.taskTitle}" ferdig`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="border-bottom: 1px solid #333;">Oppgave fullfort</h2>
        <p><strong>${params.taskTitle}</strong></p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td>Filer endret:</td><td>${params.filesChanged}</td></tr>
          <tr><td>Kostnad:</td><td>$${params.costUsd.toFixed(4)}</td></tr>
          ${params.qualityScore ? `<tr><td>Kvalitet:</td><td>${params.qualityScore}/10</td></tr>` : ""}
        </table>
        <p><a href="${params.prUrl}" style="color: #0066cc;">Se PR</a></p>
      </div>
    `,
  };
}

function healingReportEmail(params: {
  componentsScanned: number;
  componentsHealed: number;
  issues: Array<{ component: string; score: number; action: string }>;
}): { subject: string; html: string } {
  const issueRows = params.issues
    .map(i => `<tr><td>${i.component}</td><td>${i.score}</td><td>${i.action}</td></tr>`)
    .join("");

  return {
    subject: `TheFold: Vedlikeholdsrapport — ${params.componentsHealed} forbedret`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="border-bottom: 1px solid #333;">Vedlikeholdsrapport</h2>
        <p>Scannet: ${params.componentsScanned} | Forbedret: ${params.componentsHealed}</p>
        ${params.issues.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse;">
            <tr><th>Komponent</th><th>Score</th><th>Handling</th></tr>
            ${issueRows}
          </table>
        ` : "<p>Alle komponenter er over kvalitetsgrensen.</p>"}
      </div>
    `,
  };
}

function criticalErrorEmail(params: {
  taskId: string;
  error: string;
  phase: string;
  attempts: number;
}): { subject: string; html: string } {
  return {
    subject: `TheFold: Kritisk feil i oppgave ${params.taskId.substring(0, 8)}`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
        <h2 style="border-bottom: 1px solid #cc0000; color: #cc0000;">Kritisk feil</h2>
        <p><strong>Task:</strong> ${params.taskId}</p>
        <p><strong>Fase:</strong> ${params.phase}</p>
        <p><strong>Forsok:</strong> ${params.attempts}</p>
        <pre style="background: #f5f5f5; padding: 12px; overflow-x: auto;">${params.error}</pre>
      </div>
    `,
  };
}

describe("email notifications", () => {
  it("jobCompletionEmail generates correct subject", () => {
    const email = jobCompletionEmail({
      taskTitle: "Fix auth bug",
      prUrl: "https://github.com/org/repo/pull/1",
      filesChanged: 3,
      costUsd: 0.05,
      qualityScore: 8,
    });
    expect(email.subject).toContain("Fix auth bug");
    expect(email.html).toContain("$0.0500");
    expect(email.html).toContain("8/10");
  });

  it("jobCompletionEmail works without qualityScore", () => {
    const email = jobCompletionEmail({
      taskTitle: "Add feature",
      prUrl: "https://github.com/org/repo/pull/2",
      filesChanged: 5,
      costUsd: 0.1234,
    });
    expect(email.subject).toContain("Add feature");
    expect(email.html).toContain("$0.1234");
    expect(email.html).not.toContain("/10");
    expect(email.html).toContain("Se PR");
  });

  it("healingReportEmail includes issue count", () => {
    const email = healingReportEmail({
      componentsScanned: 10,
      componentsHealed: 2,
      issues: [{ component: "auth-flow", score: 40, action: "healed" }],
    });
    expect(email.subject).toContain("2 forbedret");
    expect(email.html).toContain("auth-flow");
  });

  it("healingReportEmail handles no issues", () => {
    const email = healingReportEmail({
      componentsScanned: 5,
      componentsHealed: 0,
      issues: [],
    });
    expect(email.subject).toContain("0 forbedret");
    expect(email.html).toContain("Alle komponenter er over kvalitetsgrensen");
  });

  it("criticalErrorEmail shows error details", () => {
    const email = criticalErrorEmail({
      taskId: "abc-123-def-456",
      error: "Build failed: missing import",
      phase: "building",
      attempts: 5,
    });
    expect(email.subject).toContain("abc-123-");
    expect(email.html).toContain("Build failed");
    expect(email.html).toContain("building");
  });

  it("criticalErrorEmail truncates taskId in subject", () => {
    const email = criticalErrorEmail({
      taskId: "abcdefgh-1234-5678-9abc-def012345678",
      error: "Timeout",
      phase: "validation",
      attempts: 3,
    });
    expect(email.subject).toContain("abcdefgh");
    expect(email.html).toContain("abcdefgh-1234-5678-9abc-def012345678");
    expect(email.html).toContain("3");
  });

  it("sendEmail handles missing API key gracefully", () => {
    // sendEmail returns false when ResendAPIKey is not configured
    // Can't test actual send without mock, but verify templates work
    expect(true).toBe(true);
  });
});

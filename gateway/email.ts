import { secret } from "encore.dev/config";
import log from "encore.dev/log";

const ResendApiKey = secret("ResendAPIKey");
const TheFoldEmail = secret("TheFoldEmail");

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email via Resend API.
 * Fire-and-forget: logs warnings on failure, never throws.
 */
export async function sendEmail(req: EmailRequest): Promise<boolean> {
  let apiKey: string;
  let fromEmail: string;

  try {
    apiKey = ResendApiKey();
  } catch {
    log.warn("ResendAPIKey not configured, skipping email");
    return false;
  }

  try {
    fromEmail = TheFoldEmail();
  } catch {
    fromEmail = "TheFold <noreply@noreply.twofold.no>";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: req.to,
        subject: req.subject,
        html: req.html,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      log.warn("Email send failed", { to: req.to, status: res.status, error: errorText });
      return false;
    }

    log.info("Email sent", { to: req.to, subject: req.subject });
    return true;
  } catch (err) {
    log.warn("Email send error", {
      to: req.to,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// --- Email Templates ---

export function jobCompletionEmail(params: {
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

export function healingReportEmail(params: {
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

export function criticalErrorEmail(params: {
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

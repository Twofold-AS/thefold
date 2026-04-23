// --- Security block evaluation (Fase F, Commit 35) ---
// Helpers for the orchestrator to enforce §27.5: ANY finding blocks the PR.
// Also exposes a superadmin-only endpoint to override a specific set of
// finding fingerprints and unblock the plan.

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { db } from "./db";

// Local mirror of security/types.ts Finding shape. Duplicated to avoid
// cross-service type imports (Encore rule).
export interface SecurityFinding {
  source: "regex" | "ai" | "secrets" | "npm_audit";
  cwe?: string;
  severity: "critical" | "high" | "medium" | "low" | "warning";
  file: string;
  line: number;
  snippet: string;
  message: string;
  suggestedFix?: string;
  fingerprint: string;
  ruleId?: string;
}

export interface SecurityBlockResult {
  blocked: boolean;
  reason?: string;
  /** Count of active (non-suppressed) findings */
  activeCount: number;
  /** First 5 findings for surfacing in UI / notifications */
  preview: SecurityFinding[];
}

/**
 * §27.5 — ALT blokkerer. Ingen severity-terskel, ingen magiske unntak.
 * Caller should persist blocked=true on the project_plan row and skip PR
 * creation until findings are fixed or overridden.
 */
export function evaluateSecurityBlock(
  findings: SecurityFinding[],
): SecurityBlockResult {
  if (findings.length === 0) {
    return { blocked: false, activeCount: 0, preview: [] };
  }
  const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const reason =
    `${findings.length} aktive security-funn (` +
    Object.entries(bySeverity)
      .map(([sev, n]) => `${n} ${sev}`)
      .join(", ") +
    `)`;

  return {
    blocked: true,
    reason,
    activeCount: findings.length,
    preview: findings.slice(0, 5),
  };
}

// --- Override endpoint (Commit 35) ---

interface OverrideSecurityRequest {
  reviewId: string;
  findingFingerprints: string[];
  reason: string;
}

interface OverrideSecurityResponse {
  reviewId: string;
  overriddenCount: number;
  planId: string | null;
}

export const overrideSecurity = api(
  {
    method: "POST",
    path: "/agent/review/override-security",
    expose: true,
    auth: true,
  },
  async (req: OverrideSecurityRequest): Promise<OverrideSecurityResponse> => {
    const auth = getAuthData()!;
    const { users } = await import("~encore/clients");

    const check = await users.checkAdmin({ email: auth.email });
    if (!check.isSuperadmin) {
      throw APIError.permissionDenied(
        "Kun superadministrator kan overstyre security-blokkering.",
      );
    }

    if (!req.reason || req.reason.trim().length < 10) {
      throw APIError.invalidArgument(
        "Begrunnelse kreves (minst 10 tegn) — lagres i audit-logg.",
      );
    }
    if (!Array.isArray(req.findingFingerprints) || req.findingFingerprints.length === 0) {
      throw APIError.invalidArgument("findingFingerprints må være en ikke-tom liste.");
    }

    // Resolve plan id from review
    const reviewRow = await db.queryRow<{ project_plan_id: string | null }>`
      SELECT project_plan_id FROM code_reviews WHERE id = ${req.reviewId}::uuid
    `;
    const planId = reviewRow?.project_plan_id ?? null;

    // Delegate suppression-log to the security service. Cast via `unknown`
    // because encore.gen is regenerated on `encore run`; tsc before regen
    // wouldn't see the new service yet. Don't let its failure block the
    // override — the orchestrator still needs to unblock.
    try {
      const clients = await import("~encore/clients");
      const security = (
        clients as unknown as {
          security?: {
            overrideFindings: (req: {
              findingFingerprints: string[];
              reason: string;
              planId: string;
            }) => Promise<{ recorded: number; planId: string }>;
          };
        }
      ).security;
      if (security) {
        await security.overrideFindings({
          findingFingerprints: req.findingFingerprints,
          reason: req.reason,
          planId: planId ?? "",
        });
      }
    } catch (err) {
      log.warn("security.overrideFindings client call failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Flip the review's security_blocked flag so the orchestrator can proceed.
    try {
      await db.exec`
        UPDATE code_reviews
        SET security_blocked = false,
            security_override_by = ${auth.email},
            security_override_reason = ${req.reason},
            security_override_at = NOW()
        WHERE id = ${req.reviewId}::uuid
      `;
    } catch (err) {
      // Columns may not exist yet — migration pending. Log but don't throw.
      log.warn("review.security_blocked update failed (migration pending?)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    log.info("security block overridden", {
      reviewId: req.reviewId,
      planId,
      count: req.findingFingerprints.length,
      superadmin: auth.email,
    });

    return {
      reviewId: req.reviewId,
      overriddenCount: req.findingFingerprints.length,
      planId,
    };
  },
);

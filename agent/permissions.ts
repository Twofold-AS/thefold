import log from "encore.dev/log";
import { db } from "./db";

export type RiskLevel = "read" | "write" | "destructive";

export interface PermissionContext {
  userId?: string;
  repoOwner?: string;
  repoName?: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// Tier 1: Static risk map (O(1) lookup) — always available without DB
const STATIC_RISK_MAP: Record<string, RiskLevel> = {
  repo_read_file: "read",
  repo_get_tree: "read",
  repo_write_file: "write",
  repo_create_pr: "write",
  sandbox_destroy: "destructive",
  memory_store: "write",
  memory_search: "read",
};

// Tier 2: DB-backed policy rules — cached for 60 seconds
interface CachedRule {
  action: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  description: string | null;
}

let dbRulesCache: CachedRule[] | null = null;
let dbRulesCacheExpiry = 0;
const DB_CACHE_TTL_MS = 60_000;

async function loadDbRules(): Promise<CachedRule[]> {
  const now = Date.now();
  if (dbRulesCache && now < dbRulesCacheExpiry) {
    return dbRulesCache;
  }

  try {
    const rows = await db.query<{
      action: string;
      risk_level: string;
      requires_approval: boolean;
      description: string | null;
    }>`SELECT action, risk_level, requires_approval, description FROM permission_rules`;

    const rules: CachedRule[] = [];
    for await (const row of rows) {
      rules.push({
        action: row.action,
        riskLevel: row.risk_level as RiskLevel,
        requiresApproval: row.requires_approval,
        description: row.description,
      });
    }

    dbRulesCache = rules;
    dbRulesCacheExpiry = now + DB_CACHE_TTL_MS;
    return rules;
  } catch (err) {
    log.warn("permissions: failed to load DB rules, falling back to static map", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Get the risk level for an action.
 * Checks DB-backed rules first, falls back to static map, then defaults to "write".
 */
async function getRiskLevel(action: string): Promise<{ riskLevel: RiskLevel; requiresApproval: boolean }> {
  // Try DB rules first (more authoritative)
  const dbRules = await loadDbRules();
  const dbRule = dbRules.find((r) => r.action === action);
  if (dbRule) {
    return { riskLevel: dbRule.riskLevel, requiresApproval: dbRule.requiresApproval };
  }

  // Fall back to static map
  const staticLevel = STATIC_RISK_MAP[action];
  if (staticLevel) {
    return { riskLevel: staticLevel, requiresApproval: false };
  }

  // Unknown actions default to "write" (conservative)
  return { riskLevel: "write", requiresApproval: false };
}

/**
 * Check whether an action is permitted for the given context.
 *
 * Tier 1: Static risk map (O(1) lookup, always available)
 * Tier 2: DB-backed policy rules (60s cache, lazy-loaded)
 * Tier 3: Human approval (grunnmur — infrastructure ready, not enforced yet)
 *
 * Read actions are always allowed.
 * Write and destructive actions are allowed by default (grunnmur — no human-in-the-loop yet).
 * The requires_approval flag is logged for future enforcement.
 */
export async function checkPermission(
  action: string,
  ctx: PermissionContext,
): Promise<PermissionResult> {
  const { riskLevel, requiresApproval } = await getRiskLevel(action);

  // Read is always allowed — no restrictions
  if (riskLevel === "read") {
    return { allowed: true };
  }

  // Log destructive operations for observability
  if (riskLevel === "destructive") {
    log.warn("permissions: destructive action requested", {
      action,
      userId: ctx.userId,
      repoOwner: ctx.repoOwner,
      repoName: ctx.repoName,
    });
  }

  // Log actions that require approval (grunnmur: not enforced yet)
  if (requiresApproval) {
    log.info("permissions: action requires approval (grunnmur — not enforced)", {
      action,
      riskLevel,
      userId: ctx.userId,
    });
  }

  // Grunnmur: write and destructive are allowed for now
  // Future: check requiresApproval and block until human approves
  return { allowed: true };
}

/**
 * Invalidate the DB rules cache (useful in tests or after rule updates).
 */
export function invalidatePermissionCache(): void {
  dbRulesCache = null;
  dbRulesCacheExpiry = 0;
}

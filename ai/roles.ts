import log from "encore.dev/log";
import { db } from "./db";
import { selectOptimalModel } from "./router";

// --- Types ---

export type AgentRole =
  | "orchestrator"    // decomposes projects into phases/tasks — needs high reasoning
  | "planner"         // plans a single task, selects files — needs reasoning + code understanding
  | "coder"           // generates code file-by-file — needs high code quality
  | "reviewer"        // code review and quality — needs reasoning + code quality
  | "debugger"        // root cause analysis — needs high reasoning, fast
  | "tester"          // writes tests — needs moderate code, fast
  | "documenter";     // writes documentation — needs good language, fast

export interface RolePreference {
  role: AgentRole;
  modelId: string;
  priority: number;
  enabled: boolean;
}

// --- Role model cache (60s TTL) ---

const roleModelCache = new Map<AgentRole, { modelId: string; expiry: number }>();

/**
 * Select the best model for a given agent role.
 * First tries role-based preferences from the DB, then falls back to tag-based selection.
 */
export async function selectForRole(role: AgentRole): Promise<string> {
  const now = Date.now();
  const cached = roleModelCache.get(role);
  if (cached && cached.expiry > now) {
    return cached.modelId;
  }

  try {
    const row = await db.queryRow<{ model_id: string }>`
      SELECT model_id
      FROM ai_model_role_preferences
      WHERE role = ${role} AND enabled = true
      ORDER BY priority ASC
      LIMIT 1
    `;

    if (row) {
      roleModelCache.set(role, { modelId: row.model_id, expiry: now + 60_000 });
      return row.model_id;
    }
  } catch (err) {
    log.warn("selectForRole DB query failed, falling back to tag-based selection", {
      role,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback: map role to tag-based selection
  const roleToTag: Record<AgentRole, string> = {
    orchestrator: "planning",
    planner: "planning",
    coder: "coding",
    reviewer: "coding",
    debugger: "analysis",
    tester: "fast",
    documenter: "chat",
  };

  return selectOptimalModel(5, "auto", undefined, roleToTag[role]);
}

/**
 * Invalidate role cache (call after role preferences are updated).
 * If role is undefined, clears the entire cache.
 */
export function invalidateRoleCache(role?: AgentRole) {
  if (role) {
    roleModelCache.delete(role);
  } else {
    roleModelCache.clear();
  }
}

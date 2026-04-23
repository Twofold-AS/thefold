// --- System Settings ---
// Generic key/value settings table with focused helpers for the debug_mode
// flag. Designed for read-hot, write-cold access patterns: reads are cached
// in-process for 3 minutes, writes invalidate the local cache immediately.
//
// Schema in ai/migrations/9_system_settings.up.sql.
// Cross-service access: other services call ai.getDebugMode() via
// ~encore/clients and cache the result themselves (see each service's debug.ts).

import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { db } from "./db";

// --- Types ---

export interface GetDebugModeResponse {
  enabled: boolean;
}

export interface SetDebugModeRequest {
  enabled: boolean;
}

export interface SetDebugModeResponse {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

// --- In-process cache (3 min TTL) ---
// One entry is enough since we only gate a single boolean today. If this
// module grows to serve more keys, switch to Map<string, { value; expiresAt }>.

const CACHE_TTL_MS = 3 * 60 * 1000;
let debugCache: { value: boolean; expiresAt: number } | null = null;

/** Invalidate the local cache — called after a successful write. */
function invalidateDebugCache(): void {
  debugCache = null;
}

// --- Public helper (ai-service internal) ---

/**
 * Returns true when debug_mode is ON. Cached for 3 min to keep hot-loop
 * overhead negligible. Safe to call per-request.
 *
 * External services should call `ai.getDebugMode()` via ~encore/clients and
 * cache the result locally — this in-process cache is only shared within the
 * ai service instance.
 */
export async function isDebugEnabled(): Promise<boolean> {
  const now = Date.now();
  if (debugCache && debugCache.expiresAt > now) {
    return debugCache.value;
  }
  try {
    const row = await db.queryRow<{ value: unknown }>`
      SELECT value FROM system_settings WHERE key = 'debug_mode'
    `;
    const value = normalizeBool(row?.value);
    debugCache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (err) {
    log.warn("isDebugEnabled: db read failed, defaulting to false", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function normalizeBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return false;
}

// --- Encore endpoints ---

/**
 * Read the debug flag. Internal (no auth) so other services can consult it
 * cheaply; the payload is a single boolean, nothing sensitive.
 */
export const getDebugMode = api(
  { method: "GET", path: "/ai/system-settings/debug-mode", expose: false },
  async (): Promise<GetDebugModeResponse> => {
    const enabled = await isDebugEnabled();
    return { enabled };
  },
);

/**
 * Toggle debug mode. Exposed with auth so admins can flip it from the UI.
 */
export const setDebugMode = api(
  {
    method: "POST",
    path: "/ai/system-settings/debug-mode",
    expose: true,
    auth: true,
  },
  async (req: SetDebugModeRequest): Promise<SetDebugModeResponse> => {
    const { getAuthData } = await import("~encore/auth");
    const auth = getAuthData();
    const updatedBy =
      (auth as { email?: string; userID?: string } | null)?.email ||
      (auth as { userID?: string } | null)?.userID ||
      "system";

    const jsonValue = JSON.stringify(req.enabled);
    let row: { updated_at: Date; updated_by: string | null } | null = null;
    try {
      row = await db.queryRow<{ updated_at: Date; updated_by: string | null }>`
        INSERT INTO system_settings (key, value, updated_at, updated_by)
        VALUES ('debug_mode', ${jsonValue}::jsonb, NOW(), ${updatedBy})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = EXCLUDED.updated_at,
              updated_by = EXCLUDED.updated_by
        RETURNING updated_at, updated_by
      `;
    } catch (err) {
      log.error("setDebugMode: db write failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw APIError.internal("failed to update debug_mode");
    }

    invalidateDebugCache();
    log.info("debug_mode updated", { enabled: req.enabled, updatedBy });

    return {
      enabled: req.enabled,
      updatedAt: row?.updated_at.toISOString() ?? new Date().toISOString(),
      updatedBy: row?.updated_by ?? updatedBy,
    };
  },
);

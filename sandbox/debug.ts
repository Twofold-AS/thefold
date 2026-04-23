// --- Debug-mode helper (sandbox service) ---
// Thin cache around ai.getDebugMode() so hot paths gate console.log calls
// cheaply. Cache is in-process and lives for 3 minutes.

import log from "encore.dev/log";

const CACHE_TTL_MS = 3 * 60 * 1000;
let cache: { value: boolean; expiresAt: number } | null = null;

export async function isDebugEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  try {
    const { ai } = await import("~encore/clients");
    const { enabled } = await ai.getDebugMode();
    cache = { value: enabled, expiresAt: now + CACHE_TTL_MS };
    return enabled;
  } catch (err) {
    log.warn("isDebugEnabled: ai.getDebugMode failed, defaulting to false", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

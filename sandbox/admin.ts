// --- Admin helper (sandbox service) ---
// Thin cache around users.checkAdmin() so admin gates don't hit the users
// service on every call. Cache is in-process and lives for 3 minutes per email.

import log from "encore.dev/log";

const CACHE_TTL_MS = 3 * 60 * 1000;
interface Cached {
  role: "user" | "admin" | "superadmin";
  isAdmin: boolean;
  isSuperadmin: boolean;
  expiresAt: number;
}
const cache = new Map<string, Cached>();

export async function checkAdmin(email: string): Promise<{
  role: "user" | "admin" | "superadmin";
  isAdmin: boolean;
  isSuperadmin: boolean;
}> {
  const now = Date.now();
  const hit = cache.get(email);
  if (hit && hit.expiresAt > now) {
    return { role: hit.role, isAdmin: hit.isAdmin, isSuperadmin: hit.isSuperadmin };
  }
  try {
    const { users } = await import("~encore/clients");
    const result = await users.checkAdmin({ email });
    const entry: Cached = {
      role: result.role,
      isAdmin: result.isAdmin,
      isSuperadmin: result.isSuperadmin,
      expiresAt: now + CACHE_TTL_MS,
    };
    cache.set(email, entry);
    return { role: entry.role, isAdmin: entry.isAdmin, isSuperadmin: entry.isSuperadmin };
  } catch (err) {
    log.warn("ai.admin.checkAdmin failed, defaulting to 'user'", {
      error: err instanceof Error ? err.message : String(err),
      email,
    });
    return { role: "user", isAdmin: false, isSuperadmin: false };
  }
}

export async function isAdmin(email: string): Promise<boolean> {
  return (await checkAdmin(email)).isAdmin;
}

export async function isSuperadmin(email: string): Promise<boolean> {
  return (await checkAdmin(email)).isSuperadmin;
}

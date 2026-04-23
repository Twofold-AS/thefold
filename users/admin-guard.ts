// --- Admin guard (Fase E, Commit 28) ---
// Role-based guards for the flat user / admin / superadmin hierarchy.
// Exposes:
//   - Internal endpoint `checkAdmin({email})` — cross-service role lookup
//   - Internal endpoint `listUsersWithRoles()` — admin+ only, used by the UI
//   - Local helpers `requireAdmin`, `requireSuperadmin`, `isAdmin`,
//     `getUserRole` for use inside the users service itself
//
// Other services consult the role via `users.checkAdmin({email})` through
// ~encore/clients, with their own 3-min in-process cache (see each
// service's admin.ts).

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { db } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = "user" | "admin" | "superadmin";

export interface CheckAdminRequest {
  email: string;
}

export interface CheckAdminResponse {
  role: UserRole;
  isAdmin: boolean;
  isSuperadmin: boolean;
  exists: boolean;
}

export interface UserRoleRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ListUsersWithRolesResponse {
  users: UserRoleRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// In-service helpers (no network hop)
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserRole(email: string): Promise<UserRole | null> {
  const row = await db.queryRow<{ role: string }>`
    SELECT role FROM users WHERE email = ${email}
  `;
  if (!row) return null;
  if (row.role === "admin" || row.role === "superadmin" || row.role === "user") {
    return row.role;
  }
  return "user";
}

export async function isAdmin(email: string): Promise<boolean> {
  const role = await getUserRole(email);
  return role === "admin" || role === "superadmin";
}

export async function requireAdmin(email: string): Promise<void> {
  if (!(await isAdmin(email))) {
    throw APIError.permissionDenied("Krever administrator-tilgang.");
  }
}

export async function requireSuperadmin(email: string): Promise<void> {
  const role = await getUserRole(email);
  if (role !== "superadmin") {
    throw APIError.permissionDenied("Krever superadministrator-tilgang.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal endpoints — used by client wrappers in other services
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a user's role by email. Internal — exposed only to other services
 * via ~encore/clients. Cache in the caller, not here.
 */
export const checkAdmin = api(
  { method: "POST", path: "/users/admin/check", expose: false },
  async (req: CheckAdminRequest): Promise<CheckAdminResponse> => {
    if (!req.email) {
      return { role: "user", isAdmin: false, isSuperadmin: false, exists: false };
    }
    const role = await getUserRole(req.email);
    if (!role) {
      return { role: "user", isAdmin: false, isSuperadmin: false, exists: false };
    }
    return {
      role,
      isAdmin: role === "admin" || role === "superadmin",
      isSuperadmin: role === "superadmin",
      exists: true,
    };
  },
);

/**
 * List every user with their role. Admin+ only.
 */
export const listUsersWithRoles = api(
  { method: "GET", path: "/users/list-with-roles", expose: true, auth: true },
  async (): Promise<ListUsersWithRolesResponse> => {
    const auth = getAuthData()!;
    await requireAdmin(auth.email);

    const rows = await db.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      created_at: string;
      last_login_at: string | null;
    }>`
      SELECT id, email, name, role, created_at, last_login_at
      FROM users
      ORDER BY
        CASE role
          WHEN 'superadmin' THEN 0
          WHEN 'admin' THEN 1
          ELSE 2
        END,
        email ASC
    `;

    const users: UserRoleRow[] = [];
    for await (const r of rows) {
      const role: UserRole =
        r.role === "superadmin" || r.role === "admin" ? r.role : "user";
      users.push({
        id: r.id,
        email: r.email,
        name: r.name,
        role,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
      });
    }

    return { users };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Set-role endpoint (Commit 29) — superadmin only, protects last superadmin
// ─────────────────────────────────────────────────────────────────────────────

export interface SetRoleRequest {
  email: string;
  role: UserRole;
}

export interface SetRoleResponse {
  email: string;
  role: UserRole;
}

export const setRole = api(
  { method: "POST", path: "/users/set-role", expose: true, auth: true },
  async (req: SetRoleRequest): Promise<SetRoleResponse> => {
    const auth = getAuthData()!;
    await requireSuperadmin(auth.email);

    if (!["user", "admin", "superadmin"].includes(req.role)) {
      throw APIError.invalidArgument("role must be 'user', 'admin', or 'superadmin'");
    }

    const target = await db.queryRow<{ id: string; email: string; role: string }>`
      SELECT id, email, role FROM users WHERE email = ${req.email}
    `;
    if (!target) {
      throw APIError.notFound("user not found");
    }

    // Protect the last superadmin — self-demotion is blocked when it would
    // leave the system with zero superadmins.
    if (target.role === "superadmin" && req.role !== "superadmin") {
      const superadminCount = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM users WHERE role = 'superadmin'
      `;
      if ((superadminCount?.count ?? 0) <= 1) {
        throw APIError.failedPrecondition(
          "Kan ikke fjerne den siste superadministratoren. Utnevn en ny superadmin først.",
        );
      }
    }

    await db.exec`
      UPDATE users SET role = ${req.role} WHERE email = ${req.email}
    `;

    log.info("user role updated", {
      actor: auth.email,
      target: req.email,
      oldRole: target.role,
      newRole: req.role,
    });

    return { email: req.email, role: req.role };
  },
);

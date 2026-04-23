"use client";

// --- Users tab (Fase E, Commit 29) ---
// Admin+ only. Lists every user with their role and lets a superadmin change
// roles. The backend endpoint `/users/set-role` enforces the superadmin rule
// and blocks demoting the last superadmin — this component surfaces those
// errors rather than re-implementing the rules client-side.

import { useState, useEffect, useCallback } from "react";
import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import {
  listUsersWithRoles,
  setUserRole,
  type UserRole,
  type UserRoleRow,
} from "@/lib/api/auth";

interface UsersTabProps {
  currentUserRole: string;
  currentUserEmail: string;
}

const ROLE_LABEL: Record<UserRole, string> = {
  user: "Bruker",
  admin: "Admin",
  superadmin: "Superadmin",
};

export default function UsersTab({ currentUserRole, currentUserEmail }: UsersTabProps) {
  const [rows, setRows] = useState<UserRoleRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isSuperadmin = currentUserRole === "superadmin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsersWithRoles();
      setRows(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente brukere.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = async (email: string, role: UserRole) => {
    if (!isSuperadmin) return;
    setSavingEmail(email);
    setError(null);
    try {
      await setUserRole(email, role);
      setToast(`Rolle oppdatert for ${email}.`);
      setTimeout(() => setToast(null), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke oppdatere rollen.");
    } finally {
      setSavingEmail(null);
    }
  };

  if (loading && !rows) {
    return <Skeleton rows={5} />;
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: T.textMuted, marginBottom: S.md }}>
        Administrasjon av roller. Kun superadmin kan endre roller. Den siste
        superadministratoren kan ikke degraderes.
      </p>

      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 6,
            padding: S.sm,
            color: "#fca5a5",
            fontSize: 13,
            marginBottom: S.md,
          }}
        >
          {error}
        </div>
      )}

      {toast && (
        <div
          style={{
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            borderRadius: 6,
            padding: S.sm,
            color: "#86efac",
            fontSize: 13,
            marginBottom: S.md,
          }}
        >
          {toast}
        </div>
      )}

      <div
        style={{
          background: T.sidebar,
          border: `1px solid ${T.border}`,
          borderRadius: T.r,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.subtle }}>
              <th style={thStyle}>Navn</th>
              <th style={thStyle}>E-post</th>
              <th style={thStyle}>Rolle</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Handling</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => {
              const isSelf = row.email === currentUserEmail;
              const saving = savingEmail === row.email;
              return (
                <tr key={row.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={tdStyle}>{row.name}</td>
                  <td style={tdStyle}>{row.email}</td>
                  <td style={tdStyle}>
                    <Tag>{ROLE_LABEL[row.role]}</Tag>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {isSuperadmin ? (
                      <select
                        value={row.role}
                        disabled={saving}
                        onChange={(e) => handleChange(row.email, e.target.value as UserRole)}
                        style={{
                          background: T.subtle,
                          border: `1px solid ${T.border}`,
                          borderRadius: 6,
                          padding: "6px 10px",
                          fontSize: 12,
                          color: T.text,
                          fontFamily: T.sans,
                          outline: "none",
                          cursor: saving ? "wait" : "pointer",
                        }}
                      >
                        <option value="user">Bruker</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                    ) : (
                      <span style={{ color: T.textMuted, fontSize: 12 }}>
                        {isSelf ? "Deg selv" : "Kun superadmin"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(rows ?? []).length === 0 && !loading && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: T.textMuted }}>
                  Ingen brukere funnet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: S.md, display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={() => load()} disabled={loading}>
          {loading ? "Laster..." : "Oppdater liste"}
        </Btn>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: `${S.sm}px ${S.md}px`,
  fontSize: 11,
  fontWeight: 500,
  color: T.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: `${S.sm}px ${S.md}px`,
  color: T.text,
};

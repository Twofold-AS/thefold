"use client";

import { T, S } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { apiFetch } from "@/lib/api/client";

interface AuditEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  actionType: string;
  details: Record<string, unknown>;
  success: boolean | null;
  errorMessage: string | null;
}

export default function AuditPage() {
  const { data, loading } = useApiData(
    () => apiFetch<{ entries: AuditEntry[] }>("/agent/audit", { method: "GET" }),
    [],
  );

  const entries: AuditEntry[] = data?.entries ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.xl, paddingTop: 0, paddingBottom: S.xxl }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, margin: 0 }}>Audit logg</h1>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>
          Alle handlinger utført av agenten med tidsstempel og resultat.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {loading ? (
          <div style={{ padding: S.xl, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
            Laster audit logg...
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: S.xl, textAlign: "center", color: T.textMuted, fontSize: 13, border: `1px solid ${T.border}`, borderRadius: T.r }}>
            Ingen audit-hendelser ennå.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                border: `1px solid ${T.border}`,
                borderRadius: 0,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S.md, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: entry.success === true ? T.success : entry.success === false ? T.error : T.textFaint,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.actionType}
                  </div>
                  {entry.errorMessage && (
                    <div style={{ fontSize: 11, color: T.error, marginTop: 2 }}>{entry.errorMessage}</div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: S.lg, color: T.textMuted, fontSize: 12, fontFamily: T.mono, flexShrink: 0 }}>
                <span>{entry.sessionId?.slice(0, 8)}</span>
                <span>{new Date(entry.timestamp).toLocaleString("nb-NO")}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

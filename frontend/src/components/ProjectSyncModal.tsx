"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { X, Code as CodeIcon, Github, ExternalLink } from "lucide-react";
import { T } from "@/lib/tokens";
import PlatformIcon from "@/components/icons/PlatformIcon";
import {
  getGithubSyncData,
  linkRepo,
  unlinkRepo,
  type GithubSyncRow,
  type TFProjectType,
} from "@/lib/api";

interface ProjectSyncModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a link/unlink succeeds so sidebar can refresh. */
  onChange?: () => void;
}

type Selection = "code" | "framer" | "figma" | null;

export default function ProjectSyncModal({ open, onClose, onChange }: ProjectSyncModalProps) {
  const [rows, setRows] = useState<GithubSyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-row pending selection (before "Koble" is pressed).
  const [pendingSelection, setPendingSelection] = useState<Record<string, Selection>>({});
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGithubSyncData();
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente repos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleSelect = useCallback((fullName: string, sel: Selection, isLinked: boolean) => {
    if (isLinked) return; // must unlink first
    setPendingSelection((prev) => ({ ...prev, [fullName]: prev[fullName] === sel ? null : sel }));
  }, []);

  const handleLink = useCallback(async (fullName: string) => {
    const sel = pendingSelection[fullName];
    if (!sel) return;
    setBusyRow(fullName);
    try {
      const projectType: TFProjectType = sel === "code" ? "code" : sel === "framer" ? "framer" : "figma";
      await linkRepo(fullName, projectType);
      await load();
      setPendingSelection((prev) => ({ ...prev, [fullName]: null }));
      onChange?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kobling feilet");
    } finally {
      setBusyRow(null);
    }
  }, [pendingSelection, load, onChange]);

  const handleUnlink = useCallback(async (projectId: string) => {
    if (!confirm("Fjerne koblingen mellom dette repoet og prosjektet?")) return;
    setBusyRow(projectId);
    try {
      await unlinkRepo(projectId);
      await load();
      onChange?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Fjerning feilet");
    } finally {
      setBusyRow(null);
    }
  }, [load, onChange]);

  const handleOpen = useCallback((type: TFProjectType) => {
    const path = type === "framer" || type === "figma" || type === "framer_figma" ? "/designer" : "/cowork";
    if (typeof window !== "undefined") window.location.href = path;
  }, []);

  if (!open) return null;

  return (
    <div onClick={onClose} style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={dialog}>
        {/* Header */}
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Github size={20} color="#FFFFFF" />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: T.text }}>
              GitHub-kobling
            </h2>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={body}>
          {loading && (
            <div style={{ padding: 24, fontSize: 13, color: T.textMuted, textAlign: "center" }}>
              Laster repos...
            </div>
          )}
          {error && <div style={errorBox}>{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: 24, fontSize: 13, color: T.textMuted, textAlign: "center" }}>
              Ingen repos tilgjengelig for GitHub App-installasjonen.
            </div>
          )}
          {!loading && !error && rows.length > 0 && (
            <table style={table}>
              <thead>
                <tr style={theadRow}>
                  <th style={{ ...th, width: "35%" }}>Prosjekter</th>
                  <th style={{ ...th, width: "22%" }}>Kategori</th>
                  <th style={{ ...th, width: "28%" }}>Status</th>
                  <th style={{ ...th, width: "15%", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isLinked = r.linkedProject !== null;
                  const linkedType: Selection = isLinked
                    ? (r.linkedProject!.type === "framer_figma" || r.linkedProject!.type === "framer"
                        ? "framer"
                        : r.linkedProject!.type === "figma"
                          ? "figma"
                          : "code")
                    : null;
                  const pending = pendingSelection[r.fullName] ?? null;
                  const activeSel = isLinked ? linkedType : pending;

                  const status = isLinked
                    ? `Koblet til '${r.linkedProject!.name}' (${r.linkedProject!.type})`
                    : pending
                      ? `Klar til å kobles som ${pending}`
                      : "Ikke koblet";

                  const statusColor = isLinked
                    ? (T.success ?? "#22c55e")
                    : pending
                      ? T.accent
                      : T.textFaint;

                  const rowBusy = busyRow === r.fullName || (isLinked && busyRow === r.linkedProject!.id);

                  return (
                    <tr key={r.fullName} style={{ borderTop: `1px solid ${T.subtle}` }}>
                      <td style={td}>
                        <div style={{ fontSize: 13, color: T.text, fontWeight: 400 }}>
                          {r.name}
                        </div>
                        <div style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, marginTop: 2 }}>
                          {r.owner}/{r.name}
                        </div>
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <CategoryIcon
                            type="code"
                            active={activeSel === "code"}
                            disabled={isLinked || rowBusy}
                            onClick={() => handleSelect(r.fullName, "code", isLinked)}
                          />
                          <CategoryIcon
                            type="framer"
                            active={activeSel === "framer"}
                            disabled={isLinked || rowBusy}
                            onClick={() => handleSelect(r.fullName, "framer", isLinked)}
                          />
                          <CategoryIcon
                            type="figma"
                            active={activeSel === "figma"}
                            disabled={isLinked || rowBusy}
                            onClick={() => handleSelect(r.fullName, "figma", isLinked)}
                          />
                        </div>
                      </td>
                      <td style={{ ...td, fontSize: 11, color: statusColor }}>{status}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {isLinked ? (
                          <div style={{ display: "inline-flex", gap: 4 }}>
                            <button
                              onClick={() => handleOpen(r.linkedProject!.type)}
                              style={actionBtn}
                              title="Åpne prosjektet"
                              disabled={rowBusy}
                            >
                              <ExternalLink size={11} /> Åpne
                            </button>
                            <button
                              onClick={() => handleUnlink(r.linkedProject!.id)}
                              style={{ ...actionBtn, color: T.error ?? "#f87171" }}
                              disabled={rowBusy}
                            >
                              Fjern
                            </button>
                          </div>
                        ) : pending ? (
                          <button
                            onClick={() => handleLink(r.fullName)}
                            style={{ ...actionBtn, background: T.accent, color: "#fff", border: "none" }}
                            disabled={rowBusy}
                          >
                            {rowBusy ? "..." : "Koble"}
                          </button>
                        ) : (
                          <span style={{ fontSize: 10, color: T.textFaint }}>Velg kategori</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={footer}>
          <button onClick={onClose} style={closeBtn}>Lukk</button>
        </div>
      </div>
    </div>
  );
}

function CategoryIcon({
  type, active, disabled, onClick,
}: { type: "code" | "framer" | "figma"; active: boolean; disabled?: boolean; onClick: () => void }) {
  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 6,
    border: `1px solid ${active ? T.accent : T.border}`,
    background: active ? T.tabActive : "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled && !active ? 0.35 : 1,
    color: active ? T.accent : T.textMuted,
    padding: 0,
  };

  const iconNode =
    type === "code"
      ? <CodeIcon size={13} />
      : <PlatformIcon type={type} size={13} color={active ? T.accent : "#FFFFFF"} />;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={baseStyle}
      title={type === "code" ? "CoWork (kode)" : type === "framer" ? "Designer – Framer" : "Designer – Figma"}
    >
      {iconNode}
    </button>
  );
}

// --- styles ---

const backdrop: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20,
};

const dialog: CSSProperties = {
  background: T.popup ?? T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 14,
  width: "100%", maxWidth: 720, maxHeight: "88vh",
  display: "flex", flexDirection: "column", overflow: "hidden",
  fontFamily: T.sans,
  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

const header: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "20px 24px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
};

const iconBtn: CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer", color: T.textMuted,
  display: "inline-flex", alignItems: "center",
};

const body: CSSProperties = {
  flex: 1, overflowY: "auto", padding: "12px 24px",
};

const table: CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: T.sans,
};

const theadRow: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: T.textMuted,
  textTransform: "uppercase", letterSpacing: "0.05em",
};

const th: CSSProperties = {
  padding: "10px 8px", fontWeight: 600, textAlign: "left",
};

const td: CSSProperties = {
  padding: "10px 8px", verticalAlign: "middle",
};

const errorBox: CSSProperties = {
  padding: "10px 12px", fontSize: 12, color: T.error ?? "#f87171",
  background: "rgba(248,113,113,0.08)", borderRadius: 6, margin: "10px 0",
};

const actionBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "5px 10px",
  background: "transparent", border: `1px solid ${T.border}`,
  borderRadius: 6, color: T.textMuted,
  fontSize: 11, fontFamily: T.sans, cursor: "pointer",
};

const footer: CSSProperties = {
  display: "flex", justifyContent: "flex-end",
  padding: "12px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0,
};

const closeBtn: CSSProperties = {
  padding: "8px 14px",
  background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8,
  fontSize: 13, color: T.text, cursor: "pointer", fontFamily: T.sans,
};

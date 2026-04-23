"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type CSSProperties } from "react";
import { X, Search, Pause, Play, Gauge, Terminal, Filter } from "lucide-react";
import { T } from "@/lib/tokens";

// Fase K.3 — Live stdout-stream modal. Åpner EventSource mot
// /sandbox/stdout-stream/:sandboxId og viser live-tail med auto-scroll,
// filter/søk, og fase-separatorer basert på phase_start/phase_end-events.
//
// Fase K.4 — "Ytelse"-tab viser per-fase durationMs + metrics (bundleSizeKb,
// filesCreated/Modified/Deleted, testsPassed/Failed, etc.).

type Tab = "stdout" | "performance";

interface LineEntry {
  id: string;
  ts: number;
  phaseIndex: number;
  phaseName: string;
  stream: "stdout" | "stderr";
  line: string;
}

interface PhaseEntry {
  phaseIndex: number;
  phaseName: string;
  status: "running" | "done" | "error";
  startTs: number;
  endTs?: number;
  durationMs?: number;
  metrics?: Record<string, number>;
}

interface StdoutStreamModalProps {
  sandboxId: string;
  initialPhaseIndex?: number;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function StdoutStreamModal({ sandboxId, onClose }: StdoutStreamModalProps) {
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [phases, setPhases] = useState<Record<number, PhaseEntry>>({});
  const [filter, setFilter] = useState("");
  const [regexMode, setRegexMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<Tab>("stdout");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const manualScrollRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  // SSE-connect
  // Fase K.3 — Bruker cookie-basert auth (via Fase J.1 HttpOnly-cookie).
  // `withCredentials: true` sender cookie automatisk.
  useEffect(() => {
    const url = `${API_BASE}/sandbox/stdout-stream/${encodeURIComponent(sandboxId)}?since=0`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    const handleLine = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setLines((prev) => {
          const entry: LineEntry = {
            id: `${data.ts}-${prev.length}`,
            ts: data.ts,
            phaseIndex: data.phaseIndex,
            phaseName: data.phaseName,
            stream: data.stream,
            line: data.line,
          };
          // Hard cap: behold siste 5000 linjer for å unngå memory-leak.
          const next = prev.length >= 5000 ? [...prev.slice(prev.length - 4999), entry] : [...prev, entry];
          return next;
        });
      } catch {
        /* ignore malformed */
      }
    };

    const handlePhaseStart = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setPhases((prev) => ({
          ...prev,
          [data.phaseIndex]: {
            phaseIndex: data.phaseIndex,
            phaseName: data.phaseName,
            status: "running",
            startTs: data.ts,
          },
        }));
      } catch { /* noop */ }
    };

    const handlePhaseEnd = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setPhases((prev) => ({
          ...prev,
          [data.phaseIndex]: {
            ...(prev[data.phaseIndex] ?? { phaseIndex: data.phaseIndex, phaseName: data.phaseName, startTs: data.ts }),
            phaseName: data.phaseName,
            status: data.success ? "done" : "error",
            endTs: data.ts,
            durationMs: data.durationMs,
            metrics: data.metrics,
          },
        }));
      } catch { /* noop */ }
    };

    const handleError = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setErrorMsg(data.message ?? "Ukjent feil");
      } catch { /* noop */ }
    };

    es.addEventListener("stdout.line", handleLine);
    es.addEventListener("stdout.phase_start", handlePhaseStart);
    es.addEventListener("stdout.phase_end", handlePhaseEnd);
    es.addEventListener("stdout.error", handleError);
    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnekt er innebygd — la browseren håndtere.
    };

    return () => {
      es.removeEventListener("stdout.line", handleLine);
      es.removeEventListener("stdout.phase_start", handlePhaseStart);
      es.removeEventListener("stdout.phase_end", handlePhaseEnd);
      es.removeEventListener("stdout.error", handleError);
      es.close();
      esRef.current = null;
    };
  }, [sandboxId]);

  // Auto-scroll — pauser når bruker scroller manuelt opp.
  useEffect(() => {
    if (!autoScroll) return;
    if (manualScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    manualScrollRef.current = !atBottom;
    if (atBottom) setAutoScroll(true);
  }, []);

  // Filter-funksjon — regex eller substring
  const matcher = useMemo(() => {
    if (!filter) return null;
    if (regexMode) {
      try { return new RegExp(filter, "i"); }
      catch { return null; }
    }
    const lower = filter.toLowerCase();
    return { test: (s: string) => s.toLowerCase().includes(lower) } as { test: (s: string) => boolean };
  }, [filter, regexMode]);

  const visibleLines = useMemo(() => {
    if (!matcher) return lines;
    return lines.filter((l) => matcher.test(l.line));
  }, [lines, matcher]);

  const phaseList = useMemo(() => {
    return Object.values(phases).sort((a, b) => a.phaseIndex - b.phaseIndex);
  }, [phases]);

  return (
    <div onClick={onClose} style={backdropStyle}>
      <div onClick={(e) => e.stopPropagation()} style={dialogStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Terminal size={14} color={T.textMuted} />
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>
              Sandbox stdout
            </span>
            <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>
              {sandboxId.slice(0, 12)}…
            </span>
            <span style={{
              display: "inline-block",
              width: 8, height: 8, borderRadius: "50%",
              background: connected ? (T.success ?? "#22c55e") : (T.textFaint ?? "#9ca3af"),
            }} title={connected ? "Tilkoblet" : "Frakoblet"} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <TabButton label="Output" icon={<Terminal size={11} />} active={tab === "stdout"} onClick={() => setTab("stdout")} />
            <TabButton label="Ytelse" icon={<Gauge size={11} />} active={tab === "performance"} onClick={() => setTab("performance")} />
            <button onClick={onClose} style={closeBtnStyle} aria-label="Lukk">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        {tab === "stdout" ? (
          <>
            {/* Filter bar */}
            <div style={filterBarStyle}>
              <Search size={12} color={T.textMuted} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={regexMode ? "regex (case-insensitive)" : "filter etter tekst..."}
                style={filterInputStyle}
              />
              <button
                onClick={() => setRegexMode((p) => !p)}
                style={{ ...toggleBtnStyle, background: regexMode ? T.tabActive : "transparent" }}
                title="Regex-modus"
              >
                <Filter size={11} />
              </button>
              <button
                onClick={() => { setAutoScroll((p) => !p); manualScrollRef.current = false; }}
                style={{ ...toggleBtnStyle, background: autoScroll ? T.tabActive : "transparent" }}
                title={autoScroll ? "Pause auto-scroll" : "Start auto-scroll"}
              >
                {autoScroll ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, marginLeft: "auto" }}>
                {visibleLines.length} / {lines.length} linjer
              </span>
            </div>

            {/* Output */}
            <div ref={scrollRef} onScroll={handleScroll} style={outputStyle}>
              {errorMsg && (
                <div style={errorBoxStyle}>
                  {errorMsg}
                </div>
              )}
              {visibleLines.length === 0 ? (
                <div style={{ padding: 24, color: T.textMuted, fontSize: 12, textAlign: "center" }}>
                  {lines.length === 0 ? "Venter på output..." : "Ingen treff"}
                </div>
              ) : (
                visibleLines.map((l, i) => {
                  // Fase-separator: sett inn header når phaseIndex endres
                  const prev = i > 0 ? visibleLines[i - 1] : null;
                  const showSep = !prev || prev.phaseIndex !== l.phaseIndex;
                  return (
                    <div key={l.id}>
                      {showSep && <PhaseSep phase={phases[l.phaseIndex] ?? { phaseIndex: l.phaseIndex, phaseName: l.phaseName, status: "running", startTs: l.ts }} />}
                      <div
                        style={{
                          ...lineStyle,
                          color: l.stream === "stderr" ? (T.error ?? "#f87171") : T.text,
                        }}
                      >
                        {l.line}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          // Fase K.4 — Performance-tab
          <div style={perfStyle}>
            {phaseList.length === 0 ? (
              <div style={{ padding: 24, color: T.textMuted, fontSize: 12, textAlign: "center" }}>
                Ingen ytelses-data ennå
              </div>
            ) : (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: T.sans }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}`, textAlign: "left", color: T.textMuted }}>
                      <th style={thStyle}>Fase</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Tid</th>
                      <th style={thStyle}>Metrics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaseList.map((p) => (
                      <tr key={p.phaseIndex} style={{ borderBottom: `1px solid ${T.subtle}` }}>
                        <td style={tdStyle}>{p.phaseName}</td>
                        <td style={tdStyle}>
                          <span style={{ color: p.status === "done" ? (T.success ?? "#22c55e") : p.status === "error" ? (T.error ?? "#f87171") : T.accent }}>
                            {p.status}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: T.mono, fontVariantNumeric: "tabular-nums" }}>
                          {p.durationMs ? `${(p.durationMs / 1000).toFixed(2)}s` : "—"}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: T.mono, fontSize: 11, color: T.textMuted }}>
                          {p.metrics ? formatMetrics(p.metrics) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Snapshot-sammendrag */}
                {phases[3]?.metrics && (
                  <div style={snapshotBoxStyle}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Snapshot-delta
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: T.mono }}>
                      <span>{phases[3].metrics.filesCreated ?? 0} opprettet</span>
                      <span>{phases[3].metrics.filesModified ?? 0} endret</span>
                      <span>{phases[3].metrics.filesDeleted ?? 0} slettet</span>
                      <span style={{ color: T.textFaint }}>
                        {phases[3].metrics.filesUnchanged ?? 0} uendret
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhaseSep({ phase }: { phase: PhaseEntry }) {
  const color =
    phase.status === "done" ? (T.success ?? "#22c55e") :
    phase.status === "error" ? (T.error ?? "#f87171") :
    T.accent;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 0 4px", marginTop: 6,
      borderTop: `1px solid ${T.border}`,
      color: T.textMuted, fontSize: 11,
      fontFamily: T.mono, textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span>[{phase.phaseIndex}] {phase.phaseName}</span>
      {phase.durationMs !== undefined && (
        <span style={{ color: T.textFaint }}>— {(phase.durationMs / 1000).toFixed(2)}s</span>
      )}
    </div>
  );
}

function TabButton({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 10px",
        background: active ? T.tabActive : "transparent",
        border: `1px solid ${active ? T.border : "transparent"}`,
        borderRadius: 6,
        color: active ? T.text : T.textMuted,
        fontSize: 11,
        fontFamily: T.sans,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function formatMetrics(m: Record<string, number>): string {
  return Object.entries(m)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => {
      if (k === "buildDurationMs") return `build=${(v / 1000).toFixed(1)}s`;
      if (k === "bundleSizeKb") return `bundle=${v}KB`;
      if (k === "testsPassed") return `pass=${v}`;
      if (k === "testsFailed") return `fail=${v}`;
      if (k === "filesCreated") return `+${v}`;
      if (k === "filesModified") return `~${v}`;
      if (k === "filesDeleted") return `-${v}`;
      if (k === "filesUnchanged") return `=${v}`;
      if (k === "totalDiffBytes") return `Δ${v}B`;
      return `${k}=${v}`;
    })
    .join(" · ");
}

// --- Styles ---

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
  zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20,
};

const dialogStyle: CSSProperties = {
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  width: "100%",
  maxWidth: 900,
  height: "82vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  fontFamily: T.sans,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  borderBottom: `1px solid ${T.border}`,
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderBottom: `1px solid ${T.border}`,
  background: T.subtle,
};

const filterInputStyle: CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: T.text,
  fontSize: 12,
  fontFamily: T.mono,
};

const toggleBtnStyle: CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "3px 6px",
  cursor: "pointer",
  color: T.textMuted,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: T.textMuted,
  padding: 4,
  marginLeft: 6,
  display: "inline-flex",
  alignItems: "center",
};

const outputStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  background: "#0e0f10",
  color: T.text,
  fontFamily: T.mono,
  fontSize: 12,
  padding: "8px 12px",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const lineStyle: CSSProperties = {
  padding: "1px 0",
};

const errorBoxStyle: CSSProperties = {
  margin: "6px 0",
  padding: "8px 10px",
  background: "rgba(248,113,113,0.10)",
  border: `1px solid ${T.error ?? "#f87171"}`,
  borderRadius: 6,
  color: T.error ?? "#f87171",
  fontSize: 12,
};

const perfStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "14px 18px",
  color: T.text,
};

const thStyle: CSSProperties = {
  padding: "8px 8px",
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: CSSProperties = {
  padding: "8px 8px",
};

const snapshotBoxStyle: CSSProperties = {
  marginTop: 18,
  padding: "12px 14px",
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  background: T.subtle,
};

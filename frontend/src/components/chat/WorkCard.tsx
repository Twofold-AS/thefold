"use client";

import { useState } from "react";
import { T, S } from "@/lib/tokens";
import Tag from "@/components/Tag";

// --- Types ---

export interface WorkPhase {
  id: string;
  label: string;
  status: "done" | "active" | "pending";
}

export interface WorkFile {
  path: string;
  action: "create" | "modify" | "delete";
  diff?: string;
}

export interface SubAgentInfo {
  id: string;
  role: string;
  model: string;
  status: "pending" | "working" | "done" | "failed";
  label: string;
}

interface WorkCardProps {
  title: string;
  jobId?: string;
  phases: WorkPhase[];
  filesCount?: number;
  durationSec?: number;
  costUsd?: number;
  testsPass?: number;
  testsFail?: number;
  files?: WorkFile[];
  subAgents?: SubAgentInfo[];
  currentFile?: string;
  progress?: { current: number; total: number };
}

const PHASE_COLORS: Record<string, string> = {
  done: T.success,
  active: T.accent,
  pending: T.textFaint,
};

// --- Component ---

export default function WorkCard({
  title,
  jobId,
  phases,
  filesCount,
  durationSec,
  costUsd,
  testsPass,
  testsFail,
  files,
  subAgents,
  currentFile,
  progress,
}: WorkCardProps) {
  const [showFiles, setShowFiles] = useState(false);
  const [showDiff, setShowDiff] = useState<string | null>(null);

  return (
    <div
      style={{
        background: T.raised,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: S.md,
        margin: `${S.sm}px 0`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm }}>
        <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
            🔧 {title}
          </span>
          {jobId && (
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              Jobb #{jobId.slice(-6)}
            </span>
          )}
        </div>
        {progress && (
          <span style={{ fontSize: 11, fontFamily: T.mono, color: T.accent }}>
            {progress.current}/{progress.total}
          </span>
        )}
      </div>

      {/* Phase line */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: S.md }}>
        {phases.map((phase, i) => (
          <div key={phase.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: phase.status === "done"
                    ? PHASE_COLORS.done
                    : phase.status === "active"
                      ? T.accent
                      : "transparent",
                  border: `2px solid ${PHASE_COLORS[phase.status]}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: phase.status === "done" ? "#fff" : "transparent",
                  transition: "all 0.3s",
                }}
              >
                {phase.status === "done" && "✓"}
                {phase.status === "active" && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: T.accent,
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: T.mono,
                  color: phase.status === "active" ? T.accent : T.textFaint,
                  fontWeight: phase.status === "active" ? 600 : 400,
                  marginTop: 4,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {phase.label}
              </span>
            </div>
            {i < phases.length - 1 && (
              <div
                style={{
                  height: 2,
                  flex: 1,
                  background: phase.status === "done" ? PHASE_COLORS.done : T.border,
                  marginTop: -14,
                  transition: "background 0.3s",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current file indicator */}
      {currentFile && (
        <div
          style={{
            fontSize: 11,
            fontFamily: T.mono,
            color: T.accent,
            padding: `${S.xs}px ${S.sm}px`,
            background: `${T.accent}10`,
            borderRadius: 6,
            marginBottom: S.sm,
          }}
        >
          ⏳ {currentFile}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: "flex", gap: S.lg, fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>
        {filesCount != null && <span>📄 {filesCount} filer</span>}
        {durationSec != null && <span>⏱ {durationSec}s</span>}
        {costUsd != null && <span>💰 ${costUsd.toFixed(3)}</span>}
        {(testsPass != null || testsFail != null) && (
          <span>🧪 {testsPass ?? 0}/{testsFail ?? 0}</span>
        )}
      </div>

      {/* Sub-agents */}
      {subAgents && subAgents.length > 0 && (
        <div
          style={{
            marginTop: S.sm,
            padding: S.sm,
            background: T.subtle,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S.xs }}>
            Sub-agents ({subAgents.filter(a => a.status === "working").length} aktive)
          </div>
          {subAgents.map((agent) => (
            <div
              key={agent.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `${S.xs}px 0`,
                fontSize: 11,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S.xs }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      agent.status === "done" ? T.success :
                      agent.status === "working" ? T.accent :
                      agent.status === "failed" ? T.error : T.textFaint,
                  }}
                />
                <Tag variant={agent.status === "failed" ? "error" : "default"}>{agent.role}</Tag>
                <span style={{ color: T.textSec }}>{agent.label}</span>
              </div>
              <span style={{ fontFamily: T.mono, color: T.textFaint, fontSize: 10 }}>
                {agent.model.split("-").pop()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable files list */}
      {files && files.length > 0 && (
        <div style={{ marginTop: S.sm }}>
          <button
            onClick={() => setShowFiles(!showFiles)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: T.accent,
              fontFamily: T.mono,
              padding: 0,
            }}
          >
            {showFiles ? "Skjul filer ▲" : `Vis filer ▼ (${files.length})`}
          </button>
          {showFiles && (
            <div style={{ marginTop: S.xs }}>
              {files.map((f) => (
                <div
                  key={f.path}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: `${S.xs}px 0`,
                    borderBottom: `1px solid ${T.border}`,
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: S.xs }}>
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: T.mono,
                        fontWeight: 600,
                        color: f.action === "create" ? T.success : f.action === "delete" ? T.error : T.warning,
                      }}
                    >
                      {f.action === "create" ? "+" : f.action === "delete" ? "-" : "~"}
                    </span>
                    <span style={{ fontFamily: T.mono, color: T.textSec }}>{f.path}</span>
                  </div>
                  {f.diff && (
                    <button
                      onClick={() => setShowDiff(showDiff === f.path ? null : f.path)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 10,
                        color: T.accent,
                        fontFamily: T.mono,
                      }}
                    >
                      diff
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inline diff view */}
          {showDiff && (
            <div
              style={{
                marginTop: S.xs,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: S.sm,
                fontFamily: T.mono,
                fontSize: 11,
                lineHeight: 1.6,
                overflowX: "auto",
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {files
                .find((f) => f.path === showDiff)
                ?.diff?.split("\n")
                .map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.startsWith("+")
                        ? T.success
                        : line.startsWith("-")
                          ? T.error
                          : T.textFaint,
                      background: line.startsWith("+")
                        ? "rgba(47,110,93,0.08)"
                        : line.startsWith("-")
                          ? "rgba(239,68,68,0.08)"
                          : "transparent",
                      padding: "0 4px",
                    }}
                  >
                    <span style={{ display: "inline-block", width: 32, textAlign: "right", marginRight: 8, color: T.textFaint }}>
                      {i + 1}
                    </span>
                    {line}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

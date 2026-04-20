"use client";

import { useState } from "react";
import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";

interface Phase {
  name: string;
  description: string;
  tasks: Array<{ title: string; description?: string }>;
}

interface Plan {
  type: string;
  title: string;
  phases: Phase[];
  totalTasks: number;
  estimatedComplexity?: string;
  reasoning?: string;
}

interface ProjectPlanModalProps {
  content: string;
  onClose: () => void;
}

// Sjekkliste-ikon med +/=/- symboler
function PlanIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="2" width="14" height="16" rx="2" stroke={color} strokeWidth="1.4" />
      {/* + symbol */}
      <line x1="5.5" y1="7" x2="7.5" y2="7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6.5" y1="6" x2="6.5" y2="8" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      {/* = symbol */}
      <line x1="5.5" y1="9.5" x2="7.5" y2="9.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="10.7" x2="7.5" y2="10.7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      {/* - symbol */}
      <line x1="5.5" y1="13" x2="7.5" y2="13" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      {/* Content lines */}
      <line x1="9" y1="7" x2="14.5" y2="7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="9" y1="10" x2="14.5" y2="10" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="9" y1="13" x2="12.5" y2="13" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// Pil med hale (L-form med pilhode)
function TailArrow({ size = 13, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M3 2 L3 8.5 L10.5 8.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 6.5 L10.5 8.5 L8.5 10.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sirkel med tall (fasenummer)
function PhaseNumber({ n, active }: { n: number; active: boolean }) {
  return (
    <div style={{
      width: 26,
      height: 26,
      borderRadius: "50%",
      background: active ? T.accent : T.accentDim,
      border: `1.5px solid ${active ? T.accent : T.accent + "50"}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 700,
      color: active ? "#fff" : T.accent,
      flexShrink: 0,
      transition: "all 0.15s",
    }}>
      {n}
    </div>
  );
}

export default function ProjectPlanModal({ content, onClose }: ProjectPlanModalProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());

  let plan: Plan | null = null;
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === "project_plan") plan = parsed;
  } catch {
    // ignore
  }

  const togglePhase = (idx: number) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    /* Overlay */
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        backdropFilter: "blur(2px)",
      }}
    >
      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "rgba(20,20,24,0.92)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: 620,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>
              {plan?.title ?? "Prosjektplan"}
            </div>
            {plan && (
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                {plan.totalTasks} oppgaver · {plan.phases.length} faser
                {plan.estimatedComplexity && ` · ${plan.estimatedComplexity} kompleksitet`}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: T.textMuted,
              fontSize: 18,
              lineHeight: 1,
              padding: "4px 6px",
              borderRadius: 6,
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.subtle; e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMuted; }}
          >
            ✕
          </button>
        </div>

        {/* Phases — scrollable */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          {!plan ? (
            <div style={{ padding: 20, color: T.textMuted, fontSize: 13 }}>
              Kunne ikke tolke prosjektplanen.
            </div>
          ) : plan.phases.map((phase, idx) => {
            const isExpanded = expandedPhases.has(idx);
            const hasTasks = phase.tasks.length > 0;
            return (
              <div key={idx} style={{
                border: `1px solid ${isExpanded ? T.accent + "40" : T.border}`,
                borderRadius: 8,
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}>
                {/* Phase header — only clickable if there are tasks */}
                <div
                  onClick={() => hasTasks && togglePhase(idx)}
                  style={{
                    width: "100%",
                    background: isExpanded ? T.accentDim : "transparent",
                    border: "none",
                    cursor: hasTasks ? "pointer" : "default",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    transition: "background 0.15s",
                    userSelect: "none",
                  }}
                  onMouseEnter={e => { if (hasTasks && !isExpanded) (e.currentTarget as HTMLElement).style.background = T.subtle; }}
                  onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <PhaseNumber n={idx + 1} active={isExpanded} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>
                      {phase.name}
                    </div>
                    {phase.description && (
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                        {phase.description}
                      </div>
                    )}
                  </div>
                  {hasTasks && (
                    <div style={{
                      background: T.accentDim,
                      border: `1px solid ${T.accent}30`,
                      borderRadius: 4,
                      padding: "2px 7px",
                      fontSize: 10,
                      color: T.accent,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}>
                      {phase.tasks.length} oppg.
                    </div>
                  )}
                </div>

                {/* Tasks */}
                {isExpanded && (
                  <div style={{
                    borderTop: `1px solid ${T.accent}25`,
                    padding: "8px 14px 10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    background: T.surface,
                  }}>
                    {phase.tasks.map((task, tIdx) => (
                      <div key={tIdx} style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        paddingLeft: 4,
                      }}>
                        <TailArrow size={13} color={T.accent + "90"} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: T.text,
                            lineHeight: 1.4,
                          }}>
                            {task.title}
                          </div>
                          {task.description && (
                            <div style={{
                              fontSize: 11,
                              color: T.textMuted,
                              marginTop: 2,
                              lineHeight: 1.45,
                            }}>
                              {task.description}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          display: "flex",
          justifyContent: "flex-end",
          gap: S.sm,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, color: T.textFaint, marginRight: "auto", alignSelf: "center" }}>
            Skriv &quot;kjør planen&quot; i chatten for å starte
          </div>
          <Btn variant="ghost" size="sm" onClick={onClose}>Lukk</Btn>
        </div>
      </div>
    </div>
  );
}

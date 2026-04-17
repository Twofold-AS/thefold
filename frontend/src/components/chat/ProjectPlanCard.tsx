"use client";

import { useState } from "react";
import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";

interface Phase {
  name: string;
  description: string;
  tasks: Array<{ title: string; description?: string }>;
}

interface ProjectPlanCardProps {
  content: string;
  onStart?: () => void;
}

export default function ProjectPlanCard({ content, onStart }: ProjectPlanCardProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  let plan: {
    type: string;
    title: string;
    phases: Phase[];
    totalTasks: number;
    estimatedComplexity?: string;
    reasoning?: string;
  } | null = null;

  try {
    const parsed = JSON.parse(content);
    if (parsed.type === "project_plan") {
      plan = parsed;
    }
  } catch (e) {
    // Fallback to plain text rendering if JSON parse fails
    return (
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        padding: S.md,
        color: T.text,
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {content}
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        padding: S.md,
        color: T.text,
      }}>
        Kunne ikke tolke prosjektplanen
      </div>
    );
  }

  const togglePhase = (phaseName: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseName)) {
        next.delete(phaseName);
      } else {
        next.add(phaseName);
      }
      return next;
    });
  };

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.r,
      padding: 0,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: S.md,
        borderBottom: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        gap: S.sm,
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <div>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: T.text,
            }}>
              {plan.title} klar
            </div>
            <div style={{
              fontSize: 12,
              color: T.textMuted,
              marginTop: 2,
            }}>
              {plan.totalTasks} oppgaver i {plan.phases.length} faser
            </div>
          </div>
        </div>
        <div style={{
          background: T.accentDim,
          border: `1px solid ${T.accent}40`,
          borderRadius: 20,
          padding: "4px 12px",
          fontSize: 11,
          fontWeight: 600,
          color: T.accent,
        }}>
          {plan.estimatedComplexity || "medium"} kompleksitet
        </div>
      </div>

      {/* Phases */}
      <div style={{
        padding: S.md,
        display: "flex",
        flexDirection: "column",
        gap: S.sm,
      }}>
        {plan.phases.map((phase, idx) => {
          const isExpanded = expandedPhases.has(phase.name);
          const taskCount = phase.tasks.length;

          return (
            <div key={idx}>
              <button
                onClick={() => togglePhase(phase.name)}
                style={{
                  background: "transparent",
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: `${S.sm}px ${S.md}px`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: S.sm,
                  width: "100%",
                  justifyContent: "space-between",
                  transition: "all 0.15s",
                  color: T.text,
                  fontSize: 13,
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.subtle;
                  e.currentTarget.style.borderColor = T.borderHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = T.border;
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    fontSize: 10,
                    transition: "transform 0.2s",
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}>
                    ▶
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {idx + 1}. {phase.name}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: T.textMuted,
                      marginTop: 2,
                    }}>
                      {phase.description}
                    </div>
                  </div>
                </div>
                <div style={{
                  background: T.accentDim,
                  border: `1px solid ${T.accent}30`,
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontSize: 10,
                  color: T.accent,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}>
                  {taskCount} oppgaver
                </div>
              </button>

              {/* Tasks (collapsed by default) */}
              {isExpanded && (
                <div style={{
                  background: `${T.subtle}`,
                  borderRadius: 6,
                  padding: S.md,
                  marginTop: S.sm,
                  display: "flex",
                  flexDirection: "column",
                  gap: S.sm,
                }}>
                  {phase.tasks.map((task, taskIdx) => (
                    <div key={taskIdx} style={{
                      display: "flex",
                      gap: S.sm,
                      alignItems: "flex-start",
                    }}>
                      <span style={{
                        color: T.textMuted,
                        fontSize: 12,
                        marginTop: 1,
                        flexShrink: 0,
                      }}>
                        •
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 12,
                          color: T.text,
                          fontWeight: 500,
                          lineHeight: 1.4,
                        }}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div style={{
                            fontSize: 11,
                            color: T.textMuted,
                            marginTop: 2,
                            lineHeight: 1.4,
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

      {/* Reasoning section if present */}
      {plan.reasoning && (
        <div style={{
          padding: S.md,
          borderTop: `1px solid ${T.border}`,
          background: `${T.accentDim}`,
          fontSize: 12,
          color: T.textSec,
          lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 500, color: T.text }}>Begrunnelse: </span>
          {plan.reasoning}
        </div>
      )}

      {/* Footer with action button */}
      <div style={{
        padding: S.md,
        borderTop: `1px solid ${T.border}`,
        display: "flex",
        gap: S.sm,
        justifyContent: "flex-end",
      }}>
        <Btn
          variant="primary"
          size="sm"
          onClick={onStart}
        >
          Start prosjektet
        </Btn>
      </div>
    </div>
  );
}

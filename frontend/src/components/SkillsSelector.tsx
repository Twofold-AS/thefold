"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles, X, Zap, Syringe, ClipboardCheck, Wand2 } from "lucide-react";
import { listSkills, resolveSkills, type Skill } from "@/lib/api";

// --- Category colors ---
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  security: { bg: "rgba(239,68,68,0.12)", text: "#f87171" },
  quality: { bg: "rgba(59,130,246,0.12)", text: "#60a5fa" },
  style: { bg: "rgba(168,85,247,0.12)", text: "#c084fc" },
  framework: { bg: "rgba(34,197,94,0.12)", text: "#4ade80" },
  language: { bg: "rgba(234,179,8,0.12)", text: "#facc15" },
  general: { bg: "rgba(156,163,175,0.12)", text: "#9ca3af" },
};

function getCategoryColor(category?: string) {
  return CATEGORY_COLORS[category || "general"] || CATEGORY_COLORS.general;
}

// --- Phase icon ---
function PhaseIcon({ phase, size = 10 }: { phase?: string; size?: number }) {
  switch (phase) {
    case "pre_run":
      return <Zap size={size} />;
    case "post_run":
      return <ClipboardCheck size={size} />;
    default:
      return <Syringe size={size} />;
  }
}

const PHASE_LABELS: Record<string, string> = {
  pre_run: "Pre",
  inject: "Inj",
  post_run: "Post",
};

interface SkillsSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function SkillsSelector({ selectedIds, onChange }: SkillsSelectorProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listSkills("chat")
      .then((res) => {
        setSkills(res.skills);
        // Initialize with globally enabled skills if no selection yet
        if (selectedIds.length === 0) {
          const enabled = res.skills.filter((s) => s.enabled).map((s) => s.id);
          if (enabled.length > 0) onChange(enabled);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggleSkill(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((s) => s !== id)
      : [...selectedIds, id];
    onChange(next);
  }

  async function handleAutoResolve() {
    setResolving(true);
    try {
      const result = await resolveSkills({ task: "chat context" });
      if (result.result.injectedSkillIds.length > 0) {
        onChange(result.result.injectedSkillIds);
      }
    } catch {
      // Silent
    } finally {
      setResolving(false);
    }
  }

  const activeSkills = skills.filter((s) => selectedIds.includes(s.id));
  const activeCount = activeSkills.length;
  const totalTokens = activeSkills.reduce((sum, s) => sum + (s.tokenEstimate || 0), 0);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs px-2 py-1 transition-colors flex items-center gap-1"
        style={{
          border: "1px solid var(--border)",
          borderRadius: "4px",
          background: activeCount > 0 ? "rgba(99,102,241,0.1)" : "transparent",
          color: activeCount > 0 ? "#818cf8" : "var(--text-muted)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = activeCount > 0 ? "rgba(99,102,241,0.15)" : "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = activeCount > 0 ? "rgba(99,102,241,0.1)" : "transparent")}
      >
        <Sparkles size={12} />
        Skills{activeCount > 0 ? ` (${activeCount})` : ""}
        {totalTokens > 0 && (
          <span style={{ color: "var(--text-muted)", fontSize: "9px", marginLeft: "2px" }}>
            ~{totalTokens}t
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: "300px",
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            overflow: "hidden",
          }}
        >
          <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Aktive skills for denne samtalen
            </span>
            <button
              onClick={handleAutoResolve}
              disabled={resolving}
              className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
              style={{
                background: "rgba(168,85,247,0.12)",
                color: "#c084fc",
                border: "none",
                cursor: resolving ? "wait" : "pointer",
                opacity: resolving ? 0.6 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(168,85,247,0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(168,85,247,0.12)")}
            >
              <Wand2 size={10} />
              {resolving ? "..." : "Auto"}
            </button>
          </div>

          {/* Token budget summary */}
          {activeCount > 0 && totalTokens > 0 && (
            <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}>
              <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span>{activeCount} aktive</span>
                <span>~{totalTokens} tokens</span>
              </div>
              <div style={{ height: "2px", background: "var(--border)", borderRadius: "1px", marginTop: "4px" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min((totalTokens / 4000) * 100, 100)}%`,
                    background: totalTokens > 3500 ? "#f87171" : "#6366f1",
                    borderRadius: "1px",
                    transition: "width 0.2s",
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ maxHeight: "280px", overflowY: "auto" }}>
            {skills.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                Ingen skills tilgjengelig
              </div>
            ) : (
              skills.map((skill) => {
                const isActive = selectedIds.includes(skill.id);
                const catColor = getCategoryColor(skill.category);
                return (
                  <button
                    key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                    style={{
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      opacity: isActive ? 1 : 0.7,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Toggle */}
                    <div
                      style={{
                        width: "32px",
                        height: "18px",
                        borderRadius: "9px",
                        background: isActive ? "#6366f1" : "var(--border)",
                        position: "relative",
                        flexShrink: 0,
                        transition: "background 0.15s",
                      }}
                    >
                      <div
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "50%",
                          background: "#fff",
                          position: "absolute",
                          top: "2px",
                          left: isActive ? "16px" : "2px",
                          transition: "left 0.15s",
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                          {skill.name}
                        </span>
                        {/* Category badge */}
                        {skill.category && (
                          <span
                            className="text-[9px] px-1 py-0 rounded"
                            style={{ background: catColor.bg, color: catColor.text }}
                          >
                            {skill.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                          {skill.description}
                        </span>
                      </div>
                    </div>
                    {/* Phase + tokens */}
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span
                        className="text-[9px] px-1 py-0 rounded flex items-center gap-0.5"
                        style={{
                          background: skill.executionPhase === "pre_run" ? "rgba(249,115,22,0.12)"
                            : skill.executionPhase === "post_run" ? "rgba(34,197,94,0.12)"
                            : "rgba(59,130,246,0.12)",
                          color: skill.executionPhase === "pre_run" ? "#fb923c"
                            : skill.executionPhase === "post_run" ? "#4ade80"
                            : "#60a5fa",
                        }}
                      >
                        <PhaseIcon phase={skill.executionPhase} size={8} />
                        {PHASE_LABELS[skill.executionPhase || "inject"]}
                      </span>
                      {skill.tokenEstimate ? (
                        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                          ~{skill.tokenEstimate}t
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Active skills shown as small chips with category colors */
export function SkillChips({ skills, selectedIds, onRemove }: {
  skills: Skill[];
  selectedIds: string[];
  onRemove: (id: string) => void;
}) {
  const active = skills.filter((s) => selectedIds.includes(s.id));
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {active.map((s) => {
        const catColor = getCategoryColor(s.category);
        return (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: catColor.bg, color: catColor.text }}
          >
            <PhaseIcon phase={s.executionPhase} size={9} />
            {s.name}
            <button
              onClick={() => onRemove(s.id)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "inherit" }}
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** Small inline display of skill names used in a message */
export function MessageSkillBadges({ skillIds, allSkills }: {
  skillIds: string[];
  allSkills: Skill[];
}) {
  if (!skillIds || skillIds.length === 0) return null;

  const matched = allSkills.filter((s) => skillIds.includes(s.id));
  if (matched.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      <Sparkles size={9} style={{ color: "var(--text-muted)", marginTop: "2px" }} />
      {matched.map((s) => {
        const catColor = getCategoryColor(s.category);
        return (
          <span
            key={s.id}
            className="text-[9px] px-1 py-0 rounded"
            style={{ background: catColor.bg, color: catColor.text }}
          >
            {s.name}
          </span>
        );
      })}
    </div>
  );
}

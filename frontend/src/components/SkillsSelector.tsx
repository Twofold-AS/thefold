"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { listSkills, toggleSkill as apiToggleSkill, type Skill } from "@/lib/api";

interface SkillsSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function SkillsSelector({ selectedIds, onChange }: SkillsSelectorProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [open, setOpen] = useState(false);
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

  function removeSkill(id: string) {
    onChange(selectedIds.filter((s) => s !== id));
  }

  const activeSkills = skills.filter((s) => selectedIds.includes(s.id));
  const activeCount = activeSkills.length;

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
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: "260px",
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            overflow: "hidden",
          }}
        >
          <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Aktive skills for denne samtalen
            </span>
          </div>

          <div style={{ maxHeight: "240px", overflowY: "auto" }}>
            {skills.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                Ingen skills tilgjengelig
              </div>
            ) : (
              skills.map((skill) => {
                const isActive = selectedIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                    style={{
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
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
                      <div className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                        {skill.name}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                        {skill.description}
                      </div>
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

/** Active skills shown as small chips */
export function SkillChips({ skills, selectedIds, onRemove }: {
  skills: Skill[];
  selectedIds: string[];
  onRemove: (id: string) => void;
}) {
  const active = skills.filter((s) => selectedIds.includes(s.id));
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {active.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}
        >
          {s.name}
          <button
            onClick={() => onRemove(s.id)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "inherit" }}
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

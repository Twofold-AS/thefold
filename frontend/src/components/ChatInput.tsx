"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { Ghost } from "lucide-react";
import PillIcon from "@/components/PillIcon";
import ModelPill from "@/components/ModelPill";
import TypewriterPlaceholder from "@/components/TypewriterPlaceholder";

interface ChatInputProps {
  compact?: boolean;
  repo?: string | null;
  onSubmit?: (value: string, repo?: string | null) => void;
  onRepoChange?: (repo: string | null) => void;
  ghost?: boolean;
  onGhostChange?: (ghost: boolean) => void;
  isPrivate?: boolean;
  skills?: Array<{ id: string; name: string; enabled: boolean }>;
  selectedSkillIds?: string[];
  onSkillsChange?: (ids: string[]) => void;
  subAgentsEnabled?: boolean;
  onSubAgentsToggle?: () => void;
  repos?: string[];
}

const defaultRepos = ["thefold-api", "thefold-frontend"];

export default function ChatInput({
  compact,
  repo,
  onSubmit,
  onRepoChange,
  ghost,
  onGhostChange,
  isPrivate,
  skills,
  selectedSkillIds,
  onSkillsChange,
  subAgentsEnabled,
  onSubAgentsToggle,
  repos: reposProp,
}: ChatInputProps) {
  const repos = reposProp ?? defaultRepos;
  const [v, setV] = useState("");
  const [st, setSt] = useState(false);
  const ty = v.length > 0;
  const [rd, setRd] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const doSend = () => {
    if (v && onSubmit) {
      onSubmit(v, repo);
      setV("");
    } else if (v) {
      setSt(true);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: undefined,
        background: T.surface,
        borderRadius: T.r * 1.5,
        position: "relative",
      }}
    >
      <div
        style={{
          height: compact ? 48 : 56,
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          position: "relative",
        }}
      >
        {!ty && (
          <div
            style={{
              position: "absolute",
              left: 20,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              fontFamily: T.sans,
            }}
          >
            <TypewriterPlaceholder active={ty} />
          </div>
        )}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && v) doSend();
          }}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: T.text,
            fontSize: 13,
            fontFamily: T.sans,
            position: "relative",
            zIndex: 1,
          }}
        />
      </div>
      <div
        style={{
          height: compact ? 44 : 57,
          borderTop: `1px solid ${T.border}`,
          padding: "0 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* File attach */}
          <PillIcon tooltip="Filer">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 3v8M3 7h8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </PillIcon>
          {/* Ghost toggle */}
          <PillIcon
            tooltip="Privat — kun synlig for deg"
            active={ghost}
            onClick={() => onGhostChange && onGhostChange(!ghost)}
          >
            <Ghost size={14} />
          </PillIcon>
          {/* Conditional icons: sub-agents, skills, repo dropdown — hidden when isPrivate */}
          {!ghost && !isPrivate && (
            <>
              {/* Sub-agents */}
              <PillIcon
                tooltip="Sub-agenter"
                active={subAgentsEnabled}
                onClick={() => onSubAgentsToggle && onSubAgentsToggle()}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.1" />
                  <circle cx="3.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
                  <circle cx="10.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
                  <path
                    d="M1 12c0-2 1.5-3 2.5-3M13 12c0-2-1.5-3-2.5-3M3.5 12c0-2.5 1.5-4 3.5-4s3.5 1.5 3.5 4"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                </svg>
              </PillIcon>
              {/* Skills dropdown */}
              <div style={{ position: "relative" }}>
                <PillIcon
                  tooltip="Skills"
                  active={(selectedSkillIds?.length ?? 0) > 0}
                  onClick={() => setSkillsOpen((p) => !p)}
                >
                  {/* Wand2 icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
                    <path d="m14 7 3 3" />
                    <path d="M5 6v4" /><path d="M19 14v4" />
                    <path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" />
                  </svg>
                </PillIcon>
                {skillsOpen && skills && skills.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      marginBottom: 6,
                      background: T.surface,
                      border: `1px solid ${T.border}`,
                      borderRadius: T.r,
                      padding: "4px 0",
                      minWidth: 200,
                      maxHeight: 240,
                      overflow: "auto",
                      zIndex: 100,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }}
                  >
                    {skills
                      .filter((s) => s.enabled)
                      .map((skill) => {
                        const selected = selectedSkillIds?.includes(skill.id) ?? false;
                        return (
                          <div
                            key={skill.id}
                            onClick={() => {
                              if (!onSkillsChange || !selectedSkillIds) return;
                              onSkillsChange(
                                selected
                                  ? selectedSkillIds.filter((id) => id !== skill.id)
                                  : [...selectedSkillIds, skill.id]
                              );
                            }}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              fontFamily: T.sans,
                              color: selected ? T.text : T.textSec,
                              background: "transparent",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                border: `1px solid ${selected ? T.accent : T.border}`,
                                background: selected ? T.accent : "transparent",
                              }}
                            />
                            {skill.name}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              {/* Repo dropdown */}
              <div style={{ marginLeft: 4, position: "relative", zIndex: 50 }}>
                <div
                  onClick={() => setRd((p) => !p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px",
                    background: T.subtle,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: T.mono,
                    color: repo ? T.textSec : T.textFaint,
                    cursor: "pointer",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  >
                    <path d="M2 3.5C2 2.67 2.67 2 3.5 2h2l1 1.5h2c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5h-5A1.5 1.5 0 012 9V3.5z" />
                  </svg>
                  {repo || "Velg repo"}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2.5 4L5 6.5 7.5 4"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                {rd && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      marginBottom: 4,
                      background: T.surface,
                      border: `1px solid ${T.border}`,
                      borderRadius: T.r,
                      overflow: "hidden",
                      zIndex: 100,
                      minWidth: 180,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                    }}
                  >
                    {repos.map((r) => (
                      <div
                        key={r}
                        onClick={() => {
                          onRepoChange && onRepoChange(r);
                          setRd(false);
                        }}
                        style={{
                          padding: "8px 12px",
                          fontSize: 11,
                          fontFamily: T.mono,
                          color: r === repo ? T.text : T.textSec,
                          background: r === repo ? T.subtle : "transparent",
                          cursor: "pointer",
                          borderBottom: `1px solid ${T.border}`,
                        }}
                      >
                        {r}
                      </div>
                    ))}
                    <div
                      onClick={() => {
                        onRepoChange && onRepoChange(null);
                        setRd(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 11,
                        fontFamily: T.mono,
                        color: T.textFaint,
                        cursor: "pointer",
                      }}
                    >
                      Ingen repo
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ModelPill />
          <PillIcon active={ty || st} onClick={doSend} tooltip={st ? "Stopp" : "Send"}>
            {st ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="2" y="2" width="8" height="8" rx="0" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 11V3M7 3L3.5 6.5M7 3l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </PillIcon>
        </div>
      </div>
    </div>
  );
}

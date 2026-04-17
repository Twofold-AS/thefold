"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { T } from "@/lib/tokens";
import PillIcon from "@/components/PillIcon";
import TypewriterPlaceholder from "@/components/TypewriterPlaceholder";
import { ChevronDown } from "lucide-react";
import { useRepoContext } from "@/lib/repo-context";

/** Compute fixed popup position above a trigger element */
function getPopupPos(ref: React.RefObject<HTMLElement | null>): { bottom: number; left?: number; right?: number } {
  if (!ref.current) return { bottom: 0, left: 0 };
  const r = ref.current.getBoundingClientRect();
  return {
    bottom: window.innerHeight - r.top + 6,
    left: r.left,
  };
}

interface ChatInputProps {
  compact?: boolean;
  onSubmit?: (value: string, options?: { planMode?: boolean; firecrawlEnabled?: boolean }) => void;
  placeholder?: string;
  skills?: Array<{ id: string; name: string; enabled: boolean }>;
  selectedSkillIds?: string[];
  onSkillsChange?: (ids: string[]) => void;
  subAgentsEnabled?: boolean;
  onSubAgentsToggle?: () => void;
  isLoading?: boolean;
  onCancel?: () => void;
  models?: Array<{ id: string; displayName: string; provider: string }>;
  selectedModel?: string | null;
  onModelChange?: (modelId: string | null) => void;
  isIncognito?: boolean;
  onIncognitoToggle?: () => void;
  planMode?: boolean;
  onPlanModeToggle?: () => void;
}

export default function ChatInput({
  compact,
  onSubmit,
  placeholder,
  skills,
  selectedSkillIds,
  onSkillsChange,
  subAgentsEnabled,
  onSubAgentsToggle,
  isLoading,
  onCancel,
  models,
  selectedModel,
  onModelChange,
  isIncognito,
  onIncognitoToggle,
  planMode: externalPlanMode,
  onPlanModeToggle,
}: ChatInputProps) {
  const [v, setV] = useState("");
  const ty = v.length > 0;
  const [localPlanMode, setLocalPlanMode] = useState(false);
  const planMode = externalPlanMode !== undefined ? externalPlanMode : localPlanMode;
  const togglePlanMode = () => {
    if (onPlanModeToggle) onPlanModeToggle();
    else setLocalPlanMode(p => !p);
  };
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  const [firecrawlEnabled, setFirecrawlEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const repoTriggerRef = useRef<HTMLDivElement>(null);
  const skillsTriggerRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLDivElement>(null);
  const { repos, selectedRepo, selectRepo, clearRepo } = useRepoContext();

  // --- File upload state ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const MAX_INPUT_HEIGHT = 200;

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT);
    el.style.height = newHeight + "px";
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    autoResize();
  }, [v, autoResize]);

  const doSend = () => {
    if (v && onSubmit) {
      onSubmit(v, { planMode, firecrawlEnabled });
      setV("");
    }
  };

  // --- .md file upload handler ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (!file.name.endsWith(".md")) {
      setFileError("Kun .md-filer støttes");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const header = `📎 Fil: ${file.name}\n\n${text}`;
      setV(prev => (prev ? `${header}\n\n${prev}` : header));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
    <style>{`.ci-tools::-webkit-scrollbar{display:none}`}</style>
    <div
      style={{
        width: "100%",
        maxWidth: compact ? undefined : 700,
        background: "#1b1c1e",
        border: "none",
        borderRadius: "1.5rem",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div
        style={{
          minHeight: compact ? 48 : 100,
          padding: "16px 20px 0",
          position: "relative",
        }}
      >
        {!ty && (
          <div style={{
            position: "absolute",
            top: 16,
            left: 20,
            pointerEvents: "none",
            fontSize: 13,
            fontFamily: T.sans,
          }}>
            <TypewriterPlaceholder active={ty} />
          </div>
        )}
        <textarea
          ref={textareaRef}
          data-chat-input
          rows={1}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            // Cmd+Enter (Mac) or Ctrl+Enter (Windows) — always send
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && v) {
              e.preventDefault();
              doSend();
              return;
            }
            // Plain Enter without Shift — send
            if (e.key === "Enter" && !e.shiftKey && v) {
              e.preventDefault();
              doSend();
              return;
            }
            // Escape — close open dropdowns
            if (e.key === "Escape") {
              setSkillsOpen(false);
              setModelOpen(false);
            }
          }}
          placeholder=""
          style={{
            width: "100%",
            minHeight: compact ? 24 : 28,
            maxHeight: MAX_INPUT_HEIGHT,
            background: "transparent",
            border: "none",
            outline: "none",
            color: T.text,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: T.sans,
            position: "relative",
            zIndex: 1,
            resize: "none",
            overflowY: "hidden",
            lineHeight: 1.5,
            padding: "0",
          }}
        />
      </div>
      <div
        style={{
          padding: compact ? "8px 14px 10px" : "0 20px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          className="ci-tools"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            overflowX: "auto", flexShrink: 1, minWidth: 0,
            scrollbarWidth: "none", msOverflowStyle: "none",
          } as React.CSSProperties}
        >
          {/* Repo selector — disabled in inkognito mode */}
          <div style={isIncognito ? { opacity: 0.4, pointerEvents: "none", cursor: "not-allowed" } : { position: "relative" }}>
            <div
              ref={repoTriggerRef}
              onClick={() => setRepoOpen(p => !p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                border: `1px solid ${selectedRepo ? T.tabActive : T.border}`,
                borderRadius: T.r,
                fontSize: 11,
                fontFamily: T.mono,
                color: selectedRepo ? T.text : T.textMuted,
                cursor: "pointer",
                background: selectedRepo ? T.tabActive : "transparent",
              }}
            >
              <img src="https://github.com/favicon.ico" width={11} height={11} alt="" style={{ display: "block", opacity: 0.8 }} />
              <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedRepo ? selectedRepo.name : "Prosjekter"}
              </span>
              <ChevronDown size={10} strokeWidth={2} />
            </div>
            {repoOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setRepoOpen(false)} />
                <div style={{
                  position: "fixed",
                  bottom: getPopupPos(repoTriggerRef).bottom,
                  left: getPopupPos(repoTriggerRef).left,
                  background: T.popup ?? T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  minWidth: 280,
                  maxHeight: 360,
                  overflowY: "auto",
                  zIndex: 9999,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                  padding: "6px 0",
                }}>
                  <div style={{ padding: "8px 16px 6px", fontSize: 11, fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Prosjekter
                  </div>
                  {repos.map(repo => (
                    <div
                      key={repo.fullName}
                      onClick={() => { selectRepo(repo.fullName); setRepoOpen(false); }}
                      style={{
                        padding: "12px 16px", fontSize: 13,
                        color: T.text,
                        background: selectedRepo?.fullName === repo.fullName ? T.tabActive : "transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { if (selectedRepo?.fullName !== repo.fullName) e.currentTarget.style.background = T.subtle; }}
                      onMouseLeave={(e) => { if (selectedRepo?.fullName !== repo.fullName) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ fontWeight: 500 }}>{repo.name}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{repo.fullName}</div>
                    </div>
                  ))}
                  {repos.length === 0 && (
                    <div style={{ padding: "16px", fontSize: 12, color: T.textMuted, textAlign: "center" }}>
                      Ingen repos funnet
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Plan / sub-agents / skills / firecrawl — all disabled in inkognito */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            ...(isIncognito ? { opacity: 0.4, pointerEvents: "none" } : {}),
          }}>
          {/* Plan mode toggle */}
          <PillIcon
            tooltip="Planleggingsmodus"
            active={planMode}
            onClick={togglePlanMode}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>checklist</span>
          </PillIcon>
          {/* Sub-agents — grayed out when planMode active */}
          <div style={planMode ? { opacity: 0.4, pointerEvents: "none", cursor: "not-allowed" } : undefined}>
            <PillIcon
              tooltip={planMode ? "Deaktivert i planleggingsmodus" : "Sub-agenter"}
              active={subAgentsEnabled && !planMode}
              onClick={() => !planMode && onSubAgentsToggle && onSubAgentsToggle()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>support_agent</span>
            </PillIcon>
          </div>
          {/* Skills dropdown */}
          <div style={{ position: "relative" }} ref={skillsTriggerRef as any}>
            <PillIcon
              tooltip="Skills"
              active={(selectedSkillIds?.length ?? 0) > 0}
              onClick={() => setSkillsOpen((p) => !p)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>auto_fix_high</span>
            </PillIcon>
            {skillsOpen && skills && skills.length > 0 && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setSkillsOpen(false)} />
                <div style={{
                  position: "fixed",
                  bottom: getPopupPos(skillsTriggerRef).bottom,
                  left: getPopupPos(skillsTriggerRef).left,
                  background: T.popup,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  padding: "6px 0",
                  minWidth: 220,
                  overflow: "hidden",
                  zIndex: 9999,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}>
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
                            padding: "10px 16px",
                            fontSize: 13,
                            color: T.text,
                            background: selected ? T.tabActive : "transparent",
                            cursor: "pointer",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = T.subtle; }}
                          onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                        >
                          {skill.name}
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>

          {/* Firecrawl: on/off toggle */}
          <PillIcon
            tooltip={firecrawlEnabled ? "Firecrawl aktiv" : "Aktivér Firecrawl"}
            active={firecrawlEnabled}
            onClick={() => setFirecrawlEnabled(p => !p)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>travel_explore</span>
          </PillIcon>
          </div>

          {/* Inkognito toggle */}
          <PillIcon
            tooltip={isIncognito ? "Inkognito aktiv — klikk for å deaktivere" : "Inkognito modus"}
            active={isIncognito}
            onClick={() => onIncognitoToggle?.()}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>visibility_off</span>
          </PillIcon>

          {/* .md file upload */}
          <div style={{ position: "relative" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <PillIcon
              tooltip="Last opp .md-fil"
              active={false}
              onClick={() => { setFileError(null); fileInputRef.current?.click(); }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>attach_file</span>
            </PillIcon>
            {fileError && (
              <div style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                background: T.popup ?? T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 11,
                color: T.error ?? "#f87171",
                whiteSpace: "nowrap",
                zIndex: 1000,
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              }}>
                {fileError}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Model selector dropdown */}
          <div style={{ position: "relative" }}>
            <div
              ref={modelTriggerRef}
              onClick={() => setModelOpen((p) => !p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                border: `1px solid ${T.border}`,
                borderRadius: 999,
                fontSize: 11,
                fontFamily: T.mono,
                color: T.textMuted,
                cursor: "pointer",
                background: "transparent",
              }}
            >
              {selectedModel
                ? models?.find(m => m.id === selectedModel)?.displayName || selectedModel
                : "Auto (anbefalt)"}
              <ChevronDown size={10} strokeWidth={2} />
            </div>
            {modelOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setModelOpen(false)} />
                <div style={{
                  position: "fixed",
                  bottom: getPopupPos(modelTriggerRef).bottom,
                  right: modelTriggerRef.current ? window.innerWidth - modelTriggerRef.current.getBoundingClientRect().right : 0,
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  minWidth: 220,
                  zIndex: 9999,
                  overflow: "hidden",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}>
                  <div
                    onClick={() => { onModelChange?.(null); setModelOpen(false); }}
                    style={{
                      padding: "10px 16px",
                      fontSize: 12,
                      fontFamily: T.mono,
                      color: !selectedModel ? T.text : T.textMuted,
                      background: !selectedModel ? T.subtle : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    Auto (anbefalt)
                  </div>
                  {(models || []).map((m) => (
                    <div
                      key={m.id}
                      onClick={() => { onModelChange?.(m.id); setModelOpen(false); }}
                      style={{
                        padding: "10px 16px",
                        fontSize: 12,
                        fontFamily: T.mono,
                        color: selectedModel === m.id ? T.text : T.textMuted,
                        background: selectedModel === m.id ? T.subtle : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      {m.displayName}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <PillIcon
            active={ty || isLoading}
            onClick={isLoading ? onCancel : doSend}
            tooltip={isLoading ? "Stopp" : "Send"}
          >
            {isLoading ? (
              <div style={{
                width: 12, height: 12,
                background: T.text,
                borderRadius: 2,
              }} />
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
    </>
  );
}

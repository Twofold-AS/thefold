"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { T } from "@/lib/tokens";
import PillIcon from "@/components/PillIcon";
import TypewriterPlaceholder from "@/components/TypewriterPlaceholder";
import { ChevronDown, GitBranch } from "lucide-react";
import { useRepoContext } from "@/lib/repo-context";
import { scrapeUrl } from "@/lib/api/tools";

interface ChatInputProps {
  compact?: boolean;
  onSubmit?: (value: string) => void;
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
}: ChatInputProps) {
  const [v, setV] = useState("");
  const ty = v.length > 0;
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { repos, selectedRepo, selectRepo, clearRepo } = useRepoContext();

  // --- Firecrawl state ---
  const [firecrawlOpen, setFirecrawlOpen] = useState(false);
  const [firecrawlUrl, setFirecrawlUrl] = useState("");
  const [firecrawlLoading, setFirecrawlLoading] = useState(false);
  const [firecrawlError, setFirecrawlError] = useState<string | null>(null);

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
      onSubmit(v);
      setV("");
    }
  };

  // --- Firecrawl handler ---
  const handleFirecrawlScrape = async () => {
    if (!firecrawlUrl.trim()) return;
    setFirecrawlLoading(true);
    setFirecrawlError(null);
    try {
      const result = await scrapeUrl(firecrawlUrl.trim());
      const header = result.title
        ? `📄 Innhold fra: ${result.title}\nURL: ${firecrawlUrl.trim()}\n\n`
        : `📄 Innhold fra: ${firecrawlUrl.trim()}\n\n`;
      setV(prev => (prev ? `${prev}\n\n${header}${result.content}` : `${header}${result.content}`));
      setFirecrawlUrl("");
      setFirecrawlOpen(false);
    } catch (err) {
      setFirecrawlError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setFirecrawlLoading(false);
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
    <div
      style={{
        width: "100%",
        maxWidth: compact ? undefined : 700,
        background: "#1b1c1e",
        border: "none",
        borderRadius: "1.5rem",
        position: "relative",
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
            fontFamily: T.sans,
            position: "relative",
            zIndex: 1,
            resize: "none",
            overflowY: "hidden",
            lineHeight: 1.5,
            padding: "12px 0",
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Repo selector */}
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setRepoOpen(p => !p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                border: `1px solid ${selectedRepo ? T.accent + "40" : T.border}`,
                borderRadius: 999,
                fontSize: 11,
                fontFamily: T.mono,
                color: selectedRepo ? T.accent : T.textMuted,
                cursor: "pointer",
                background: selectedRepo ? T.accentDim : "transparent",
              }}
            >
              <GitBranch size={11} strokeWidth={2} />
              <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedRepo ? selectedRepo.name : "Velg repo"}
              </span>
              <ChevronDown size={10} strokeWidth={2} />
            </div>
            {repoOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setRepoOpen(false)} />
                <div style={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: 0,
                  background: T.popup,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  minWidth: 280,
                  maxHeight: 360,
                  overflowY: "auto",
                  zIndex: 99,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                  padding: "6px 0",
                }}>
                  <div style={{ padding: "8px 16px 6px", fontSize: 11, fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Velg repo
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
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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

          {/* Firecrawl: scrape URL */}
          <div style={{ position: "relative" }}>
            <PillIcon
              tooltip="Skrap URL med Firecrawl"
              active={firecrawlOpen}
              onClick={() => { setFirecrawlOpen(p => !p); setFirecrawlError(null); }}
            >
              {/* Globe icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </PillIcon>
            {firecrawlOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setFirecrawlOpen(false)} />
                <div style={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: 0,
                  background: T.popup ?? T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  padding: 12,
                  minWidth: 320,
                  zIndex: 99,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Skrap URL
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      autoFocus
                      type="url"
                      value={firecrawlUrl}
                      onChange={e => setFirecrawlUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleFirecrawlScrape(); if (e.key === "Escape") setFirecrawlOpen(false); }}
                      placeholder="https://..."
                      style={{
                        flex: 1,
                        background: T.raised,
                        border: `1px solid ${T.border}`,
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontFamily: T.mono,
                        color: T.text,
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={handleFirecrawlScrape}
                      disabled={firecrawlLoading || !firecrawlUrl.trim()}
                      style={{
                        background: T.accent,
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontSize: 12,
                        cursor: firecrawlLoading || !firecrawlUrl.trim() ? "not-allowed" : "pointer",
                        opacity: firecrawlLoading || !firecrawlUrl.trim() ? 0.6 : 1,
                        fontFamily: T.sans,
                        flexShrink: 0,
                      }}
                    >
                      {firecrawlLoading ? "Henter..." : "Hent"}
                    </button>
                  </div>
                  {firecrawlError && (
                    <div style={{ marginTop: 6, fontSize: 11, color: T.error ?? "#f87171" }}>
                      {firecrawlError}
                    </div>
                  )}
                  <div style={{ marginTop: 6, fontSize: 11, color: T.textFaint ?? T.textMuted }}>
                    Innholdet legges inn i meldingsfeltet som Markdown
                  </div>
                </div>
              </>
            )}
          </div>

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
              {/* Paperclip icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
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
                zIndex: 99,
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
                <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setModelOpen(false)} />
                <div style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  right: 0,
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  minWidth: 220,
                  zIndex: 99,
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
  );
}

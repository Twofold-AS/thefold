"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { T } from "@/lib/tokens";
import PillIcon from "@/components/PillIcon";
import TypewriterPlaceholder from "@/components/TypewriterPlaceholder";
import { ChevronDown } from "lucide-react";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div
      style={{
        width: "100%",
        maxWidth: compact ? undefined : 800,
        background: T.bg,
        border: "none",
        borderRadius: T.r * 1.5,
        position: "relative",
      }}
    >
      <div
        style={{
          minHeight: compact ? 48 : 56,
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
              top: compact ? 14 : 18,
              fontSize: 13,
              fontFamily: T.sans,
              pointerEvents: "none",
            }}
          >
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
          placeholder={placeholder}
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

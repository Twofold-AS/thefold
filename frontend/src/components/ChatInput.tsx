"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { T } from "@/lib/tokens";
import PillIcon from "@/components/PillIcon";
import TypewriterPlaceholder from "@/components/TypewriterPlaceholder";
import { Ghost } from "lucide-react";
import ComposerPopup, { type ComposerMode } from "@/components/ComposerPopup";
import SlashCommandDropdown from "@/components/SlashCommandDropdown";
import { matchSlashCommands, type SlashCommand } from "@/lib/slash-commands";
import {
  getConversationToolState,
  saveConversationToolState,
  listTFProjects,
  getIntegrationApiKeyStatus,
  uploadZip,
  type TFProject,
} from "@/lib/api";

/** ArrayBuffer → base64 (browser-safe, chunked to avoid stack overflow on large bufs). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
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
  autoMode?: boolean;
  onAutoModeToggle?: () => void;
  /** Fase I.0.e — per-samtale tool-state persistence */
  conversationId?: string;
  /** Fase I.0.f — filtrerer prosjekt-liste i "+"-popup */
  projectScope?: "cowork" | "designer";
  /** Fase I.0.f — kaller opp CodeProjectModal/DesignProjectModal (I.3) */
  onNewProject?: () => void;
  /** Fase I.0.e — valgt prosjekt for denne samtalen */
  selectedProjectId?: string | null;
  onSelectProject?: (id: string | null) => void;
  /** Active mode label (e.g. "Planlegger" / "Auto" / "Agenter"). When set,
   *  rendered as shimmer text beside the ghost icon. null = hide. */
  activeModeLabel?: string | null;
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
  autoMode,
  onAutoModeToggle,
  conversationId,
  projectScope,
  onNewProject,
  selectedProjectId,
  onSelectProject,
  activeModeLabel,
}: ChatInputProps) {
  const [v, setV] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const ty = v.length > 0;
  const hidePlaceholder = ty || isFocused;
  const [localPlanMode, setLocalPlanMode] = useState(false);
  const planMode = externalPlanMode !== undefined ? externalPlanMode : localPlanMode;
  const [firecrawlEnabled, setFirecrawlEnabled] = useState(false);
  // True once we've fetched /integrations/api-key/status for firecrawl.
  // null until checked (prevents flicker between "loading" and "disabled").
  const [firecrawlConfigured, setFirecrawlConfigured] = useState<boolean | null>(null);

  const [tfProjects, setTfProjects] = useState<TFProject[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Fase I.8 — Slash-command dropdown state
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [slashOpen, setSlashOpen] = useState(true);
  const slashScope = (projectScope ?? "cowork") as "cowork" | "designer";
  const slashMatches: SlashCommand[] =
    slashOpen && v.trimStart().startsWith("/") ? matchSlashCommands(v, slashScope) : [];
  const slashActive = slashMatches.length > 0;

  const applySlashCommand = (cmd: SlashCommand) => {
    setV(cmd.template);
    setSlashOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  useEffect(() => {
    const scope = projectScope ?? "cowork";
    listTFProjects(scope).then((r) => setTfProjects(r.projects ?? [])).catch(() => setTfProjects([]));
  }, [projectScope]);

  // Check if Firecrawl API-key is configured for this user (gates "Web søk"-toggle).
  useEffect(() => {
    let cancelled = false;
    getIntegrationApiKeyStatus("firecrawl")
      .then((r) => {
        if (cancelled) return;
        setFirecrawlConfigured(r.status.configured);
        // Default ON when configured AND no explicit user-saved state yet.
        if (r.status.configured && !conversationId) setFirecrawlEnabled(true);
      })
      .catch(() => { if (!cancelled) setFirecrawlConfigured(false); });
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    getConversationToolState(conversationId)
      .then((r) => {
        if (cancelled) return;
        setFirecrawlEnabled(!!r.state.toolToggles.firecrawl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId]);

  const persistState = useCallback((next: Record<string, boolean>) => {
    if (!conversationId) return;
    saveConversationToolState({
      conversationId,
      toolToggles: next,
      selectedSkillIds: selectedSkillIds ?? [],
      selectedModel: selectedModel ?? null,
      projectId: selectedProjectId ?? null,
      mode: next.autoMode ? "auto" : next.planMode ? "plan" : "chat",
    }).catch(() => {});
  }, [conversationId, selectedSkillIds, selectedModel, selectedProjectId]);

  // UX spec 2026-04-22 — mutually-exclusive Moduser: auto / agents / planner / null.
  // Derived from host-controlled booleans so state ownership stays with the page.
  const composerMode: ComposerMode =
    externalPlanMode ? "planner" :
    subAgentsEnabled ? "agents" :
    autoMode ? "auto" :
    null;

  const onChangeComposerMode = useCallback((next: ComposerMode) => {
    const shouldPlan = next === "planner";
    const shouldAgents = next === "agents";
    const shouldAuto = next === "auto";
    if (shouldPlan !== planMode) {
      if (onPlanModeToggle) onPlanModeToggle();
      else setLocalPlanMode(p => !p);
    }
    if (shouldAgents !== !!subAgentsEnabled) {
      onSubAgentsToggle?.();
    }
    if (shouldAuto !== !!autoMode) {
      onAutoModeToggle?.();
    }
    persistState({ autoMode: shouldAuto, planMode: shouldPlan, subAgents: shouldAgents });
  }, [planMode, subAgentsEnabled, autoMode, onPlanModeToggle, onSubAgentsToggle, onAutoModeToggle, persistState]);

  const onToggleWebSearch = useCallback((v: boolean) => {
    setFirecrawlEnabled(v);
    persistState({ firecrawl: v });
  }, [persistState]);

  const handleToggleSkill = useCallback((id: string, value: boolean) => {
    if (!onSkillsChange) return;
    const current = selectedSkillIds ?? [];
    const next = value ? Array.from(new Set([...current, id])) : current.filter((x) => x !== id);
    onSkillsChange(next);
  }, [onSkillsChange, selectedSkillIds]);

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
    // Guard against double-submit: if a request is in-flight (`isLoading`),
    // no-op. Users spamming Enter or clicking Send rapidly would otherwise
    // emit two send() calls and produce duplicate backend rows + responses.
    if (isLoading) return;
    if (v && onSubmit) {
      onSubmit(v, { planMode, firecrawlEnabled });
      setV("");
    }
  };

  // --- File upload handler: .md (inline), .zip (server extraction) ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    const name = file.name.toLowerCase();

    // .md: paste content inline into the message (legacy behaviour)
    if (name.endsWith(".md")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const header = `Fil: ${file.name}\n\n${text}`;
        setV((prev) => (prev ? `${header}\n\n${prev}` : header));
      };
      reader.readAsText(file);
      e.target.value = "";
      return;
    }

    // .zip: upload to backend for extraction. Requires an active conversation.
    if (name.endsWith(".zip")) {
      if (!conversationId) {
        setFileError("Start en samtale først før du laster opp .zip.");
        e.target.value = "";
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setFileError("Zip for stor (maks 50 MB).");
        e.target.value = "";
        return;
      }
      try {
        const arrayBuf = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuf);
        const result = await uploadZip(conversationId, file.name, base64);
        const summary = Object.entries(result.byCategory)
          .map(([cat, n]) => `${n} ${cat}`)
          .join(", ");
        const msg = `Lastet opp ${file.name}: ${result.filesExtracted} filer${summary ? ` (${summary})` : ""}. upload-id: ${result.uploadId}`;
        setV((prev) => (prev ? `${msg}\n\n${prev}` : msg));
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Zip-opplasting feilet");
      } finally {
        e.target.value = "";
      }
      return;
    }

    setFileError("Støttede filer: .md, .zip");
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
        {!hidePlaceholder && (
          <div style={{
            position: "absolute",
            top: 16,
            left: 20,
            pointerEvents: "none",
            fontSize: 13,
            fontFamily: T.sans,
          }}>
            <TypewriterPlaceholder active={hidePlaceholder} />
          </div>
        )}
        <textarea
          ref={textareaRef}
          data-chat-input
          rows={1}
          value={v}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(e) => { setV(e.target.value); setSlashOpen(true); setSlashActiveIndex(0); }}
          onKeyDown={(e) => {
            // Fase I.8 — Slash-command navigation
            if (slashActive) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashActiveIndex((i) => (i + 1) % slashMatches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashActiveIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const cmd = slashMatches[slashActiveIndex];
                if (cmd) applySlashCommand(cmd);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlashOpen(false);
                return;
              }
            }
            // Cmd+Enter (Mac) or Ctrl+Enter (Windows) — always send.
            // Skip when a request is in-flight (prevents double-submit).
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && v && !isLoading) {
              e.preventDefault();
              doSend();
              return;
            }
            // Plain Enter without Shift — send. Same in-flight guard.
            if (e.key === "Enter" && !e.shiftKey && v && !isLoading) {
              e.preventDefault();
              doSend();
              return;
            }
            // Escape — close open dropdowns
            if (e.key === "Escape") {
              setSlashOpen(false);
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
            fontWeight: 400,
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
          {/* UX cleanup 2026-04-22 — "+"-popup + ghost-incognito-button + send remain in bottom row. */}
          <ComposerPopup
            mode={composerMode}
            onChangeMode={onChangeComposerMode}
            webSearchEnabled={firecrawlEnabled}
            onToggleWebSearch={onToggleWebSearch}
            skills={(skills ?? []).map((s) => ({ id: s.id, name: s.name, enabled: s.enabled }))}
            selectedSkillIds={selectedSkillIds}
            onToggleSkill={handleToggleSkill}
            projects={tfProjects}
            selectedProjectId={selectedProjectId}
            onSelectProject={onSelectProject}
            onNewProject={onNewProject}
            models={models?.map((m) => ({
              id: m.id,
              displayName: m.displayName,
              provider: m.provider,
              supportsVision: (m as { supportsVision?: boolean }).supportsVision,
              tags: (m as { tags?: string[] }).tags,
            })) ?? []}
            selectedModel={selectedModel}
            onSelectModel={onModelChange}
            onAttachFile={() => { setFileError(null); fileInputRef.current?.click(); }}
            disabledItems={{
              auto: projectScope === "designer",
              webSearch: firecrawlConfigured === false,
            }}
            disabledTooltips={{
              webSearch: "Koble til Firecrawl i Innstillinger → Integrasjoner",
            }}
          />

          {/* Ghost-ikon: sticky inkognito-innganspunkt.
              - Når bruker ALLEREDE er i inkognito (enten via auto — ingen prosjekt — eller
                eksplisitt toggle): disabled, grå, ikke klikkbar. Ingen toggle-ut.
              - Når bruker er i et prosjekt: klikkbar → starter ny inkognito-samtale (forlater
                prosjektet, rydder URL, åpner ny chat).
              Inkognito er dermed "sticky per samtale" — forlates kun ved ny samtale i et prosjekt. */}
          {(() => {
            const alreadyIncognito = isIncognito || !selectedProjectId;
            return (
              <button
                type="button"
                onClick={alreadyIncognito ? undefined : () => onIncognitoToggle?.()}
                disabled={alreadyIncognito}
                title={
                  alreadyIncognito
                    ? "Du er allerede i inkognito"
                    : "Start ny inkognito-samtale"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: alreadyIncognito ? T.accent : T.textMuted,
                  cursor: alreadyIncognito ? "not-allowed" : "pointer",
                  opacity: alreadyIncognito ? 0.4 : 1,
                  flexShrink: 0,
                }}
              >
                <Ghost
                  size={16}
                  fill={alreadyIncognito ? T.accent : "none"}
                  strokeWidth={alreadyIncognito ? 2 : 1.5}
                />
              </button>
            );
          })()}
          {/* Active mode + model labels — shimmer text beside the ghost icon.
              Shown when planMode / autoMode / subAgentsEnabled is active,
              or when the user has picked a specific model (not "Smart"). */}
          {(() => {
            const selectedModelLabel = selectedModel
              ? (models?.find((m) => m.id === selectedModel)?.displayName ?? null)
              : null;
            const shimmerStyle: React.CSSProperties = {
              fontSize: 12,
              fontFamily: T.sans,
              fontWeight: 500,
              letterSpacing: "0.02em",
              flexShrink: 0,
              userSelect: "none",
              color: "transparent",
              backgroundImage:
                "linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.3) 100%)",
              backgroundSize: "200% 100%",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              animation: "tf-shimmer 2.5s linear infinite",
            };
            return (
              <>
                {activeModeLabel && <span style={shimmerStyle}>{activeModeLabel}</span>}
                {selectedModelLabel && <span style={shimmerStyle}>{selectedModelLabel}</span>}
              </>
            );
          })()}
          {/* Hidden file input — triggered by "+"-popup "Legg ved fil" action.
              Supports .md (pasted inline) and .zip (uploaded + extracted server-side). */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.zip"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {fileError && (
            <span style={{
              fontSize: 10, color: T.error ?? "#f87171", fontFamily: T.mono,
              paddingLeft: 8,
            }}>
              {fileError}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
    {/* Fase I.8 — Slash-command dropdown, UNDER chatboksen som plain text */}
    {slashActive && (
      <SlashCommandDropdown
        commands={slashMatches}
        activeIndex={Math.min(slashActiveIndex, slashMatches.length - 1)}
        onSelect={applySlashCommand}
        onHover={setSlashActiveIndex}
      />
    )}
    </>
  );
}

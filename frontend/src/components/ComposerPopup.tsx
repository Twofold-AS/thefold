"use client";

import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import {
  Plus,
  Zap,
  UsersRound,
  ListOrdered,
  Paperclip,
  Wand2,
  Globe,
  Folder,
  Check,
  ChevronLeft,
  Cpu,
  Eye,
} from "lucide-react";
import { T } from "@/lib/tokens";
import PlatformIcon from "@/components/icons/PlatformIcon";
import type { TFProject } from "@/lib/api";

// UX spec 2026-04-22 — Exact 6-item structure:
//   1. Moduser (mutually-exclusive group: Auto, Agenter, Planlegger)
//   2. Legg ved fil (direct action → opens file picker)
//   3. Skills (sub-popup with selectable skill list)
//   4. Web søk (toggle — firecrawl)
//   5. Prosjekter (sub-popup with project list + "+ Nytt prosjekt")
//   6. Inkognito (direct toggle)
//
// No more "Tools"-group or per-chat tool-toggle surface — those tools are
// implicit for AI based on project type + chat scope. Repo/model selectors
// removed from chatbox entirely.

export type ToolToggles = Record<string, boolean>;
export type ComposerMode = "auto" | "agents" | "planner" | null;

export interface SkillLite {
  id: string;
  name: string;
  enabled?: boolean;
}

interface ComposerPopupProps {
  /** Mutually-exclusive mode selection. Null = chat-only. */
  mode: ComposerMode;
  onChangeMode: (mode: ComposerMode) => void;
  /** Web-søk toggle (wired to firecrawl). */
  webSearchEnabled: boolean;
  onToggleWebSearch: (v: boolean) => void;
  /** @deprecated Inkognito moved to a ghost-button next to "+" in ChatInput. Kept for back-compat. */
  incognito?: boolean;
  /** @deprecated See `incognito`. */
  onToggleIncognito?: (v: boolean) => void;
  skills?: SkillLite[];
  selectedSkillIds?: string[];
  onToggleSkill?: (id: string, value: boolean) => void;
  projects?: TFProject[];
  selectedProjectId?: string | null;
  onSelectProject?: (id: string | null) => void;
  onNewProject?: () => void;
  /** Available AI models for manual override. */
  models?: Array<{
    id: string;
    displayName: string;
    provider: string;
    supportsVision?: boolean;
    tags?: string[];
  }>;
  /** Selected model id. null = Smart (AI) auto-routing. */
  selectedModel?: string | null;
  onSelectModel?: (id: string | null) => void;
  /** Legg ved fil: triggers host to open file picker. */
  onAttachFile?: () => void;
  /** Disabled-filter per host scope: hide/disable items not relevant to cowork vs designer. */
  disabledItems?: {
    auto?: boolean;
    agents?: boolean;
    planner?: boolean;
    skills?: boolean;
    webSearch?: boolean;
    incognito?: boolean;
  };
  /** Per-disabled-item tooltip, e.g. "Koble til Firecrawl i Innstillinger → Integrasjoner". */
  disabledTooltips?: {
    webSearch?: string;
  };
  disabled?: boolean;
}

type Section = "root" | "modes" | "skills" | "projects" | "models";

const MODE_LABEL: Record<"auto" | "agents" | "planner", string> = {
  auto: "Auto",
  agents: "Agenter",
  planner: "Planlegger",
};

export default function ComposerPopup({
  mode,
  onChangeMode,
  webSearchEnabled,
  onToggleWebSearch,
  incognito,
  onToggleIncognito,
  skills = [],
  selectedSkillIds = [],
  onToggleSkill,
  projects = [],
  selectedProjectId = null,
  onSelectProject,
  onNewProject,
  models = [],
  selectedModel = null,
  onSelectModel,
  onAttachFile,
  disabledItems = {},
  disabledTooltips = {},
  disabled,
}: ComposerPopupProps) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>("root");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - r.top + 6,
      left: r.left,
    });
  }, []);

  useEffect(() => {
    if (open) updatePos();
  }, [open, updatePos]);

  const close = () => { setOpen(false); setSection("root"); };

  const projectName = projects.find((p) => p.id === selectedProjectId)?.name;
  const skillCount = selectedSkillIds.length;
  const selectedModelName = selectedModel
    ? models.find((m) => m.id === selectedModel)?.displayName
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { updatePos(); setOpen((p) => !p); } }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          // Plain plus — no border or background.
          border: "none",
          background: "transparent",
          color: open ? T.text : T.textMuted,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          flexShrink: 0,
          padding: 0,
        }}
        title="Moduser og verktøy"
      >
        <Plus size={16} />
      </button>

      {open && (
        <>
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "transparent" }} />
          <div
            style={{
              position: "fixed",
              bottom: pos.bottom,
              left: pos.left,
              width: 280,
              maxHeight: 460,
              background: T.popup ?? T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              zIndex: 9999,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              fontFamily: T.sans,
            }}
          >
            {section === "root" && (
              <div style={{ padding: 4, display: "flex", flexDirection: "column" }}>
                {/* 1. Moduser — sub-popup (matches Prosjekter pattern) */}
                <NavRow
                  icon={mode === "auto" ? <Zap size={14} /> : mode === "agents" ? <UsersRound size={14} /> : mode === "planner" ? <ListOrdered size={14} /> : <Zap size={14} />}
                  label="Moduser"
                  badge={mode ? MODE_LABEL[mode] : undefined}
                  onClick={() => setSection("modes")}
                />

                {/* 2. Legg ved fil — direct action */}
                <ActionRow
                  icon={<Paperclip size={14} />}
                  label="Legg ved fil"
                  onClick={() => { onAttachFile?.(); close(); }}
                />

                {/* 3. Skills — sub-popup */}
                <NavRow
                  icon={<Wand2 size={14} />}
                  label="Skills"
                  badge={skillCount > 0 ? String(skillCount) : undefined}
                  disabled={disabledItems.skills}
                  onClick={() => setSection("skills")}
                />

                {/* 4. Web søk — enabled når bruker har konfigurert Firecrawl-nøkkel.
                    Toggle bestemmer om web_scrape-tool er tilgjengelig for AI denne turen. */}
                <ToggleRow
                  icon={<Globe size={14} />}
                  label="Web søk"
                  checked={webSearchEnabled}
                  disabled={disabledItems.webSearch}
                  disabledTooltip={disabledTooltips.webSearch}
                  onChange={onToggleWebSearch}
                />

                {/* 5. Prosjekter — sub-popup */}
                <NavRow
                  icon={<Folder size={14} />}
                  label="Prosjekter"
                  badge={projectName}
                  onClick={() => setSection("projects")}
                />

                {/* 6. Modell — sub-popup. Default "Smart (AI)" = auto-routing. */}
                <NavRow
                  icon={<Cpu size={14} />}
                  label="Modell"
                  badge={selectedModelName ?? "Smart (AI)"}
                  onClick={() => setSection("models")}
                />

                {/* Inkognito moved to a ghost-button next to "+" in ChatInput (2026-04-22). */}
              </div>
            )}

            {section === "modes" && (
              <SubPanel title="Moduser" onBack={() => setSection("root")}>
                <ModeRow
                  icon={<Zap size={14} />}
                  label="Auto"
                  active={mode === "auto"}
                  disabled={disabledItems.auto}
                  onClick={() => { onChangeMode(mode === "auto" ? null : "auto"); setSection("root"); }}
                />
                <ModeRow
                  icon={<UsersRound size={14} />}
                  label="Agenter"
                  active={mode === "agents"}
                  disabled={disabledItems.agents}
                  onClick={() => { onChangeMode(mode === "agents" ? null : "agents"); setSection("root"); }}
                />
                <ModeRow
                  icon={<ListOrdered size={14} />}
                  label="Planlegger"
                  active={mode === "planner"}
                  disabled={disabledItems.planner}
                  onClick={() => { onChangeMode(mode === "planner" ? null : "planner"); setSection("root"); }}
                />
                {mode !== null && (
                  <>
                    <Divider />
                    <ActionRow
                      icon={<Zap size={14} />}
                      label="Ingen modus (chat)"
                      onClick={() => { onChangeMode(null); setSection("root"); }}
                    />
                  </>
                )}
              </SubPanel>
            )}

            {section === "skills" && (
              <SubPanel title="Skills" onBack={() => setSection("root")}>
                {skills.length === 0 ? (
                  <EmptyRow label="Ingen skills tilgjengelig" />
                ) : (
                  skills.map((s) => (
                    <ToggleRow
                      key={s.id}
                      icon={<Wand2 size={13} />}
                      label={s.name}
                      checked={selectedSkillIds.includes(s.id)}
                      onChange={(v) => onToggleSkill?.(s.id, v)}
                    />
                  ))
                )}
              </SubPanel>
            )}

            {section === "models" && (
              <SubPanel title="Modell" onBack={() => setSection("root")}>
                {/* Smart (AI) default */}
                <div
                  onClick={() => { onSelectModel?.(null); close(); }}
                  style={{ ...listRowStyle, background: selectedModel === null ? T.tabActive : "transparent" }}
                >
                  <Zap size={13} style={{ color: T.accent, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>Smart (AI)</div>
                    <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>
                      Velger modell automatisk basert på oppgave
                    </div>
                  </div>
                  {selectedModel === null && <Check size={13} style={{ color: T.accent, flexShrink: 0 }} />}
                </div>
                <Divider />
                {models.length === 0 ? (
                  <EmptyRow label="Ingen modeller tilgjengelig" />
                ) : (
                  models.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => { onSelectModel?.(m.id); close(); }}
                      style={{ ...listRowStyle, background: selectedModel === m.id ? T.tabActive : "transparent" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.displayName}
                          </span>
                          {m.supportsVision && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              fontSize: 9, color: T.accent, padding: "1px 5px",
                              border: `1px solid ${T.accent}40`, borderRadius: 3,
                              fontFamily: T.mono,
                            }}>
                              <Eye size={9} /> vision
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, marginTop: 2 }}>
                          {m.provider}{m.tags && m.tags.length > 0 ? ` · ${m.tags.join(" · ")}` : ""}
                        </div>
                      </div>
                      {selectedModel === m.id && <Check size={13} style={{ color: T.accent, flexShrink: 0 }} />}
                    </div>
                  ))
                )}
              </SubPanel>
            )}

            {section === "projects" && (
              <SubPanel title="Prosjekter" onBack={() => setSection("root")}>
                <div
                  onClick={() => { onSelectProject?.(null); close(); }}
                  style={{ ...listRowStyle, background: selectedProjectId === null ? T.tabActive : "transparent" }}
                >
                  <span style={{ fontSize: 13, color: T.textMuted, fontStyle: "italic" }}>Ingen (globalt)</span>
                </div>
                {projects.length === 0 ? (
                  <EmptyRow label="Ingen prosjekter ennå" />
                ) : (
                  projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => { onSelectProject?.(p.id); close(); }}
                      style={{ ...listRowStyle, background: selectedProjectId === p.id ? T.tabActive : "transparent" }}
                    >
                      <PlatformIcon type={p.projectType} size={13} />
                      <span style={{ flex: 1, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                    </div>
                  ))
                )}
                {onNewProject && (
                  <BottomButton onClick={() => { onNewProject(); close(); }} label="+ Nytt prosjekt" />
                )}
              </SubPanel>
            )}
          </div>
        </>
      )}
    </>
  );
}

// --- Row variants ---

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "8px 12px 4px",
      fontSize: 10,
      fontWeight: 600,
      color: T.textFaint,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: T.border, margin: "4px 8px" }} />;
}

function ModeRow({
  icon, label, active, disabled, onClick,
}: { icon: React.ReactNode; label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...baseRowStyle,
        background: active ? T.tabActive : "transparent",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => { if (!disabled && !active) e.currentTarget.style.background = T.subtle; }}
      onMouseLeave={(e) => { if (!disabled && !active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ display: "inline-flex", width: 18, justifyContent: "center", color: active ? T.accent : T.textMuted }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: T.text, textAlign: "left" }}>{label}</span>
      {active && <Check size={12} color={T.accent} />}
    </button>
  );
}

function ActionRow({
  icon, label, onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...baseRowStyle, background: "transparent", cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.subtle; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ display: "inline-flex", width: 18, justifyContent: "center", color: T.textMuted }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: T.text, textAlign: "left" }}>{label}</span>
    </button>
  );
}

function NavRow({
  icon, label, badge, disabled, onClick,
}: { icon: React.ReactNode; label: string; badge?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...baseRowStyle,
        background: "transparent",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = T.subtle; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ display: "inline-flex", width: 18, justifyContent: "center", color: T.textMuted }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: T.text, textAlign: "left" }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 11, color: T.textMuted, padding: "1px 6px",
          background: T.tabActive, borderRadius: 6, fontFamily: T.mono,
          maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function ToggleRow({
  icon, label, checked, disabled, disabledTooltip, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      title={disabled ? disabledTooltip : undefined}
      style={{
        ...baseRowStyle,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = T.subtle; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ display: "inline-flex", width: 18, justifyContent: "center", color: checked ? T.accent : T.textMuted }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: T.text }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: T.accent, cursor: disabled ? "not-allowed" : "pointer" }}
      />
    </label>
  );
}

function SubPanel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px", borderBottom: `1px solid ${T.border}`,
      }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: T.textMuted, display: "inline-flex", padding: 2,
          }}
          title="Tilbake"
        >
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {title}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        {children}
      </div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div style={{ padding: "18px 12px", fontSize: 12, color: T.textMuted, textAlign: "center" }}>
      {label}
    </div>
  );
}

function BottomButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: 4 }}>
      <button
        onClick={onClick}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          borderRadius: 8,
          fontSize: 13,
          color: T.accent,
          fontFamily: T.sans,
          cursor: "pointer",
          textAlign: "left",
          fontWeight: 500,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.subtle; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {label}
      </button>
    </div>
  );
}

const baseRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  margin: 0,
  border: "none",
  borderRadius: 8,
  fontFamily: "inherit",
  textAlign: "left",
  width: "100%",
};

const listRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  cursor: "pointer",
  borderRadius: 8,
};

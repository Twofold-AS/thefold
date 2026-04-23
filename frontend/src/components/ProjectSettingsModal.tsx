"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { T } from "@/lib/tokens";
import PlatformIcon from "@/components/icons/PlatformIcon";
import ProjectFilesTab from "@/components/ProjectFilesTab";
import ProjectScrapesTab from "@/components/ProjectScrapesTab";
import {
  type TFProject,
  type TFProjectSourceOfTruth,
  updateTFProject,
  archiveTFProject,
  listProjectApiKeys,
  setProjectApiKey,
} from "@/lib/api";

type SettingsTab = "overview" | "files" | "scrapes";

interface ProjectSettingsModalProps {
  project: TFProject | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (p: TFProject) => void;
  onArchived?: (id: string) => void;
}

// Fase I.0.d — Per-prosjekt innstillinger (platform-agnostisk).
// Felter: navn, beskrivelse, source-of-truth, GitHub-flags, Framer/Figma-URL.
// Navnet kan endres (globalt UNIQUE på backend).
export default function ProjectSettingsModal({
  project,
  open,
  onClose,
  onSaved,
  onArchived,
}: ProjectSettingsModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceOfTruth, setSourceOfTruth] = useState<TFProjectSourceOfTruth>("repo");
  const [githubPrivate, setGithubPrivate] = useState(true);
  const [githubAutoMerge, setGithubAutoMerge] = useState(false);
  const [githubAutoPr, setGithubAutoPr] = useState(true);
  const [framerSiteUrl, setFramerSiteUrl] = useState("");
  const [figmaFileUrl, setFigmaFileUrl] = useState("");
  const [framerApiKey, setFramerApiKey] = useState("");
  const [framerKeyPreview, setFramerKeyPreview] = useState<string | null>(null);
  const [showFramerKey, setShowFramerKey] = useState(false);
  const [figmaApiKey, setFigmaApiKey] = useState("");
  const [figmaKeyPreview, setFigmaKeyPreview] = useState<string | null>(null);
  const [showFigmaKey, setShowFigmaKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SettingsTab>("overview");

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setSourceOfTruth(project.sourceOfTruth);
    setGithubPrivate(project.githubPrivate);
    setGithubAutoMerge(project.githubAutoMerge);
    setGithubAutoPr(project.githubAutoPr);
    setFramerSiteUrl(project.framerSiteUrl ?? "");
    setFigmaFileUrl(project.figmaFileUrl ?? "");
    setFramerApiKey("");
    setFigmaApiKey("");
    setShowFramerKey(false);
    setShowFigmaKey(false);
    setError(null);
    // Load existing API-key previews so UI shows whether a key is set.
    let cancelled = false;
    listProjectApiKeys(project.id)
      .then(({ keys }) => {
        if (cancelled) return;
        setFramerKeyPreview(keys.find((k) => k.keyName === "framer")?.preview ?? null);
        setFigmaKeyPreview(keys.find((k) => k.keyName === "figma")?.preview ?? null);
      })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [project]);

  const handleSave = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      // Persist API keys first (empty string = user didn't touch the field).
      if (framerApiKey.trim()) {
        await setProjectApiKey(project.id, "framer", framerApiKey.trim());
      }
      if (figmaApiKey.trim()) {
        await setProjectApiKey(project.id, "figma", figmaApiKey.trim());
      }
      const res = await updateTFProject(project.id, {
        name: name.trim() || project.name,
        description: description.trim() || undefined,
        githubPrivate,
        githubAutoMerge,
        githubAutoPr,
        framerSiteUrl: framerSiteUrl.trim() || undefined,
        figmaFileUrl: figmaFileUrl.trim() || undefined,
        sourceOfTruth,
      });
      onSaved?.(res.project);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  }, [project, name, description, githubPrivate, githubAutoMerge, githubAutoPr, framerSiteUrl, figmaFileUrl, sourceOfTruth, framerApiKey, figmaApiKey, onSaved, onClose]);

  const handleArchive = useCallback(async () => {
    if (!project) return;
    if (!confirm(`Arkivere prosjektet "${project.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await archiveTFProject(project.id);
      onArchived?.(project.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke arkivere");
    } finally {
      setSaving(false);
    }
  }, [project, onArchived, onClose]);

  if (!open || !project) return null;

  const showGithub = project.projectType === "code" || project.projectType === "framer_figma";
  const showFramer = project.projectType === "framer" || project.projectType === "framer_figma";
  const showFigma = project.projectType === "figma" || project.projectType === "framer_figma";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.sidebar,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          width: "100%",
          maxWidth: 720,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: T.sans,
          color: T.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <PlatformIcon type={project.projectType} size={18} />
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{project.name}</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: T.textMuted, display: "flex", alignItems: "center" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab-switcher */}
        <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>Oversikt</TabBtn>
          <TabBtn active={tab === "files"} onClick={() => setTab("files")}>Opplastede filer</TabBtn>
          <TabBtn active={tab === "scrapes"} onClick={() => setTab("scrapes")}>Web-scrapes</TabBtn>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px 24px" }}>
          {tab === "files" && <ProjectFilesTab projectId={project.id} />}
          {tab === "scrapes" && <ProjectScrapesTab projectId={project.id} />}
          {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Navn">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label="Beskrivelse">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle(), resize: "vertical", minHeight: 60 }}
            />
          </Field>

          <Field label="Kilde for sannhet">
            <select
              value={sourceOfTruth}
              onChange={(e) => setSourceOfTruth(e.target.value as TFProjectSourceOfTruth)}
              style={inputStyle()}
            >
              <option value="repo">Repo (GitHub)</option>
              <option value="framer">Framer</option>
              <option value="figma">Figma</option>
            </select>
          </Field>

          {showGithub && (
            <section style={sectionStyle()}>
              <SectionHeader>GitHub</SectionHeader>
              <CheckboxRow checked={githubPrivate} onChange={setGithubPrivate} label="Privat repo" />
              <CheckboxRow checked={githubAutoPr} onChange={setGithubAutoPr} label="Auto-PR ved endringer" />
              <CheckboxRow checked={githubAutoMerge} onChange={setGithubAutoMerge} label="Auto-merge etter review" />
            </section>
          )}

          {showFramer && (
            <section style={sectionStyle()}>
              <SectionHeader>Framer</SectionHeader>
              <Field label="Site URL">
                <input
                  value={framerSiteUrl}
                  onChange={(e) => setFramerSiteUrl(e.target.value)}
                  placeholder="https://framer.com/projects/..."
                  style={inputStyle()}
                />
              </Field>
              <Field label="API-nøkkel">
                <ApiKeyInput
                  value={framerApiKey}
                  onChange={setFramerApiKey}
                  preview={framerKeyPreview}
                  show={showFramerKey}
                  onToggleShow={() => setShowFramerKey((v) => !v)}
                  placeholderWhenEmpty="fp_..."
                />
              </Field>
            </section>
          )}

          {showFigma && (
            <section style={sectionStyle()}>
              <SectionHeader>Figma</SectionHeader>
              <Field label="File URL">
                <input
                  value={figmaFileUrl}
                  onChange={(e) => setFigmaFileUrl(e.target.value)}
                  placeholder="https://figma.com/file/..."
                  style={inputStyle()}
                />
              </Field>
              <Field label="API-nøkkel">
                <ApiKeyInput
                  value={figmaApiKey}
                  onChange={setFigmaApiKey}
                  preview={figmaKeyPreview}
                  show={showFigmaKey}
                  onToggleShow={() => setShowFigmaKey((v) => !v)}
                  placeholderWhenEmpty="figd_..."
                />
              </Field>
            </section>
          )}

          {error && (
            <div style={{ color: T.error ?? "#f87171", fontSize: 12, padding: "6px 8px", background: "rgba(248,113,113,0.08)", borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <button
              onClick={handleArchive}
              disabled={saving}
              style={{ ...buttonStyle("ghost"), color: T.error ?? "#f87171" }}
            >
              Arkiver
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} disabled={saving} style={buttonStyle("ghost")}>Avbryt</button>
              <button onClick={handleSave} disabled={saving} style={buttonStyle("primary")}>
                {saving ? "Lagrer..." : "Lagre"}
              </button>
            </div>
          </div>
        </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 14px",
        fontSize: 12,
        fontFamily: T.sans,
        color: active ? T.text : T.textMuted,
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? T.accent : "transparent"}`,
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
      {children}
    </div>
  );
}

function ApiKeyInput({
  value, onChange, preview, show, onToggleShow, placeholderWhenEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  preview: string | null;
  show: boolean;
  onToggleShow: () => void;
  placeholderWhenEmpty: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={preview ?? placeholderWhenEmpty}
        style={{ ...inputStyle(), paddingRight: 38 }}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={onToggleShow}
        title={show ? "Skjul" : "Vis"}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: T.textMuted,
          padding: 4,
          display: "flex",
          alignItems: "center",
        }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function CheckboxRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ color: T.text }}>{label}</span>
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: T.search,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: T.text,
    fontFamily: T.sans,
    outline: "none",
    width: "100%",
  };
}

function sectionStyle(): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    background: T.tabActive,
    borderRadius: 10,
  };
}

function buttonStyle(variant: "primary" | "ghost"): React.CSSProperties {
  if (variant === "primary") {
    return {
      padding: "8px 14px",
      background: T.accent,
      color: "#fff",
      border: "none",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      fontFamily: T.sans,
    };
  }
  return {
    padding: "8px 14px",
    background: "transparent",
    color: T.textMuted,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: T.sans,
  };
}

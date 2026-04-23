"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Github } from "lucide-react";
import { T } from "@/lib/tokens";
import {
  type TFProject,
  createTFProject,
  checkProjectName,
} from "@/lib/api";

// CoWork "Start nytt prosjekt"-modal. GitHub-org er hardkodet globalt
// (thefold-dev) og eksponeres ikke i UI — bruker kan ikke overstyre.
// Styling matcher "+"-popup (T.popup + 14 px radius + 40 px shadow).

/** Global GitHub org for TheFold — samme som i ai/prompts.ts systemprompt. */
const DEFAULT_GITHUB_ORG = "thefold-dev";

interface CodeProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (p: TFProject) => void;
}

export default function CodeProjectModal({ open, onClose, onCreated }: CodeProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [githubPrivate, setGithubPrivate] = useState(true);
  const [githubAutoPr, setGithubAutoPr] = useState(true);
  const [githubAutoMerge, setGithubAutoMerge] = useState(false);
  const [createGithubRepo, setCreateGithubRepo] = useState(true);
  const [checking, setChecking] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setError(null);
      setNameError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!name.trim()) { setNameError(null); return; }
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const r = await checkProjectName(name.trim());
        setNameError(r.available ? null : (r.reason ?? "Navnet er allerede i bruk"));
      } catch {
        setNameError(null);
      } finally {
        setChecking(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [name]);

  const canSubmit = name.trim().length > 0 && !nameError && !checking && !saving;

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createTFProject({
        name: name.trim(),
        projectType: "code",
        description: description.trim() || undefined,
        githubPrivate,
        githubAutoPr,
        githubAutoMerge,
        createGithubRepo,
        githubOrg: DEFAULT_GITHUB_ORG,
      } as Parameters<typeof createTFProject>[0]);
      onCreated?.(res.project);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke opprette prosjekt");
    } finally {
      setSaving(false);
    }
  }, [canSubmit, name, description, githubPrivate, githubAutoPr, githubAutoMerge, createGithubRepo, onCreated, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.popup ?? T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          width: "100%", maxWidth: 520, padding: 24,
          fontFamily: T.sans, color: T.text,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Github size={16} color="#FFFFFF" />
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Start nytt prosjekt</h2>
          </div>
          <button onClick={onClose} style={iconBtn()}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Navn">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mitt-prosjekt"
              style={input()}
            />
            {nameError && <Hint error>{nameError}</Hint>}
            {checking && !nameError && <Hint>Sjekker tilgjengelighet...</Hint>}
          </Field>

          <Field label="Beskrivelse (valgfri)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...input(), resize: "vertical" }}
            />
          </Field>

          <section style={section()}>
            <SectionHeader>GitHub</SectionHeader>
            <CheckboxRow
              checked={createGithubRepo}
              onChange={setCreateGithubRepo}
              label="Opprett Github prosjekt automatisk"
            />
            <CheckboxRow
              checked={githubPrivate}
              onChange={setGithubPrivate}
              label={githubPrivate ? "Privat prosjekt" : "Offentlig prosjekt"}
            />
            <CheckboxRow checked={githubAutoPr} onChange={setGithubAutoPr} label="Auto-PR ved endringer" />
            <CheckboxRow checked={githubAutoMerge} onChange={setGithubAutoMerge} label="Auto-merge etter review" />
          </section>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={btn("ghost")}>Avbryt</button>
            <button onClick={handleCreate} disabled={!canSubmit} style={{ ...btn("primary"), opacity: canSubmit ? 1 : 0.5 }}>
              {saving ? "Oppretter..." : "Opprett"}
            </button>
          </div>
        </div>
      </div>
    </div>
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

function CheckboxRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ color: T.text }}>{label}</span>
    </label>
  );
}

function Hint({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <div style={{ fontSize: 11, color: error ? (T.error ?? "#f87171") : T.textMuted }}>{children}</div>;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: T.error ?? "#f87171", padding: "6px 8px", background: "rgba(248,113,113,0.08)", borderRadius: 6 }}>
      {children}
    </div>
  );
}

function input(): React.CSSProperties {
  return {
    background: T.search, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: "8px 10px", fontSize: 13, color: T.text, fontFamily: T.sans, outline: "none", width: "100%",
  };
}
function section(): React.CSSProperties {
  return { display: "flex", flexDirection: "column", gap: 8, padding: 12, background: T.tabActive, borderRadius: 10 };
}
function btn(variant: "primary" | "ghost"): React.CSSProperties {
  if (variant === "primary") {
    return { padding: "8px 14px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.sans };
  }
  return { padding: "8px 14px", background: "transparent", color: T.textMuted, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: T.sans };
}
function iconBtn(): React.CSSProperties {
  return { background: "transparent", border: "none", cursor: "pointer", color: T.textMuted, display: "flex", alignItems: "center" };
}

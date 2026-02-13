"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listSkills,
  createSkill,
  toggleSkill,
  deleteSkill,
  previewPrompt,
  type Skill,
} from "@/lib/api";

const CONTEXTS = ["coding", "review", "planning", "chat"] as const;

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [previewContext, setPreviewContext] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadSkills = useCallback(async () => {
    try {
      const result = await listSkills();
      setSkills(result.skills);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke laste skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const result = await toggleSkill(id, enabled);
      setSkills((prev) => prev.map((s) => (s.id === id ? result.skill : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke oppdatere skill");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Er du sikker på at du vil slette "${name}"?`)) return;
    try {
      await deleteSkill(id);
      setSkills((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke slette skill");
    }
  }

  async function handlePreview(context: string) {
    if (previewContext === context) {
      setPreviewContext(null);
      return;
    }
    setPreviewContext(context);
    setPreviewLoading(true);
    try {
      const result = await previewPrompt(context);
      setPreviewContent(result.systemPrompt);
    } catch {
      setPreviewContent("Kunne ikke laste forhåndsvisning");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCreated(skill: Skill) {
    setSkills((prev) => [...prev, skill]);
    setShowCreate(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div
          className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--sidebar-text-active)" }}
        />
      </div>
    );
  }

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="font-heading text-[32px] font-semibold leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Skills
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Administrer AI-instruksjoner som injiseres i system-prompten. {enabledCount} av{" "}
            {skills.length} aktive.
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary text-sm">
          {showCreate ? "Avbryt" : "Ny skill"}
        </button>
      </div>

      {error && (
        <div
          className="mt-4 px-4 py-3 rounded-lg text-sm"
          style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}
        >
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mt-6">
          <CreateSkillForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
        </div>
      )}

      {/* Prompt Preview */}
      <div className="mt-8">
        <h2
          className="font-heading text-lg font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Forhåndsvis system-prompt
        </h2>
        <div className="flex gap-2 flex-wrap">
          {CONTEXTS.map((ctx) => (
            <button
              key={ctx}
              onClick={() => handlePreview(ctx)}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                background: previewContext === ctx ? "var(--accent)" : "var(--bg-card)",
                color: previewContext === ctx ? "#fff" : "var(--text-primary)",
                border: `1px solid ${previewContext === ctx ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {ctx}
            </button>
          ))}
        </div>
        {previewContext && (
          <div
            className="mt-3 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[300px]"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            {previewLoading ? (
              <span style={{ color: "var(--text-muted)" }}>Laster...</span>
            ) : (
              <pre className="whitespace-pre-wrap">{previewContent}</pre>
            )}
          </div>
        )}
      </div>

      {/* Skills List */}
      <div className="mt-8 space-y-3">
        {skills.length === 0 ? (
          <div
            className="text-center py-12 rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Ingen skills enda. Opprett en for å komme i gang.
            </p>
          </div>
        ) : (
          skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- Skill Card ---

function SkillCard({
  skill,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${skill.enabled ? "var(--border)" : "var(--border)"}`,
        opacity: skill.enabled ? 1 : 0.6,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm font-medium hover:underline text-left"
              style={{ color: "var(--text-primary)" }}
            >
              {skill.name}
            </button>
            <div className="flex gap-1.5 flex-wrap">
              {skill.appliesTo.map((ctx) => (
                <span
                  key={ctx}
                  className="px-2 py-0.5 text-[10px] rounded-full"
                  style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
                >
                  {ctx}
                </span>
              ))}
            </div>
          </div>
          <p
            className="text-xs mt-1 line-clamp-2"
            style={{ color: "var(--text-muted)" }}
          >
            {skill.description}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Toggle */}
          <button
            onClick={() => onToggle(skill.id, !skill.enabled)}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{
              background: skill.enabled ? "var(--accent)" : "var(--bg-sidebar)",
            }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
              style={{
                background: "#fff",
                left: skill.enabled ? "22px" : "2px",
              }}
            />
          </button>

          {/* Delete */}
          <button
            onClick={() => onDelete(skill.id, skill.name)}
            className="p-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: "var(--text-muted)" }}
            title="Slett"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded view: prompt fragment */}
      {expanded && (
        <div
          className="mt-3 rounded-lg p-3 text-xs font-mono overflow-auto max-h-[200px]"
          style={{
            background: "var(--bg-sidebar)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <pre className="whitespace-pre-wrap">{skill.promptFragment}</pre>
        </div>
      )}
    </div>
  );
}

// --- Create Skill Form ---

function CreateSkillForm({
  onCreated,
  onCancel,
}: {
  onCreated: (skill: Skill) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptFragment, setPromptFragment] = useState("");
  const [appliesTo, setAppliesTo] = useState<string[]>([]);
  const [scope, setScope] = useState("global");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleContext(ctx: string) {
    setAppliesTo((prev) =>
      prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !description || !promptFragment || appliesTo.length === 0) {
      setError("Alle felt er påkrevd, og minst én kontekst må velges.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await createSkill({ name, description, promptFragment, appliesTo, scope });
      onCreated(result.skill);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke opprette skill");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-6 space-y-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <h3 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        Opprett ny skill
      </h3>

      {error && (
        <p className="text-sm" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
          Navn
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="f.eks. Security Awareness"
          className="input-field w-full text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
          Beskrivelse
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Kort beskrivelse av hva denne skillen gjør"
          className="input-field w-full text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
          Prompt-fragment
        </label>
        <textarea
          value={promptFragment}
          onChange={(e) => setPromptFragment(e.target.value)}
          placeholder="Instruksjoner som injiseres i system-prompten..."
          rows={6}
          className="input-field w-full text-sm font-mono"
        />
      </div>

      <div>
        <label className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
          Gjelder for
        </label>
        <div className="flex gap-2 flex-wrap">
          {CONTEXTS.map((ctx) => (
            <button
              key={ctx}
              type="button"
              onClick={() => toggleContext(ctx)}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                background: appliesTo.includes(ctx) ? "var(--accent)" : "var(--bg-sidebar)",
                color: appliesTo.includes(ctx) ? "#fff" : "var(--text-muted)",
                border: `1px solid ${appliesTo.includes(ctx) ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {ctx}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
          Scope
        </label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="input-field w-auto text-sm"
        >
          <option value="global">Global</option>
          <option value="repo:thefold">Kun TheFold-repo</option>
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Oppretter..." : "Opprett skill"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          Avbryt
        </button>
      </div>
    </form>
  );
}

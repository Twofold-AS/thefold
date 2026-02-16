"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listSkills,
  listRepos,
  createSkill,
  updateSkill,
  toggleSkill,
  deleteSkill,
  type Skill,
  type RepoInfo,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Panels
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [skillsRes, reposRes] = await Promise.all([
        listSkills(),
        listRepos("Twofold-AS").catch(() => ({ repos: [] })),
      ]);
      setSkills(skillsRes.skills);
      setRepos(reposRes.repos);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke laste skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const result = await toggleSkill(id, enabled);
      setSkills((prev) => prev.map((s) => (s.id === id ? result.skill : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke oppdatere skill");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Er du sikker pa at du vil slette "${name}"?`)) return;
    try {
      await deleteSkill(id);
      setSkills((prev) => prev.filter((s) => s.id !== id));
      if (detailSkill?.id === id) setDetailSkill(null);
      if (editingSkill?.id === id) setEditingSkill(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke slette skill");
    }
  }

  function handleSaved(skill: Skill) {
    setSkills((prev) => {
      const idx = prev.findIndex((s) => s.id === skill.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = skill;
        return updated;
      }
      return [...prev, skill];
    });
    setShowCreate(false);
    setEditingSkill(null);
  }

  const filtered = skills.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const enabledCount = skills.filter((s) => s.enabled).length;

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

  return (
    <div className="relative">
      <PageHeaderBar title="Skills" />
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {enabledCount} av {skills.length} aktive
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            + Ny skill
          </button>
        </div>

        {error && (
          <div
            className="mb-4 px-4 py-3 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}
          >
            {error}
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Sok..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field text-sm"
            style={{ width: "260px" }}
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div
              className="col-span-full text-center py-12"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {skills.length === 0 ? "Ingen skills enda. Opprett en for a komme i gang." : "Ingen skills matcher soket."}
              </p>
            </div>
          ) : (
            filtered.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onToggle={handleToggle}
                onClick={() => setDetailSkill(skill)}
              />
            ))
          )}
        </div>
      </div>

      {/* Slide-over: Create */}
      {showCreate && (
        <SlideOver title="Ny skill" onClose={() => setShowCreate(false)}>
          <SkillForm repos={repos} onSave={handleSaved} onCancel={() => setShowCreate(false)} />
        </SlideOver>
      )}

      {/* Slide-over: Edit */}
      {editingSkill && (
        <SlideOver title="Rediger skill" onClose={() => setEditingSkill(null)}>
          <SkillForm skill={editingSkill} repos={repos} onSave={handleSaved} onCancel={() => setEditingSkill(null)} />
        </SlideOver>
      )}

      {/* Slide-over: Detail */}
      {detailSkill && (
        <SlideOver title={detailSkill.name} onClose={() => setDetailSkill(null)}>
          <SkillDetail
            skill={detailSkill}
            onEdit={() => { setEditingSkill(detailSkill); setDetailSkill(null); }}
            onDelete={() => { handleDelete(detailSkill.id, detailSkill.name); }}
          />
        </SlideOver>
      )}
    </div>
  );
}

// --- Skill Card (simplified) ---

function SkillCard({
  skill,
  onToggle,
  onClick,
}: {
  skill: Skill;
  onToggle: (id: string, enabled: boolean) => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
      style={{
        background: "var(--bg-card)",
        border: skill.enabled ? "1px solid var(--border)" : "1px solid transparent",
        opacity: skill.enabled ? 1 : 0.5,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {skill.name}
          </h3>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-muted)" }}>
            {skill.description}
          </p>
        </div>

        {/* Toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(skill.id, !skill.enabled); }}
          className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
          style={{ background: skill.enabled ? "var(--accent)" : "var(--bg-sidebar)" }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
            style={{ background: "#fff", left: skill.enabled ? "18px" : "2px" }}
          />
        </button>
      </div>

      {/* Scope badge */}
      <div className="flex gap-1.5 mt-3">
        <span
          className="px-2 py-0.5 text-[10px]"
          style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
        >
          {skill.scope === "global" ? "Global" : skill.scope.replace("repo:", "")}
        </span>
        {skill.totalUses ? (
          <span
            className="px-2 py-0.5 text-[10px]"
            style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
          >
            {skill.totalUses} bruk
          </span>
        ) : null}
      </div>
    </div>
  );
}

// --- Slide-over Panel ---

function SlideOver({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg overflow-y-auto"
        style={{ background: "var(--bg-main)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

// --- Skill Form (simplified) ---

function SkillForm({
  skill,
  repos,
  onSave,
  onCancel,
}: {
  skill?: Skill;
  repos: RepoInfo[];
  onSave: (skill: Skill) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(skill?.name || "");
  const [description, setDescription] = useState(skill?.description || "");
  const [promptFragment, setPromptFragment] = useState(skill?.promptFragment || "");
  const [scope, setScope] = useState(skill?.scope || "global");
  const [keywords, setKeywords] = useState(
    (skill?.routingRules?.keywords || []).join(", ")
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const scopeOptions = [
    { value: "global", label: "Global (alle repoer)" },
    ...repos.map((r) => ({ value: `repo:${r.name}`, label: r.name })),
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !description || !promptFragment) {
      setError("Navn, beskrivelse og prompt er pakrevd.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (skill) {
        const result = await updateSkill({
          id: skill.id,
          name,
          description,
          promptFragment,
          scope,
        });
        onSave(result.skill);
      } else {
        const result = await createSkill({
          name,
          description,
          promptFragment,
          appliesTo: ["coding", "review"],
          scope,
        });
        onSave(result.skill);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre skill");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p className="text-sm px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>
          {error}
        </p>
      )}

      <Field label="Navn">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Security Awareness" className="input-field w-full text-sm" />
      </Field>

      <Field label="Beskrivelse">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kort beskrivelse..." rows={2} className="input-field w-full text-sm" />
      </Field>

      <Field label="Prompt">
        <textarea
          value={promptFragment}
          onChange={(e) => setPromptFragment(e.target.value)}
          placeholder="Instruksjoner som injiseres i system-prompten..."
          rows={8}
          className="input-field w-full text-sm font-mono"
          style={{ background: "var(--bg-sidebar)" }}
        />
      </Field>

      <Field label="Scope">
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="input-field text-sm w-full">
          {scopeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Keywords (kommaseparert — triggere for auto-matching)">
        <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="f.eks. security, auth, password" className="input-field w-full text-sm" />
      </Field>

      {/* Actions */}
      <div className="flex gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Lagrer..." : skill ? "Oppdater" : "Opprett"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          Avbryt
        </button>
      </div>
    </form>
  );
}

// --- Skill Detail (simplified) ---

function SkillDetail({
  skill,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Prompt fragment */}
      <div>
        <Label>Prompt</Label>
        <div
          className="p-4 text-xs font-mono overflow-auto max-h-[300px]"
          style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <pre className="whitespace-pre-wrap">{skill.promptFragment}</pre>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4">
        <MetaItem label="Scope" value={skill.scope === "global" ? "Global" : skill.scope.replace("repo:", "")} />
        <MetaItem label="Status" value={skill.enabled ? "Aktiv" : "Deaktivert"} color={skill.enabled ? "#22c55e" : "var(--text-muted)"} />
      </div>

      {/* Statistics */}
      {(skill.totalUses ?? 0) > 0 && (
        <div>
          <Label>Statistikk</Label>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Bruk" value={skill.totalUses ?? 0} />
            <StatBox label="Suksess" value={skill.successCount ?? 0} color="#22c55e" />
            <StatBox label="Feil" value={skill.failureCount ?? 0} color="#ef4444" />
          </div>
        </div>
      )}

      {/* Routing rules */}
      {skill.routingRules && Object.keys(skill.routingRules).length > 0 && (
        <div>
          <Label>Keywords</Label>
          <div className="flex gap-1.5 flex-wrap">
            {(skill.routingRules.keywords || []).map((kw: string) => (
              <span key={kw} className="px-2 py-0.5 text-xs" style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {skill.lastUsedAt && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Sist brukt: {new Date(skill.lastUsedAt).toLocaleString("nb-NO")}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <button onClick={onEdit} className="btn-primary text-sm">Rediger</button>
        <button onClick={onDelete} className="btn-secondary text-sm" style={{ color: "var(--error)" }}>Slett</button>
      </div>
    </div>
  );
}

// --- Utility Components ---

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
      {children}
    </h4>
  );
}

function MetaItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2.5" style={{ background: "var(--bg-sidebar)" }}>
      <div className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="p-2.5 text-center" style={{ background: "var(--bg-sidebar)" }}>
      <div className="text-lg font-semibold" style={{ color: color || "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

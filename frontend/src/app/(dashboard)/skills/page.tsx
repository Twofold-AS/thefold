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
import { useRepoContext } from "@/lib/repo-context";

const PHASES = [
  { label: "Alle", value: "all" },
  { label: "Planlegging", value: "planning" },
  { label: "Koding", value: "coding" },
  { label: "Debug / Test", value: "debugging" },
  { label: "Review", value: "reviewing" },
] as const;

const PHASE_LABELS: Record<string, string> = {
  all: "Alle faser",
  planning: "Planlegging",
  coding: "Koding",
  debugging: "Debug / Test",
  reviewing: "Review",
};

export default function SkillsPage() {
  const { repos } = useRepoContext();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [apiRepos, setApiRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activePhase, setActivePhase] = useState("all");
  const [repoFilter, setRepoFilter] = useState<string | null>(null);

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
      setApiRepos(reposRes.repos);
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

  // Filter: search + phase + repo
  const filtered = skills.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (activePhase !== "all" && s.taskPhase !== activePhase && s.taskPhase !== "all") return false;
    if (repoFilter === "global" && s.scope !== "global") return false;
    if (repoFilter && repoFilter.startsWith("repo:") && s.scope !== repoFilter && s.scope !== "global") return false;
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
      {/* Cell-style header with phase tabs */}
      <div className="flex items-center" style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}>
        <div className="px-5 flex items-center" style={{ borderRight: "1px solid var(--border)", minHeight: "80px" }}>
          <h1 className="text-xl font-display" style={{ color: "var(--text-primary)" }}>Skills</h1>
        </div>

        {PHASES.map((phase) => {
          const count = skills.filter((s) => phase.value === "all" ? true : s.taskPhase === phase.value || s.taskPhase === "all").length;
          return (
            <button
              key={phase.value}
              onClick={() => setActivePhase(phase.value)}
              className="px-4 flex items-center text-sm"
              style={{
                borderRight: "1px solid var(--border)",
                minHeight: "80px",
                color: activePhase === phase.value ? "var(--text-primary)" : "var(--text-muted)",
                background: activePhase === phase.value ? "rgba(255,255,255,0.03)" : "transparent",
              }}
            >
              {phase.label}
              <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{count}</span>
            </button>
          );
        })}

        {/* Ny skill som celle — SISTE celle i headeren */}
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 flex items-center text-sm ml-auto"
          style={{
            borderLeft: "1px solid var(--border)",
            minHeight: "80px",
            color: "var(--text-muted)",
          }}
        >
          + Ny skill
        </button>
      </div>

      {/* Scope dropdown + search */}
      <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Scope:</span>
        <select
          value={repoFilter || "all"}
          onChange={(e) => setRepoFilter(e.target.value === "all" ? null : e.target.value)}
          className="input-field text-sm py-1 px-2"
          style={{ width: "auto", minWidth: 120 }}
        >
          <option value="all">Alle</option>
          <option value="global">Globale</option>
          {repos.map((repo) => (
            <option key={repo.name} value={`repo:${repo.name}`}>{repo.name}</option>
          ))}
        </select>
        <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
          {filtered.length} av {skills.length} aktive
        </span>
        <input
          type="text"
          placeholder="Sok..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field ml-auto text-sm py-1 px-3"
          style={{ width: "200px" }}
        />
      </div>

      <div className="p-6">

        {error && (
          <div
            className="mb-4 px-4 py-3 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}
          >
            {error}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div
              className="col-span-full text-center py-12"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {skills.length === 0 ? "Ingen skills enda. Opprett en for a komme i gang." : "Ingen skills matcher filteret."}
              </p>
            </div>
          ) : (
            filtered.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onToggle={handleToggle}
                onEdit={() => { setEditingSkill(skill); }}
                onClick={() => setDetailSkill(skill)}
              />
            ))
          )}
        </div>
      </div>

      {/* Slide-over: Create */}
      {showCreate && (
        <SlideOver title="Ny skill" onClose={() => setShowCreate(false)}>
          <SkillForm repos={apiRepos} onSave={handleSaved} onCancel={() => setShowCreate(false)} />
        </SlideOver>
      )}

      {/* Slide-over: Edit */}
      {editingSkill && (
        <SlideOver title="Rediger skill" onClose={() => setEditingSkill(null)}>
          <SkillForm skill={editingSkill} repos={apiRepos} onSave={handleSaved} onCancel={() => setEditingSkill(null)} />
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

// --- Skill Card ---

function SkillCard({
  skill,
  onToggle,
  onEdit,
  onClick,
}: {
  skill: Skill;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: () => void;
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

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(skill.id, !skill.enabled); }}
            className="relative w-9 h-5 rounded-full transition-colors"
            style={{ background: skill.enabled ? "var(--accent)" : "var(--bg-sidebar)" }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{ background: "#fff", left: skill.enabled ? "18px" : "2px" }}
            />
          </button>

          {/* Edit gear */}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 hover:opacity-80"
            style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Phase + Scope + Usage */}
      <div className="flex gap-1.5 mt-3 flex-wrap">
        <span
          className="px-2 py-0.5 text-[10px]"
          style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
        >
          {PHASE_LABELS[skill.taskPhase || "all"] || "Alle faser"}
        </span>
        <span
          className="px-2 py-0.5 text-[10px]"
          style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
        >
          {skill.scope === "global" ? "Global" : skill.scope.replace("repo:", "")}
        </span>
        {skill.routingRules?.keywords && skill.routingRules.keywords.length > 0 && (
          <span
            className="px-2 py-0.5 text-[10px]"
            style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
          >
            {skill.routingRules.keywords.slice(0, 3).join(", ")}
            {skill.routingRules.keywords.length > 3 ? ` +${skill.routingRules.keywords.length - 3}` : ""}
          </span>
        )}
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
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0, 0, 0, 0.6)" }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg overflow-y-auto"
        style={{ background: "var(--bg-primary)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:opacity-80"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
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

// --- Skill Form ---

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
  const [taskPhase, setTaskPhase] = useState(skill?.taskPhase || "all");
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
          taskPhase,
        });
        onSave(result.skill);
      } else {
        const result = await createSkill({
          name,
          description,
          promptFragment,
          appliesTo: ["coding", "review"],
          scope,
          taskPhase,
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

      <div className="grid grid-cols-2 gap-4">
        <Field label="Fase">
          <select
            value={taskPhase}
            onChange={(e) => setTaskPhase(e.target.value)}
            className="input-field text-sm w-full"
          >
            <option value="all">Alle faser</option>
            <option value="planning">Planlegging</option>
            <option value="coding">Koding</option>
            <option value="debugging">Debug / Test</option>
            <option value="reviewing">Review</option>
          </select>
        </Field>

        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="input-field text-sm w-full">
            {scopeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Keywords (kommaseparert)">
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

// --- Skill Detail ---

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
      <div className="grid grid-cols-3 gap-4">
        <MetaItem label="Fase" value={PHASE_LABELS[skill.taskPhase || "all"] || "Alle faser"} />
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

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listSkills,
  createSkill,
  updateSkill,
  toggleSkill,
  deleteSkill,
  previewPrompt,
  type Skill,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const CONTEXTS = ["coding", "review", "planning", "chat"] as const;
const CATEGORIES = ["security", "quality", "style", "framework", "language", "general"] as const;
const PHASES = ["pre_run", "inject", "post_run"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  security: "#ef4444",
  quality: "#3b82f6",
  style: "#a855f7",
  framework: "#22c55e",
  language: "#eab308",
  general: "#6b7280",
};

const PHASE_COLORS: Record<string, string> = {
  pre_run: "#f97316",
  inject: "#3b82f6",
  post_run: "#22c55e",
};

const PHASE_LABELS: Record<string, string> = {
  pre_run: "Pre-run",
  inject: "Inject",
  post_run: "Post-run",
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"grid" | "pipeline">("grid");

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPhase, setFilterPhase] = useState("");
  const [filterAppliesTo, setFilterAppliesTo] = useState("");

  // Panels
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);

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

  // Filter logic
  const filtered = skills.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && s.category !== filterCategory) return false;
    if (filterPhase && s.executionPhase !== filterPhase) return false;
    if (filterAppliesTo && !s.appliesTo.includes(filterAppliesTo)) return false;
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
          {enabledCount} av {skills.length} aktive &middot; Administrer AI-instruksjoner og pipeline
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

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {(["grid", "pipeline"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? "tab tab-active" : "tab"}
          >
            {tab === "grid" ? "Oversikt" : "Pipeline"}
          </button>
        ))}
      </div>

      {activeTab === "grid" ? (
        <>
          {/* Filters */}
          <div className="flex gap-3 mb-6 flex-wrap">
            <input
              type="text"
              placeholder="Sok..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm"
              style={{ width: "200px" }}
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">Alle kategorier</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={filterPhase}
              onChange={(e) => setFilterPhase(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">Alle faser</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>{PHASE_LABELS[p]}</option>
              ))}
            </select>
            <select
              value={filterAppliesTo}
              onChange={(e) => setFilterAppliesTo(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">Alle kontekster</option>
              {CONTEXTS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <div
                className="col-span-full text-center py-12"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {skills.length === 0 ? "Ingen skills enda. Opprett en for a komme i gang." : "Ingen skills matcher filtrene."}
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
        </>
      ) : (
        <PipelineView skills={skills} />
      )}

      </div>

      {/* Slide-over: Create */}
      {showCreate && (
        <SlideOver title="Ny skill" onClose={() => setShowCreate(false)}>
          <SkillForm onSave={handleSaved} onCancel={() => setShowCreate(false)} />
        </SlideOver>
      )}

      {/* Slide-over: Edit */}
      {editingSkill && (
        <SlideOver title="Rediger skill" onClose={() => setEditingSkill(null)}>
          <SkillForm skill={editingSkill} onSave={handleSaved} onCancel={() => setEditingSkill(null)} />
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
  onClick,
}: {
  skill: Skill;
  onToggle: (id: string, enabled: boolean) => void;
  onClick: () => void;
}) {
  const category = skill.category || "general";
  const phase = skill.executionPhase || "inject";
  const confidence = skill.confidenceScore ?? 0.5;

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

      {/* Badges */}
      <div className="flex gap-1.5 mt-3 flex-wrap">
        <span
          className="px-2 py-0.5 text-[10px] font-medium"
          style={{ background: `${CATEGORY_COLORS[category]}20`, color: CATEGORY_COLORS[category] }}
        >
          {category}
        </span>
        <span
          className="px-2 py-0.5 text-[10px] font-medium"
          style={{ background: `${PHASE_COLORS[phase]}20`, color: PHASE_COLORS[phase] }}
        >
          {PHASE_LABELS[phase]}
        </span>
        {skill.appliesTo.map((ctx) => (
          <span
            key={ctx}
            className="px-2 py-0.5 text-[10px]"
            style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
          >
            {ctx}
          </span>
        ))}
      </div>

      {/* Footer: priority + tokens + confidence */}
      <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span>P{skill.priority ?? 100}</span>
          {skill.tokenEstimate ? <span>~{skill.tokenEstimate} tokens</span> : null}
          {skill.totalUses ? <span>{skill.totalUses} bruk</span> : null}
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-sidebar)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${confidence * 100}%`,
            background: confidence > 0.7 ? "#22c55e" : confidence > 0.4 ? "#eab308" : "#ef4444",
          }}
        />
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
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

// --- Skill Form (Create + Edit) ---

function SkillForm({
  skill,
  onSave,
  onCancel,
}: {
  skill?: Skill;
  onSave: (skill: Skill) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(skill?.name || "");
  const [description, setDescription] = useState(skill?.description || "");
  const [promptFragment, setPromptFragment] = useState(skill?.promptFragment || "");
  const [appliesTo, setAppliesTo] = useState<string[]>(skill?.appliesTo || []);
  const [scope, setScope] = useState(skill?.scope || "global");
  const [category, setCategory] = useState(skill?.category || "general");
  const [executionPhase, setExecutionPhase] = useState(skill?.executionPhase || "inject");
  const [priority, setPriority] = useState(skill?.priority ?? 100);
  const [tokenEstimate, setTokenEstimate] = useState(skill?.tokenEstimate ?? 0);
  const [keywords, setKeywords] = useState(
    (skill?.routingRules?.keywords || []).join(", ")
  );
  const [filePatterns, setFilePatterns] = useState(
    (skill?.routingRules?.file_patterns || []).join(", ")
  );
  const [routingLabels, setRoutingLabels] = useState(
    (skill?.routingRules?.labels || []).join(", ")
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Preview
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  function toggleContext(ctx: string) {
    setAppliesTo((prev) =>
      prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx]
    );
  }

  async function handlePreview() {
    if (appliesTo.length === 0) return;
    setPreviewLoading(true);
    try {
      const result = await previewPrompt(appliesTo[0]);
      setPreviewContent(result.systemPrompt);
    } catch {
      setPreviewContent("Kunne ikke laste forhåndsvisning");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !description || !promptFragment || appliesTo.length === 0) {
      setError("Alle felt er pakrevd, og minst en kontekst ma velges.");
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
          appliesTo,
          scope,
        });
        onSave(result.skill);
      } else {
        const result = await createSkill({
          name,
          description,
          promptFragment,
          appliesTo,
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

      <Field label="Prompt-fragment">
        <textarea
          value={promptFragment}
          onChange={(e) => setPromptFragment(e.target.value)}
          placeholder="Instruksjoner som injiseres i system-prompten..."
          rows={8}
          className="input-field w-full text-sm font-mono"
          style={{ background: "var(--bg-sidebar)" }}
        />
      </Field>

      <Field label="Kategori">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field text-sm">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>

      <Field label="Execution phase">
        <div className="space-y-2">
          {PHASES.map((p) => (
            <label key={p} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="phase"
                checked={executionPhase === p}
                onChange={() => setExecutionPhase(p)}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-medium" style={{ color: PHASE_COLORS[p] }}>
                  {PHASE_LABELS[p]}
                </span>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {p === "pre_run" && "Kjores for AI-kall (validerer input, beriker context)"}
                  {p === "inject" && "Injiseres i system-prompt (dagens oppforsel)"}
                  {p === "post_run" && "Kjores etter AI-kall (reviewer output, quality check)"}
                </p>
              </div>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Gjelder for">
        <div className="flex gap-2 flex-wrap">
          {CONTEXTS.map((ctx) => (
            <button
              key={ctx}
              type="button"
              onClick={() => toggleContext(ctx)}
              className="px-3 py-1.5 text-sm transition-colors"
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
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Prioritet (lavere = forst)">
          <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="input-field w-full text-sm" />
        </Field>
        <Field label="Token-estimat">
          <input type="number" value={tokenEstimate} onChange={(e) => setTokenEstimate(Number(e.target.value))} className="input-field w-full text-sm" />
        </Field>
      </div>

      <Field label="Scope">
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="input-field text-sm">
          <option value="global">Global</option>
          <option value="repo:thefold">Kun TheFold-repo</option>
        </select>
      </Field>

      {/* Routing rules */}
      <Field label="Routing-regler (automatisk aktivering)">
        <div className="space-y-2">
          <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Keywords (komma-separert)" className="input-field w-full text-sm" />
          <input type="text" value={filePatterns} onChange={(e) => setFilePatterns(e.target.value)} placeholder="File patterns (f.eks. *.ts, *.tsx)" className="input-field w-full text-sm" />
          <input type="text" value={routingLabels} onChange={(e) => setRoutingLabels(e.target.value)} placeholder="Labels (komma-separert)" className="input-field w-full text-sm" />
        </div>
      </Field>

      {/* Preview */}
      <div>
        <button type="button" onClick={handlePreview} className="text-xs underline" style={{ color: "var(--accent)" }}>
          Forhåndsvis system-prompt
        </button>
        {previewContent && (
          <div
            className="mt-2 p-3 text-[11px] font-mono overflow-auto max-h-[200px]"
            style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          >
            {previewLoading ? "Laster..." : <pre className="whitespace-pre-wrap">{previewContent}</pre>}
          </div>
        )}
      </div>

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
  const confidence = skill.confidenceScore ?? 0.5;
  const totalRuns = (skill.successCount ?? 0) + (skill.failureCount ?? 0);

  return (
    <div className="space-y-6">
      {/* Prompt fragment */}
      <div>
        <Label>Prompt-fragment</Label>
        <div
          className="p-4 text-xs font-mono overflow-auto max-h-[300px]"
          style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <pre className="whitespace-pre-wrap">{skill.promptFragment}</pre>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-4">
        <MetaItem label="Kategori" value={skill.category || "general"} color={CATEGORY_COLORS[skill.category || "general"]} />
        <MetaItem label="Phase" value={PHASE_LABELS[skill.executionPhase || "inject"]} color={PHASE_COLORS[skill.executionPhase || "inject"]} />
        <MetaItem label="Prioritet" value={String(skill.priority ?? 100)} />
        <MetaItem label="Token-estimat" value={`~${skill.tokenEstimate ?? 0}`} />
        <MetaItem label="Scope" value={skill.scope} />
        <MetaItem label="Versjon" value={skill.version || "1.0.0"} />
      </div>

      {/* Applies to */}
      <div>
        <Label>Gjelder for</Label>
        <div className="flex gap-1.5 flex-wrap">
          {skill.appliesTo.map((ctx) => (
            <span key={ctx} className="px-2 py-0.5 text-xs" style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}>
              {ctx}
            </span>
          ))}
        </div>
      </div>

      {/* Statistics */}
      <div>
        <Label>Statistikk</Label>
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Totale bruk" value={skill.totalUses ?? 0} />
          <StatBox label="Suksessrate" value={totalRuns > 0 ? `${Math.round(confidence * 100)}%` : "N/A"} />
          <StatBox label="Suksess" value={skill.successCount ?? 0} color="#22c55e" />
          <StatBox label="Feil" value={skill.failureCount ?? 0} color="#ef4444" />
          <StatBox label="Snitt token-kostnad" value={Math.round(skill.avgTokenCost ?? 0)} />
          <StatBox label="Confidence" value={`${Math.round(confidence * 100)}%`} />
        </div>

        {/* Confidence bar */}
        <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-sidebar)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${confidence * 100}%`,
              background: confidence > 0.7 ? "#22c55e" : confidence > 0.4 ? "#eab308" : "#ef4444",
            }}
          />
        </div>
      </div>

      {/* Routing rules */}
      {skill.routingRules && Object.keys(skill.routingRules).length > 0 && (
        <div>
          <Label>Routing-regler</Label>
          <div className="text-xs font-mono p-3" style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}>
            <pre className="whitespace-pre-wrap">{JSON.stringify(skill.routingRules, null, 2)}</pre>
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

// --- Pipeline Visualization ---

function PipelineView({ skills }: { skills: Skill[] }) {
  const enabled = skills.filter((s) => s.enabled);
  const preRun = enabled.filter((s) => s.executionPhase === "pre_run").sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const inject = enabled.filter((s) => !s.executionPhase || s.executionPhase === "inject").sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const postRun = enabled.filter((s) => s.executionPhase === "post_run").sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  const totalTokens = enabled.reduce((sum, s) => sum + (s.tokenEstimate ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Token budget bar */}
      <div
        className="p-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Token-forbruk
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {totalTokens} / 4000 tokens
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-sidebar)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min((totalTokens / 4000) * 100, 100)}%`,
              background: totalTokens > 3500 ? "#ef4444" : totalTokens > 2500 ? "#eab308" : "#22c55e",
            }}
          />
        </div>
      </div>

      {/* Pipeline flow */}
      <div className="flex items-stretch gap-3">
        <PipelinePhase title="Pre-run" color="#f97316" skills={preRun} />
        <Arrow />
        <PipelinePhase title="Inject" color="#3b82f6" skills={inject} />
        <Arrow />
        <div
          className="flex-1 p-4 flex items-center justify-center"
          style={{ background: "var(--bg-card)", border: "2px solid var(--border)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            AI-kall
          </span>
        </div>
        <Arrow />
        <PipelinePhase title="Post-run" color="#22c55e" skills={postRun} />
      </div>
    </div>
  );
}

function PipelinePhase({ title, color, skills }: { title: string; color: string; skills: Skill[] }) {
  return (
    <div
      className="flex-1 p-4"
      style={{ background: "var(--bg-card)", borderTop: `3px solid ${color}` }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color }}>
        {title} ({skills.length})
      </h3>
      {skills.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Ingen aktive</p>
      ) : (
        <div className="space-y-2">
          {skills.map((s) => (
            <div
              key={s.id}
              className="px-2 py-1.5 text-xs"
              style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}
            >
              <span className="font-medium">{s.name}</span>
              <span className="ml-2" style={{ color: "var(--text-muted)" }}>P{s.priority ?? 100}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center" style={{ color: "var(--text-muted)" }}>
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
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

"use client";

import { useEffect, useState } from "react";
import {
  listTemplates,
  listRepos,
  useTemplateApi,
  type Template,
  type TemplateFile,
} from "@/lib/api";

const CATEGORIES = [
  { key: "", label: "Alle" },
  { key: "auth", label: "Auth" },
  { key: "api", label: "API" },
  { key: "ui", label: "UI" },
  { key: "database", label: "Database" },
  { key: "payment", label: "Betaling" },
  { key: "form", label: "Skjema" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  auth: "#ef4444",
  api: "#3b82f6",
  ui: "#a855f7",
  database: "#22c55e",
  payment: "#eab308",
  form: "#f97316",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [category]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const result = await listTemplates(category || undefined);
      setTemplates(result.templates);
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      {/* Info card */}
      <div className="card p-5 mb-6">
        <h2 className="text-lg font-display font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          Template Library
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Ferdige maler med ekte kode du kan bruke som utgangspunkt. Velg en mal, tilpass variabler, og legg til i prosjektet.
        </p>
      </div>

      {/* Category pills */}
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {CATEGORIES.map((cat) => {
          const isActive = category === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className="px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: isActive ? "var(--accent)" : "var(--bg-secondary)",
                color: isActive ? "#fff" : "var(--text-secondary)",
                border: isActive ? "none" : "1px solid var(--border)",
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--sidebar-text-active)" }}
          />
        </div>
      ) : templates.length === 0 ? (
        <div
          className="text-center py-16"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Ingen maler funnet for denne kategorien.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={() => setSelectedTemplate(template)}
            />
          ))}
        </div>
      )}

      {/* Slide-over detail */}
      {selectedTemplate && (
        <TemplateSlideOver
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUsed={() => {
            setSelectedTemplate(null);
            loadTemplates();
          }}
        />
      )}
    </div>
  );
}

// --- Template Card ---

function TemplateCard({ template, onClick }: { template: Template; onClick: () => void }) {
  const catColor = CATEGORY_COLORS[template.category] ?? "#6b7280";

  return (
    <div
      onClick={onClick}
      className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {template.name}
      </h3>
      <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-muted)" }}>
        {template.description}
      </p>

      <div className="flex gap-1.5 mt-3 flex-wrap">
        <span
          className="px-2 py-0.5 text-[10px] font-medium"
          style={{ background: `${catColor}20`, color: catColor }}
        >
          {template.category}
        </span>
        <span className="px-2 py-0.5 text-[10px]" style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}>
          {template.framework}
        </span>
        {template.dependencies.length > 0 && (
          <span className="px-2 py-0.5 text-[10px]" style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}>
            {template.dependencies.length} deps
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {template.files.length} filer
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {template.useCount} bruk
        </span>
      </div>
    </div>
  );
}

// --- Template Slide-Over ---

function TemplateSlideOver({
  template,
  onClose,
  onUsed,
}: {
  template: Template;
  onClose: () => void;
  onUsed: () => void;
}) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl overflow-y-auto"
        style={{ background: "var(--bg-main)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-display font-semibold" style={{ color: "var(--text-primary)" }}>
              {template.name}
            </h2>
            <button onClick={onClose} className="p-1.5 hover:opacity-80" style={{ color: "var(--text-muted)" }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            {template.description}
          </p>

          {/* Files */}
          <div className="mb-6">
            <h3 className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
              Filer ({template.files.length})
            </h3>
            <div className="space-y-2">
              {template.files.map((file) => (
                <div key={file.path} className="overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                  <button
                    onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left"
                    style={{ background: "var(--bg-card)" }}
                  >
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                      {file.path}
                    </span>
                    <svg
                      className="w-3.5 h-3.5 transition-transform"
                      style={{ transform: expandedFile === file.path ? "rotate(180deg)" : "rotate(0deg)", color: "var(--text-muted)" }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {expandedFile === file.path && (
                    <div className="p-3" style={{ background: "var(--bg-sidebar)" }}>
                      <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                        {file.content}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Dependencies */}
          {template.dependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Dependencies
              </h3>
              <div className="flex gap-2 flex-wrap">
                {template.dependencies.map((dep) => (
                  <span key={dep} className="px-2 py-1 text-xs font-mono" style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}>
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Variables preview */}
          {template.variables.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Variabler ({template.variables.length})
              </h3>
              <div className="flex gap-2 flex-wrap">
                {template.variables.map((v) => (
                  <span key={v.name} className="px-2 py-1 text-xs font-mono" style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}>
                    {v.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Use button */}
          <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={() => setShowInstallModal(true)} className="btn-primary text-sm w-full">
              Legg til i prosjekt
            </button>
          </div>
        </div>
      </div>

      {/* Install modal */}
      {showInstallModal && (
        <InstallTemplateModal
          template={template}
          onClose={() => setShowInstallModal(false)}
          onInstalled={() => {
            setShowInstallModal(false);
            onUsed();
          }}
        />
      )}
    </>
  );
}

// --- Install Template Modal ---

function InstallTemplateModal({
  template,
  onClose,
  onInstalled,
}: {
  template: Template;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [variables, setVariables] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const v of template.variables) {
      defaults[v.name] = v.defaultValue;
    }
    return defaults;
  });
  const [repos, setRepos] = useState<{ name: string; fullName: string }[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [reposLoading, setReposLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{ files: TemplateFile[]; dependencies: string[] } | null>(null);

  useEffect(() => {
    loadRepos();
  }, []);

  async function loadRepos() {
    setReposLoading(true);
    try {
      const res = await listRepos("Twofold-AS");
      setRepos(res.repos.map((r) => ({ name: r.name, fullName: r.fullName })));
      if (res.repos.length > 0) {
        setSelectedRepo(res.repos[0].name);
      }
    } catch {
      // Fail silently
    } finally {
      setReposLoading(false);
    }
  }

  async function handleInstall() {
    if (!selectedRepo) return;
    setInstalling(true);
    try {
      const res = await useTemplateApi(template.id, selectedRepo, variables);
      setResult(res);
    } catch {
      // Error handling
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-display font-semibold" style={{ color: "var(--text-primary)" }}>
              Installer template
            </h2>
            <button onClick={onClose} className="p-1 hover:opacity-80" style={{ color: "var(--text-muted)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Template info */}
          <div className="mb-5 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {template.name}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {template.description}
            </p>
          </div>

          {result ? (
            /* Success state */
            <div className="text-center py-4">
              <p className="text-sm font-medium mb-1" style={{ color: "#22c55e" }}>
                Installert
              </p>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                {result.files.length} filer generert til {selectedRepo}
              </p>
              <button onClick={onInstalled} className="btn-primary text-sm">
                Lukk
              </button>
            </div>
          ) : (
            <>
              {/* Repo selector */}
              <div className="mb-4">
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Repo
                </label>
                {reposLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    Laster repos...
                  </div>
                ) : (
                  <select
                    value={selectedRepo}
                    onChange={(e) => setSelectedRepo(e.target.value)}
                    className="input-field w-full text-sm"
                  >
                    {repos.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.fullName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Variables */}
              {template.variables.length > 0 && (
                <div className="mb-5">
                  <label className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
                    Variabler
                  </label>
                  <div className="space-y-3">
                    {template.variables.map((v) => (
                      <div key={v.name}>
                        <label className="text-[11px] block mb-1" style={{ color: "var(--text-muted)" }}>
                          <span className="font-mono">{v.name}</span> — {v.description}
                        </label>
                        <input
                          type="text"
                          value={variables[v.name] ?? v.defaultValue}
                          onChange={(e) => setVariables({ ...variables, [v.name]: e.target.value })}
                          className="input-field w-full text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <button onClick={onClose} className="btn-secondary text-sm flex-1">
                  Avbryt
                </button>
                <button
                  onClick={handleInstall}
                  disabled={installing || !selectedRepo}
                  className="btn-primary text-sm flex-1"
                >
                  {installing ? "Installerer..." : "Installer"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

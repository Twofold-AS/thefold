"use client";

import { useEffect, useState } from "react";
import {
  listTemplates,
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
        <h2 className="text-lg font-sans font-medium mb-2" style={{ color: "var(--text-primary)" }}>
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
      <h3 className="text-sm font-sans font-semibold" style={{ color: "var(--text-primary)" }}>
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
  const [variables, setVariables] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const v of template.variables) {
      defaults[v.name] = v.defaultValue;
    }
    return defaults;
  });
  const [useLoading, setUseLoading] = useState(false);
  const [result, setResult] = useState<{ files: TemplateFile[]; dependencies: string[] } | null>(null);

  async function handleUse() {
    setUseLoading(true);
    try {
      const res = await useTemplateApi(template.id, "current-project", variables);
      setResult(res);
    } catch {
      // Error handling
    } finally {
      setUseLoading(false);
    }
  }

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
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
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

          {/* Variables */}
          {template.variables.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
                Variabler
              </h3>
              <div className="space-y-3">
                {template.variables.map((v) => (
                  <div key={v.name}>
                    <label className="text-[11px] block mb-1" style={{ color: "var(--text-muted)" }}>
                      {v.name} — {v.description}
                    </label>
                    <input
                      type="text"
                      value={variables[v.name] ?? v.defaultValue}
                      onChange={(e) => setVariables({ ...variables, [v.name]: e.target.value })}
                      className="input-field w-full text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          <div className="mb-6">
            <h3 className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
              Filer ({template.files.length})
            </h3>
            <div className="space-y-2">
              {(result?.files ?? template.files).map((file) => (
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

          {/* Use button */}
          <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            {result ? (
              <div className="text-center">
                <p className="text-sm font-medium mb-2" style={{ color: "#22c55e" }}>
                  Mal generert med {result.files.length} filer
                </p>
                <button onClick={onUsed} className="btn-primary text-sm">
                  Lukk
                </button>
              </div>
            ) : (
              <button onClick={handleUse} disabled={useLoading} className="btn-primary text-sm w-full">
                {useLoading ? "Genererer..." : "Legg til i prosjekt"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  listComponents,
  searchComponents,
  listTemplates,
  getTemplateCategories,
  type Component,
  type Template,
  type CategoryCount,
} from "@/lib/api";
import { GridSection } from "@/components/ui/corner-ornament";
import { ParticleField, EmberGlow } from "@/components/effects/ParticleField";
import {
  Package,
  Search,
  FileCode2,
  Layers,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Puzzle,
} from "lucide-react";

type ComponentsTab = "components" | "templates";

export default function ComponentsPage() {
  const [activeTab, setActiveTab] = useState<ComponentsTab>("components");
  const [components, setComponents] = useState<Component[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      listComponents().then((res) => setComponents(res.components)),
      listTemplates().then((res) => setTemplates(res.templates)),
      getTemplateCategories().then((res) => setCategories(res.categories)),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timeout = setTimeout(() => {
      searchComponents(searchQuery, selectedCategory || undefined).then((res) =>
        setComponents(res.components)
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, selectedCategory]);

  const filteredTemplates = selectedCategory
    ? templates.filter((t) => t.category === selectedCategory)
    : templates;

  const tabs: { key: ComponentsTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "components", label: "Components", icon: <Puzzle className="w-4 h-4" />, count: components.length },
    { key: "templates", label: "Templates", icon: <LayoutTemplate className="w-4 h-4" />, count: templates.length },
  ];

  return (
    <div className="min-h-full page-enter" style={{ background: "var(--tf-bg-base)" }}>
      {/* Header with decorative dots */}
      <GridSection showTop={false} className="px-6 pt-8 pb-6 relative overflow-hidden">
        <ParticleField count={8} className="opacity-30" />
        <EmberGlow />
        <div className="absolute top-4 right-6 opacity-20 hidden lg:block" style={{ color: "var(--tf-border-muted)" }}>
          <svg width="120" height="60" viewBox="0 0 120 60" fill="none">
            {Array.from({ length: 8 }).map((_, row) =>
              Array.from({ length: 16 }).map((_, col) => (
                <circle
                  key={`${row}-${col}`}
                  cx={col * 8 + 4}
                  cy={row * 8 + 4}
                  r="1"
                  fill="currentColor"
                />
              ))
            )}
          </svg>
        </div>
        <h1 className="text-display-lg mb-1" style={{ color: "var(--tf-text-primary)" }}>
          Components
        </h1>
        <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
          Registry, templates, and reusable building blocks
        </p>
      </GridSection>

      {/* Tabbed layout */}
      <GridSection className="min-h-[500px]">
        <div className="flex min-h-[500px]">
          {/* Left tab sidebar */}
          <div className="w-[200px] flex-shrink-0 p-4 hidden sm:block" style={{ borderRight: "1px solid var(--tf-border-faint)" }}>
            <div className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-colors text-left"
                  style={{
                    background: activeTab === tab.key ? "rgba(255, 107, 44, 0.06)" : "transparent",
                    color: activeTab === tab.key ? "var(--tf-heat)" : "var(--tf-text-secondary)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    {tab.icon}
                    {tab.label}
                  </div>
                  {!loading && tab.count !== undefined && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--tf-surface)", color: "var(--tf-text-muted)" }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Category filter (for templates tab) */}
            {activeTab === "templates" && categories.length > 0 && (
              <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--tf-border-faint)" }}>
                <span className="text-[10px] uppercase tracking-wider block mb-2 px-4" style={{ color: "var(--tf-text-faint)" }}>
                  Categories
                </span>
                <div className="space-y-0.5">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="w-full text-left px-4 py-1.5 rounded-lg text-xs transition-colors"
                    style={{
                      color: !selectedCategory ? "var(--tf-heat)" : "var(--tf-text-muted)",
                      background: !selectedCategory ? "rgba(255, 107, 44, 0.06)" : "transparent",
                    }}
                  >
                    All
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.category}
                      onClick={() => setSelectedCategory(c.category)}
                      className="w-full text-left px-4 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between"
                      style={{
                        color: selectedCategory === c.category ? "var(--tf-heat)" : "var(--tf-text-muted)",
                        background: selectedCategory === c.category ? "rgba(255, 107, 44, 0.06)" : "transparent",
                      }}
                    >
                      <span className="capitalize">{c.category}</span>
                      <span style={{ color: "var(--tf-text-faint)" }}>{c.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mobile tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b sm:hidden" style={{ borderColor: "var(--tf-border-faint)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                style={{
                  background: activeTab === tab.key ? "rgba(255, 107, 44, 0.06)" : "transparent",
                  color: activeTab === tab.key ? "var(--tf-heat)" : "var(--tf-text-muted)",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right content area */}
          <div className="flex-1 p-6 lg:p-8">
            {/* Components tab */}
            {activeTab === "components" && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Component Registry
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    Registered components and their usage
                  </p>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--tf-text-faint)" }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search components..."
                    className="w-full rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors"
                    style={{
                      background: "var(--tf-surface)",
                      border: "1px solid var(--tf-border-faint)",
                      color: "var(--tf-text-primary)",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tf-border-faint)"; }}
                  />
                </div>

                {/* Component list */}
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="skeleton h-16 rounded-lg" />
                    ))}
                  </div>
                ) : components.length === 0 ? (
                  <div
                    className="text-center py-12 rounded-lg"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    <Package className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--tf-text-faint)" }} />
                    <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                      No components registered yet
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--tf-text-faint)" }}>
                      Components appear here once registered through the agent
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-lg divide-y overflow-hidden"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    {components.map((comp) => (
                      <div key={comp.id}>
                        <button
                          onClick={() => setExpandedId(expandedId === comp.id ? null : comp.id)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--tf-surface)]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Package className="w-4 h-4 flex-shrink-0" style={{ color: "var(--tf-heat)" }} />
                            <div className="min-w-0">
                              <span className="text-sm font-medium block" style={{ color: "var(--tf-text-primary)" }}>
                                {comp.name}
                              </span>
                              {comp.description && (
                                <span className="text-xs block truncate" style={{ color: "var(--tf-text-faint)" }}>
                                  {comp.description}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--tf-surface)", color: "var(--tf-text-faint)" }}>
                              v{comp.version}
                            </span>
                            {comp.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255, 107, 44, 0.08)", color: "var(--tf-heat)" }}>
                                {comp.category}
                              </span>
                            )}
                            <span className="text-xs font-mono" style={{ color: "var(--tf-text-faint)" }}>
                              {comp.timesUsed}x
                            </span>
                            {expandedId === comp.id ? (
                              <ChevronUp className="w-4 h-4" style={{ color: "var(--tf-text-faint)" }} />
                            ) : (
                              <ChevronDown className="w-4 h-4" style={{ color: "var(--tf-text-faint)" }} />
                            )}
                          </div>
                        </button>

                        {expandedId === comp.id && (
                          <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: "var(--tf-border-faint)", background: "var(--tf-surface)" }}>
                            {/* Files */}
                            <div>
                              <span className="text-xs font-medium block mb-2" style={{ color: "var(--tf-text-secondary)" }}>
                                Files ({comp.files.length})
                              </span>
                              <div className="space-y-1">
                                {comp.files.map((f, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <FileCode2 className="w-3 h-3" style={{ color: "var(--tf-text-faint)" }} />
                                    <span className="text-xs font-mono" style={{ color: "var(--tf-text-secondary)" }}>
                                      {f.path}
                                    </span>
                                    <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: "var(--tf-border-faint)", color: "var(--tf-text-faint)" }}>
                                      {f.language}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Tags */}
                            {comp.tags.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Tag className="w-3 h-3" style={{ color: "var(--tf-text-faint)" }} />
                                {comp.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{ background: "var(--tf-border-faint)", color: "var(--tf-text-faint)" }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Dependencies */}
                            {comp.dependencies.length > 0 && (
                              <div>
                                <span className="text-xs font-medium block mb-1" style={{ color: "var(--tf-text-secondary)" }}>
                                  Dependencies
                                </span>
                                <div className="flex gap-1.5 flex-wrap">
                                  {comp.dependencies.map((dep) => (
                                    <span key={dep} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(255, 107, 44, 0.06)", color: "var(--tf-text-muted)" }}>
                                      {dep}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Meta */}
                            <div className="flex items-center gap-4 pt-1">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" style={{ color: "var(--tf-text-faint)" }} />
                                <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                                  {new Date(comp.updatedAt).toLocaleDateString()}
                                </span>
                              </div>
                              <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                                {comp.sourceRepo}
                              </span>
                              <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                                {comp.validationStatus}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Templates tab */}
            {activeTab === "templates" && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Templates
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    Pre-built scaffolds for common patterns
                  </p>
                </div>

                {/* Mobile category filter */}
                <div className="sm:hidden">
                  {categories.length > 0 && (
                    <select
                      value={selectedCategory || ""}
                      onChange={(e) => setSelectedCategory(e.target.value || null)}
                      className="w-full rounded-lg py-2 px-3 text-sm outline-none"
                      style={{
                        background: "var(--tf-surface)",
                        border: "1px solid var(--tf-border-faint)",
                        color: "var(--tf-text-primary)",
                      }}
                    >
                      <option value="">All categories</option>
                      {categories.map((c) => (
                        <option key={c.category} value={c.category}>
                          {c.category} ({c.count})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="skeleton h-40 rounded-lg" />
                    ))}
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div
                    className="text-center py-12 rounded-lg"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    <LayoutTemplate className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--tf-text-faint)" }} />
                    <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                      No templates available
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredTemplates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        className="rounded-lg p-4 transition-colors"
                        style={{
                          border: "1px solid var(--tf-border-faint)",
                        }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <LayoutTemplate className="w-4 h-4" style={{ color: "var(--tf-heat)" }} />
                            <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                              {tmpl.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255, 107, 44, 0.08)", color: "var(--tf-heat)" }}>
                              {tmpl.category}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--tf-surface)", color: "var(--tf-text-faint)" }}>
                              {tmpl.framework}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs mb-3" style={{ color: "var(--tf-text-muted)" }}>
                          {tmpl.description}
                        </p>

                        <div className="flex items-center gap-4 mb-2">
                          <div className="flex items-center gap-1">
                            <FileCode2 className="w-3 h-3" style={{ color: "var(--tf-text-faint)" }} />
                            <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                              {tmpl.files.length} files
                            </span>
                          </div>
                          {tmpl.dependencies.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Layers className="w-3 h-3" style={{ color: "var(--tf-text-faint)" }} />
                              <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                                {tmpl.dependencies.length} deps
                              </span>
                            </div>
                          )}
                        </div>

                        {tmpl.variables.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap mb-3">
                            {tmpl.variables.map((v) => (
                              <span
                                key={v.name}
                                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                style={{ background: "var(--tf-surface)", color: "var(--tf-text-faint)" }}
                              >
                                {`{{${v.name}}}`}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--tf-border-faint)" }}>
                          <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                            Used {tmpl.useCount} times
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                            {new Date(tmpl.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </GridSection>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  listComponents,
  searchComponents,
  useComponentApi,
  getHealingStatus,
  type Component,
  type HealingEvent,
} from "@/lib/api";
import { GridSection } from "@/components/ui/corner-ornament";
import {
  Package,
  Search,
  FileCode2,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
  ArrowRight,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ComponentsPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [healingMap, setHealingMap] = useState<Record<string, HealingEvent>>({});
  const [useRepo, setUseRepo] = useState<string>("");
  const [usingId, setUsingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      listComponents().then((res) => setComponents(res.components)),
      getHealingStatus({ limit: 100 }).then((res) => {
        const map: Record<string, HealingEvent> = {};
        res.events.forEach((e) => { if (!map[e.componentId]) map[e.componentId] = e; });
        setHealingMap(map);
      }),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      listComponents().then((res) => setComponents(res.components));
      return;
    }
    const timeout = setTimeout(() => {
      searchComponents(searchQuery, selectedCategory || undefined).then((res) =>
        setComponents(res.components)
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, selectedCategory]);

  const categories = Array.from(new Set(components.map((c) => c.category).filter(Boolean)));

  const filtered = selectedCategory
    ? components.filter((c) => c.category === selectedCategory)
    : components;

  async function handleUse(componentId: string) {
    if (!useRepo.trim()) return;
    setUsingId(componentId);
    try {
      await useComponentApi(componentId, useRepo.trim());
      setUseRepo("");
      setUsingId(null);
    } catch {
      setUsingId(null);
    }
  }

  function validationLabel(status: string) {
    if (status === "valid") return { text: "Valid", color: "var(--tf-success)" };
    if (status === "warning") return { text: "Warning", color: "var(--tf-warning)" };
    if (status === "error") return { text: "Error", color: "var(--tf-error)" };
    return { text: status || "Unknown", color: "var(--tf-text-faint)" };
  }

  return (
    <div className="min-h-full page-enter" style={{ background: "var(--tf-bg-base)" }}>
      {/* Header */}
      <GridSection showTop={false} className="px-6 pt-8 pb-6">
        <div className="max-w-3xl">
          <h1 className="text-display-lg mb-1" style={{ color: "var(--tf-text-primary)" }}>
            Components
          </h1>
          <p className="text-sm mb-5" style={{ color: "var(--tf-text-muted)" }}>
            {filtered.length} registered component{filtered.length !== 1 ? "s" : ""}
          </p>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: "var(--tf-text-faint)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search components..."
                className="w-full rounded-lg py-2 pl-9 pr-8 text-sm outline-none transition-colors"
                style={{
                  background: "var(--tf-surface)",
                  border: "1px solid var(--tf-border-faint)",
                  color: "var(--tf-text-primary)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tf-border-faint)"; }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--tf-text-faint)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {categories.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="control-chip">
                    <span className="text-xs capitalize">
                      {selectedCategory || "All categories"}
                    </span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={() => setSelectedCategory(null)}>
                    All categories
                  </DropdownMenuItem>
                  {categories.map((c) => (
                    <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                      <span className="capitalize">{c}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </GridSection>

      {/* Component list */}
      <GridSection className="px-6 py-2">
        <div className="max-w-3xl">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "var(--tf-surface-raised)" }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--tf-text-faint)" }} />
              <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                {components.length === 0 ? "No components registered yet" : "No components match your filters"}
              </p>
            </div>
          ) : (
            <div
              className="rounded-lg divide-y overflow-hidden"
              style={{ border: "1px solid var(--tf-border-faint)" }}
            >
              {filtered.map((comp) => {
                const val = validationLabel(comp.validationStatus);
                const healing = healingMap[comp.id];
                return (
                  <div key={comp.id}>
                    <button
                      onClick={() => setExpandedId(expandedId === comp.id ? null : comp.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tf-surface)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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
                        {/* Quality score */}
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: val.color, border: `1px solid ${val.color}30` }}>
                          {val.text}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--tf-surface)", color: "var(--tf-text-faint)" }}>
                          v{comp.version}
                        </span>
                        {comp.category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded capitalize hidden sm:inline" style={{ background: "rgba(53, 88, 114, 0.08)", color: "var(--tf-heat)" }}>
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
                      <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: "var(--tf-border-faint)", background: "var(--tf-surface)" }}>
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

                        {/* Healing status */}
                        {healing && (
                          <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3" style={{ color: healing.status === "completed" ? "var(--tf-success)" : "var(--tf-warning)" }} />
                            <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                              Healing: {healing.status}
                            </span>
                            <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                              {new Date(healing.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}

                        {/* Use in repo */}
                        <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--tf-border-faint)" }}>
                          <input
                            type="text"
                            value={useRepo}
                            onChange={(e) => setUseRepo(e.target.value)}
                            placeholder="owner/repo"
                            className="rounded-lg py-1.5 px-3 text-xs outline-none flex-1 max-w-[200px]"
                            style={{
                              background: "var(--tf-bg-base)",
                              border: "1px solid var(--tf-border-faint)",
                              color: "var(--tf-text-primary)",
                            }}
                          />
                          <button
                            onClick={() => handleUse(comp.id)}
                            disabled={!useRepo.trim() || usingId === comp.id}
                            className="control-chip active text-xs"
                            style={{ opacity: !useRepo.trim() ? 0.5 : 1 }}
                          >
                            <ArrowRight className="w-3 h-3" />
                            Use
                          </button>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" style={{ color: "var(--tf-text-faint)" }} />
                            <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                              {new Date(comp.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          {comp.sourceRepo && (
                            <span className="text-[10px] font-mono" style={{ color: "var(--tf-text-faint)" }}>
                              {comp.sourceRepo}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GridSection>
    </div>
  );
}

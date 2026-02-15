"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listComponents,
  searchComponents,
  type Component,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const CATEGORIES = ["Alle", "auth", "api", "ui", "util", "config"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  auth: "#ef4444",
  api: "#3b82f6",
  ui: "#a855f7",
  util: "#22c55e",
  config: "#eab308",
};

export default function MarketplacePage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadComponents();
  }, [category]);

  async function loadComponents() {
    setLoading(true);
    try {
      const result = await listComponents({
        category: category || undefined,
        limit: 50,
      });
      setComponents(result.components);
      setTotal(result.total);
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(query: string) {
    setSearch(query);
    if (searchTimeout) clearTimeout(searchTimeout);

    if (!query.trim()) {
      loadComponents();
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchComponents(query, category || undefined);
        setComponents(result.components);
        setTotal(result.components.length);
      } catch {
        // Fail silently
      } finally {
        setLoading(false);
      }
    }, 300);

    setSearchTimeout(timeout);
  }

  return (
    <div>
      <PageHeaderBar title="Marketplace" />
      <div className="p-6">
      {/* Search + filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Sok etter komponenter..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="input-field text-sm flex-1 min-w-[200px]"
        />
        <div className="flex gap-1.5">
          {CATEGORIES.map((cat) => {
            const isActive = cat === "Alle" ? !category : category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat === "Alle" ? "" : cat)}
                className="px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: isActive ? "var(--accent)" : "var(--bg-secondary)",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  border: isActive ? "none" : "1px solid var(--border)",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--sidebar-text-active)" }}
          />
        </div>
      ) : components.length === 0 ? (
        <div
          className="text-center py-16"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {search ? "Ingen komponenter matcher soket." : "Ingen komponenter i marketplace enda."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {components.map((comp) => (
            <ComponentCard key={comp.id} component={comp} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function ComponentCard({ component }: { component: Component }) {
  const catColor = CATEGORY_COLORS[component.category ?? ""] ?? "#6b7280";

  return (
    <Link href={`/marketplace/${component.id}`}>
      <div
        className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-sans font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {component.name}
            </h3>
            <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-muted)" }}>
              {component.description}
            </p>
          </div>
          <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>
            v{component.version}
          </span>
        </div>

        {/* Badges */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {component.category && (
            <span
              className="px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${catColor}20`, color: catColor }}
            >
              {component.category}
            </span>
          )}
          {component.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[10px]"
              style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>{component.timesUsed} bruk</span>
            <span>{component.files.length} filer</span>
            <span>{component.usedByRepos.length} repos</span>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{
              background: component.validationStatus === "validated" ? "#22c55e20" : "var(--bg-tertiary)",
              color: component.validationStatus === "validated" ? "#22c55e" : "var(--text-muted)",
            }}
          >
            {component.validationStatus}
          </span>
        </div>
      </div>
    </Link>
  );
}

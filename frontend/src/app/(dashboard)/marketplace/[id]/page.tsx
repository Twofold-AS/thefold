"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getComponent,
  useComponentApi,
  getHealingStatus,
  type Component,
  type HealingEvent,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const CATEGORY_COLORS: Record<string, string> = {
  auth: "#ef4444",
  api: "#3b82f6",
  ui: "#a855f7",
  util: "#22c55e",
  config: "#eab308",
};

export default function MarketplaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [component, setComponent] = useState<Component | null>(null);
  const [healingEvents, setHealingEvents] = useState<HealingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [useLoading, setUseLoading] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [compResult, healingResult] = await Promise.all([
        getComponent(id),
        getHealingStatus({ componentId: id, limit: 5 }),
      ]);
      setComponent(compResult.component);
      setHealingEvents(healingResult.events);
    } catch {
      setError("Kunne ikke laste komponenten");
    } finally {
      setLoading(false);
    }
  }

  async function handleUse() {
    if (!component) return;
    setUseLoading(true);
    try {
      await useComponentApi(component.id, "current-project");
      setComponent((prev) => prev ? { ...prev, timesUsed: prev.timesUsed + 1 } : null);
    } catch {
      setError("Kunne ikke registrere bruk");
    } finally {
      setUseLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeaderBar title="Marketplace" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--sidebar-text-active)" }}
          />
        </div>
      </div>
    );
  }

  if (error && !component) {
    return (
      <div>
        <PageHeaderBar title="Marketplace" />
        <div className="p-6 text-center py-16">
          <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
          <button onClick={() => router.push("/marketplace")} className="mt-4 text-sm underline" style={{ color: "var(--accent)" }}>
            Tilbake til Marketplace
          </button>
        </div>
      </div>
    );
  }

  if (!component) return null;

  const catColor = CATEGORY_COLORS[component.category ?? ""] ?? "#6b7280";

  return (
    <div>
      <PageHeaderBar title="Marketplace" />
      <div className="p-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/marketplace")}
        className="flex items-center gap-1.5 text-sm mb-6 hover:underline"
        style={{ color: "var(--text-muted)" }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Tilbake til Marketplace
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <h2 className="font-display text-[28px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {component.name}
          </h2>
          <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
            {component.description}
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            {component.category && (
              <span
                className="px-2.5 py-0.5 text-xs font-medium"
                style={{ background: `${catColor}20`, color: catColor }}
              >
                {component.category}
              </span>
            )}
            <span className="px-2.5 py-0.5 text-xs font-mono" style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}>
              v{component.version}
            </span>
            <span
              className="px-2.5 py-0.5 text-xs font-medium"
              style={{
                background: component.validationStatus === "validated" ? "#22c55e20" : "var(--bg-tertiary)",
                color: component.validationStatus === "validated" ? "#22c55e" : "var(--text-muted)",
              }}
            >
              {component.validationStatus}
            </span>
          </div>
        </div>
        <button
          onClick={handleUse}
          disabled={useLoading}
          className="btn-primary text-sm flex-shrink-0"
        >
          {useLoading ? "Registrerer..." : "Bruk i prosjekt"}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Bruk" value={component.timesUsed} />
        <StatCard label="Repos" value={component.usedByRepos.length} />
        <StatCard label="Filer" value={component.files.length} />
        <StatCard label="Opprettet" value={new Date(component.createdAt).toLocaleDateString("nb-NO")} />
      </div>

      {/* Files */}
      <div className="mb-8">
        <h2 className="text-sm font-sans font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Filer ({component.files.length})
        </h2>
        <div className="space-y-2">
          {component.files.map((file) => (
            <div key={file.path} className="overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <button
                onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                style={{ background: "var(--bg-card)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-sidebar)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-card)")}
              >
                <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
                  {file.path}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {file.language}
                  </span>
                  <svg
                    className="w-4 h-4 transition-transform"
                    style={{ transform: expandedFile === file.path ? "rotate(180deg)" : "rotate(0deg)", color: "var(--text-muted)" }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>
              {expandedFile === file.path && (
                <div className="code-block">
                  <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap p-4" style={{ color: "var(--text-secondary)" }}>
                    {file.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dependencies */}
      {component.dependencies.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-sans font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Dependencies
          </h2>
          <div className="flex gap-2 flex-wrap">
            {component.dependencies.map((dep) => (
              <span key={dep} className="px-2.5 py-1 text-xs font-mono" style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}>
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {component.tags.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-sans font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Tags
          </h2>
          <div className="flex gap-2 flex-wrap">
            {component.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 text-xs" style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Used by repos */}
      {component.usedByRepos.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-sans font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Brukt av
          </h2>
          <div className="flex gap-2 flex-wrap">
            {component.usedByRepos.map((repo) => (
              <span key={repo} className="px-2.5 py-1 text-xs font-mono" style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}>
                {repo}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Healing events */}
      {healingEvents.length > 0 && (
        <div>
          <h2 className="text-sm font-sans font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Healing-hendelser
          </h2>
          <div className="space-y-2">
            {healingEvents.map((event) => (
              <div key={event.id} className="card p-3 flex items-center gap-3">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background:
                      event.status === "completed" ? "#22c55e" :
                      event.status === "in_progress" ? "#eab308" :
                      event.status === "failed" ? "#ef4444" : "var(--text-muted)",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      {event.trigger}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {event.severity}
                    </span>
                    {event.newVersion && (
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                        {event.oldVersion} &rarr; {event.newVersion}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {event.affectedRepos.length} repos, {event.tasksCreated.length} oppgaver
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {new Date(event.createdAt).toLocaleDateString("nb-NO")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

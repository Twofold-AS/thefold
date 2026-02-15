"use client";

import { useState, useEffect } from "react";
import { listBuilderJobs, type BuilderJobSummary } from "@/lib/api";

const PHASE_LABELS: Record<string, string> = {
  init: "Init",
  scaffold: "Scaffold",
  dependencies: "Deps",
  implement: "Implement",
  integrate: "Integrate",
  finalize: "Finalize",
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "var(--bg-tertiary)", color: "var(--text-muted)", label: "Venter" },
  planning: { bg: "#3b82f620", color: "#60a5fa", label: "Planlegger" },
  building: { bg: "#f59e0b20", color: "#fbbf24", label: "Bygger" },
  validating: { bg: "#8b5cf620", color: "#a78bfa", label: "Validerer" },
  complete: { bg: "#22c55e20", color: "#22c55e", label: "Ferdig" },
  failed: { bg: "#ef444420", color: "#ef4444", label: "Feilet" },
  cancelled: { bg: "var(--bg-tertiary)", color: "var(--text-muted)", label: "Avbrutt" },
};

export default function BuilderPage() {
  const [activeJobs, setActiveJobs] = useState<BuilderJobSummary[]>([]);
  const [recentJobs, setRecentJobs] = useState<BuilderJobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const [activeRes, recentRes] = await Promise.all([
          listBuilderJobs({ status: "building", limit: 10 }),
          listBuilderJobs({ limit: 10 }),
        ]);
        setActiveJobs(activeRes.jobs);
        setRecentJobs(recentRes.jobs);

        // Poll every 5s when there are active jobs
        if (activeRes.jobs.length > 0 && !interval) {
          interval = setInterval(load, 5000);
        } else if (activeRes.jobs.length === 0 && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const hasActive = activeJobs.length > 0;

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="status-dot"
            style={{ background: hasActive ? "var(--accent)" : "var(--text-muted)" }}
          />
          <h2 className="text-lg font-sans font-medium" style={{ color: "var(--text-primary)" }}>
            Builder
          </h2>
          <span className="text-xs px-2 py-0.5 rounded" style={{
            background: hasActive ? "#22c55e20" : "var(--bg-tertiary)",
            color: hasActive ? "#22c55e" : "var(--text-muted)",
          }}>
            {hasActive ? `${activeJobs.length} aktiv` : "Inaktiv"}
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Fil-for-fil kodebygging med avhengighetsanalyse, inkrementell validering og automatisk feilfiksing.
        </p>
      </div>

      {/* Configuration */}
      <div className="card p-5">
        <h3 className="text-sm font-sans font-medium mb-4" style={{ color: "var(--text-primary)" }}>
          Konfigurasjon
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="section-label block mb-1">Max iterasjoner</label>
            <input
              type="number"
              defaultValue={10}
              className="input-field w-full text-sm"
              disabled
            />
          </div>
          <div>
            <label className="section-label block mb-1">Sandbox timeout (s)</label>
            <input
              type="number"
              defaultValue={120}
              className="input-field w-full text-sm"
              disabled
            />
          </div>
          <div>
            <label className="section-label block mb-1">Strategi</label>
            <select className="input-field w-full text-sm" disabled defaultValue="auto">
              <option value="auto">Auto (anbefalt)</option>
              <option value="sequential">Sequential</option>
              <option value="scaffold_first">Scaffold First</option>
              <option value="dependency_order">Dependency Order</option>
            </select>
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          Konfigurasjon er skrivebeskyttet for nå. Verdier styres fra backend.
        </p>
      </div>

      {/* CLI connection */}
      <div className="card p-5">
        <h3 className="text-sm font-sans font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          CLI-tilkobling
        </h3>
        <div className="flex items-center gap-3 mb-2">
          <span className="status-dot" style={{ background: "var(--text-muted)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Aldri tilkoblet</span>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          CLI bruker kortlevde HMAC-tokens. Alle handlinger logges.
        </p>
        <button
          className="px-3 py-1.5 text-xs font-medium"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          disabled
        >
          Installer CLI (kommer snart)
        </button>
      </div>

      {/* Active jobs */}
      {hasActive && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-sm font-sans font-medium" style={{ color: "var(--text-primary)" }}>
              Pågående jobber
            </h3>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {activeJobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Build history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-sans font-medium" style={{ color: "var(--text-primary)" }}>
            Byggehistorikk
          </h3>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Laster...
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Ingen byggjobber ennå
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {recentJobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobRow({ job }: { job: BuilderJobSummary }) {
  const style = STATUS_STYLES[job.status] || STATUS_STYLES.pending;
  const phase = job.currentPhase ? PHASE_LABELS[job.currentPhase] || job.currentPhase : "—";

  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs truncate" style={{ color: "var(--text-primary)" }}>
            {job.taskId}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{ background: style.bg, color: style.color }}
          >
            {style.label}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>Fase: {phase}</span>
          {job.totalSteps > 0 && (
            <span>{job.currentStep}/{job.totalSteps} filer</span>
          )}
          <span>${job.totalCostUsd.toFixed(4)}</span>
        </div>
      </div>
      <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        {job.createdAt ? new Date(job.createdAt).toLocaleDateString("nb-NO") : "—"}
      </div>
    </div>
  );
}

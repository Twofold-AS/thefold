"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  listProviders,
  updateModelMode,
  updatePreferences,
  getMe,
  estimateSubAgentCost,
  type AIProvider,
  type SubAgentCostPreview,
} from "@/lib/api";
import { Settings } from "lucide-react";

export default function AIModelsPage() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);
  const [costPreview, setCostPreview] = useState<SubAgentCostPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [provRes, meRes] = await Promise.all([listProviders(), getMe()]);
        setProviders(provRes.providers);
        const prefs = meRes.user.preferences as Record<string, unknown>;
        if (prefs?.modelMode === "manual") setMode("manual");
        if (prefs?.subAgentsEnabled === true) setSubAgentsEnabled(true);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load cost preview when sub-agents enabled
  useEffect(() => {
    if (!subAgentsEnabled) {
      setCostPreview(null);
      return;
    }
    async function loadPreview() {
      try {
        const preview = await estimateSubAgentCost(7, "balanced");
        setCostPreview(preview);
      } catch {
        // silent
      }
    }
    loadPreview();
  }, [subAgentsEnabled]);

  async function handleModeChange(newMode: "auto" | "manual") {
    setMode(newMode);
    setSaving(true);
    try {
      await updateModelMode(newMode);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleSubAgentsToggle() {
    const newValue = !subAgentsEnabled;
    setSubAgentsEnabled(newValue);
    setSaving(true);
    try {
      await updatePreferences({ subAgentsEnabled: newValue });
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Laster modeller...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="card p-5">
        <h2 className="text-lg font-display font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Modellstrategi
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => handleModeChange("auto")}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: mode === "auto" ? "var(--accent)" : "var(--bg-secondary)",
              color: mode === "auto" ? "#fff" : "var(--text-secondary)",
              border: mode === "auto" ? "none" : "1px solid var(--border)",
            }}
          >
            Auto
          </button>
          <button
            onClick={() => handleModeChange("manual")}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: mode === "manual" ? "var(--accent)" : "var(--bg-secondary)",
              color: mode === "manual" ? "#fff" : "var(--text-secondary)",
              border: mode === "manual" ? "none" : "1px solid var(--border)",
            }}
          >
            Manuell
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          {mode === "auto"
            ? "AI velger optimal modell basert pa oppgavens kompleksitet og budsjett."
            : "Du velger modell manuelt for hver oppgave."}
          {saving && " Lagrer..."}
        </p>
      </div>

      {/* Sub-agents toggle */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-medium" style={{ color: "var(--text-primary)" }}>
              Sub-agenter
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Aktiver parallelle AI-agenter for komplekse oppgaver. Spesialiserte roller (planner, implementer, tester, reviewer) jobber samtidig for raskere og bedre resultater.
            </p>
          </div>
          <button
            onClick={handleSubAgentsToggle}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4"
            style={{
              background: subAgentsEnabled ? "var(--accent)" : "var(--bg-tertiary)",
            }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              style={{
                transform: subAgentsEnabled ? "translateX(1.375rem)" : "translateX(0.25rem)",
              }}
            />
          </button>
        </div>

        {/* Cost preview when enabled */}
        {subAgentsEnabled && costPreview && (
          <div
            className="mt-4 p-3 text-xs space-y-2"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Uten sub-agenter (estimert):</span>
              <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                ${costPreview.withoutSubAgents.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Med sub-agenter (estimert):</span>
              <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                ${costPreview.withSubAgents.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-muted)" }}>Speedup:</span>
              <span className="font-mono" style={{ color: "var(--accent)" }}>
                {costPreview.speedupEstimate}
              </span>
            </div>
            {costPreview.agents.length > 0 && (
              <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="font-medium" style={{ color: "var(--text-muted)" }}>Agenter (kompleksitet 7):</span>
                {costPreview.agents.map((a, i) => (
                  <div key={i} className="flex justify-between mt-1">
                    <span style={{ color: "var(--text-muted)" }}>{a.role}</span>
                    <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                      {a.model.split("-").slice(0, 2).join("-")} &middot; ${a.estimatedCostUsd.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Provider-grouped model list */}
      {providers.map((p) => (
        <div key={p.id} className="card overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-display font-medium" style={{ color: "var(--text-primary)" }}>
                {p.name}
              </h2>
              {!p.enabled && (
                <span className="text-[10px] px-1.5 py-0.5" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                  deaktivert
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {p.models.filter((m) => m.enabled).length}/{p.models.length} aktive
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="table-header text-left px-5 py-3">Modell</th>
                  <th className="table-header text-center px-3 py-3">Tier</th>
                  <th className="table-header text-right px-3 py-3">Input $/1M</th>
                  <th className="table-header text-right px-3 py-3">Output $/1M</th>
                  <th className="table-header text-right px-3 py-3">Kontekst</th>
                  <th className="table-header text-center px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {p.models.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border)", opacity: m.enabled ? 1 : 0.5 }}>
                    <td className="px-5 py-3">
                      <div className="text-sm" style={{ color: "var(--text-primary)" }}>{m.displayName}</div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{m.modelId}</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium"
                        style={{
                          background: m.tier >= 4 ? "var(--accent)" : "var(--bg-tertiary)",
                          color: m.tier >= 4 ? "#fff" : "var(--text-secondary)",
                        }}
                      >
                        {m.tier}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                      ${Number(m.inputPrice).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                      ${Number(m.outputPrice).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                      {(m.contextWindow / 1000).toFixed(0)}K
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className="text-[10px] px-1.5 py-0.5"
                        style={{
                          background: m.enabled ? "rgba(34,197,94,0.15)" : "var(--bg-tertiary)",
                          color: m.enabled ? "#22c55e" : "var(--text-muted)",
                        }}
                      >
                        {m.enabled ? "aktiv" : "av"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Link to manage */}
      <div className="text-center">
        <Link
          href="/settings/models"
          className="inline-flex items-center gap-2 text-xs transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <Settings size={12} />
          Administrer leverandorer og modeller
        </Link>
      </div>
    </div>
  );
}

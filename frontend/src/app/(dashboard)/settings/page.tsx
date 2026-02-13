"use client";

import { useState, useEffect } from "react";
import { clearToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUserPreferences, updateModelMode, listModels, type ModelInfo } from "@/lib/api";
import { Zap, Settings, Shield, DollarSign, LogOut } from "lucide-react";
import { usePreferences } from "@/contexts/UserPreferencesContext";

function tierLabel(tier: number | string): string {
  if (tier === "high" || (typeof tier === "number" && tier >= 5)) return "Premium";
  if (tier === "mid" || (typeof tier === "number" && tier >= 3)) return "Standard";
  return "Budget";
}

function tierColor(tier: number | string): string {
  if (tier === "high" || (typeof tier === "number" && tier >= 5)) return "var(--accent-purple)";
  if (tier === "mid" || (typeof tier === "number" && tier >= 3)) return "var(--accent-blue)";
  return "var(--accent-green)";
}

export default function SettingsPage() {
  const router = useRouter();
  const { preferences, refresh: refreshPreferences } = usePreferences();
  const [modelMode, setModelMode] = useState<"auto" | "manual">("auto");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setModelMode(preferences.modelMode);
  }, [preferences.modelMode]);

  useEffect(() => {
    getUserPreferences()
      .then((res) => {
        setUserId(res.user.id);
      })
      .catch(() => {});

    listModels()
      .then((res) => setModels(res.models.sort((a, b) => a.tier - b.tier)))
      .catch(() => {});
  }, []);

  async function handleModeChange(mode: "auto" | "manual") {
    setModelMode(mode);
    if (!userId) return;

    setSaving(true);
    try {
      await updateModelMode(userId, mode);
      await refreshPreferences();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Revert on error
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div>
      <h1 className="font-heading text-[32px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
        Innstillinger
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        Konfigurer TheFold
      </p>

      <div className="mt-8 space-y-10">
        {/* AI-modellstrategi */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              AI-modellstrategi
            </h2>
            {saved && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-green)", color: "white" }}>
                Lagret
              </span>
            )}
          </div>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Hvordan TheFold velger AI-modell for oppgaver
          </p>
          <div className="space-y-2">
            {/* Auto */}
            <label
              className="flex items-start gap-3 py-3 px-4 cursor-pointer transition-colors"
              style={{
                border: modelMode === "auto" ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
                borderRadius: "8px",
                background: modelMode === "auto" ? "var(--bg-hover)" : "var(--bg-card)",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <input
                type="radio"
                name="modelMode"
                value="auto"
                checked={modelMode === "auto"}
                onChange={() => handleModeChange("auto")}
                disabled={saving}
                className="mt-1"
              />
              <Zap size={20} style={{ color: "var(--accent-blue)", marginTop: 2, flexShrink: 0 }} />
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  AI styrer beste modell
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Velger automatisk basert p&aring; oppgavens kompleksitet
                </div>
              </div>
            </label>

            {/* Manual */}
            <label
              className="flex items-start gap-3 py-3 px-4 cursor-pointer transition-colors"
              style={{
                border: modelMode === "manual" ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
                borderRadius: "8px",
                background: modelMode === "manual" ? "var(--bg-hover)" : "var(--bg-card)",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <input
                type="radio"
                name="modelMode"
                value="manual"
                checked={modelMode === "manual"}
                onChange={() => handleModeChange("manual")}
                disabled={saving}
                className="mt-1"
              />
              <Settings size={20} style={{ color: "var(--text-secondary)", marginTop: 2, flexShrink: 0 }} />
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Jeg velger selv
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Velg modell manuelt for hver oppgave
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* Tilgjengelige modeller */}
        {models.length > 0 && (
          <section>
            <h2 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Tilgjengelige modeller
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Modeller TheFold kan velge mellom
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Modell</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Tier</th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      <span className="inline-flex items-center gap-1"><DollarSign size={12} /> Input/1M</span>
                    </th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      <span className="inline-flex items-center gap-1"><DollarSign size={12} /> Output/1M</span>
                    </th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Styrker</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Best for</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr
                      key={m.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="py-2 px-3 font-medium" style={{ color: "var(--text-primary)" }}>
                        {m.displayName || (m as any).name || m.id}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: tierColor(m.tier), color: "white" }}
                        >
                          {tierLabel(m.tier)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>
                        ${m.inputCostPer1M.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>
                        ${m.outputCostPer1M.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {m.strengths.join(", ")}
                      </td>
                      <td className="py-2 px-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {(m.bestFor || []).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Integrasjoner */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Integrasjoner
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Tilkoblede tjenester
          </p>
          <div className="space-y-2">
            <IntegrationRow name="GitHub" status="connected" detail="Twofold-AS" />
            <IntegrationRow name="Linear" status="connected" detail="TheFold workspace" />
            <IntegrationRow name="Voyage AI" status="connected" detail="Embeddings" />
          </div>
        </section>

        {/* Sikkerhet & Audit */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Sikkerhet & Audit
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Se agent-operasjoner, innloggingshistorikk og audit-logg
          </p>
          <Link
            href="/settings/security"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            <Shield size={16} />
            Se audit-logg
          </Link>
        </section>

        {/* Konto */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Konto
          </h2>
          <button onClick={handleLogout} className="btn-secondary inline-flex items-center gap-2">
            <LogOut size={16} />
            Logg ut
          </button>
        </section>
      </div>
    </div>
  );
}

function IntegrationRow({ name, status, detail }: {
  name: string;
  status: "connected" | "disconnected";
  detail: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-3 px-4"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{name}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{detail}</span>
      </div>
      <span className={status === "connected" ? "badge-active" : "badge-error"}>
        {status === "connected" ? "Tilkoblet" : "Frakoblet"}
      </span>
    </div>
  );
}

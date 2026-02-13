"use client";

import { useState, useEffect } from "react";
import { clearToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUserPreferences, updateBudgetMode, listModels, type ModelInfo } from "@/lib/api";

const BUDGET_MODES = [
  {
    id: "aggressive_save",
    label: "Aggressiv sparing",
    description: "Bruker alltid billigste modell, oppgraderer kun ved feil",
    icon: "💰",
  },
  {
    id: "balanced",
    label: "Balansert",
    description: "Velger modell basert på oppgavens kompleksitet (anbefalt)",
    icon: "⚖️",
  },
  {
    id: "quality_first",
    label: "Kvalitet først",
    description: "Bruker alltid beste modell for høyest kvalitet",
    icon: "🏆",
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [budgetMode, setBudgetMode] = useState("balanced");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getUserPreferences()
      .then((res) => {
        setUserId(res.user.id);
        const prefs = res.user.preferences;
        if (prefs.budgetMode && typeof prefs.budgetMode === "string") {
          setBudgetMode(prefs.budgetMode);
        }
      })
      .catch(() => {});

    listModels()
      .then((res) => setModels(res.models))
      .catch(() => {});
  }, []);

  async function handleBudgetChange(mode: string) {
    setBudgetMode(mode);
    if (!userId) return;

    setSaving(true);
    try {
      await updateBudgetMode(userId, mode);
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
        {/* Budget Mode */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              AI-budsjett
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
            {BUDGET_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleBudgetChange(mode.id)}
                disabled={saving}
                className="w-full flex items-start gap-3 py-3 px-4 rounded-xl text-left transition-colors"
                style={{
                  background: budgetMode === mode.id ? "var(--accent-blue)" : "var(--bg-card)",
                  border: budgetMode === mode.id ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
                  color: budgetMode === mode.id ? "white" : "var(--text-primary)",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <span className="text-xl mt-0.5">{mode.icon}</span>
                <div>
                  <div className="text-sm font-medium">{mode.label}</div>
                  <div className="text-xs mt-0.5" style={{ opacity: 0.8 }}>{mode.description}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Available Models */}
        {models.length > 0 && (
          <section>
            <h2 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Tilgjengelige modeller
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Modeller TheFold velger mellom basert på budsjett-modus
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Modell</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Tier</th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Input $/1M</th>
                    <th className="text-right py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Output $/1M</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--text-muted)" }}>Styrker</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 px-3 font-medium" style={{ color: "var(--text-primary)" }}>{m.name}</td>
                      <td className="py-2 px-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: m.tier === "high" ? "var(--accent-purple)" : m.tier === "mid" ? "var(--accent-blue)" : "var(--accent-green)",
                            color: "white",
                          }}
                        >
                          {m.tier === "high" ? "Premium" : m.tier === "mid" ? "Standard" : "Budget"}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Integrations */}
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

        {/* Security & Audit */}
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
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            Se audit-logg
          </Link>
        </section>

        {/* Account */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Konto
          </h2>
          <button onClick={handleLogout} className="btn-secondary">
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

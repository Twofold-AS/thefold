"use client";

import { useState, useEffect, useRef } from "react";
import { clearToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateModelMode, updateProfile, listModels, type ModelInfo } from "@/lib/api";
import { Zap, Settings, Shield, DollarSign, LogOut, Check, Bug } from "lucide-react";
import { usePreferences, useUser } from "@/contexts/UserPreferencesContext";
import { isDebugEnabled, setDebugEnabled } from "@/lib/debug";

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6",
];

function tierLabel(tier: number | string): string {
  if (tier === "high" || (typeof tier === "number" && tier >= 5)) return "Premium";
  if (tier === "mid" || (typeof tier === "number" && tier >= 3)) return "Standard";
  return "Budget";
}

function tierColor(tier: number | string): string {
  if (tier === "high" || (typeof tier === "number" && tier >= 5)) return "#8b5cf6";
  if (tier === "mid" || (typeof tier === "number" && tier >= 3)) return "#3b82f6";
  return "#22c55e";
}

export default function SettingsPage() {
  const router = useRouter();
  const { preferences, refresh: refreshPreferences } = usePreferences();
  const { user, initial, avatarColor, refresh: refreshUser } = useUser();
  const [modelMode, setModelMode] = useState<"auto" | "manual">("auto");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile
  const [editName, setEditName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [localColor, setLocalColor] = useState(avatarColor);
  const [debugMode, setDebugMode] = useState(false);
  const nameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setModelMode(preferences.modelMode);
  }, [preferences.modelMode]);

  useEffect(() => {
    if (user?.name) setEditName(user.name);
  }, [user?.name]);

  useEffect(() => {
    setDebugMode(isDebugEnabled());
  }, []);

  useEffect(() => {
    setLocalColor(avatarColor);
  }, [avatarColor]);

  useEffect(() => {
    listModels()
      .then((res) => setModels(res.models.sort((a, b) => a.tier - b.tier)))
      .catch(() => {});
  }, []);

  async function handleModeChange(mode: "auto" | "manual") {
    setModelMode(mode);
    setSaving(true);
    try {
      await updateModelMode(mode);
      await refreshPreferences();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Silent
    } finally {
      setSaving(false);
    }
  }

  function handleNameChange(value: string) {
    setEditName(value);
    if (nameTimeout.current) clearTimeout(nameTimeout.current);
    nameTimeout.current = setTimeout(async () => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === user?.name) return;
      setNameSaving(true);
      try {
        await updateProfile({ name: trimmed });
        await refreshUser();
      } catch {
        // Silent
      } finally {
        setNameSaving(false);
      }
    }, 800);
  }

  async function handleColorChange(color: string) {
    setLocalColor(color);
    try {
      await updateProfile({ avatarColor: color });
      await refreshUser();
    } catch {
      setLocalColor(avatarColor);
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
        {/* Profil */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Profil
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Din brukerinformasjon
          </p>

          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold"
                style={{ background: localColor, color: "#fff" }}
              >
                {initial}
              </div>
              <div className="flex gap-1.5 flex-wrap justify-center" style={{ maxWidth: "120px" }}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(c)}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                    style={{
                      background: c,
                      outline: c === localColor ? "2px solid var(--text-primary)" : "none",
                      outlineOffset: "2px",
                    }}
                  >
                    {c === localColor && <Check size={10} color="#fff" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Visningsnavn
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="input-field"
                    style={{ maxWidth: "300px" }}
                  />
                  {nameSaving && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>
                      Lagrer...
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  E-post
                </label>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {user?.email || "..."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Rolle
                </label>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: user?.role === "admin" ? "#6366f1" : "var(--border)",
                    color: user?.role === "admin" ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {user?.role || "..."}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* AI-modellstrategi */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              AI-modellstrategi
            </h2>
            {saved && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#22c55e", color: "white" }}>
                Lagret
              </span>
            )}
          </div>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Hvordan TheFold velger AI-modell for oppgaver
          </p>
          <div className="space-y-2">
            <label
              className="flex items-start gap-3 py-3 px-4 cursor-pointer transition-colors"
              style={{
                border: modelMode === "auto" ? "2px solid #3b82f6" : "1px solid var(--border)",
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
              <Zap size={20} style={{ color: "#3b82f6", marginTop: 2, flexShrink: 0 }} />
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  AI styrer beste modell
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Velger automatisk basert på oppgavens kompleksitet
                </div>
              </div>
            </label>

            <label
              className="flex items-start gap-3 py-3 px-4 cursor-pointer transition-colors"
              style={{
                border: modelMode === "manual" ? "2px solid #3b82f6" : "1px solid var(--border)",
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
                        {m.displayName || m.id}
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

        {/* Developer */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <Bug size={18} style={{ color: "var(--text-muted)" }} />
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Developer
            </h2>
          </div>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Verktøy for utvikling og feilsøking
          </p>

          <label
            className="flex items-center justify-between py-3 px-4 cursor-pointer transition-colors"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: debugMode ? "var(--bg-hover)" : "var(--bg-card)",
            }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Debug-modus
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Vis debug-popups ved API-kall
              </div>
            </div>
            <div
              onClick={() => {
                const next = !debugMode;
                setDebugMode(next);
                setDebugEnabled(next);
              }}
              style={{
                width: "40px",
                height: "22px",
                borderRadius: "11px",
                background: debugMode ? "#6366f1" : "var(--border)",
                position: "relative",
                cursor: "pointer",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: "2px",
                  left: debugMode ? "20px" : "2px",
                  transition: "left 0.15s",
                }}
              />
            </div>
          </label>
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

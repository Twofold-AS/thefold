"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { clearToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updateProfile,
  updatePreferences,
  getCacheStats,
  listAuditLog,
  getMemoryStats,
  getMonitorHealth,
  getSecretsStatus,
  getTaskStats,
  listBuilderJobs,
  listSkills,
  listMCPServers,
  type AuditLogEntry,
} from "@/lib/api";
import { Check, LogOut, Shield } from "lucide-react";
import { useUser } from "@/contexts/UserPreferencesContext";
import { isDebugEnabled, setDebugEnabled } from "@/lib/debug";
import { getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6",
];

type SettingsTab = "profil" | "preferanser" | "debug";

export default function SettingsPage() {
  const router = useRouter();
  const { user, initial, avatarColor, refresh: refreshUser } = useUser();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profil");

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: "profil", label: "Profil" },
    { id: "preferanser", label: "Preferanser" },
    { id: "debug", label: "Debug" },
  ];

  return (
    <div>
      <PageHeaderBar
        title="Settings"
        actions={
          <Link
            href="/settings/security"
            className="inline-flex items-center gap-2 text-sm transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <Shield size={14} />
            Security & Audit
          </Link>
        }
      />
      <div className="p-6">
      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-1.5 text-sm font-medium transition-colors duration-75"
            style={{
              background: activeTab === tab.id ? "var(--accent)" : "var(--bg-secondary)",
              color: activeTab === tab.id ? "#fff" : "var(--text-secondary)",
              border: activeTab === tab.id ? "none" : "1px solid var(--border)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "profil" && (
        <ProfilTab
          user={user}
          initial={initial}
          avatarColor={avatarColor}
          refreshUser={refreshUser}
          onLogout={handleLogout}
        />
      )}
      {activeTab === "preferanser" && <PreferanserTab user={user} refreshUser={refreshUser} />}
      {activeTab === "debug" && <DebugTab />}
      </div>
    </div>
  );
}

/* ============================================
   Profil Tab
   ============================================ */

function ProfilTab({
  user,
  initial,
  avatarColor,
  refreshUser,
  onLogout,
}: {
  user: { name: string; email: string; role: string } | null;
  initial: string;
  avatarColor: string;
  refreshUser: () => Promise<void>;
  onLogout: () => void;
}) {
  const [editName, setEditName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [localColor, setLocalColor] = useState(avatarColor);
  const nameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user?.name) setEditName(user.name);
  }, [user?.name]);

  useEffect(() => {
    setLocalColor(avatarColor);
  }, [avatarColor]);

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

  return (
    <div className="space-y-8">
      {/* Avatar + fields */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-medium mb-4" style={{ color: "var(--text-primary)" }}>
          Brukerinformasjon
        </h3>
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
              <label className="section-label block mb-1">Visningsnavn</label>
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
              <label className="section-label block mb-1">E-post</label>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {user?.email || "..."}
              </p>
            </div>

            <div>
              <label className="section-label block mb-1">Rolle</label>
              <span
                className="text-xs px-2 py-0.5 font-medium"
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
      </div>

      {/* Konto */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Konto
        </h3>
        <button onClick={onLogout} className="btn-secondary inline-flex items-center gap-2">
          <LogOut size={16} />
          Logg ut
        </button>
      </div>
    </div>
  );
}

/* ============================================
   Preferanser Tab
   ============================================ */

function PreferanserTab({
  user,
  refreshUser,
}: {
  user: { name: string; email: string; role: string; preferences?: Record<string, unknown> } | null;
  refreshUser: () => Promise<void>;
}) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [notifyTaskDone, setNotifyTaskDone] = useState(true);
  const [notifyReview, setNotifyReview] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  // Load notification preferences from user profile
  useEffect(() => {
    if (user?.preferences) {
      const prefs = user.preferences as Record<string, unknown>;
      if (typeof prefs.notifyTaskDone === "boolean") setNotifyTaskDone(prefs.notifyTaskDone);
      if (typeof prefs.notifyReview === "boolean") setNotifyReview(prefs.notifyReview);
    }
  }, [user?.preferences]);

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
    setStoredTheme(newTheme);
  }

  async function handleNotifyChange(key: string, value: boolean) {
    if (key === "notifyTaskDone") setNotifyTaskDone(value);
    if (key === "notifyReview") setNotifyReview(value);

    setSaving(true);
    try {
      await updatePreferences({ [key]: value });
      await refreshUser();
    } catch {
      // Revert on error
      if (key === "notifyTaskDone") setNotifyTaskDone(!value);
      if (key === "notifyReview") setNotifyReview(!value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Tema
        </h3>
        <div className="flex gap-3">
          <button
            onClick={() => handleThemeChange("dark")}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: theme === "dark" ? "var(--accent)" : "var(--bg-secondary)",
              color: theme === "dark" ? "#fff" : "var(--text-secondary)",
              border: theme === "dark" ? "none" : "1px solid var(--border)",
            }}
          >
            M&oslash;rk
          </button>
          <button
            onClick={() => handleThemeChange("light")}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: theme === "light" ? "var(--accent)" : "var(--bg-secondary)",
              color: theme === "light" ? "#fff" : "var(--text-secondary)",
              border: theme === "light" ? "none" : "1px solid var(--border)",
            }}
          >
            Lys
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Spr&aring;k
        </h3>
        <div className="flex gap-3">
          <button
            className="px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Norsk
          </button>
          <button
            className="px-4 py-2 text-sm font-medium"
            style={{ background: "var(--bg-secondary)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            disabled
          >
            English (kommer)
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-medium mb-4" style={{ color: "var(--text-primary)" }}>
          Varsler
        </h3>
        <div className="space-y-3">
          <ToggleRow
            label="Varsle n&aring;r oppgave er ferdig"
            description="F&aring; beskjed n&aring;r en agent-task fullf&oslash;res"
            checked={notifyTaskDone}
            onChange={(v) => handleNotifyChange("notifyTaskDone", v)}
          />
          <ToggleRow
            label="Varsle n&aring;r review trengs"
            description="F&aring; beskjed n&aring;r kode venter p&aring; din godkjenning"
            checked={notifyReview}
            onChange={(v) => handleNotifyChange("notifyReview", v)}
          />
        </div>
        {saving && (
          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            Lagrer...
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================
   Debug Tab
   ============================================ */

type ServiceStatus = "checking" | "ok" | "error";

function DebugTab() {
  const [debugMode, setDebugMode] = useState(false);
  const [cacheStats, setCacheStats] = useState<{
    hitRate: number;
    totalEntries: number;
    embeddingHits: number;
    embeddingMisses: number;
    repoHits: number;
    repoMisses: number;
    aiPlanHits: number;
    aiPlanMisses: number;
  } | null>(null);
  const [recentErrors, setRecentErrors] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, ServiceStatus>>({});

  useEffect(() => {
    setDebugMode(isDebugEnabled());
  }, []);

  const SERVICES = [
    { name: "gateway", label: "Gateway (Auth)" },
    { name: "chat", label: "Chat" },
    { name: "ai", label: "AI" },
    { name: "agent", label: "Agent" },
    { name: "sandbox", label: "Sandbox" },
    { name: "memory", label: "Memory" },
    { name: "skills", label: "Skills" },
    { name: "tasks", label: "Tasks" },
    { name: "builder", label: "Builder" },
    { name: "monitor", label: "Monitor" },
    { name: "mcp", label: "MCP" },
    { name: "cache", label: "Cache" },
  ];

  const checkServices = useCallback(async () => {
    // Set all to "checking"
    const initial: Record<string, ServiceStatus> = {};
    SERVICES.forEach((s) => { initial[s.name] = "checking"; });
    setServiceStatuses(initial);

    // Ping each service with a lightweight call
    const checks: Array<{ name: string; fn: () => Promise<unknown> }> = [
      { name: "gateway", fn: () => getSecretsStatus() },
      { name: "cache", fn: () => getCacheStats() },
      { name: "memory", fn: () => getMemoryStats() },
      { name: "monitor", fn: () => getMonitorHealth() },
      { name: "agent", fn: () => listAuditLog({ limit: 1 }) },
      { name: "tasks", fn: () => getTaskStats() },
      { name: "builder", fn: () => listBuilderJobs({ limit: 1 }) },
      { name: "skills", fn: () => listSkills(undefined, false) },
      { name: "mcp", fn: () => listMCPServers() },
    ];

    // Run all checks in parallel
    const results = await Promise.allSettled(checks.map((c) => c.fn()));
    const updated: Record<string, ServiceStatus> = {};
    checks.forEach((c, i) => {
      updated[c.name] = results[i].status === "fulfilled" ? "ok" : "error";
    });

    // Services without direct endpoints — mark as ok if Encore is running
    // (chat, ai, sandbox don't have lightweight GET endpoints we can ping)
    const encoreUp = Object.values(updated).some((s) => s === "ok");
    ["chat", "ai", "sandbox"].forEach((s) => {
      updated[s] = encoreUp ? "ok" : "error";
    });

    setServiceStatuses(updated);
  }, []);

  const loadDebugData = useCallback(async () => {
    setLoading(true);
    try {
      const [cacheRes, errorsRes] = await Promise.all([
        getCacheStats(),
        listAuditLog({ failedOnly: true, limit: 5 }),
      ]);
      setCacheStats(cacheRes);
      setRecentErrors(errorsRes.entries);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDebugData();
    checkServices();
  }, [loadDebugData, checkServices]);

  function handleDebugToggle() {
    const next = !debugMode;
    setDebugMode(next);
    setDebugEnabled(next);
  }

  return (
    <div className="space-y-6">
      {/* Debug mode toggle */}
      <div className="card p-5">
        <ToggleRow
          label="Debug-modus"
          description="Vis debug-popups ved API-kall (synlig kun for deg)"
          checked={debugMode}
          onChange={handleDebugToggle}
        />
      </div>

      {/* System status */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-medium" style={{ color: "var(--text-primary)" }}>
            Backend-tjenester
          </h3>
          <button onClick={checkServices} className="text-xs" style={{ color: "var(--text-muted)" }}>
            Sjekk p&aring; nytt
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SERVICES.map((svc) => {
            const status = serviceStatuses[svc.name] || "checking";
            const dotColor = status === "ok" ? "#22c55e" : status === "error" ? "#ef4444" : "var(--text-muted)";
            return (
              <div
                key={svc.name}
                className="flex items-center gap-2 px-3 py-2 rounded"
                style={{ background: "var(--bg-secondary)" }}
              >
                <span
                  className="status-dot"
                  style={{
                    background: dotColor,
                    animation: status === "checking" ? "pulse 1.5s infinite" : "none",
                  }}
                />
                <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                  {svc.label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          {Object.values(serviceStatuses).filter((s) => s === "ok").length}/{SERVICES.length} tjenester tilkoblet
        </p>
      </div>

      {/* Cache stats */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-medium" style={{ color: "var(--text-primary)" }}>
            Cache-statistikk
          </h3>
          <button onClick={loadDebugData} className="text-xs" style={{ color: "var(--text-muted)" }}>
            Oppdater
          </button>
        </div>
        {loading ? (
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>Laster...</div>
        ) : cacheStats ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Hit rate</span>
              <span className="font-mono text-sm font-medium" style={{
                color: cacheStats.hitRate > 60 ? "#22c55e" : cacheStats.hitRate > 30 ? "#eab308" : "#ef4444"
              }}>
                {cacheStats.hitRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Totalt entries</span>
              <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>{cacheStats.totalEntries}</span>
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div style={{ color: "var(--text-muted)" }}>Embeddings</div>
                  <div className="font-mono mt-1" style={{ color: "var(--text-primary)" }}>
                    {cacheStats.embeddingHits}/{cacheStats.embeddingHits + cacheStats.embeddingMisses}
                  </div>
                </div>
                <div className="text-center">
                  <div style={{ color: "var(--text-muted)" }}>Repo</div>
                  <div className="font-mono mt-1" style={{ color: "var(--text-primary)" }}>
                    {cacheStats.repoHits}/{cacheStats.repoHits + cacheStats.repoMisses}
                  </div>
                </div>
                <div className="text-center">
                  <div style={{ color: "var(--text-muted)" }}>AI Plan</div>
                  <div className="font-mono mt-1" style={{ color: "var(--text-primary)" }}>
                    {cacheStats.aiPlanHits}/{cacheStats.aiPlanHits + cacheStats.aiPlanMisses}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>Kunne ikke hente cache-statistikk</div>
        )}
      </div>

      {/* Recent errors */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-display font-medium" style={{ color: "var(--text-primary)" }}>
            Siste feil
          </h3>
        </div>
        {recentErrors.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Ingen feil registrert
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {recentErrors.map((entry) => (
              <div key={entry.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                    {entry.actionType}
                  </span>
                  {entry.taskId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                      {entry.taskId.substring(0, 8)}
                    </span>
                  )}
                  <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                    {new Date(entry.timestamp).toLocaleString("nb-NO")}
                  </span>
                </div>
                {entry.errorMessage && (
                  <p className="text-xs" style={{ color: "#ef4444" }}>
                    {entry.errorMessage.length > 150 ? entry.errorMessage.substring(0, 150) + "..." : entry.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version info */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Versjon
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>TheFold</span>
            <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>4.0-dev</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Encore.ts</span>
            <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>1.54.x</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Next.js</span>
            <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>15.x</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   Shared: Toggle Row
   ============================================ */

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {description}
        </div>
      </div>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: "40px",
          height: "22px",
          borderRadius: "11px",
          background: checked ? "#6366f1" : "var(--border)",
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
            left: checked ? "20px" : "2px",
            transition: "left 0.15s",
          }}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  getMe,
  updateProfile,
  updatePreferences,
  getSecretsStatus,
  listIntegrations,
  logout,
  type UserProfile,
  type SecretStatus,
  type IntegrationConfig,
} from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { GridSection } from "@/components/ui/corner-ornament";
import {
  User,
  Sliders,
  Shield,
  Save,
  Check,
  LogOut,
  Key,
  Plug,
} from "lucide-react";
import { usePreferences } from "@/contexts/UserPreferencesContext";

type SettingsTab = "profile" | "preferences" | "security";

export default function SettingsPage() {
  const router = useRouter();
  const { preferences, refresh } = usePreferences();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [secrets, setSecrets] = useState<SecretStatus[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const [name, setName] = useState("");
  const [modelMode, setModelMode] = useState("auto");
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      getMe().then((res) => {
        setProfile(res.user);
        setName(res.user.name || "");
      }),
      getSecretsStatus().then((res) => setSecrets(res.secrets)),
      listIntegrations().then((res) => setIntegrations(res.configs)),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (preferences) {
      setModelMode(preferences.modelMode || "auto");
    }
  }, [preferences]);

  useEffect(() => {
    if (profile?.preferences) {
      setSubAgentsEnabled(!!(profile.preferences as Record<string, unknown>).subAgentsEnabled);
    }
  }, [profile]);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await updateProfile({ name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  }

  async function handleSavePreferences() {
    setSaving(true);
    try {
      await updatePreferences({ modelMode, subAgentsEnabled });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {}
    clearToken();
    router.push("/login");
  }

  const configuredSecrets = secrets.filter((s) => s.configured).length;

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: "profile", label: "Profile", icon: <User className="w-4 h-4" /> },
    { key: "preferences", label: "Preferences", icon: <Sliders className="w-4 h-4" /> },
    { key: "security", label: "Security", icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-full page-enter" style={{ background: "var(--tf-bg-base)" }}>
      {/* Header with decorative dots */}
      <GridSection showTop={false} className="px-6 pt-8 pb-6">
        <h1 className="text-display-lg mb-1" style={{ color: "var(--tf-text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
          Manage your profile, preferences, and security
        </p>
      </GridSection>

      {/* Tabbed layout — matches Firecrawl settings pattern */}
      <GridSection className="min-h-[500px]">
        <div className="flex min-h-[500px]">
          {/* Left tab sidebar */}
          <div className="w-[200px] flex-shrink-0 p-4 hidden sm:block" style={{ borderRight: "1px solid var(--tf-border-faint)" }}>
            <div className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left"
                  style={{
                    background: activeTab === tab.key ? "rgba(53, 88, 114, 0.06)" : "transparent",
                    color: activeTab === tab.key ? "var(--tf-heat)" : "var(--tf-text-secondary)",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b sm:hidden" style={{ borderColor: "var(--tf-border-faint)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                style={{
                  background: activeTab === tab.key ? "rgba(53, 88, 114, 0.06)" : "transparent",
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
            {/* Profile tab */}
            {activeTab === "profile" && (
              <div className="max-w-lg space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Profile
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    Update your account information
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: "var(--tf-text-muted)" }}>
                      Email
                    </label>
                    <div
                      className="text-sm px-3 py-2.5 rounded-lg"
                      style={{
                        background: "var(--tf-surface)",
                        color: "var(--tf-text-secondary)",
                        border: "1px solid var(--tf-border-faint)",
                      }}
                    >
                      {profile?.email || "—"}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: "var(--tf-text-muted)" }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full text-sm px-3 py-2.5 rounded-lg outline-none transition-colors"
                      style={{
                        background: "var(--tf-surface)",
                        color: "var(--tf-text-primary)",
                        border: "1px solid var(--tf-border-faint)",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tf-border-faint)"; }}
                    />
                  </div>

                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--tf-text-faint)" }}>
                    <span>
                      Role: <strong style={{ color: "var(--tf-text-secondary)" }}>{profile?.role || "—"}</strong>
                    </span>
                    <span>
                      Joined: {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}
                    </span>
                  </div>

                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all active:scale-[0.98]"
                    style={{
                      background: "var(--tf-heat)",
                      color: "white",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {saved ? "Saved" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* Preferences tab */}
            {activeTab === "preferences" && (
              <div className="max-w-lg space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Preferences
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    AI behavior and routing
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="text-xs block mb-2" style={{ color: "var(--tf-text-muted)" }}>
                      Model routing
                    </label>
                    <div className="flex gap-2">
                      {["auto", "manual"].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setModelMode(mode)}
                          className="px-4 py-2 rounded-full text-sm capitalize transition-all active:scale-[0.98]"
                          style={{
                            background: modelMode === mode ? "rgba(53, 88, 114, 0.08)" : "var(--tf-surface)",
                            color: modelMode === mode ? "var(--tf-heat)" : "var(--tf-text-secondary)",
                            border: `1px solid ${modelMode === mode ? "rgba(53, 88, 114, 0.2)" : "var(--tf-border-faint)"}`,
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] mt-1.5 block" style={{ color: "var(--tf-text-faint)" }}>
                      Auto: best model selected. Manual: you choose per message.
                    </span>
                  </div>

                  <div
                    className="flex items-center justify-between p-4 rounded-lg"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    <div>
                      <span className="text-sm block" style={{ color: "var(--tf-text-primary)" }}>
                        Sub-agents
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                        Parallel AI agents for complex tasks
                      </span>
                    </div>
                    <button
                      onClick={() => setSubAgentsEnabled(!subAgentsEnabled)}
                      className="w-10 h-5 rounded-full relative transition-colors"
                      style={{ background: subAgentsEnabled ? "var(--tf-heat)" : "var(--tf-border-muted)" }}
                    >
                      <div
                        className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform"
                        style={{ left: subAgentsEnabled ? "22px" : "2px" }}
                      />
                    </button>
                  </div>

                  <button
                    onClick={handleSavePreferences}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all active:scale-[0.98]"
                    style={{
                      background: "var(--tf-heat)",
                      color: "white",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {saved ? "Saved" : "Save preferences"}
                  </button>
                </div>
              </div>
            )}

            {/* Security tab */}
            {activeTab === "security" && (
              <div className="max-w-lg space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Security
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    Secrets, integrations, and session management
                  </p>
                </div>

                {/* Secrets */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Key className="w-4 h-4" style={{ color: "var(--tf-text-muted)" }} />
                    <h3 className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                      Secrets
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--tf-surface)", color: "var(--tf-text-muted)" }}>
                      {configuredSecrets}/{secrets.length}
                    </span>
                  </div>
                  <div
                    className="rounded-lg divide-y"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    {secrets.map((s) => (
                      <div key={s.name} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-mono" style={{ color: "var(--tf-text-secondary)" }}>
                          {s.name}
                        </span>
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: s.configured ? "var(--tf-success)" : "var(--tf-error)" }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Integrations */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Plug className="w-4 h-4" style={{ color: "var(--tf-text-muted)" }} />
                    <h3 className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                      Integrations
                    </h3>
                  </div>
                  {integrations.length > 0 ? (
                    <div
                      className="rounded-lg divide-y"
                      style={{ border: "1px solid var(--tf-border-faint)" }}
                    >
                      {integrations.map((c) => (
                        <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm capitalize" style={{ color: "var(--tf-text-primary)" }}>
                            {c.platform}
                          </span>
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: c.enabled ? "var(--tf-success)" : "var(--tf-text-faint)" }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                      No integrations configured
                    </p>
                  )}
                </div>

                {/* Sign out */}
                <div className="pt-4 border-t" style={{ borderColor: "var(--tf-border-faint)" }}>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all active:scale-[0.98]"
                    style={{
                      background: "rgba(235, 52, 36, 0.08)",
                      color: "var(--tf-error)",
                      border: "1px solid rgba(235, 52, 36, 0.15)",
                    }}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </GridSection>
    </div>
  );
}

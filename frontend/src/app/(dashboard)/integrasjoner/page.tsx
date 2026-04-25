"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import Skeleton from "@/components/Skeleton";

import { GR } from "@/components/GridRow";
import { useApiData } from "@/lib/hooks";
import {
  listIntegrations,
  saveIntegration,
  deleteIntegration,
  getIntegrationApiKeyStatus,
  setIntegrationApiKey,
  deleteIntegrationApiKey,
  testIntegrationApiKey,
  type IntegrationConfig,
} from "@/lib/api";
import { useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface StaticIntegration {
  n: string;
  cat: string;
  platform: string;
  desc: string;
  ev?: string[];
  /** When true the row is shown in the list but rendered disabled with a
   *  "Kommer snart"-tag instead of a "Koble til"-knapp. Used as a
   *  placeholder for integrations we're considering but haven't built yet
   *  — lets users see the direction without accidentally clicking. */
  comingSoon?: boolean;
}

const staticIntegrations: StaticIntegration[] = [
  {
    n: "Slack",
    cat: "kommunikasjon",
    platform: "slack",
    desc: "Motta varsler om oppgavestatus, builds og reviews direkte i Slack.",
    ev: ["task.completed", "build.failed", "review.ready"],
  },
  {
    n: "Discord",
    cat: "kommunikasjon",
    platform: "discord",
    desc: "Send agent-hendelser og statusoppdateringer til Discord-kanaler.",
    ev: ["task.completed", "build.failed", "review.ready"],
  },
  {
    n: "Linear",
    cat: "prosjektstyring",
    platform: "linear",
    desc: "To-veis synkronisering av oppgaver og statuser med Linear.",
  },
  {
    n: "GitHub",
    cat: "kode",
    platform: "github",
    desc: "Les og skriv kode, opprett PRer og håndter repos via GitHub App.",
  },
  {
    n: "Firecrawl",
    cat: "web",
    platform: "firecrawl",
    desc: "Web-skraping og innhenting av kontekst fra nettsider.",
  },
  {
    n: "Sentry",
    cat: "feilsporing",
    platform: "sentry",
    desc: "Koble TheFold til Sentry for automatisk feilanalyse og oppgaveopprettelse.",
  },
  {
    n: "Vercel",
    cat: "deploy",
    platform: "vercel",
    desc: "Integrasjon med Vercel for automatisk deployment etter godkjente PRer.",
  },
  {
    n: "Resend",
    cat: "e-post",
    platform: "resend",
    desc: "E-postvarsler for jobb-fullføring, healing-hendelser og kritiske feil.",
  },
  {
    n: "iMessage (SendBlue)",
    cat: "kommunikasjon",
    platform: "sendblue",
    desc: "Chat med agenten din via iMessage eller SMS. Under vurdering — ikke tilgjengelig enda.",
    comingSoon: true,
  },
];

// Platforms configured server-side via secrets — user cannot add/remove these
const SERVER_SIDE_PLATFORMS = ["linear", "resend", "brave-search"];
// Platforms with API-key-based flow (uses /integrations/api-key/* endpoints, encrypted).
const API_KEY_PLATFORMS = ["firecrawl"];
// GitHub is server-side but also shown as "tilkoblet" since it's the core integration
const GITHUB_PLATFORM = "github";

const INTEGRATION_FIELDS: Record<string, { label: string; field: string; placeholder: string }[]> = {
  slack:    [{ label: "Webhook URL", field: "webhookUrl", placeholder: "https://hooks.slack.com/..." }],
  discord:  [{ label: "Webhook URL", field: "webhookUrl", placeholder: "https://discord.com/api/webhooks/..." }],
  sentry:   [{ label: "DSN", field: "webhookUrl", placeholder: "https://xxx@sentry.io/..." }],
  vercel:   [{ label: "Token", field: "botToken", placeholder: "vercel_..." }],
  firecrawl: [{ label: "API Key", field: "botToken", placeholder: "fc-..." }],
};

/** True only if user has saved a config for this platform */
function isUserConnected(platform: string, configs: IntegrationConfig[]): boolean {
  return configs.some(c => c.platform === platform && c.enabled);
}

function isApiKeyPlatform(p: string): boolean {
  return API_KEY_PLATFORMS.includes(p);
}

/** True if platform is github (always shown as active) or user has configured it */
function isConnected(platform: string, configs: IntegrationConfig[]): boolean {
  if (platform === GITHUB_PLATFORM) return true;
  return isUserConnected(platform, configs);
}

function isServerSide(platform: string): boolean {
  return SERVER_SIDE_PLATFORMS.includes(platform);
}

const inputStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 13,
  color: T.text,
  fontFamily: T.sans,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

export default function IntegrasjonerPage() {
  const { data, loading, refresh } = useApiData(() => listIntegrations(), []);
  const configs = data?.configs ?? [];

  const [configPlatform, setConfigPlatform] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // API-key-platform status (Firecrawl etc) — separate lookup from integration_configs.
  const [apiKeyPreview, setApiKeyPreview] = useState<Record<string, string | null>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      API_KEY_PLATFORMS.map(async (p) => {
        try {
          const r = await getIntegrationApiKeyStatus(p);
          return [p, r.status.preview] as const;
        } catch {
          return [p, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setApiKeyPreview(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, []);

  const merged = staticIntegrations.map(si => {
    const apiKeyConfigured = isApiKeyPlatform(si.platform) && !!apiKeyPreview[si.platform];
    const userConfigured = apiKeyConfigured || isUserConnected(si.platform, configs);
    return {
      ...si,
      connected: si.platform === GITHUB_PLATFORM || userConfigured,
      serverSide: isServerSide(si.platform),
      apiKey: isApiKeyPlatform(si.platform),
      apiKeyPreview: apiKeyPreview[si.platform] ?? null,
      isGitHub: si.platform === GITHUB_PLATFORM,
      userConfigured,
    };
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (platform: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform); else next.add(platform);
      return next;
    });
  };

  const handleOpenConfig = (platform: string) => {
    setConfigPlatform(platform);
    setConfigValues({});
    setTestResult(null);
  };

  const handleSaveConfig = async () => {
    if (!configPlatform) return;
    setSaving(true);
    try {
      if (isApiKeyPlatform(configPlatform)) {
        // Firecrawl-style: encrypted API key endpoint
        const field = INTEGRATION_FIELDS[configPlatform]?.[0]?.field ?? "botToken";
        const value = configValues[field] ?? "";
        if (!value.trim()) throw new Error("API-nøkkel mangler");
        const res = await setIntegrationApiKey(configPlatform, value.trim());
        setApiKeyPreview((prev) => ({ ...prev, [configPlatform]: res.status.preview }));
      } else {
        const fields = INTEGRATION_FIELDS[configPlatform] ?? [];
        const req: Record<string, unknown> = { platform: configPlatform, enabled: true };
        for (const f of fields) {
          if (configValues[f.field]) {
            req[f.field] = configValues[f.field];
          }
        }
        await saveIntegration(req as Parameters<typeof saveIntegration>[0]);
      }
      setConfigPlatform(null);
      setConfigValues({});
      setTestResult(null);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!configPlatform || !isApiKeyPlatform(configPlatform)) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testIntegrationApiKey(configPlatform);
      setTestResult(r.success ? `✓ ${r.message}` : `✗ ${r.message}`);
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async (platform: string) => {
    try {
      if (isApiKeyPlatform(platform)) {
        await deleteIntegrationApiKey(platform);
        setApiKeyPreview((prev) => ({ ...prev, [platform]: null }));
      } else {
        await deleteIntegration(platform);
      }
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Frakobling feilet");
    }
  };

  return (
    <>
      <div style={{ paddingTop: 0, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Integrasjoner</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Eksterne tjenester og tilkoblinger.</p>
      </div>

      <GR mb={40}>
        {loading ? (
          <Skeleton rows={4} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {merged.map((ig) => {
              const isOpen = expanded.has(ig.platform);
              return (
                <div
                  key={ig.platform}
                  style={{
                    background: T.sidebar,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r,
                    overflow: "hidden",
                    // Subtle muted state for placeholder integrations so
                    // users see the intent without mistaking them for live.
                    opacity: ig.comingSoon ? 0.6 : 1,
                  }}
                >
                  {/* Header row */}
                  <div
                    onClick={() => toggle(ig.platform)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 20px", cursor: "pointer",
                    }}
                  >
                    <span style={{ color: T.textFaint, flexShrink: 0 }}>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{ig.n}</span>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>{ig.cat}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      {ig.comingSoon && <Tag variant="default">Kommer snart</Tag>}
                      {!ig.comingSoon && ig.connected && <Tag variant="success">tilkoblet</Tag>}
                      {!ig.comingSoon && !ig.connected && ig.serverSide && <Tag>via server</Tag>}
                      {!ig.comingSoon && !ig.connected && !ig.serverSide && <Tag variant="default">frakoblet</Tag>}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{
                      padding: "16px 20px",
                      borderTop: `1px solid ${T.border}`,
                      background: "#2a2d30",
                    }}>
                      <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, marginBottom: 12 }}>{ig.desc}</p>
                      {ig.ev && ig.connected && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                          {ig.ev.map(e => (<Tag key={e}>{e}</Tag>))}
                        </div>
                      )}
                      {ig.comingSoon ? (
                        <Tag variant="default">Ikke tilgjengelig enda</Tag>
                      ) : ig.isGitHub ? (
                        <Tag variant="success">Aktiv — GitHub App</Tag>
                      ) : ig.serverSide ? (
                        <Tag>Konfigurert via server</Tag>
                      ) : ig.userConfigured ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {ig.apiKey && ig.apiKeyPreview && (
                            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>
                              {ig.apiKeyPreview}
                            </span>
                          )}
                          {ig.apiKey && (
                            <Btn sm onClick={() => handleOpenConfig(ig.platform)}>Rediger</Btn>
                          )}
                          <Btn sm onClick={() => handleDisconnect(ig.platform)}>Koble fra</Btn>
                        </div>
                      ) : (
                        <Btn sm primary onClick={() => handleOpenConfig(ig.platform)}>Koble til</Btn>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GR>

      {/* Config dialog */}
      {configPlatform && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.15)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfigPlatform(null); }}
        >
          <div
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.r,
              padding: 24,
              width: 420,
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 20 }}>
              Koble til {staticIntegrations.find(s => s.platform === configPlatform)?.n ?? configPlatform}
            </div>

            {(INTEGRATION_FIELDS[configPlatform] ?? []).map((f) => (
              <div key={f.field} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>{f.label}</div>
                <input
                  value={configValues[f.field] ?? ""}
                  onChange={(e) => setConfigValues(prev => ({ ...prev, [f.field]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={inputStyle}
                />
              </div>
            ))}

            {testResult && (
              <div style={{
                marginTop: 10,
                padding: "8px 12px",
                background: testResult.startsWith("✓") ? "rgba(34,197,94,0.10)" : "rgba(248,113,113,0.10)",
                border: `1px solid ${testResult.startsWith("✓") ? "#22c55e" : "#f87171"}`,
                borderRadius: 6,
                fontSize: 12,
                color: testResult.startsWith("✓") ? "#22c55e" : "#f87171",
              }}>
                {testResult}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 20 }}>
              {isApiKeyPlatform(configPlatform) && apiKeyPreview[configPlatform] ? (
                <Btn sm onClick={handleTestConnection} style={{ opacity: testing ? 0.5 : 1, pointerEvents: testing ? "none" : "auto" }}>
                  {testing ? "Tester..." : "Test tilkobling"}
                </Btn>
              ) : <span />}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn sm onClick={() => setConfigPlatform(null)}>Avbryt</Btn>
                <Btn
                  primary
                  sm
                  onClick={handleSaveConfig}
                  style={{ opacity: saving ? 0.5 : 1, pointerEvents: saving ? "none" : "auto" }}
                >
                  {saving ? "Lagrer..." : "Lagre"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

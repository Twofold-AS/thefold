"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import Skeleton from "@/components/Skeleton";

import PixelCorners from "@/components/PixelCorners";
import { GR } from "@/components/GridRow";
import { useApiData } from "@/lib/hooks";
import { listIntegrations, saveIntegration, deleteIntegration, type IntegrationConfig } from "@/lib/api";

interface StaticIntegration {
  n: string;
  cat: string;
  platform: string;
  desc: string;
  ev?: string[];
}

const staticIntegrations: StaticIntegration[] = [
  { n: "Slack", cat: "Kommunikasjon", platform: "slack", desc: "Webhook-varsler til Slack-kanaler", ev: ["task.completed", "review.pending", "health.alert"] },
  { n: "Discord", cat: "Kommunikasjon", platform: "discord", desc: "Varsler til Discord-server", ev: ["task.completed", "review.pending"] },
  { n: "Linear", cat: "Prosjektstyring", platform: "linear", desc: "Synkroniserer oppgaver med Linear", ev: ["task.created", "task.updated", "task.completed"] },
  { n: "GitHub", cat: "Kode", platform: "github", desc: "Repo-tilgang, PR-oppretting, webhooks", ev: ["push", "pull_request", "review"] },
  { n: "Sentry", cat: "Observability", platform: "sentry", desc: "Feilsporing og ytelsesovervåking" },
  { n: "Vercel", cat: "Deploy", platform: "vercel", desc: "Automatisk deployment ved PR-merge" },
  { n: "Resend", cat: "E-post", platform: "resend", desc: "OTP og transaksjonell e-post", ev: ["auth.otp"] },
  { n: "Brave Search", cat: "MCP", platform: "brave-search", desc: "Web-søk for agent via MCP", ev: ["agent.search"] },
  { n: "Firecrawl", cat: "Web", platform: "firecrawl", desc: "Web-scraping — agenten kan lese nettsider som kontekst", ev: ["agent.browse_url"] },
];

const SERVER_SIDE_PLATFORMS = ["linear", "github", "resend", "brave-search"];

const INTEGRATION_FIELDS: Record<string, { label: string; field: string; placeholder: string }[]> = {
  slack:    [{ label: "Webhook URL", field: "webhookUrl", placeholder: "https://hooks.slack.com/..." }],
  discord:  [{ label: "Webhook URL", field: "webhookUrl", placeholder: "https://discord.com/api/webhooks/..." }],
  sentry:   [{ label: "DSN", field: "webhookUrl", placeholder: "https://xxx@sentry.io/..." }],
  vercel:   [{ label: "Token", field: "botToken", placeholder: "vercel_..." }],
  firecrawl: [{ label: "API Key", field: "botToken", placeholder: "fc-..." }],
};

function isConnected(platform: string, configs: IntegrationConfig[]): boolean {
  const cfg = configs.find(c => c.platform === platform);
  if (cfg && cfg.enabled) return true;
  return false;
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

  const merged = staticIntegrations.map(si => ({
    ...si,
    connected: isConnected(si.platform, configs) || isServerSide(si.platform),
    serverSide: isServerSide(si.platform),
    userConfigured: isConnected(si.platform, configs),
  }));

  const connectedCount = merged.filter(i => i.connected).length;
  const disconnectedCount = merged.filter(i => !i.connected).length;

  const handleOpenConfig = (platform: string) => {
    setConfigPlatform(platform);
    setConfigValues({});
  };

  const handleSaveConfig = async () => {
    if (!configPlatform) return;
    setSaving(true);
    try {
      const fields = INTEGRATION_FIELDS[configPlatform] ?? [];
      const req: Record<string, unknown> = { platform: configPlatform, enabled: true };
      for (const f of fields) {
        if (configValues[f.field]) {
          req[f.field] = configValues[f.field];
        }
      }
      await saveIntegration(req as Parameters<typeof saveIntegration>[0]);
      setConfigPlatform(null);
      setConfigValues({});
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (platform: string) => {
    try {
      await deleteIntegration(platform);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Frakobling feilet");
    }
  };

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Integrasjoner</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Eksterne tjenester og tilkoblinger.</p>
      </div>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", border: `1px solid ${T.border}`, borderRadius: T.r, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          {[
            { l: "TILKOBLET", v: loading ? "–" : connectedCount },
            { l: "FRAKOBLET", v: loading ? "–" : disconnectedCount },
            { l: "EVENTS I DAG", v: "–" },
            { l: "FEIL", v: "0" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "18px 20px", borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.l}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </GR>

      <GR mb={40}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: `0 0 ${T.r}px ${T.r}px`, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          {loading ? (
            <div style={{ padding: 40, gridColumn: "1 / -1" }}>
              <Skeleton rows={4} />
            </div>
          ) : (
            merged.map((ig, i) => {
              const ir = i % 2 === 1;
              const nl = i < merged.length - 2 || (merged.length % 2 === 1 && i < merged.length - 1);
              return (
                <div key={i} style={{ padding: 20, borderRight: ir ? "none" : `1px solid ${T.border}`, borderBottom: nl ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{ig.n}</span>
                    <Tag variant={ig.connected ? "success" : "default"}>{ig.connected ? "tilkoblet" : "frakoblet"}</Tag>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, marginBottom: 6 }}>{ig.cat}</div>
                  <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, marginBottom: 10 }}>{ig.desc}</p>
                  {ig.ev && ig.connected && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                      {ig.ev.map(e => (<Tag key={e}>{e}</Tag>))}
                    </div>
                  )}
                  {ig.serverSide ? (
                    <Tag>Konfigurert via server</Tag>
                  ) : ig.userConfigured ? (
                    <Btn sm onClick={() => handleDisconnect(ig.platform)}>Koble fra</Btn>
                  ) : (
                    <Btn sm primary onClick={() => handleOpenConfig(ig.platform)}>Koble til</Btn>
                  )}
                </div>
              );
            })
          )}
        </div>
      </GR>

      {/* Config dialog */}
      {configPlatform && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
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

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
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
      )}
    </>
  );
}

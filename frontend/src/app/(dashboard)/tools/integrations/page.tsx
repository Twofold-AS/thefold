"use client";

import { useEffect, useState } from "react";
import {
  listIntegrations,
  saveIntegration,
  deleteIntegration,
  type IntegrationConfig,
} from "@/lib/api";
import { useRepoContext } from "@/lib/repo-context";

export default function IntegrationsPage() {
  const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { repos } = useRepoContext();

  // Form state
  const [slackTeamId, setSlackTeamId] = useState("");
  const [slackRepo, setSlackRepo] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [discordRepo, setDiscordRepo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const res = await listIntegrations();
      setConfigs(res.configs);

      // Pre-fill form from existing configs
      const slack = res.configs.find((c) => c.platform === "slack");
      if (slack) {
        setSlackTeamId(slack.teamId || "");
        setSlackRepo(slack.defaultRepo || "");
      }
      const discord = res.configs.find((c) => c.platform === "discord");
      if (discord) {
        setDiscordGuildId(discord.teamId || "");
        setDiscordRepo(discord.defaultRepo || "");
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSlack() {
    setSaving(true);
    try {
      await saveIntegration({
        platform: "slack",
        teamId: slackTeamId || undefined,
        defaultRepo: slackRepo || undefined,
        enabled: true,
      });
      await loadConfigs();
    } catch {
      // Silent
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDiscord() {
    setSaving(true);
    try {
      await saveIntegration({
        platform: "discord",
        teamId: discordGuildId || undefined,
        defaultRepo: discordRepo || undefined,
        enabled: true,
      });
      await loadConfigs();
    } catch {
      // Silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(platform: string) {
    try {
      await deleteIntegration(platform);
      setConfigs((prev) => prev.filter((c) => c.platform !== platform));
      if (platform === "slack") {
        setSlackTeamId("");
        setSlackRepo("");
      } else {
        setDiscordGuildId("");
        setDiscordRepo("");
      }
    } catch {
      // Silent
    }
  }

  const slackConfig = configs.find((c) => c.platform === "slack");
  const discordConfig = configs.find((c) => c.platform === "discord");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Laster...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Slack */}
      <div style={{ border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="text-lg">S</span>
            </div>
            <div>
              <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Slack</h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chat med TheFold direkte fra Slack</p>
            </div>
          </div>
          {slackConfig && (
            <span className="text-xs px-2 py-0.5" style={{ color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
              Koblet til
            </span>
          )}
        </div>
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Team ID</label>
            <input
              value={slackTeamId}
              onChange={(e) => setSlackTeamId(e.target.value)}
              placeholder="T01234567"
              className="input-field w-full text-sm"
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Standard repo</label>
            <select
              value={slackRepo}
              onChange={(e) => setSlackRepo(e.target.value)}
              className="input-field w-full text-sm"
            >
              <option value="">Ingen</option>
              {repos.map((r) => (
                <option key={r.name} value={r.name}>{r.fullName}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveSlack} disabled={saving} className="btn-primary text-sm px-4 py-1.5">
              {slackConfig ? "Oppdater" : "Koble til"}
            </button>
            {slackConfig && (
              <button onClick={() => handleDelete("slack")} className="btn-secondary text-sm px-4 py-1.5">
                Fjern
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Discord */}
      <div style={{ border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="text-lg">D</span>
            </div>
            <div>
              <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Discord</h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Bruk TheFold som Discord-bot</p>
            </div>
          </div>
          {discordConfig && (
            <span className="text-xs px-2 py-0.5" style={{ color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
              Koblet til
            </span>
          )}
        </div>
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Guild ID</label>
            <input
              value={discordGuildId}
              onChange={(e) => setDiscordGuildId(e.target.value)}
              placeholder="123456789012345678"
              className="input-field w-full text-sm"
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Standard repo</label>
            <select
              value={discordRepo}
              onChange={(e) => setDiscordRepo(e.target.value)}
              className="input-field w-full text-sm"
            >
              <option value="">Ingen</option>
              {repos.map((r) => (
                <option key={r.name} value={r.name}>{r.fullName}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveDiscord} disabled={saving} className="btn-primary text-sm px-4 py-1.5">
              {discordConfig ? "Oppdater" : "Koble til"}
            </button>
            {discordConfig && (
              <button onClick={() => handleDelete("discord")} className="btn-secondary text-sm px-4 py-1.5">
                Fjern
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-3" style={{ border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Webhook URL for Slack: <code className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>/integrations/slack/webhook</code>
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Interactions URL for Discord: <code className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>/integrations/discord/webhook</code>
        </p>
      </div>
    </div>
  );
}

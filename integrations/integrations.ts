import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { integrationsDB as db } from "./db";
import type { IntegrationConfig, SlackEvent, DiscordInteraction } from "./types";

// --- CRUD Endpoints ---

interface ConfigResponse {
  config: IntegrationConfig;
}

interface ListConfigsResponse {
  configs: IntegrationConfig[];
}

// List all integrations for current user
export const listConfigs = api(
  { method: "GET", path: "/integrations/list", expose: true, auth: true },
  async (): Promise<ListConfigsResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");

    const rows = db.query<IntegrationConfig>`
      SELECT id, user_id as "userId", platform, webhook_url as "webhookUrl",
             channel_id as "channelId", team_id as "teamId", default_repo as "defaultRepo",
             enabled, created_at as "createdAt", updated_at as "updatedAt"
      FROM integration_configs
      WHERE user_id = ${auth.userID}::uuid
      ORDER BY platform
    `;

    const configs: IntegrationConfig[] = [];
    for await (const row of rows) configs.push(row);

    return { configs };
  }
);

// Upsert integration config
interface SaveConfigRequest {
  platform: "slack" | "discord";
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
  teamId?: string;
  defaultRepo?: string;
  enabled?: boolean;
}

export const saveConfig = api(
  { method: "POST", path: "/integrations/save", expose: true, auth: true },
  async (req: SaveConfigRequest): Promise<ConfigResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");

    const config = await db.queryRow<IntegrationConfig>`
      INSERT INTO integration_configs (user_id, platform, webhook_url, bot_token, channel_id, team_id, default_repo, enabled)
      VALUES (${auth.userID}::uuid, ${req.platform}, ${req.webhookUrl || null}, ${req.botToken || null},
              ${req.channelId || null}, ${req.teamId || null}, ${req.defaultRepo || null}, ${req.enabled ?? true})
      ON CONFLICT (user_id, platform) DO UPDATE SET
        webhook_url = COALESCE(EXCLUDED.webhook_url, integration_configs.webhook_url),
        bot_token = COALESCE(EXCLUDED.bot_token, integration_configs.bot_token),
        channel_id = COALESCE(EXCLUDED.channel_id, integration_configs.channel_id),
        team_id = COALESCE(EXCLUDED.team_id, integration_configs.team_id),
        default_repo = COALESCE(EXCLUDED.default_repo, integration_configs.default_repo),
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
      RETURNING id, user_id as "userId", platform, webhook_url as "webhookUrl",
                channel_id as "channelId", team_id as "teamId", default_repo as "defaultRepo",
                enabled, created_at as "createdAt", updated_at as "updatedAt"
    `;

    if (!config) throw APIError.internal("failed to save config");

    return { config };
  }
);

// Delete integration
export const deleteConfig = api(
  { method: "POST", path: "/integrations/delete", expose: true, auth: true },
  async (req: { platform: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");

    await db.exec`
      DELETE FROM integration_configs
      WHERE user_id = ${auth.userID}::uuid AND platform = ${req.platform}
    `;

    return { success: true };
  }
);

// --- Slack Webhook ---

interface SlackWebhookResponse {
  ok?: boolean;
  challenge?: string;
}

export const slackWebhook = api(
  { method: "POST", path: "/integrations/slack/webhook", expose: true, auth: false },
  async (req: SlackEvent): Promise<SlackWebhookResponse> => {
    // URL verification challenge
    if (req.type === "url_verification" && req.challenge) {
      return { challenge: req.challenge };
    }

    // Handle message events
    if (req.event?.type === "message" && !req.event.bot_id && req.team_id) {
      const config = await db.queryRow<IntegrationConfig>`
        SELECT id, user_id as "userId", platform, default_repo as "defaultRepo", enabled
        FROM integration_configs
        WHERE team_id = ${req.team_id} AND platform = 'slack' AND enabled = true
      `;

      if (!config) return { ok: true };

      try {
        const { chat } = await import("~encore/clients");

        await chat.send({
          conversationId: `slack-${req.event.channel}-${config.userId}`,
          message: req.event.text,
          repoName: config.defaultRepo || undefined,
          source: "slack",
        });
      } catch (e) {
        console.error("Slack message processing failed:", e);
      }
    }

    return { ok: true };
  }
);

// --- Discord Webhook ---

interface DiscordWebhookResponse {
  type: number;
  data?: { content: string };
}

export const discordWebhook = api(
  { method: "POST", path: "/integrations/discord/webhook", expose: true, auth: false },
  async (req: DiscordInteraction): Promise<DiscordWebhookResponse> => {
    // PING
    if (req.type === 1) {
      return { type: 1 };
    }

    // APPLICATION_COMMAND
    if (req.type === 2 && req.guild_id) {
      const config = await db.queryRow<IntegrationConfig>`
        SELECT id, user_id as "userId", platform, default_repo as "defaultRepo", enabled
        FROM integration_configs
        WHERE team_id = ${req.guild_id} AND platform = 'discord' AND enabled = true
      `;

      if (!config) {
        return { type: 4, data: { content: "TheFold er ikke konfigurert for denne serveren." } };
      }

      const userMessage = req.data?.options?.[0]?.value || "";

      // Process async — return deferred response immediately
      processDiscordMessage(userMessage, req.channel_id || "", config).catch(console.error);

      return { type: 5 }; // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    }

    return { type: 1 };
  }
);

async function processDiscordMessage(message: string, channelId: string, config: IntegrationConfig) {
  try {
    const { chat } = await import("~encore/clients");

    await chat.send({
      conversationId: `discord-${channelId}-${config.userId}`,
      message,
      repoName: config.defaultRepo || undefined,
      source: "discord",
    });
  } catch (e) {
    console.error("Discord message processing failed:", e);
  }
}

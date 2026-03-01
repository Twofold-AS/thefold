import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import * as crypto from "crypto";
import { integrationsDB as db } from "./db";
import type { IntegrationConfig, SlackEvent, DiscordInteraction } from "./types";

// Webhook signing secrets — if not set, webhooks are rejected
const slackSigningSecret = secret("SlackSigningSecret");
const discordPublicKey = secret("DiscordPublicKey");

function isSecretSet(getter: () => string): boolean {
  try {
    const val = getter();
    return !!val && val.length > 0;
  } catch {
    return false;
  }
}

function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Replay protection: reject if timestamp is > 5 min old
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBaseString = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto
    .createHmac("sha256", signingSecret)
    .update(sigBaseString)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  try {
    const ed25519 = crypto.verify(
      null,
      Buffer.from(timestamp + body),
      {
        key: Buffer.from(publicKey, "hex"),
        format: "der",
        type: "spki",
      },
      Buffer.from(signature, "hex")
    );
    return ed25519;
  } catch {
    return false;
  }
}

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

// --- Slack Webhook (raw for signature verification) ---

export const slackWebhook = api.raw(
  { method: "POST", path: "/integrations/slack/webhook", expose: true },
  async (req, res) => {
    // Require signing secret
    if (!isSecretSet(slackSigningSecret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Slack webhook signature verification not configured" }));
      return;
    }

    // Read raw body
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf-8");

    // Verify signature
    const signature = (req.headers["x-slack-signature"] as string) || "";
    const timestamp = (req.headers["x-slack-request-timestamp"] as string) || "";

    if (!verifySlackSignature(slackSigningSecret(), signature, timestamp, rawBody)) {
      log.warn("Slack webhook: invalid signature");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    const event: SlackEvent = JSON.parse(rawBody);

    // URL verification challenge
    if (event.type === "url_verification" && event.challenge) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ challenge: event.challenge }));
      return;
    }

    // Handle message events
    if (event.event?.type === "message" && !event.event.bot_id && event.team_id) {
      const config = await db.queryRow<IntegrationConfig>`
        SELECT id, user_id as "userId", platform, webhook_url as "webhookUrl",
               default_repo as "defaultRepo", enabled
        FROM integration_configs
        WHERE team_id = ${event.team_id} AND platform = 'slack' AND enabled = true
      `;

      if (config) {
        try {
          const { chat } = await import("~encore/clients");
          await chat.send({
            conversationId: `slack-${event.event.channel}-${config.userId}`,
            message: event.event.text,
            repoName: config.defaultRepo || undefined,
            source: "slack",
          });
        } catch (e) {
          log.warn("Slack message processing failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }
);

// --- Discord Webhook (raw for signature verification) ---

export const discordWebhook = api.raw(
  { method: "POST", path: "/integrations/discord/webhook", expose: true },
  async (req, res) => {
    // Require public key
    if (!isSecretSet(discordPublicKey)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Discord webhook signature verification not configured" }));
      return;
    }

    // Read raw body
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf-8");

    // Verify signature
    const signature = (req.headers["x-signature-ed25519"] as string) || "";
    const timestamp = (req.headers["x-signature-timestamp"] as string) || "";

    if (!verifyDiscordSignature(discordPublicKey(), signature, timestamp, rawBody)) {
      log.warn("Discord webhook: invalid signature");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    const interaction: DiscordInteraction = JSON.parse(rawBody);

    // PING
    if (interaction.type === 1) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: 1 }));
      return;
    }

    // APPLICATION_COMMAND
    if (interaction.type === 2 && interaction.guild_id) {
      const config = await db.queryRow<IntegrationConfig>`
        SELECT id, user_id as "userId", platform, webhook_url as "webhookUrl",
               default_repo as "defaultRepo", enabled
        FROM integration_configs
        WHERE team_id = ${interaction.guild_id} AND platform = 'discord' AND enabled = true
      `;

      if (!config) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type: 4, data: { content: "TheFold er ikke konfigurert for denne serveren." } }));
        return;
      }

      const userMessage = interaction.data?.options?.[0]?.value || "";
      processDiscordMessage(userMessage, interaction.channel_id || "", config).catch(e =>
        log.warn("Discord async processing failed", { error: e instanceof Error ? e.message : String(e) })
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: 5 }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ type: 1 }));
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
    log.warn("Discord message processing failed", { error: e instanceof Error ? e.message : String(e) });
  }
}


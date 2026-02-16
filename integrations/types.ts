export interface IntegrationConfig {
  id: string;
  userId: string;
  platform: "slack" | "discord";
  webhookUrl: string | null;
  botToken: string | null;
  channelId: string | null;
  teamId: string | null;
  defaultRepo: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    text: string;
    channel: string;
    user: string;
    bot_id?: string;
  };
  team_id?: string;
}

export interface DiscordInteraction {
  type: number; // 1=PING, 2=APPLICATION_COMMAND
  data?: {
    name: string;
    options?: Array<{ name: string; value: string }>;
  };
  channel_id?: string;
  guild_id?: string;
}

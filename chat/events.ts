// Isolated Pub/Sub Topics — safe for cross-service import without pulling in chat service internals.

import { Topic } from "encore.dev/pubsub";

// --- Agent reports back to chat ---

export interface AgentReport {
  conversationId: string;
  taskId: string;
  content: string;
  status: "working" | "completed" | "failed" | "needs_input";
  prUrl?: string;
  filesChanged?: string[];
  completionMessage?: string;
}

export const agentReports = new Topic<AgentReport>("agent-reports", {
  deliveryGuarantee: "at-least-once",
});

// --- Chat response routing (two-way Slack/Discord) ---

export interface ChatResponse {
  conversationId: string;
  content: string;
  source: string;  // "web" | "slack" | "discord" | "api"
  metadata: Record<string, string>;
}

export const chatResponses = new Topic<ChatResponse>("chat-responses", {
  deliveryGuarantee: "at-least-once",
});

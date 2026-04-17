import { apiFetch } from "./client";

// --- Types ---

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  messageType: "chat" | "agent_report" | "task_start" | "context_transfer" | "agent_status" | "agent_thought" | "agent_progress" | "memory_insight";
  metadata: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  lastActivity: string;
  activeTask?: string;
}

export interface CostPeriod {
  total: number;
  tokens: number;
  count: number;
}

export interface ModelCost {
  model: string;
  total: number;
  tokens: number;
  count: number;
}

export interface DailyTrend {
  date: string;
  total: number;
  tokens: number;
}

export interface CostSummary {
  today: CostPeriod;
  thisWeek: CostPeriod;
  thisMonth: CostPeriod;
  perModel: ModelCost[];
  dailyTrend: DailyTrend[];
}

export interface RepoActivityEvent {
  id: string;
  repoName: string;
  eventType: string;
  title: string;
  description: string | null;
  userId: string | null;
  metadata: string | null;
  createdAt: string;
}

// --- Conversation ID helpers ---

export function mainConversationId(): string {
  return `main-${crypto.randomUUID()}`;
}

export function repoConversationId(repoName: string): string {
  return `repo-${repoName}-${crypto.randomUUID()}`;
}

export function inkognitoConversationId(): string {
  return `inkognito-${crypto.randomUUID()}`;
}

// --- Chat API ---

export async function sendMessage(conversationId: string, message: string, options?: {
  linearTaskId?: string;
  chatOnly?: boolean;
  modelOverride?: string | null;
  skillIds?: string[];
  repoName?: string;
  repoOwner?: string;
  planMode?: boolean;
  firecrawlEnabled?: boolean;
}) {
  return apiFetch<{
    message: Message;
    agentTriggered: boolean;
    taskId?: string;
  }>("/chat/send", {
    method: "POST",
    body: { conversationId, message, ...options },
  });
}

export async function getChatHistory(conversationId: string, limit?: number, before?: string) {
  return apiFetch<{
    messages: Message[];
    hasMore: boolean;
  }>("/chat/history", {
    method: "POST",
    body: { conversationId, limit, before },
  });
}

export async function getConversations() {
  return apiFetch<{
    conversations: ConversationSummary[];
  }>("/chat/conversations", { method: "GET" });
}

export interface NotificationItem {
  id: string;
  type: "review_ready" | "task_done" | "task_failed";
  title: string;
  conversationId: string;
  taskId?: string;
  prUrl?: string;
  reviewId?: string;
  createdAt: string;
}

export async function getNotifications() {
  return apiFetch<{
    notifications: NotificationItem[];
  }>("/chat/notifications", { method: "GET" });
}

export async function getMainConversations() {
  const result = await getConversations();
  return {
    conversations: result.conversations.filter((c) => c.id.startsWith("main-")),
  };
}

export async function getRepoConversations(repoName: string) {
  const result = await getConversations();
  return {
    conversations: result.conversations.filter((c) => c.id.startsWith(`repo-${repoName}-`)),
  };
}

export async function getInkognitoConversations() {
  const result = await getConversations();
  return {
    conversations: result.conversations.filter((c) => c.id.startsWith("inkognito-")),
  };
}

export async function getAllRepoConversations() {
  const result = await getConversations();
  return {
    conversations: result.conversations.filter((c) => c.id.startsWith("repo-")),
  };
}

export async function transferContext(sourceConversationId: string, targetRepo: string) {
  return apiFetch<{
    targetConversationId: string;
    contextSummary: string;
    success: boolean;
  }>("/chat/transfer-context", {
    method: "POST",
    body: { sourceConversationId, targetRepo },
  });
}

export async function deleteConversation(conversationId: string) {
  return apiFetch<{ success: boolean }>("/chat/delete", {
    method: "POST",
    body: { conversationId },
  });
}

/** Archive a conversation (hides from history, retrievable from settings) */
export async function archiveConversation(conversationId: string) {
  return apiFetch<{ success: boolean }>("/chat/conversations/archive", {
    method: "POST",
    body: { conversationId },
  });
}

/** Restore an archived conversation back to history */
export async function restoreConversation(conversationId: string) {
  return apiFetch<{ success: boolean }>("/chat/conversations/restore", {
    method: "POST",
    body: { conversationId },
  });
}

/** Permanently delete an archived conversation (cannot be undone) */
export async function deleteConversationPermanent(conversationId: string) {
  return apiFetch<{ success: boolean }>("/chat/conversations/delete", {
    method: "POST",
    body: { conversationId },
  });
}

/** List archived conversations */
export async function listArchivedConversations() {
  return apiFetch<{ conversations: ConversationSummary[] }>("/chat/conversations/archived", {
    method: "GET",
  });
}

export async function cancelChatGeneration(conversationId: string) {
  return apiFetch<{ success: boolean }>("/chat/cancel", {
    method: "POST",
    body: { conversationId },
  });
}

export async function uploadChatFile(
  conversationId: string,
  filename: string,
  contentType: string,
  content: string,
  sizeBytes: number,
) {
  return apiFetch<{ fileId: string; filename: string }>("/chat/upload", {
    method: "POST",
    body: { conversationId, filename, contentType, content, sizeBytes },
  });
}

export async function getCostSummary() {
  return apiFetch<CostSummary>("/chat/costs");
}

export async function getRepoActivity(repoName: string) {
  return apiFetch<{ activities: RepoActivityEvent[] }>(`/chat/activity/${repoName}`);
}

import { getToken } from "./auth";

// --- Base fetch wrapper ---

const API_BASE = "/api";

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

async function apiFetch<T>(path: string, options?: FetchOptions): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method: options?.method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    throw new Error("Unauthenticated");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API error ${res.status}`);
  }

  return res.json();
}

// --- Types (mirrors backend) ---

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  messageType: "chat" | "agent_report" | "task_start";
  metadata: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  lastActivity: string;
  activeTask?: string;
}

export interface LinearTask {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  labels: string[];
}

export interface MemoryResult {
  id: string;
  content: string;
  category: string;
  relevance: number;
  createdAt: string;
}

// --- Chat ---

export async function sendMessage(conversationId: string, message: string, options?: {
  linearTaskId?: string;
  chatOnly?: boolean;
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

// --- Linear Tasks ---

export async function getTasks() {
  return apiFetch<{
    tasks: LinearTask[];
  }>("/linear/tasks", {
    method: "POST",
    body: {},
  });
}

export async function getTasksByLabel(label: string) {
  const result = await getTasks();
  return {
    tasks: result.tasks.filter((t) => t.labels.includes(label)),
  };
}

// --- Agent ---

export async function checkPendingTasks() {
  return apiFetch<{
    tasksFound: number;
  }>("/agent/check", { method: "POST" });
}

// --- Memory ---

export async function storeMemory(content: string, category: string) {
  return apiFetch<{ id: string }>("/memory/store", {
    method: "POST",
    body: { content, category },
  });
}

// --- GitHub ---

export async function getRepoTree(owner: string, repo: string) {
  return apiFetch<{
    tree: string[];
    treeString: string;
    packageJson?: { dependencies?: Record<string, string> };
  }>("/github/tree", {
    method: "POST",
    body: { owner, repo },
  });
}

// --- Chat helpers ---

export function mainConversationId(): string {
  return `main-${crypto.randomUUID()}`;
}

export function repoConversationId(repoName: string): string {
  return `repo-${repoName}-${crypto.randomUUID()}`;
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

// --- Auth ---

export async function login(username: string, password: string) {
  return apiFetch<{
    token: string;
    user: { userId: string; username: string; role: "admin" | "viewer" };
  }>("/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

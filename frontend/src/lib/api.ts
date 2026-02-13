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

// --- Audit Log ---

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  actionType: string;
  details: Record<string, unknown>;
  success: boolean | null;
  errorMessage: string | null;
  confidenceScore: number | null;
  taskId: string | null;
  repoName: string | null;
  durationMs: number | null;
}

export async function listAuditLog(filters?: {
  actionType?: string;
  taskId?: string;
  sessionId?: string;
  failedOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  return apiFetch<{
    entries: AuditLogEntry[];
    total: number;
  }>("/agent/audit/list", {
    method: "POST",
    body: filters || {},
  });
}

export async function getTaskTrace(taskId: string) {
  return apiFetch<{
    taskId: string;
    entries: AuditLogEntry[];
    summary: {
      totalSteps: number;
      totalDurationMs: number;
      successCount: number;
      failureCount: number;
      confidenceScore: number | null;
      outcome: "completed" | "failed" | "paused" | "in_progress";
    };
  }>("/agent/audit/trace", {
    method: "POST",
    body: { taskId },
  });
}

export async function getAuditStats() {
  return apiFetch<{
    totalEntries: number;
    totalTasks: number;
    successRate: number;
    averageDurationMs: number;
    actionTypeCounts: Record<string, number>;
    recentFailures: AuditLogEntry[];
  }>("/agent/audit/stats", {
    method: "POST",
    body: {},
  });
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

// --- Skills ---

export interface Skill {
  id: string;
  name: string;
  description: string;
  promptFragment: string;
  appliesTo: string[];
  scope: string;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listSkills(context?: string, enabledOnly?: boolean) {
  return apiFetch<{ skills: Skill[] }>("/skills/list", {
    method: "POST",
    body: { context, enabledOnly },
  });
}

export async function createSkill(data: {
  name: string;
  description: string;
  promptFragment: string;
  appliesTo: string[];
  scope?: string;
}) {
  return apiFetch<{ skill: Skill }>("/skills/create", {
    method: "POST",
    body: data,
  });
}

export async function updateSkill(data: {
  id: string;
  name?: string;
  description?: string;
  promptFragment?: string;
  appliesTo?: string[];
  scope?: string;
}) {
  return apiFetch<{ skill: Skill }>("/skills/update", {
    method: "POST",
    body: data,
  });
}

export async function toggleSkill(id: string, enabled: boolean) {
  return apiFetch<{ skill: Skill }>("/skills/toggle", {
    method: "POST",
    body: { id, enabled },
  });
}

export async function deleteSkill(id: string) {
  return apiFetch<{ success: boolean }>("/skills/delete", {
    method: "POST",
    body: { id },
  });
}

export async function previewPrompt(context: string) {
  return apiFetch<{
    systemPrompt: string;
    activeSkillCount: number;
    activeSkillNames: string[];
  }>("/skills/preview-prompt", {
    method: "POST",
    body: { context },
  });
}

// --- Model Routing & Cost ---

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  tier: "low" | "mid" | "high";
  inputCostPer1M: number;
  outputCostPer1M: number;
  maxOutputTokens: number;
  strengths: string[];
}

export async function listModels() {
  return apiFetch<{ models: ModelInfo[] }>("/ai/models", {
    method: "GET",
  });
}

export async function estimateCost(inputTokens: number, outputTokens: number, modelId: string) {
  return apiFetch<{
    estimate: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      inputCost: number;
      outputCost: number;
      totalCost: number;
    };
    savings: {
      actualCost: number;
      opusCost: number;
      savedUsd: number;
      savedPercent: number;
    };
  }>("/ai/estimate-cost", {
    method: "POST",
    body: { inputTokens, outputTokens, modelId },
  });
}

export async function getUserPreferences() {
  return apiFetch<{
    user: { id: string; email: string; name: string; role: string; preferences: Record<string, unknown> };
  }>("/users/me", {
    method: "GET",
  });
}

export async function updateBudgetMode(userId: string, budgetMode: string) {
  return apiFetch<{ success: boolean }>("/users/preferences", {
    method: "POST",
    body: { userId, preferences: { budgetMode } },
  });
}

// --- Auth ---

export async function requestOtp(email: string) {
  return apiFetch<{
    success: boolean;
    message: string;
  }>("/auth/request-otp", {
    method: "POST",
    body: { email },
  });
}

export async function verifyOtp(email: string, code: string) {
  return apiFetch<{
    success: boolean;
    token?: string;
    user?: { id: string; email: string; name: string; role: string };
    error?: string;
  }>("/auth/verify-otp", {
    method: "POST",
    body: { email, code },
  });
}

export async function logout() {
  return apiFetch<{ success: boolean }>("/auth/logout", {
    method: "POST",
  });
}

import { getToken } from "./auth";
import { debugToast } from "./debug";

// --- Base fetch wrapper ---

const API_BASE = "http://localhost:4000";

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

async function apiFetch<T>(path: string, options?: FetchOptions): Promise<T> {
  const token = getToken();
  const url = `${API_BASE}${path}`;
  const method = options?.method || "GET";
  const bodyStr = options?.body ? JSON.stringify(options.body) : undefined;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    body: bodyStr,
  });

  if (!res.ok) {
    const errBody = await res.text();
    debugToast(method, path, bodyStr, undefined, `${res.status} ${errBody}`);

    if (res.status === 401) {
      throw new Error("Unauthenticated");
    }
    throw new Error(errBody || `API error ${res.status}`);
  }

  const data = await res.json();
  debugToast(method, path, bodyStr, JSON.stringify(data).substring(0, 200));
  return data;
}

// --- Types (mirrors backend) ---

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  messageType: "chat" | "agent_report" | "task_start" | "context_transfer";
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
  modelOverride?: string | null;
  skillIds?: string[];
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
  repoName?: string;
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

export interface MemorySearchResult {
  id: string;
  content: string;
  category: string;
  similarity: number;
  memoryType: string;
  relevanceScore: number;
  decayedScore: number;
  accessCount: number;
  tags: string[];
  sourceRepo?: string;
  createdAt: string;
}

export async function searchMemories(query: string, options?: {
  limit?: number;
  sourceRepo?: string;
  memoryType?: string;
  includeDecayed?: boolean;
}) {
  return apiFetch<{ results: MemorySearchResult[] }>("/memory/search", {
    method: "POST",
    body: { query, ...options },
  });
}

export async function storeMemory(content: string, category: string) {
  return apiFetch<{ id: string }>("/memory/store", {
    method: "POST",
    body: { content, category },
  });
}

export async function getMemoryStats() {
  return apiFetch<{
    total: number;
    byType: Record<string, number>;
    avgRelevanceScore: number;
    expiringSoon: number;
  }>("/memory/stats", { method: "GET" });
}

// --- Cache ---

export async function getCacheStats() {
  return apiFetch<{
    embeddingHits: number;
    embeddingMisses: number;
    repoHits: number;
    repoMisses: number;
    aiPlanHits: number;
    aiPlanMisses: number;
    hitRate: number;
    totalEntries: number;
  }>("/cache/stats", { method: "GET" });
}

// --- Monitor ---

export async function getMonitorHealth() {
  return apiFetch<{
    repos: Record<string, Array<{
      id?: string;
      repo: string;
      checkType: string;
      status: "pass" | "warn" | "fail";
      details: Record<string, unknown>;
      createdAt?: string;
    }>>;
  }>("/monitor/health", { method: "GET" });
}

// --- GitHub ---

export interface RepoInfo {
  name: string;
  fullName: string;
  description: string;
  language: string;
  defaultBranch: string;
  pushedAt: string;
  updatedAt: string;
  private: boolean;
  archived: boolean;
  stargazersCount: number;
  openIssuesCount: number;
}

export async function listRepos(owner: string) {
  return apiFetch<{ repos: RepoInfo[] }>("/github/repos", {
    method: "POST",
    body: { owner },
  });
}

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
  // Pipeline fields
  executionPhase?: "pre_run" | "inject" | "post_run";
  priority?: number;
  tokenEstimate?: number;
  tokenBudgetMax?: number;
  routingRules?: { keywords?: string[]; file_patterns?: string[]; labels?: string[] };
  category?: string;
  tags?: string[];
  version?: string;
  dependsOn?: string[];
  conflictsWith?: string[];
  // Scoring
  successCount?: number;
  failureCount?: number;
  avgTokenCost?: number;
  confidenceScore?: number;
  lastUsedAt?: string | null;
  totalUses?: number;
}

export interface ResolvedSkill {
  id: string;
  name: string;
  phase: "pre_run" | "inject" | "post_run";
  priority: number;
  promptFragment: string;
  tokenEstimate: number;
  routingRules: Record<string, unknown>;
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

export async function getSkill(id: string) {
  return apiFetch<{ skill: Skill }>("/skills/get", {
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

export async function resolveSkills(context: { task: string; repo?: string }) {
  return apiFetch<{
    result: {
      preRunResults: unknown[];
      injectedPrompt: string;
      injectedSkillIds: string[];
      tokensUsed: number;
      postRunSkills: ResolvedSkill[];
    };
  }>("/skills/resolve", {
    method: "POST",
    body: {
      context: {
        ...context,
        userId: "frontend",
        totalTokenBudget: 4000,
      },
    },
  });
}

// --- Code Reviews ---

export interface ReviewFile {
  path: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
}

export interface AIReviewData {
  documentation: string;
  qualityScore: number;
  concerns: string[];
  memoriesExtracted: string[];
}

export interface CodeReview {
  id: string;
  conversationId: string;
  taskId: string;
  projectTaskId?: string;
  sandboxId: string;
  filesChanged: ReviewFile[];
  aiReview?: AIReviewData;
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  reviewerId?: string;
  feedback?: string;
  createdAt: string;
  reviewedAt?: string;
  prUrl?: string;
}

export interface ReviewSummary {
  id: string;
  taskId: string;
  fileCount: number;
  qualityScore: number | null;
  status: string;
  createdAt: string;
  prUrl?: string;
}

export async function getReview(reviewId: string) {
  return apiFetch<{ review: CodeReview }>("/agent/review/get", {
    method: "POST",
    body: { reviewId },
  });
}

export async function listReviews(options?: { status?: string; limit?: number; offset?: number }) {
  return apiFetch<{ reviews: ReviewSummary[]; total: number }>("/agent/review/list", {
    method: "POST",
    body: options || {},
  });
}

export async function approveReview(reviewId: string) {
  return apiFetch<{ prUrl: string }>("/agent/review/approve", {
    method: "POST",
    body: { reviewId },
  });
}

export async function requestReviewChanges(reviewId: string, feedback: string) {
  return apiFetch<{ status: string }>("/agent/review/request-changes", {
    method: "POST",
    body: { reviewId, feedback },
  });
}

export async function rejectReview(reviewId: string, reason?: string) {
  return apiFetch<{ status: string }>("/agent/review/reject", {
    method: "POST",
    body: { reviewId, reason },
  });
}

// --- Model Routing & Cost ---

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  tier: number; // 1-5 (1 = billigst, 5 = best)
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
  strengths: string[];
  bestFor: string[];
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

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function getMe() {
  return apiFetch<{ user: UserProfile }>("/users/me", {
    method: "GET",
  });
}

export async function updateProfile(data: { name?: string; avatarColor?: string }) {
  return apiFetch<{ success: boolean }>("/users/update-profile", {
    method: "POST",
    body: data,
  });
}

/** @deprecated Use getMe() instead */
export async function getUserPreferences() {
  return getMe();
}

export async function updateModelMode(modelMode: string) {
  return apiFetch<{ success: boolean }>("/users/preferences", {
    method: "POST",
    body: { preferences: { modelMode } },
  });
}

export async function updatePreferences(prefs: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>("/users/preferences", {
    method: "POST",
    body: { preferences: prefs },
  });
}

// --- Context Transfer ---

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

export async function cancelChatGeneration(conversationId: string) {
  return apiFetch<{ success: boolean }>("/chat/cancel", {
    method: "POST",
    body: { conversationId },
  });
}

// --- Builder ---

export interface BuilderJobSummary {
  id: string;
  taskId: string;
  status: string;
  buildStrategy: string;
  currentPhase: string | null;
  currentStep: number;
  totalSteps: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function listBuilderJobs(options?: { taskId?: string; status?: string; repo?: string; limit?: number; offset?: number }) {
  return apiFetch<{ jobs: BuilderJobSummary[]; total: number }>("/builder/jobs", {
    method: "POST",
    body: options || {},
  });
}

// --- Tasks (TheFold Task Engine) ---

export interface TheFoldTask {
  id: string;
  title: string;
  description: string;
  repo: string;
  status: string;
  priority: number;
  labels: string[];
  source: string;
  assignedTo: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export async function listTheFoldTasks(options?: {
  repo?: string;
  status?: string;
  source?: string;
  labels?: string[];
  limit?: number;
  offset?: number;
}) {
  return apiFetch<{ tasks: TheFoldTask[]; total: number }>("/tasks/list", {
    method: "POST",
    body: options || {},
  });
}

export async function createTask(data: {
  title: string;
  description: string;
  repo: string;
  priority?: number;
  labels?: string[];
}) {
  return apiFetch<{ task: TheFoldTask }>("/tasks/create", {
    method: "POST",
    body: data,
  });
}

export async function getTaskStats() {
  return apiFetch<{
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byRepo: Record<string, number>;
  }>("/tasks/stats", { method: "GET" });
}

export async function syncLinearTasks() {
  return apiFetch<{ created: number; updated: number; total: number }>("/tasks/sync-linear", {
    method: "POST",
    body: {},
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

// --- Secrets Status ---

export interface SecretStatus {
  name: string;
  configured: boolean;
}

export async function getSecretsStatus() {
  return apiFetch<{ secrets: SecretStatus[] }>("/gateway/secrets-status", { method: "GET" });
}

// --- MCP Servers ---

export interface MCPServer {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[];
  envVars: Record<string, string>;
  status: "available" | "installed" | "error";
  category: "general" | "code" | "data" | "docs" | "ai";
  config: Record<string, unknown>;
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listMCPServers() {
  return apiFetch<{ servers: MCPServer[] }>("/mcp/list", { method: "GET" });
}

export async function getMCPServer(id: string) {
  return apiFetch<{ server: MCPServer }>("/mcp/get", {
    method: "GET",
    body: { id },
  });
}

export async function installMCPServer(id: string, envVars?: Record<string, string>, config?: Record<string, unknown>) {
  return apiFetch<{ server: MCPServer }>("/mcp/install", {
    method: "POST",
    body: { id, envVars, config },
  });
}

export async function uninstallMCPServer(id: string) {
  return apiFetch<{ server: MCPServer }>("/mcp/uninstall", {
    method: "POST",
    body: { id },
  });
}

export async function configureMCPServer(id: string, envVars?: Record<string, string>, config?: Record<string, unknown>) {
  return apiFetch<{ server: MCPServer }>("/mcp/configure", {
    method: "POST",
    body: { id, envVars, config },
  });
}

// --- Registry / Marketplace ---

export interface ComponentFile {
  path: string;
  content: string;
  language: string;
}

export interface Component {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: string;
  files: ComponentFile[];
  dependencies: string[];
  sourceRepo: string;
  usedByRepos: string[];
  timesUsed: number;
  validationStatus: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HealingEvent {
  id: string;
  componentId: string;
  oldVersion: string | null;
  newVersion: string | null;
  trigger: string;
  severity: string;
  affectedRepos: string[];
  tasksCreated: string[];
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export async function listComponents(options?: { category?: string; sourceRepo?: string; limit?: number; offset?: number }) {
  return apiFetch<{ components: Component[]; total: number }>("/registry/list", {
    method: "POST",
    body: options || {},
  });
}

export async function searchComponents(query: string, category?: string) {
  return apiFetch<{ components: Component[] }>("/registry/search", {
    method: "POST",
    body: { query, category },
  });
}

export async function getComponent(id: string) {
  return apiFetch<{ component: Component }>(`/registry/get?id=${encodeURIComponent(id)}`);
}

export async function useComponentApi(componentId: string, repo: string) {
  return apiFetch<{ success: boolean }>("/registry/use-component", {
    method: "POST",
    body: { componentId, repo },
  });
}

export async function getHealingStatus(options?: { componentId?: string; status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.componentId) params.set("componentId", options.componentId);
  if (options?.status) params.set("status", options.status);
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return apiFetch<{ events: HealingEvent[]; total: number }>(`/registry/healing-status${qs ? `?${qs}` : ""}`);
}

// --- Templates ---

export interface TemplateFile {
  path: string;
  content: string;
  language: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  framework: string;
  files: TemplateFile[];
  dependencies: string[];
  variables: TemplateVariable[];
  useCount: number;
  createdAt: string;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export async function listTemplates(category?: string) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const qs = params.toString();
  return apiFetch<{ templates: Template[]; total: number }>(`/templates/list${qs ? `?${qs}` : ""}`);
}

export async function getTemplate(id: string) {
  return apiFetch<{ template: Template }>(`/templates/get?id=${encodeURIComponent(id)}`);
}

export async function useTemplateApi(id: string, repo: string, variables?: Record<string, string>) {
  return apiFetch<{ files: TemplateFile[]; dependencies: string[] }>("/templates/use", {
    method: "POST",
    body: { id, repo, variables },
  });
}

export async function getTemplateCategories() {
  return apiFetch<{ categories: CategoryCount[] }>("/templates/categories");
}

// --- Sub-Agent Cost Estimation ---

export interface SubAgentCostEstimate {
  role: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

export interface SubAgentCostPreview {
  withoutSubAgents: number;
  withSubAgents: number;
  speedupEstimate: string;
  agents: SubAgentCostEstimate[];
}

export async function estimateSubAgentCost(complexity: number, budgetMode?: string) {
  return apiFetch<SubAgentCostPreview>("/ai/estimate-sub-agent-cost", {
    method: "POST",
    body: { complexity, budgetMode },
  });
}

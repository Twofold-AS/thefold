import { apiFetch } from "./client";

// --- Audit Log Types ---

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

// --- Code Review Types ---

export interface ReviewFile {
  path: string;
  content: string;
  action: "create" | "modify" | "delete";
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
  status: "pending" | "approved" | "changes_requested" | "rejected";
  reviewerId?: string;
  feedback?: string;
  createdAt: string;
  reviewedAt?: string;
  prUrl?: string;
}

export interface ReviewSummary {
  id: string;
  taskId: string;
  repoName?: string;
  fileCount: number;
  qualityScore: number | null;
  status: string;
  createdAt: string;
  prUrl?: string;
}

// --- Phase Metrics Types ---

export interface PhaseMetricsSummary {
  phase: string;
  avgCostUsd: number;
  avgTokensInput: number;
  avgTokensOutput: number;
  avgDurationMs: number;
  totalCostUsd: number;
  totalAiCalls: number;
  taskCount: number;
  p95CostUsd: number;
}

export interface TaskPhaseBreakdown {
  phase: string;
  tokensInput: number;
  tokensOutput: number;
  cachedTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
  aiCalls: number;
}

export interface TaskCostBreakdown {
  taskId: string;
  jobId: string;
  phases: TaskPhaseBreakdown[];
  totalCostUsd: number;
  totalTokens: number;
  totalDurationMs: number;
}

// --- AI Model/Provider Types ---

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  tier: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
  strengths: string[];
  bestFor: string[];
  supportsTools: boolean;
  supportsVision: boolean;
}

export interface AIModelRow {
  id: string;
  modelId: string;
  displayName: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: number;
  maxOutputTokens: number;
  tags: string[];
  tier: number;
  enabled: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  slug: string;
  baseUrl: string | null;
  apiKeySet: boolean;
  enabled: boolean;
  models: AIModelRow[];
}

// --- Sub-Agent Cost Types ---

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

// --- MCP Server Types ---

export interface MCPServer {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[];
  envVars: Record<string, string>;
  status: "available" | "installed" | "not_configured" | "error";
  category: "general" | "code" | "data" | "docs" | "ai";
  config: Record<string, unknown>;
  configRequired: boolean;
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Agent API ---

export async function checkPendingTasks() {
  return apiFetch<{
    tasksFound: number;
  }>("/agent/check", { method: "POST" });
}

// --- Audit Log ---

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

// --- Task Execution Log ---

export interface TaskLogEvent {
  id: string;
  taskId: string;
  timestamp: string;
  type: string;
  phase: string | null;
  toolName: string | null;
  subAgentRole: string | null;
  payload: Record<string, unknown>;
}

export interface TaskLogSummary {
  totalToolCalls: number;
  totalTokens: { input: number; output: number };
  totalCost: number;
  subAgentsUsed: string[];
  filesWritten: string[];
  validationResults: Record<string, unknown> | null;
}

export interface TaskLogTaskMeta {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface TaskLogResponse {
  task: TaskLogTaskMeta;
  events: TaskLogEvent[];
  summary: TaskLogSummary;
}

export async function getTaskLog(taskId: string): Promise<TaskLogResponse> {
  return apiFetch<TaskLogResponse>(`/agent/task-log/${encodeURIComponent(taskId)}`, {
    method: "GET",
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

// --- Code Reviews ---

export async function getReview(reviewId: string) {
  return apiFetch<{ review: CodeReview }>("/agent/review/get", {
    method: "POST",
    body: { reviewId },
  });
}

export async function listReviews(options?: { status?: string; repoName?: string; limit?: number; offset?: number }) {
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

export async function deleteReview(reviewId: string) {
  return apiFetch<{ deleted: boolean }>("/agent/review/delete", {
    method: "POST",
    body: { reviewId },
  });
}

export async function cleanupReviews() {
  return apiFetch<{ deleted: number; errors: number }>("/agent/review/cleanup", {
    method: "POST",
    body: {},
  });
}

export async function deleteAllReviews() {
  return apiFetch<{ deleted: number }>("/agent/review/delete-all", {
    method: "POST",
    body: {},
  });
}

// --- Phase Metrics ---

export async function getPhaseMetrics(days = 7) {
  return apiFetch<{ phases: PhaseMetricsSummary[] }>(`/agent/metrics/phases?days=${days}`);
}

export async function getTaskMetrics(taskId: string) {
  return apiFetch<{ breakdown: TaskCostBreakdown | null }>(
    "/agent/metrics/task",
    { method: "POST", body: { taskId } },
  );
}

// --- AI Models & Providers ---

export async function listModels() {
  return apiFetch<{ models: ModelInfo[] }>("/ai/models", { method: "GET" });
}

export async function listProviders() {
  return apiFetch<{ providers: AIProvider[] }>("/ai/providers", { method: "GET" });
}

export async function saveProvider(data: {
  id?: string;
  name: string;
  slug: string;
  baseUrl?: string;
  enabled: boolean;
}) {
  return apiFetch<{ id: string }>("/ai/providers/save", { method: "POST", body: data });
}

export async function saveModel(data: {
  id?: string;
  providerId: string;
  modelId: string;
  displayName: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: number;
  maxOutputTokens?: number;
  tags: string[];
  tier: number;
  enabled: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
}) {
  return apiFetch<{ id: string }>("/ai/models/save", { method: "POST", body: data });
}

export async function toggleModel(id: string, enabled: boolean) {
  return apiFetch<void>("/ai/models/toggle", { method: "POST", body: { id, enabled } });
}

export async function deleteModel(id: string) {
  return apiFetch<void>("/ai/models/delete", { method: "POST", body: { id } });
}

export async function setProviderApiKey(providerId: string, apiKey: string) {
  return apiFetch<{ ok: boolean }>("/ai/providers/set-key", {
    method: "POST",
    body: { providerId, apiKey },
  });
}

export async function clearProviderApiKey(providerId: string) {
  return apiFetch<{ ok: boolean }>("/ai/providers/clear-key", {
    method: "POST",
    body: { providerId },
  });
}

// --- Role-Based Model Preferences ---

export type AgentRole =
  | "orchestrator"
  | "planner"
  | "coder"
  | "reviewer"
  | "debugger"
  | "tester"
  | "documenter";

export interface RolePreference {
  modelId: string;
  priority: number;
}

export async function getRolePreferences() {
  return apiFetch<{ preferences: Record<AgentRole, RolePreference[]> }>("/ai/role-preferences", {
    method: "GET",
  });
}

export async function setRolePreference(role: AgentRole, modelId: string, priority?: number) {
  return apiFetch<{ ok: boolean }>("/ai/role-preferences/set", {
    method: "POST",
    body: { role, modelId, priority },
  });
}

export async function deleteRolePreference(role: AgentRole, modelId: string) {
  return apiFetch<{ ok: boolean }>("/ai/role-preferences/delete", {
    method: "POST",
    body: { role, modelId },
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

export async function estimateSubAgentCost(complexity: number, budgetMode?: string) {
  return apiFetch<SubAgentCostPreview>("/ai/estimate-sub-agent-cost", {
    method: "POST",
    body: { complexity, budgetMode },
  });
}

// --- MCP Servers ---

export async function listMCPServers() {
  return apiFetch<{ servers: MCPServer[] }>("/mcp/list", { method: "GET" });
}

export async function getMCPServer(id: string) {
  return apiFetch<{ server: MCPServer }>("/mcp/get", { method: "GET", body: { id } });
}

export async function installMCPServer(id: string, envVars?: Record<string, string>, config?: Record<string, unknown>) {
  return apiFetch<{ server: MCPServer }>("/mcp/install", { method: "POST", body: { id, envVars, config } });
}

export async function uninstallMCPServer(id: string) {
  return apiFetch<{ server: MCPServer }>("/mcp/uninstall", { method: "POST", body: { id } });
}

export async function configureMCPServer(id: string, envVars?: Record<string, string>, config?: Record<string, unknown>) {
  return apiFetch<{ server: MCPServer }>("/mcp/configure", { method: "POST", body: { id, envVars, config } });
}

export async function validateMCPServer(serverId: string) {
  return apiFetch<{ status: "active" | "misconfigured" | "error"; message: string }>("/mcp/validate", {
    method: "POST",
    body: { serverId },
  });
}

// --- Proactive Suggestions (8.2) ---

export interface Suggestion {
  id: string;
  type: "test_coverage" | "outdated_dep" | "error_pattern" | "cve" | "similar_failure" | "health";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  repo?: string;
  actionLabel?: string;
  actionTaskDescription?: string;
}

export async function getSuggestions(repo?: string, limit?: number) {
  return apiFetch<{ suggestions: Suggestion[]; generatedAt: string }>("/agent/suggestions", {
    method: "POST",
    body: { repo, limit },
  });
}

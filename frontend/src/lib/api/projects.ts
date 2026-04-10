import { apiFetch } from "./client";

// --- GitHub Types ---

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

// --- Registry / Marketplace Types ---

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
  qualityScore: number | null;
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

// --- Template Types ---

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

// --- Integration Types ---

export interface IntegrationConfig {
  id: string;
  userId: string;
  platform: string;
  webhookUrl: string | null;
  channelId: string | null;
  teamId: string | null;
  defaultRepo: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- GitHub API ---

export async function listRepos(owner?: string) {
  return apiFetch<{ repos: RepoInfo[] }>("/github/repos", {
    method: "POST",
    body: owner ? { owner } : {},
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

// --- Monitor API ---

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

export async function runMonitorCheck(repo: string) {
  return apiFetch<{
    results: Array<{ repo: string; checkType: string; status: string; details: Record<string, unknown> }>;
  }>("/monitor/run-check", { method: "POST", body: { repo } });
}

export async function getMonitorHistory(repo: string, limit?: number) {
  return apiFetch<{
    checks: Array<{ id: string; repo: string; checkType: string; status: string; details: Record<string, unknown>; createdAt: string }>;
  }>("/monitor/history", { method: "POST", body: { repo, limit: limit || 20 } });
}

// --- Cache API ---

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

// --- Registry API ---

export async function listComponents(options?: {
  category?: string;
  sourceRepo?: string;
  limit?: number;
  offset?: number;
}) {
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

export async function healComponent(componentId: string) {
  return apiFetch<{ action: string; reason?: string }>("/registry/heal", {
    method: "POST",
    body: { componentId },
  });
}

// --- Templates API ---

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

// --- Integrations API ---

export async function listIntegrations() {
  return apiFetch<{ configs: IntegrationConfig[] }>("/integrations/list");
}

export async function saveIntegration(req: {
  platform: string;
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
  teamId?: string;
  defaultRepo?: string;
  enabled?: boolean;
}) {
  return apiFetch<{ config: IntegrationConfig }>("/integrations/save", {
    method: "POST",
    body: req,
  });
}

export async function deleteIntegration(platform: string) {
  return apiFetch<{ success: boolean }>("/integrations/delete", {
    method: "POST",
    body: { platform },
  });
}

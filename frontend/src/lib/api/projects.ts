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

export type ComponentPlatform = "code" | "framer" | "figma";

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
  /** Fase I.4 — Platform-metadata */
  platform?: ComponentPlatform;
  role?: string | null;
  framerComponentId?: string | null;
  figmaNodeId?: string | null;
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

export async function getWatchFindings() {
  return apiFetch<{
    findings: Array<{
      id: string;
      repo: string;
      findingType: "new_commit" | "cve" | "breaking_change" | "test_failure" | "info";
      severity: "info" | "warning" | "critical";
      summary: string;
      details: Record<string, unknown>;
      createdAt: string;
    }>;
  }>("/monitor/watch-findings", { method: "GET" });
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

// --- Integration API keys (Firecrawl etc) ---

export interface IntegrationApiKeyStatus {
  platform: string;
  configured: boolean;
  preview: string | null;
  lastTestAt: string | null;
  lastTestStatus: "success" | "error" | null;
}

export async function getIntegrationApiKeyStatus(platform: string) {
  return apiFetch<{ status: IntegrationApiKeyStatus }>("/integrations/api-key/status", {
    method: "POST",
    body: { platform },
  });
}

export async function setIntegrationApiKey(platform: string, value: string) {
  return apiFetch<{ status: IntegrationApiKeyStatus }>("/integrations/api-key/set", {
    method: "POST",
    body: { platform, value },
  });
}

export async function deleteIntegrationApiKey(platform: string) {
  return apiFetch<{ success: boolean }>("/integrations/api-key/delete", {
    method: "POST",
    body: { platform },
  });
}

export async function testIntegrationApiKey(platform: string) {
  return apiFetch<{ success: boolean; message: string }>("/integrations/api-key/test", {
    method: "POST",
    body: { platform },
  });
}

// --- Canonical projects registry (Fase I.0.a) ---

export type TFProjectType = "code" | "framer" | "figma" | "framer_figma";
export type TFProjectScope = "cowork" | "designer";
export type TFProjectSourceOfTruth = "repo" | "framer" | "figma";

export interface TFProject {
  id: string;
  name: string;
  projectType: TFProjectType;
  description: string | null;
  ownerEmail: string;
  githubRepo: string | null;
  githubPrivate: boolean;
  githubAutoMerge: boolean;
  githubAutoPr: boolean;
  framerSiteUrl: string | null;
  figmaFileUrl: string | null;
  sourceOfTruth: TFProjectSourceOfTruth;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function tfProjectScope(type: TFProjectType): TFProjectScope {
  return type === "code" ? "cowork" : "designer";
}

export async function listTFProjects(scope?: TFProjectScope) {
  return apiFetch<{ projects: TFProject[] }>("/projects/list", {
    method: "POST",
    body: scope ? { scope } : {},
  });
}

export async function getTFProject(id: string) {
  return apiFetch<{ project: TFProject }>("/projects/get", {
    method: "POST",
    body: { id },
  });
}

export async function checkProjectName(name: string) {
  return apiFetch<{ available: boolean; reason?: string }>("/projects/check-name", {
    method: "POST",
    body: { name },
  });
}

export interface CreateTFProjectPayload {
  name: string;
  projectType: TFProjectType;
  description?: string;
  githubPrivate?: boolean;
  githubAutoMerge?: boolean;
  githubAutoPr?: boolean;
  createGithubRepo?: boolean;
  githubOrg?: string;
  framerSiteUrl?: string;
  figmaFileUrl?: string;
}

export async function createTFProject(payload: CreateTFProjectPayload) {
  return apiFetch<{ project: TFProject }>("/projects/create", {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
}

export async function updateTFProject(
  id: string,
  patch: Partial<CreateTFProjectPayload> & { sourceOfTruth?: TFProjectSourceOfTruth },
) {
  return apiFetch<{ project: TFProject }>("/projects/update", {
    method: "POST",
    body: { id, ...patch } as Record<string, unknown>,
  });
}

export async function archiveTFProject(id: string) {
  return apiFetch<{ success: boolean }>("/projects/archive", {
    method: "POST",
    body: { id },
  });
}

// --- GitHub sync hub (Prosjekt-sync-modal) ---

export interface GithubSyncRow {
  fullName: string;
  owner: string;
  name: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string;
  linkedProject: {
    id: string;
    name: string;
    type: TFProjectType;
  } | null;
}

export async function getGithubSyncData() {
  return apiFetch<{ rows: GithubSyncRow[]; ownerResolved: string | null }>(
    "/projects/github-sync-data",
    { method: "POST", body: {} },
  );
}

export async function linkRepo(repoFullName: string, projectType: TFProjectType, projectName?: string) {
  return apiFetch<{
    projectId: string;
    projectName: string;
    projectType: TFProjectType;
    linked: boolean;
    reason?: string;
    backfilledConversations?: number;
  }>("/projects/link-repo", {
    method: "POST",
    body: { repoFullName, projectType, projectName },
  });
}

export async function unlinkRepo(projectId: string) {
  return apiFetch<{ success: boolean; previousRepo: string | null }>("/projects/unlink-repo", {
    method: "POST",
    body: { projectId },
  });
}

// --- Fase I.1 — Per-project API keys ---

export interface ProjectApiKey {
  id: string;
  projectId: string;
  keyName: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export async function listProjectApiKeys(projectId: string) {
  return apiFetch<{ keys: ProjectApiKey[] }>("/projects/api-keys/list", {
    method: "POST",
    body: { projectId },
  });
}

export async function setProjectApiKey(projectId: string, keyName: string, value: string) {
  return apiFetch<{ key: ProjectApiKey }>("/projects/api-keys/set", {
    method: "POST",
    body: { projectId, keyName, value },
  });
}

export async function deleteProjectApiKey(projectId: string, keyName: string) {
  return apiFetch<{ success: boolean }>("/projects/api-keys/delete", {
    method: "POST",
    body: { projectId, keyName },
  });
}

// --- Fase I.1 — Per-project integrations ---

export type ProjectIntegrationPlatform = "github" | "framer" | "figma";

export interface ProjectIntegration {
  id: string;
  projectId: string;
  platform: ProjectIntegrationPlatform;
  remoteId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export async function listProjectIntegrations(projectId: string) {
  return apiFetch<{ integrations: ProjectIntegration[] }>("/projects/integrations/list", {
    method: "POST",
    body: { projectId },
  });
}

export async function saveProjectIntegration(payload: {
  projectId: string;
  platform: ProjectIntegrationPlatform;
  remoteId?: string;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch<{ integration: ProjectIntegration }>("/projects/integrations/save", {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
}

export async function deleteProjectIntegration(projectId: string, platform: ProjectIntegrationPlatform) {
  return apiFetch<{ success: boolean }>("/projects/integrations/delete", {
    method: "POST",
    body: { projectId, platform },
  });
}

// --- Fase I.2 — Design imports ---

export interface DesignImportSummary {
  id: string;
  projectId: string;
  filename: string;
  sizeBytes: number;
  source: string;
  nodeCount: number;
  assetCount: number;
  warnings: string[];
  createdAt: string;
}

export async function uploadDesign(projectId: string, filename: string, contentBase64: string) {
  return apiFetch<{ import: DesignImportSummary }>("/projects/design/upload", {
    method: "POST",
    body: { projectId, filename, contentBase64 },
  });
}

export async function listDesignImports(projectId: string) {
  return apiFetch<{ imports: DesignImportSummary[] }>("/projects/design/list", {
    method: "POST",
    body: { projectId },
  });
}

// --- Fase I.5 — Sync jobs ---

export type SyncDirection = "repo_to_design" | "design_to_repo" | "bidirectional";
export type SyncStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type SyncPlatform = "github" | "framer" | "figma";

export interface SyncJob {
  id: string;
  projectId: string;
  direction: SyncDirection;
  status: SyncStatus;
  triggeredBy: "manual" | "webhook" | "cron";
  sourcePlatform: SyncPlatform;
  targetPlatform: SyncPlatform;
  details: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export async function triggerSync(payload: {
  projectId: string;
  direction: SyncDirection;
  sourcePlatform: SyncPlatform;
  targetPlatform: SyncPlatform;
}) {
  return apiFetch<{ job: SyncJob }>("/projects/sync/trigger", {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
}

export async function listSyncJobs(projectId: string, limit?: number) {
  return apiFetch<{ jobs: SyncJob[] }>("/projects/sync/list", {
    method: "POST",
    body: { projectId, limit },
  });
}

export async function cancelSyncJob(jobId: string) {
  return apiFetch<{ success: boolean }>("/projects/sync/cancel", {
    method: "POST",
    body: { jobId },
  });
}

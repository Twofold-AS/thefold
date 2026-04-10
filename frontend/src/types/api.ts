// Shared API response/entity types used across multiple domains

// --- Chat ---

export type MessageType =
  | "chat"
  | "agent_report"
  | "task_start"
  | "context_transfer"
  | "agent_status"
  | "agent_thought"
  | "agent_progress";

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  messageType: MessageType;
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

// --- Costs ---

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

// --- GitHub / Repos ---

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

// --- Skills ---

export interface Skill {
  id: string;
  name: string;
  description: string;
  promptFragment: string;
  appliesTo: string[];
  scope: string;
  enabled: boolean;
  taskPhase?: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
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
  successCount?: number;
  failureCount?: number;
  avgTokenCost?: number;
  confidenceScore?: number;
  lastUsedAt?: string | null;
  totalUses?: number;
}

// --- AI Providers & Models ---

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

// --- User ---

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

// --- Sub-agent cost ---

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

export interface BuildStepInfo {
  id: string;
  stepNumber: number;
  phase: string;
  action: string;
  filePath: string | null;
  status: string;
  tokensUsed: number;
}

// --- Integrations ---

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

// --- Pagination helper ---

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// --- Generic API error shape ---

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

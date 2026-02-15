// --- Component types ---

export type ComponentCategory = "auth" | "api" | "ui" | "util" | "config";
export type ValidationStatus = "pending" | "validated" | "failed";
export type HealingSeverity = "low" | "normal" | "high" | "critical";
export type HealingTrigger = "update" | "bugfix" | "security";
export type HealingStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ComponentFile {
  path: string;
  content: string;
  language: string;
}

export interface Component {
  id: string;
  name: string;
  description: string | null;
  category: ComponentCategory | null;
  version: string;
  previousVersionId: string | null;
  files: ComponentFile[];
  entryPoint: string | null;
  dependencies: string[];
  sourceRepo: string;
  sourceTaskId: string | null;
  extractedBy: string;
  usedByRepos: string[];
  timesUsed: number;
  testCoverage: number | null;
  validationStatus: ValidationStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HealingEvent {
  id: string;
  componentId: string;
  oldVersion: string | null;
  newVersion: string | null;
  trigger: HealingTrigger;
  severity: HealingSeverity;
  affectedRepos: string[];
  tasksCreated: string[];
  status: HealingStatus;
  createdAt: string;
  completedAt: string | null;
}

// --- Request/Response types ---

export interface RegisterComponentRequest {
  name: string;
  description?: string;
  category?: ComponentCategory;
  version?: string;
  previousVersionId?: string;
  files: ComponentFile[];
  entryPoint?: string;
  dependencies?: string[];
  sourceRepo: string;
  sourceTaskId?: string;
  extractedBy?: string;
  tags?: string[];
}

export interface GetComponentRequest {
  id: string;
}

export interface ListComponentsRequest {
  category?: string;
  sourceRepo?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchComponentsRequest {
  query: string;
  category?: string;
  limit?: number;
}

export interface UseComponentRequest {
  componentId: string;
  repo: string;
}

export interface FindForTaskRequest {
  taskDescription: string;
  repo?: string;
  limit?: number;
}

export interface TriggerHealingRequest {
  componentId: string;
  newVersion?: string;
  trigger: HealingTrigger;
  severity?: HealingSeverity;
}

export interface HealingStatusRequest {
  componentId?: string;
  status?: string;
  limit?: number;
}

export interface HealingNotification {
  componentId: string;
  componentName: string;
  severity: string;
  affectedRepos: string[];
  tasksCreated: number;
}

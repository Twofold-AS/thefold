// --- Component types ---

export type ComponentCategory = "auth" | "api" | "ui" | "util" | "config" | "database" | "infrastructure" | "security" | "payment" | "form" | "email" | "devops" | "notification" | "storage" | "testing";
export type ComponentType = "component" | "pattern" | "template";
export type ComponentSource = "manual" | "seeded" | "extracted" | "healing";
export type ValidationStatus = "pending" | "validated" | "failed" | "rejected";
export type HealingSeverity = "low" | "normal" | "high" | "critical";
export type HealingTrigger = "update" | "bugfix" | "security";
export type HealingStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ComponentFile {
  path: string;
  content: string;
  language: string;
}

export interface ComponentVariable {
  name: string;
  description?: string;
  defaultValue?: string;
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
  qualityScore: number;
  type: ComponentType;
  variables: ComponentVariable[];
  source: ComponentSource;
  dependencySnapshot?: Record<string, string>; // { "encore.dev": "1.x", "react": "18.x" }
  generatedAt?: Date;
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
  type?: string;
  search?: string;
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

// --- Use component with variable substitution ---

export interface UseComponentWithVarsRequest {
  componentId: string;
  targetRepo?: string;
  variables?: Record<string, string>;
}

export interface UseComponentWithVarsResponse {
  files: Array<{ path: string; content: string }>;
}

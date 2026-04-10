import { apiFetch } from "./client";

// --- Types ---

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

// --- Skills API ---

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
  taskPhase?: string;
}) {
  return apiFetch<{ skill: Skill }>("/skills/create", { method: "POST", body: data });
}

export async function updateSkill(data: {
  id: string;
  name?: string;
  description?: string;
  promptFragment?: string;
  appliesTo?: string[];
  scope?: string;
  taskPhase?: string;
}) {
  return apiFetch<{ skill: Skill }>("/skills/update", { method: "POST", body: data });
}

export async function toggleSkill(id: string, enabled: boolean) {
  return apiFetch<{ skill: Skill }>("/skills/toggle", { method: "POST", body: { id, enabled } });
}

export async function deleteSkill(id: string) {
  return apiFetch<{ success: boolean }>("/skills/delete", { method: "POST", body: { id } });
}

export async function getSkill(id: string) {
  return apiFetch<{ skill: Skill }>("/skills/get", { method: "POST", body: { id } });
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

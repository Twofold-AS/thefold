// ai/tools/types.ts
// Tool contract — all tools implement the `Tool` interface.
// See ai/tools/README.md for how to add a new tool.

import type { z } from "zod";
import type log from "encore.dev/log";

/** Hvor verktøyet er tilgjengelig */
export type ToolSurface = "chat" | "agent";

/** Metadata om hva slags kostnad/beslutningsstøtte verktøyet har */
export type ToolCostHint = "low" | "medium" | "high";

/** Kategori — bestemmer mappe-plassering og UI-grupping */
export type ToolCategory =
  | "task"       // create/start/list tasks
  | "code"       // read/search files
  | "project"    // execute/revise plans
  | "review"     // respond to review
  | "memory"     // recall/save insights
  | "brain"      // sleep, consolidate
  | "component"  // find/use/save components
  | "meta"       // request_human_clarification, reflect
  | "repo"       // repo_write_file, repo_read_file, etc (agent)
  | "build"      // build_create_sandbox, validate_code, etc (agent)
  | "skills"     // search_skills, activate_skill (agent)
  | "web"        // web_scrape (Firecrawl), future: web_search
  | "uploads";   // read_uploaded_content, list_uploads

/** Kontekst som passes til hver handler */
export interface ToolContext {
  /** UUID til pågående conversation */
  conversationId?: string;
  /** Bruker-ID (for ownership-sjekker, audit) */
  userId: string;
  userEmail?: string;
  /** TheFold task ID — set når tool-loopen kjører i en task-kontekst */
  taskId?: string;
  /** Repo-info, hvis verktøyet trenger det */
  repoOwner?: string;
  repoName?: string;
  /** Aktiv plan, hvis det kjører en */
  activePlanId?: string | null;
  /** Side-effekt-magi — set av tool-loopen mellom iterasjoner */
  lastCreatedTaskId?: string | null;
  lastStartedTaskId?: string | null;
  /** SSE/Pub/Sub-emitter for live UI-oppdateringer */
  emit: (eventType: string, data: unknown) => void;
  /** Encore-logger */
  log: typeof log;
}

/** Returverdi fra handler */
export interface ToolResult {
  /** Om kallet lyktes */
  success: boolean;
  /** Bruker-vendt melding (vises som tool-resultat) */
  message?: string;
  /** Strukturert data (vises i UI hvis relevant) */
  data?: Record<string, unknown>;
  /** Side-effekter for tool-loopen å fange opp */
  taskId?: string;        // → lastCreatedTaskId neste iterasjon
  startedTaskId?: string; // → lastStartedTaskId
  /** Hint om hvor mye state som ble endret (for telemetri) */
  mutationCount?: number;
  /**
   * Signal til tool-loopen: pause loopen etter at tool_result er lagt til.
   * Task-status settes til needs_input av handleren selv — loopen bare breaker.
   */
  stopReason?: "paused_for_clarification";
  /** Data som loopen propagerer til orchestrator (vises i UI) */
  pauseData?: { question: string; context?: string };
}

/** Hovedkontrakt — alle verktøy implementerer denne */
export interface Tool<TInput = unknown> {
  /** Unik snake_case-ID — vises til AI */
  name: string;
  /** Bruker-vendt beskrivelse — AI leser denne for å velge verktøy */
  description: string;
  /** Folder-plassering + UI-grupping */
  category: ToolCategory;
  /** Zod-skjema → konverteres til JSONSchema for både Anthropic og OpenAI */
  inputSchema: z.ZodType<TInput>;
  /** Selve handler-funksjonen */
  handler: (input: TInput, ctx: ToolContext) => Promise<ToolResult>;

  // Metadata for filtrering og rate-limiting
  /** Hvilke overflater verktøyet er tilgjengelig på. Default: ["chat", "agent"] */
  surfaces?: ToolSurface[];
  /** Kun synlig når en plan er aktiv */
  requiresActivePlan?: boolean;
  /** Skjules når en plan er aktiv */
  forbiddenWithActivePlan?: boolean;
  /** Hint om kostnad — påvirker AI-valg og analytics */
  costHint?: ToolCostHint;
  /** Maks antall kall per session (anti-loop) */
  maxCallsPerSession?: number;
  /** Krever bruker-godkjenning før eksekvering (review-gate) */
  requiresApproval?: boolean;
}

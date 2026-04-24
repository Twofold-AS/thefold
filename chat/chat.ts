import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Subscription } from "encore.dev/pubsub";
import { isDebugEnabled } from "./debug";

// Re-export from isolated events file for backward compatibility
export { agentReports, chatResponses, type AgentReport, type ChatResponse } from "./events";
import { agentReports, chatResponses, type AgentReport } from "./events";

// --- Database ---

export const db = new SQLDatabase("chat", {
  migrations: "./migrations",
});

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[chat] db warmed"); }
  catch (e) { console.warn("[chat] warmup failed:", e); }
})();

import log from "encore.dev/log";

// Route responses back to originating platform (Slack/Discord)
const _responseRouter = new Subscription(chatResponses, "route-response", {
  handler: async (response) => {
    if (response.source === "slack" && response.metadata.webhookUrl) {
      await sendToSlackDirect(response.metadata.webhookUrl, response.content);
    } else if (response.source === "discord" && response.metadata.webhookUrl) {
      await sendToDiscordDirect(response.metadata.webhookUrl, response.content);
    }
    // "web" and "api" — no routing needed, frontend polls
  },
});

async function sendToSlackDirect(webhookUrl: string, message: string): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, unfurl_links: false }),
    });
    if (!res.ok) {
      log.warn("Slack response routing failed", { status: res.status });
    }
  } catch (err) {
    log.warn("Failed to route response to Slack", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function sendToDiscordDirect(webhookUrl: string, message: string): Promise<void> {
  try {
    // Discord has a 2000 char limit
    const truncated = message.length > 1900 ? message.substring(0, 1900) + "..." : message;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: truncated }),
    });
    if (!res.ok) {
      log.warn("Discord response routing failed", { status: res.status });
    }
  } catch (err) {
    log.warn("Failed to route response to Discord", { error: err instanceof Error ? err.message : String(err) });
  }
}

// --- Agent Message Parser (cross-service boundary — types duplicated from agent/messages.ts) ---

import { deserializeMessage, mapReportStatusToPhase, buildStatusContent, deserializeProgress } from "./agent-message-parser";

// Subscribe to agent reports and UPDATE existing agent_status (not create new agent_report)
const _ = new Subscription(agentReports, "store-agent-report", {
  handler: async (report) => {
    const debug = await isDebugEnabled();
    if (debug) console.log("[DEBUG-AF] === PUB/SUB agent report received ===");
    if (debug) console.log("[DEBUG-AF] taskId:", report.taskId, "status:", report.status);
    if (debug) console.log("[DEBUG-AF] conversationId:", report.conversationId);
    if (debug) console.log("[DEBUG-AF] content:", report.content?.substring(0, 200));

    // === NEW CONTRACT: AgentProgress → single agent_progress row per task ===
    // Always handle type:"progress" regardless of feature flag — this is what reportProgress() emits
    // and it carries the reviewId needed for the review UI. Flag check was causing reviewId to be lost.
    // Only match true new-contract messages (type:"progress"), not legacy types handled below.
    {
      let _isNewContract = false;
      try { _isNewContract = JSON.parse(report.content)?.type === "progress"; } catch {}
      const progress = _isNewContract ? deserializeProgress(report.content) : null;
      if (progress) {
        const progressMetadata = JSON.stringify({
          taskId: report.taskId,
          status: report.status,
          prUrl: report.prUrl,
          filesChanged: report.filesChanged,
        });

        // Find existing agent_progress message for this taskId
        const existingProgress = await db.queryRow<{ id: string }>`
          SELECT id FROM messages
          WHERE conversation_id = ${report.conversationId}
            AND message_type = 'agent_progress'
            AND metadata->>'taskId' = ${report.taskId}
          ORDER BY created_at DESC LIMIT 1
        `;

        if (existingProgress) {
          // UPDATE — always same row, never INSERT a second one
          await db.exec`
            UPDATE messages
            SET content = ${report.content}, metadata = ${progressMetadata}::jsonb, updated_at = NOW()
            WHERE id = ${existingProgress.id}::uuid
          `;
        } else {
          // First progress message for this task — INSERT
          await db.exec`
            INSERT INTO messages (conversation_id, role, content, message_type, metadata)
            VALUES (${report.conversationId}, 'assistant', ${report.content}, 'agent_progress', ${progressMetadata}::jsonb)
          `;
        }

        // Insert persistent completion message when done
        if (report.completionMessage) {
          await db.exec`
            INSERT INTO messages (conversation_id, role, content, message_type, metadata)
            VALUES (${report.conversationId}, 'assistant', ${report.completionMessage}, 'chat',
                    ${JSON.stringify({ taskId: report.taskId, type: "completion" })}::jsonb)
          `;
        }

        // Emit SSE on taskId so the frontend (which switches SSE stream from conversationId →
        // taskId when the agent starts) receives real-time completion/review notifications.
        // DB is written above before the emit, so frontend refreshMsgs() will find the data.
        if (report.taskId) {
          try {
            const { agent: agentEvt } = await import("~encore/clients");
            if (progress.status === "done" || progress.status === "failed") {
              // Signal task completion — frontend onDone fires, sending=false, refreshMsgs
              await agentEvt.emitChatEvent({
                streamKey: report.taskId,
                eventType: "agent.done",
                data: {
                  finalText: progress.summary || "",
                  toolsUsed: [],
                  filesWritten: progress.report?.filesChanged?.length || 0,
                  totalInputTokens: 0,
                  totalOutputTokens: 0,
                  costUsd: progress.report?.costUsd || 0,
                  loopsUsed: 0,
                  stoppedAtMaxLoops: false,
                },
              });
            } else if (progress.status === "waiting") {
              // Review submitted — frontend should stop spinner and refresh to show review UI
              await agentEvt.emitChatEvent({
                streamKey: report.taskId,
                eventType: "agent.status",
                data: { status: "pending_review", phase: "reviewing" },
              });
            }
          } catch (err) {
            log.warn("store-agent-report: SSE emit failed (non-critical)", {
              taskId: report.taskId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return;
      }
      // If deserializeProgress returned null, fall through to legacy handling below
    }

    // === LEGACY CONTRACT: original handler ===
    let statusContent: string;
    const agentMsg = deserializeMessage(report.content);

    if (agentMsg) {
      switch (agentMsg.type) {
        case "thought":
          // Store ONLY the text, not JSON — fixes raw JSON in chat bubbles
          await db.exec`
            INSERT INTO messages (conversation_id, role, content, message_type, metadata)
            VALUES (${report.conversationId}, 'assistant', ${agentMsg.text}, 'agent_thought',
                    ${JSON.stringify({ taskId: report.taskId, timestamp: agentMsg.timestamp })}::jsonb)
          `;
          return;

        case "status":
          // Use full serialized message as agent_status content
          statusContent = report.content;
          break;

        case "report":
          // Plain text report — convert to status format for UI
          statusContent = buildStatusContent(
            mapReportStatusToPhase(agentMsg.status),
            [{ label: agentMsg.text.substring(0, 80), status: agentMsg.status === "working" ? "active" : "done" }],
          );
          break;

        case "clarification":
          statusContent = report.content;
          break;

        case "review":
          statusContent = report.content;
          break;

        case "completion":
          // Store as persistent chat message + update status to "Ferdig"
          await db.exec`
            INSERT INTO messages (conversation_id, role, content, message_type, metadata)
            VALUES (${report.conversationId}, 'assistant', ${agentMsg.text}, 'chat',
                    ${JSON.stringify({ taskId: report.taskId, type: "completion", prUrl: agentMsg.prUrl })}::jsonb)
          `;
          statusContent = buildStatusContent("Ferdig", [
            { label: "Oppgave fullført", status: "done" },
          ]);
          break;

        default:
          // Unknown new type — fall through to legacy
          statusContent = buildLegacyStatusContent(report);
          break;
      }
    } else {
      // Legacy fallback — KEEP existing buildLegacyStatusContent()
      statusContent = buildLegacyStatusContent(report);
    }

    const metadata = JSON.stringify({
      taskId: report.taskId,
      status: report.status,
      prUrl: report.prUrl,
      filesChanged: report.filesChanged,
    });

    // Try to find existing agent_status message for this task (match by taskId in JSONB metadata)
    // Each task gets its own agent_status message — prevents overwriting old task statuses
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM messages
      WHERE conversation_id = ${report.conversationId}
        AND message_type = 'agent_status'
        AND metadata->>'taskId' = ${report.taskId}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (existing) {
      // UPDATE existing agent_status for this task
      await db.exec`
        UPDATE messages
        SET content = ${statusContent}, metadata = ${metadata}::jsonb, updated_at = NOW()
        WHERE id = ${existing.id}::uuid
      `;
    } else {
      // No agent_status for this task — create one
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${report.conversationId}, 'assistant', ${statusContent}, 'agent_status', ${metadata}::jsonb)
      `;
    }

    // Insert persistent completion message (visible in chat history, survives page refresh)
    if (report.completionMessage) {
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${report.conversationId}, 'assistant', ${report.completionMessage}, 'chat',
                ${JSON.stringify({ taskId: report.taskId, type: "completion" })}::jsonb)
      `;
    }
  },
});

function buildLegacyStatusContent(report: AgentReport): string {
  const phase = report.status === "working" ? "Bygger"
    : report.status === "completed" ? "Ferdig"
    : report.status === "failed" ? "Feilet"
    : report.status === "needs_input" ? "Venter"
    : "Bygger";

  return JSON.stringify({
    type: "agent_status",
    phase,
    title: report.status === "completed" ? "Fullfort"
      : report.status === "failed" ? "Feilet"
      : report.content.substring(0, 80),
    steps: parseReportToSteps(report),
    questions: report.status === "needs_input" ? [report.content] : undefined,
  });
}

function parseReportToSteps(report: AgentReport): Array<{ label: string; icon: string; status: string }> {
  const steps: Array<{ label: string; icon: string; status: string }> = [];

  if (report.content.includes("Leser task") || report.content.includes("oppgave")) {
    steps.push({ label: "Leser oppgave", icon: "search", status: "done" });
  }
  if (report.content.includes("prosjektstruktur") || report.content.includes("GitHub")) {
    steps.push({ label: "Leser prosjektstruktur", icon: "service", status: "done" });
  }
  if (report.content.includes("kontekst") || report.content.includes("memory")) {
    steps.push({ label: "Henter kontekst", icon: "memory", status: "done" });
  }
  if (report.content.includes("Planlegger") || report.content.includes("plan")) {
    steps.push({ label: "Planlegger arbeidet", icon: "plan", status: report.status === "working" ? "active" : "done" });
  }
  if (report.content.includes("sandbox") || report.content.includes("Skriver") || report.content.includes("kode")) {
    steps.push({ label: "Skriver kode", icon: "code", status: report.status === "working" ? "active" : "done" });
  }
  if (report.content.includes("Validerer") || report.content.includes("validering")) {
    steps.push({ label: "Validerer kode", icon: "service", status: report.status === "working" ? "active" : "done" });
  }
  if (report.content.includes("PR") || report.content.includes("pull request")) {
    steps.push({ label: "Oppretter PR", icon: "service", status: report.status === "working" ? "active" : "done" });
  }

  // Final step based on status
  if (report.status === "completed") {
    steps.push({ label: "Fullfort!", icon: "check", status: "done" });
  } else if (report.status === "failed") {
    steps.push({ label: report.content.substring(0, 100), icon: "error", status: "error" });
  } else if (report.status === "working" && !steps.some(s => s.status === "active")) {
    const lastContent = report.content.split("...")[0] || report.content;
    steps.push({ label: lastContent.substring(0, 80), icon: "code", status: "active" });
  }

  return steps;
}

// Subscribe to build progress and notify users
import { buildProgress } from "../builder/events";

const _buildProgressSub = new Subscription(buildProgress, "chat-build-progress", {
  handler: async (event) => {
    // Emit as agent_status JSON for rich frontend rendering
    const phases = ["init", "scaffold", "dependencies", "implement", "integrate", "finalize"];
    const currentIdx = phases.indexOf(event.phase);
    const steps = phases.map((p, i) => ({
      label: p.charAt(0).toUpperCase() + p.slice(1),
      icon: "file",
      status: i < currentIdx ? "done" : i === currentIdx ? (event.status === "completed" ? "done" : "active") : "pending",
    }));

    const content = JSON.stringify({
      type: "agent_status",
      phase: "Bygger",
      subPhase: event.currentFile || event.phase,
      progress: { current: event.step, total: event.totalSteps },
      steps,
    });

    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (
        ${"build-" + event.taskId},
        'assistant',
        ${content},
        'agent_status',
        ${JSON.stringify({
          type: "build_progress",
          jobId: event.jobId,
          taskId: event.taskId,
          phase: event.phase,
          step: event.step,
          totalSteps: event.totalSteps,
          status: event.status,
        })}
      )
    `;
  },
});

// Subscribe to task events and notify users
import { taskEvents } from "../tasks/events";

const _taskEventsSub = new Subscription(taskEvents, "chat-task-events", {
  handler: async (event) => {
    const actionLabels: Record<string, string> = {
      created: "opprettet",
      updated: "oppdatert",
      started: "startet",
      completed: "fullført",
      blocked: "blokkert",
      synced: "synkronisert",
    };
    const label = actionLabels[event.action] ?? event.action;
    const content = `Oppgave '${event.taskId}' ${label}`;
    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (
        ${"tasks-" + (event.repo ?? "system")},
        'assistant',
        ${content},
        'agent_report',
        ${JSON.stringify({
          type: "task_event",
          taskId: event.taskId,
          action: event.action,
          repo: event.repo,
          source: event.source,
        })}
      )
    `;
  },
});

// Subscribe to healing events and notify users
import { healingEvents } from "../registry/events";

const _healingSub = new Subscription(healingEvents, "store-healing-notification", {
  handler: async (event) => {
    // Store as a system message in the main conversation
    const content = `Healing: Komponent "${event.componentName}" (${event.severity}) — ${event.tasksCreated} oppgaver opprettet for ${event.affectedRepos.length} repo(s).`;
    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (
        'system-healing',
        'assistant',
        ${content},
        'agent_report',
        ${JSON.stringify({
          type: "healing",
          componentId: event.componentId,
          severity: event.severity,
          affectedRepos: event.affectedRepos,
          tasksCreated: event.tasksCreated,
        })}
      )
    `;
  },
});

// --- Types ---

interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  messageType: "chat" | "agent_report" | "task_start" | "context_transfer" | "agent_status" | "agent_thought" | "agent_progress" | "memory_insight" | "swarm_status";
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Swarm message upsert (Fase H, Commit 41) ---
// One message per parent-task, updated in place. Keyed by conversation_id +
// metadata.parentTaskId so we never fragment the chat thread when sub-agents
// flip state. messageId round-trips so the aggregator reuses the same row.

import { api as apiDecorator } from "encore.dev/api";

interface UpsertSwarmMessageRequest {
  parentTaskId: string;
  conversationId: string;
  content: string;
  /** When supplied, skip the lookup and UPDATE directly. */
  messageId?: string;
}

interface UpsertSwarmMessageResponse {
  messageId: string;
}

export const upsertSwarmMessage = apiDecorator(
  { method: "POST", path: "/chat/swarm/upsert", expose: false },
  async (req: UpsertSwarmMessageRequest): Promise<UpsertSwarmMessageResponse> => {
    // Fast path: caller already knows the messageId.
    if (req.messageId) {
      await db.exec`
        UPDATE messages
        SET content = ${req.content}, updated_at = NOW()
        WHERE id = ${req.messageId}::uuid
      `;
      return { messageId: req.messageId };
    }

    // Look up existing swarm_status message for this parent-task via metadata.
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM messages
      WHERE conversation_id = ${req.conversationId}
        AND message_type = 'swarm_status'
        AND metadata->>'parentTaskId' = ${req.parentTaskId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (existing) {
      await db.exec`
        UPDATE messages
        SET content = ${req.content}, updated_at = NOW()
        WHERE id = ${existing.id}::uuid
      `;
      return { messageId: existing.id };
    }

    const metadata = JSON.stringify({ parentTaskId: req.parentTaskId });
    const inserted = await db.queryRow<{ id: string }>`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (${req.conversationId}, 'assistant', ${req.content}, 'swarm_status', ${metadata}::jsonb)
      RETURNING id
    `;
    if (!inserted) {
      const { APIError } = await import("encore.dev/api");
      throw APIError.internal("failed to insert swarm_status message");
    }
    return { messageId: inserted.id };
  },
);

// --- Helper: update message content in-place (for progress tracking) ---

async function updateMessageContent(messageId: string, content: string) {
  await db.exec`UPDATE messages SET content = ${content} WHERE id = ${messageId}::uuid`;
}

async function updateMessageType(messageId: string, messageType: string) {
  await db.exec`UPDATE messages SET message_type = ${messageType} WHERE id = ${messageId}::uuid`;
}

// --- Intent detection ---

function detectMessageIntent(content: string): "repo_review" | "task_request" | "question" | "general" {
  const lower = content.toLowerCase();
  if (lower.includes("se over") || lower.includes("analyser") || lower.includes("gjennomgå") || lower.includes("strukturen")) return "repo_review";
  if (lower.includes("endre") || lower.includes("fiks") || lower.includes("implementer") || lower.includes("legg til") || lower.includes("lag en")) return "task_request";
  if (lower.includes("hva") || lower.includes("hvorfor") || lower.includes("hvordan") || lower.includes("?")) return "question";
  return "general";
}

// --- Cancel generation (in-memory set) ---

const cancelledConversations = new Set<string>();

function isCancelled(conversationId: string): boolean {
  if (cancelledConversations.has(conversationId)) {
    cancelledConversations.delete(conversationId);
    return true;
  }
  return false;
}

interface SendRequest {
  conversationId: string;
  message: string;
  // If set, TheFold works on this task autonomously (Linear task ID)
  linearTaskId?: string;
  // If set, TheFold works on this TheFold task autonomously (primary flow)
  taskId?: string;
  // If true, trigger agent regardless of taskId/linearTaskId
  triggerAgent?: boolean;
  // If true, just chat — don't trigger agent work
  chatOnly?: boolean;
  // Manuelt modellvalg for denne oppgaven (null = auto)
  modelOverride?: string | null;
  // Skills aktive for denne samtalen
  skillIds?: string[];
  // Hvilket repo brukeren chatter om (fra repo-chat)
  repoName?: string;
  // GitHub repo owner/org — resolved from frontend context
  repoOwner?: string;
  // Where the message originated
  source?: "web" | "slack" | "discord" | "api";
  // If true, agent only plans and creates tasks — skips code-gen and building
  planMode?: boolean;
  // If true, enable web_scrape tool (Firecrawl) in this turn's tool list.
  // Defaults true when user has a configured API key; false otherwise.
  firecrawlEnabled?: boolean;
  // Active project for this conversation — populated at creation time so
  // uploads, scrapes and project-context resolve without joins later.
  projectId?: string;
  /** "cowork" | "designer" — scope of the chat. Populated at conversation creation. */
  scope?: "cowork" | "designer";
}

interface SendResponse {
  message: Message;
  agentTriggered: boolean;
  taskId?: string;
}

interface HistoryRequest {
  conversationId: string;
  limit?: number;
  before?: string; // cursor for pagination
}

interface HistoryResponse {
  messages: Message[];
  hasMore: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  lastActivity: string;
  activeTask?: string;
  scope?: "cowork" | "designer";
  projectId?: string | null;
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
}

// --- Ownership helpers (OWASP A01:2025 — Broken Access Control) ---

/** Ensure the current user owns this conversation, or create ownership for new ones.
 *  When `projectId` is provided on first-seen conversation, it's persisted so uploads
 *  and scrapes within this chat resolve to the right project. */
async function ensureConversationOwner(
  conversationId: string,
  projectId?: string | null,
  scope?: "cowork" | "designer" | null,
): Promise<void> {
  const auth = getAuthData();
  if (!auth) throw APIError.unauthenticated("not authenticated");

  const existing = await db.queryRow<{ owner_email: string; project_id: string | null; scope: string | null }>`
    SELECT owner_email, project_id, scope FROM conversations WHERE id = ${conversationId}
  `;

  if (existing) {
    if (existing.owner_email !== auth.email) {
      throw APIError.permissionDenied("du har ikke tilgang til denne samtalen");
    }
    if (projectId && !existing.project_id) {
      await db.exec`UPDATE conversations SET project_id = ${projectId}::uuid WHERE id = ${conversationId}`;
    }
    if (scope && !existing.scope) {
      await db.exec`UPDATE conversations SET scope = ${scope} WHERE id = ${conversationId}`;
    }
    return;
  }

  const effectiveScope = scope ?? "cowork";
  if (projectId) {
    await db.exec`
      INSERT INTO conversations (id, owner_email, project_id, scope)
      VALUES (${conversationId}, ${auth.email}, ${projectId}::uuid, ${effectiveScope})
      ON CONFLICT (id) DO NOTHING
    `;
  } else {
    await db.exec`
      INSERT INTO conversations (id, owner_email, scope)
      VALUES (${conversationId}, ${auth.email}, ${effectiveScope})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

/** Verify the current user owns this conversation (read-only check) */
async function verifyConversationAccess(conversationId: string): Promise<void> {
  const auth = getAuthData();
  if (!auth) throw APIError.unauthenticated("not authenticated");

  const existing = await db.queryRow<{ owner_email: string }>`
    SELECT owner_email FROM conversations WHERE id = ${conversationId}
  `;

  // Null ownership = allow. System conversations (from Pub/Sub subscribers like
  // agent_status, build-progress, task-events) don't have ownership records
  // and need to be accessible for AgentStatus/activity rendering.
  if (existing && existing.owner_email !== auth.email) {
    throw APIError.permissionDenied("du har ikke tilgang til denne samtalen");
  }
}

// --- Project Detection ---

import { detectProjectRequest } from "./detection";
import { buildProjectContextBlock } from "./project-context";

// --- Endpoints ---

// Send a message — either triggers agent work or direct chat
export const send = api(
  { method: "POST", path: "/chat/send", expose: true, auth: true },
  async (req: SendRequest): Promise<SendResponse> => {
    await ensureConversationOwner(req.conversationId, req.projectId, req.scope);

    // Idempotency guard — reject duplicate sends within a 10s window so a
    // double-submit from the client (retry storm, StrictMode double-render,
    // rapid Enter-presses) doesn't create two rows + two agent runs. Match
    // on (conversationId, role=user, exact content). If a matching row was
    // inserted in the last 10 seconds, return that row instead of inserting
    // again. Cheap — uses the existing (conversation_id, created_at) index.
    {
      const existing = await db.queryRow<Message>`
        SELECT id, conversation_id as "conversationId", role, content,
               message_type as "messageType", metadata, created_at as "createdAt",
               updated_at as "updatedAt"
        FROM messages
        WHERE conversation_id = ${req.conversationId}
          AND role = 'user'
          AND content = ${req.message}
          AND created_at > NOW() - INTERVAL '10 seconds'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (existing) {
        log.warn("chat.send: duplicate send ignored (idempotency window)", {
          conversationId: req.conversationId,
          existingMsgId: existing.id,
          contentLength: req.message.length,
        });
        return { message: existing, agentTriggered: false };
      }
    }

    // Store user message (include skillIds in metadata if present)
    const userMetadata = req.skillIds && req.skillIds.length > 0
      ? JSON.stringify({ skillIds: req.skillIds })
      : null;

    const msg = await db.queryRow<Message>`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata, source)
      VALUES (${req.conversationId}, 'user', ${req.message}, 'chat', ${userMetadata}, ${req.source || "web"})
      RETURNING id, conversation_id as "conversationId", role, content,
                message_type as "messageType", metadata, created_at as "createdAt",
                updated_at as "updatedAt"
    `;

    if (!msg) throw APIError.internal("failed to store message");

    // DEL 4: Check if there's an active needs_input task for this conversation
    // If so, route the message as a clarification response
    if (!req.chatOnly) {
      try {
        // Check agent_progress messages with status="waiting" — route as clarification response
        const lastProgress = await db.queryRow<{ content: string; metadata: string }>`
          SELECT content, metadata::text FROM messages
          WHERE conversation_id = ${req.conversationId}
            AND message_type = 'agent_progress'
          ORDER BY updated_at DESC LIMIT 1
        `;
        if (lastProgress) {
          const progress = deserializeProgress(lastProgress.content);
          const progressMeta = typeof lastProgress.metadata === "string"
            ? JSON.parse(lastProgress.metadata)
            : lastProgress.metadata;
          if (progress?.status === "waiting" && progressMeta?.taskId) {
            const { agent: agentClient } = await import("~encore/clients");
            await agentClient.respondToClarification({
              taskId: progressMeta.taskId,
              response: req.message,
              conversationId: req.conversationId,
            });
            return { message: msg, agentTriggered: false };
          }
        }
      } catch {
        // Non-critical — fall through to normal chat flow
      }
    }

    // Designer-scope with a projectId: the frontend's RepoContext may still
    // hold a stale legacy repoName (e.g. "Krakefjes") from before the user
    // switched into a Framer project. Override it with whatever github_repo
    // the project currently holds — but DON'T proactively create a companion
    // repo here. A pure-Framer conversation should not force a GitHub repo
    // to exist; that decision is deferred to the first repo_write_file call
    // inside the agent tool-loop, which calls ensureProjectRepo lazily.
    if (req.scope === "designer" && req.projectId) {
      try {
        const { projects: projectsClient } = await import("~encore/clients");
        const info = await projectsClient.getProjectInternal({ projectId: req.projectId });
        const existingRepo = info.project?.githubRepo ?? "";
        if (existingRepo) {
          const [owner, name] = existingRepo.split("/");
          if (owner && name) {
            log.info("designer-scope: using existing project github_repo", {
              projectId: req.projectId,
              was: req.repoName ? `${req.repoOwner}/${req.repoName}` : "(unset)",
              now: existingRepo,
            });
            req = { ...req, repoName: name, repoOwner: owner };
          }
        } else {
          // No companion repo yet — clear stale legacy repo from the request
          // so the agent sees an empty repoName. repo_write_file will
          // ensureProjectRepo on demand if the AI actually tries to write.
          log.info("designer-scope: no companion repo yet, clearing stale request repo", {
            projectId: req.projectId,
            stripped: req.repoName ? `${req.repoOwner}/${req.repoName}` : "(none)",
          });
          req = { ...req, repoName: "", repoOwner: "" };
        }
      } catch (err) {
        log.warn("designer-scope: getProjectInternal failed, keeping request-provided repo", {
          projectId: req.projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Determine: agent work, project decomposition, or direct chat?
    // Tasks (TheFold's own task system) is the PRIMARY flow. Linear is just a side integration.
    const shouldTriggerAgent = !req.chatOnly && (req.linearTaskId || req.taskId || req.triggerAgent);

    // Project detection heuristics
    const isProjectRequest = !req.chatOnly && !req.linearTaskId && !req.taskId && !req.triggerAgent && detectProjectRequest(req.message);

    if (isProjectRequest) {
      // Large project request — decompose into phases + tasks
      const { ai: aiClient } = await import("~encore/clients");
      const { github: ghClient } = await import("~encore/clients");
      const { agent: agentClient } = await import("~encore/clients");

      let projectOwner = req.repoOwner;
      const projectRepo = req.repoName;
      // Resolve owner from GitHub App if not provided
      if (!projectOwner && projectRepo) {
        try {
          const { owner } = await ghClient.getGitHubOwner();
          projectOwner = owner;
        } catch { /* fallback to empty */ }
      }
      if (!projectOwner || !projectRepo) {
        // Can't decompose without owner/repo — fall through to direct chat
      } else try {
        // Get project structure (try/catch — empty repos return fallback)
        let treeString = "(Tomt repo — ingen eksisterende filer)";
        try {
          const tree = await ghClient.getTree({ owner: projectOwner, repo: projectRepo });
          treeString = tree.treeString || treeString;
        } catch (e) {
          console.warn("getTree failed for project decomposition (likely empty repo):", e);
        }

        // Send immediate status so frontend shows spinner
        await db.exec`
          INSERT INTO messages (conversation_id, role, content, message_type)
          VALUES (${req.conversationId}, 'assistant', ${JSON.stringify({
            type: "progress",
            status: "working",
            phase: "planning",
            summary: "Planlegger prosjekt — analyserer oppgaven og deler den opp i faser..."
          })}, 'agent_status')
        `;

        // Decompose project
        const decomposition = await aiClient.decomposeProject({
          userMessage: req.message,
          repoOwner: projectOwner,
          repoName: projectRepo,
          projectStructure: treeString,
        });

        // Store project plan via agent service (project_plans is in agent DB)
        const planResult = await agentClient.storeProjectPlan({
          conversationId: req.conversationId,
          userRequest: req.message,
          decomposition: {
            phases: decomposition.phases,
            conventions: decomposition.conventions,
            estimatedTotalTasks: decomposition.estimatedTotalTasks,
          },
        });

        // Store structured project plan as JSON content
        const projectPlanContent = JSON.stringify({
          type: "project_plan",
          title: `Prosjektplan`,
          phases: decomposition.phases,
          totalTasks: decomposition.estimatedTotalTasks,
          estimatedComplexity: decomposition.estimatedComplexity ?? "medium",
          reasoning: decomposition.reasoning,
        });

        // Store plan as assistant message with structured JSON content
        await db.exec`
          INSERT INTO messages (conversation_id, role, content, message_type, metadata)
          VALUES (${req.conversationId}, 'assistant', ${projectPlanContent}, 'agent_report',
                  ${JSON.stringify({
                    type: "project_plan",
                    projectId: planResult.projectId,
                    phases: decomposition.phases.length,
                    totalTasks: decomposition.estimatedTotalTasks,
                  })})
        `;

        return {
          message: msg,
          agentTriggered: false,
          taskId: planResult.projectId,
        };
      } catch {
        // Decomposition failed — fall through to direct chat
      }
    }

    if (shouldTriggerAgent) {
      // Import agent dynamically to avoid circular deps
      const { agent } = await import("~encore/clients");

      // Resolve effective task ID — TheFold task is primary, Linear is fallback
      const effectiveTaskId = req.taskId || req.linearTaskId!;

      // Fire off agent work asynchronously via pub/sub
      // The agent will report back via agentReports topic
      await agent.startTask({
        conversationId: req.conversationId,
        taskId: effectiveTaskId,
        userMessage: req.message,
        modelOverride: req.modelOverride ?? undefined,
        repoName: req.repoName,
        repoOwner: req.repoOwner,
        planOnly: req.planMode,
      });

      // Store a "task started" message
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${req.conversationId}, 'assistant',
                ${"Jeg har startet arbeidet med " + effectiveTaskId + ". Jeg rapporterer fremgang her."},
                'task_start', ${JSON.stringify({ taskId: effectiveTaskId })})
      `;

      // Create initial agent_status message for immediate frontend rendering (new contract)
      const initialStatus = buildStatusContent("Forbereder", [
        { label: "Starter oppgave...", status: "active" },
      ]);
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${req.conversationId}, 'assistant', ${initialStatus}, 'agent_status',
          ${JSON.stringify({ taskId: effectiveTaskId, status: "working" })}::jsonb)
      `;

      return {
        message: msg,
        agentTriggered: true,
        taskId: effectiveTaskId,
      };
    } else {
      // Direct chat — return immediately, process AI async
      // Insert a placeholder chat message (NOT agent_status — that's for agent tasks only)
      const placeholderMsg = await db.queryRow<Message>`
        INSERT INTO messages (conversation_id, role, content, message_type)
        VALUES (${req.conversationId}, 'assistant', '', 'chat')
        RETURNING id, conversation_id as "conversationId", role, content,
                  message_type as "messageType", metadata, created_at as "createdAt"
      `;
      if (!placeholderMsg) throw APIError.internal("failed to create placeholder message");

      // Fetch user's AI name preference
      let userAiName: string | undefined;
      try {
        const { users: usersClient } = await import("~encore/clients");
        const userInfo = await usersClient.getUser({ userId: getAuthData()!.userID });
        if (userInfo.preferences?.aiName && typeof userInfo.preferences.aiName === "string") {
          userAiName = userInfo.preferences.aiName;
        }
      } catch {
        // Non-critical — use default
      }

      // Fire-and-forget async processing
      processAIResponse(
        req.conversationId,
        req.message,
        placeholderMsg.id,
        { email: getAuthData()!.email, userID: getAuthData()!.userID },
        req.skillIds,
        req.repoName,
        userAiName,
        req.modelOverride ?? undefined,
        req.repoOwner,
        req.firecrawlEnabled,
      ).catch((err) => {
        console.error("AI processing failed:", err);
        updateMessageContent(placeholderMsg.id, "Beklager, noe gikk galt. Prøv igjen.").catch(() => {});
        updateMessageType(placeholderMsg.id, "chat").catch(() => {});
      });

      // Return immediately
      return { message: msg, agentTriggered: false };
    }
  }
);

// --- Onboarding repo scan (7.4) ---
//
// DEPRECATED — no longer called from the send-path hot loop. Kept as an
// intentional helper so cron / manual triggers can still request a full
// index (e.g. from projects/manifest-updater.ts). The AI now orients itself
// via repo_* tools when it actually needs repo context, and the background
// manifest-updater refreshes project_manifests every 6h.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function performOnboardingScan(repoOwner: string, repoName: string, conversationId: string): Promise<void> {
  const { github: gh, memory: mem, ai: aiClient } = await import("~encore/clients");
  const repo = `${repoOwner}/${repoName}`;

  // Fetch file tree
  let tree: string[] = [];
  let treeString = "";
  try {
    const result = await gh.getTree({ owner: repoOwner, repo: repoName });
    tree = result.tree || [];
    treeString = result.treeString || tree.join("\n");
    if (result.empty || tree.length === 0) return; // Empty repo — nothing to scan
  } catch { return; }

  // Fetch key files for profiling
  const keyFilePaths = ["package.json", "README.md", "encore.app", "tsconfig.json", "encore.service.ts"];
  const fileContents: Record<string, string> = {};
  await Promise.all(
    keyFilePaths.map(async (path) => {
      try {
        const file = await gh.getFile({ owner: repoOwner, repo: repoName, path });
        if (file?.content) fileContents[path] = file.content.slice(0, 2000);
      } catch { /* not all key files exist */ }
    })
  );

  // Build a profile summary using AI
  const filesSummary = Object.entries(fileContents)
    .map(([p, c]) => `--- ${p} ---\n${c}`)
    .join("\n\n");

  const profilePrompt = `Analyze this repository and write a concise repo profile (max 400 words) covering:
1. What this project does
2. Tech stack and frameworks
3. Architecture patterns (services, databases, APIs)
4. Key conventions (naming, file structure, testing)
5. Important files and entry points

Repo: ${repo}
File tree (${tree.length} files):
${treeString.slice(0, 1500)}

Key files:
${filesSummary.slice(0, 3000)}

Write the profile in English as a structured summary an AI agent can use as context.`;

  let profile = "";
  try {
    const resp = await aiClient.chat({
      messages: [{ role: "user", content: profilePrompt }],
      systemContext: "direct_chat",
      model: "claude-haiku-4-5-20251001", // Fast + cheap for scanning
      memoryContext: [],
    });
    profile = resp.content;
  } catch { return; }

  if (!profile || profile.length < 50) return;

  // Store as high-priority pinned memory
  await mem.store({
    content: `Repo profile for ${repo}:\n\n${profile}`,
    category: "repo_profile",
    memoryType: "decision",
    sourceRepo: repo,
    tags: ["repo_profile", "onboarding", repoName, "high-priority"],
    pinned: true,
    ttlDays: 365,
    trustLevel: "system",
  });

  // Also store tech stack as a separate shorter memory for fast retrieval
  const stackLines = profile.split("\n").filter((l) =>
    /tech|stack|framework|language|library|typescript|react|next|encore|postgres|api/i.test(l)
  ).slice(0, 5);
  if (stackLines.length > 0) {
    await mem.store({
      content: `Tech stack for ${repo}: ${stackLines.join(". ")}`,
      category: "tech_stack",
      memoryType: "decision",
      sourceRepo: repo,
      tags: ["tech_stack", repoName],
      pinned: true,
      ttlDays: 365,
      trustLevel: "system",
    });
  }

  // Notify user in chat that repo was indexed
  const notif = `🗂️ Jeg har indeksert **${repoName}** (${tree.length} filer) og lagret en repo-profil i kunnskapsbasen. Jeg vil nå bruke denne konteksten i alle fremtidige svar.`;
  await db.exec`
    INSERT INTO messages (conversation_id, role, content, message_type, metadata)
    VALUES (${conversationId}, 'assistant', ${notif}, 'chat',
            ${JSON.stringify({ type: "onboarding_scan", repo })}::jsonb)
  `;

  log.info("onboarding scan complete", { repo, fileCount: tree.length });
}

// --- Async AI processing (fire-and-forget from sendMessage) ---

// C2: Quick complexity heuristic for auto model routing
function quickComplexity(msg: string): number {
  const len = msg.length;
  const hasCode = /```|function |const |import /.test(msg);
  const hasQuestion = msg.includes("?");
  const wordCount = msg.split(/\s+/).length;

  if (wordCount <= 5 && !hasCode) return 2; // "Hei", "Takk", etc.
  if (wordCount <= 20 && !hasCode && hasQuestion) return 4; // Simple question
  if (hasCode || len > 500) return 7; // Code or long
  if (len > 1500 || wordCount > 200) return 9; // Very complex
  return 5; // Default medium
}

async function processAIResponse(
  conversationId: string,
  userContent: string,
  placeholderId: string,
  auth: { email: string; userID: string },
  skillIds?: string[],
  repoName?: string,
  aiName?: string,
  modelOverride?: string,
  repoOwner?: string,
  firecrawlEnabled?: boolean,
) {
  // Start heartbeat — updates updated_at every 10s so frontend knows we're alive
  const heartbeat = setInterval(async () => {
    try {
      await db.exec`UPDATE messages SET updated_at = NOW() WHERE id = ${placeholderId}::uuid`;
    } catch {}
  }, 10000);

  try {
    const debug = await isDebugEnabled();
    if (debug) console.log("[DEBUG-AF] processAIResponse started for conversation:", conversationId);

    const { ai, memory, agent: agentEvt } = await import("~encore/clients");

    // §3.3: Look up active project plan for this conversation (fail-soft).
    // When a plan is running, we'll filter create_task/start_task from the
    // chat tool-set so the AI can't spawn a parallel task that conflicts with it.
    let activePlanId: string | undefined;
    try {
      const activePlan = await agentEvt.getActivePlanByConversation({ conversationId });
      activePlanId = activePlan.plan?.id;
      if (activePlanId) {
        if (debug) console.log("[DEBUG-AF] active plan detected:", activePlanId, "status:", activePlan.plan?.status);
      }
    } catch (e) {
      log.warn("chat: active-plan lookup failed — proceeding without plan context", {
        error: e instanceof Error ? e.message : String(e),
        conversationId,
      });
    }

    // Detect intent for richer context
    const intent = detectMessageIntent(userContent);

    // Social-greeting fast-path. Short messages that match a greeting regex
    // skip memory search, manifest-summary injection, knowledge-rule
    // injection, and broad orientation. They also signal the prompt layer
    // to stay in "short reply" register. Without this gate a 4-char "Hei"
    // produced an 11k-token orient + respond cycle with task-status dumps
    // and repo summaries.
    const SOCIAL_GREETING_REGEX = /^(hei|hey|hallo|yo|hi|heisann|god\s?morgen|god\s?kveld|god\s?natt|takk|tack|ok|okay|ja|nei|jepp|yes|no)[\s.\!\?]*$/i;
    const isSocialGreeting = userContent.length < 20 && SOCIAL_GREETING_REGEX.test(userContent.trim());

    // Emit "thinking" status to frontend via SSE (Bug 2 fix)
    agentEvt.emitChatEvent({
      streamKey: conversationId,
      eventType: "agent.status",
      data: { status: "running", phase: "Tenker" },
    }).catch(() => {});

    if (isCancelled(conversationId)) return;

    // Step 2: Get conversation history
    const historyRows = await db.query<Message>`
      SELECT id, conversation_id as "conversationId", role, content,
             message_type as "messageType", metadata, created_at as "createdAt",
             updated_at as "updatedAt"
      FROM messages
      WHERE conversation_id = ${conversationId} AND message_type != 'agent_status'
      ORDER BY created_at DESC LIMIT 30
    `;
    const history: Message[] = [];
    for await (const row of historyRows) history.push(row);
    history.reverse();

    // Step 3: Resolve skills (try/catch — don't crash on failure).
    // Social greetings cap token-budget at 300 so even heavy skills like
    // `security` (priority 9) can't bloat the prompt. Complexity hint of 1
    // lets the resolver's min_complexity gate suppress anything tagged for
    // more involved work.
    let resolvedSkills = { result: { injectedPrompt: "", injectedSkillIds: [] as string[], tokensUsed: 0, preRunResults: [] as any[], postRunSkills: [] as any[] } };
    try {
      const { skills: skillsClient } = await import("~encore/clients");
      resolvedSkills = await skillsClient.resolve({
        context: {
          task: userContent,
          userId: auth.userID,
          repo: repoName,
          totalTokenBudget: isSocialGreeting ? 300 : 4000,
          context: isSocialGreeting ? "chat" : undefined,
          complexity: isSocialGreeting ? 1 : undefined,
        },
      });
    } catch (e) {
      console.error("Skills resolve failed:", e);
    }

    if (isCancelled(conversationId)) return;

    // Step 4: Search memories — only for complex queries (saves tokens and time).
    // Social greetings never search: a 2-3s memory lookup on "Hei" is both
    // wasteful and semantically noisy (returns random top-similarity hits).
    let memories: { results: Array<{ content: string; memoryType?: string; decayedScore?: number; createdAt?: string }> } = { results: [] };
    if (!isSocialGreeting && (intent === "task_request" || intent === "repo_review" || userContent.length > 100)) {
      try {
        memories = await memory.search({ query: userContent, limit: 5 });
      } catch (e) {
        console.error("Memory search failed:", e);
      }
    }

    // Step 4.1: (REMOVED) Proactive onboarding scan on every send.
    //
    // Previously we kicked off performOnboardingScan() for every first
    // interaction with a repo — 10+ github.getFile calls, memory searches,
    // and two memory.store writes before the AI ever saw the input. That
    // ran even for "Hei" messages that have nothing to do with the repo.
    //
    // Replacement (v3): the AI has repo_get_tree, repo_find_relevant_files,
    // and repo_read_file as tools. It decides when repo context is actually
    // needed. For passive context, project_manifests is refreshed in the
    // background by a cron (see projects/manifest-updater.ts) and surfaced
    // to the prompt as a small summary — no per-turn scanning.

    // Step 4.5: Passive repo-context via cached manifest — NO github.getTree,
    // NO findRelevantFiles, NO file-fetches on the hot path. The manifest
    // updater (projects/manifest-updater.ts) keeps this fresh in the
    // background (cron every 6h + stale-trigger fire-and-forget). When the
    // AI needs actual file contents, it calls repo_get_tree / repo_read_file
    // / repo_find_relevant_files itself.
    let repoContext = "";
    // Social greetings skip manifest-injection entirely — the AI doesn't
    // need to be primed with repo-summary to say "Hei tilbake".
    if (!isSocialGreeting && repoName && repoOwner) {
      try {
        const { ensureManifestIsFresh } = await import("../projects/manifest-updater");
        const { manifest } = await ensureManifestIsFresh(repoOwner, repoName);
        if (manifest) {
          // First 10 file-paths from fileHashes act as a rough "key files"
          // hint — the full manifest has more detail that the agent flow
          // pulls when a task starts.
          const keyFiles = manifest.fileHashes
            ? Object.keys(manifest.fileHashes).slice(0, 10)
            : [];
          const techStack = (manifest.techStack ?? []).slice(0, 8);
          repoContext = [
            "",
            "## Project Manifest",
            `Repo: ${repoOwner}/${repoName}`,
            manifest.summary ? `Summary: ${manifest.summary}` : "",
            techStack.length > 0 ? `Tech: ${techStack.join(", ")}` : "",
            manifest.fileCount != null ? `Files: ${manifest.fileCount}` : "",
            keyFiles.length > 0 ? `Key files: ${keyFiles.join(", ")}` : "",
            manifest.lastAnalyzedAt ? `Manifest updated: ${manifest.lastAnalyzedAt}` : "",
            "",
            "Use repo_get_tree / repo_read_file / repo_find_relevant_files when you need actual file contents. Do NOT guess — verify via tools.",
          ].filter(Boolean).join("\n");
        }
      } catch (e) {
        // Non-critical — the AI can still call repo_* tools itself.
        log.warn("manifest-summary injection failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (isCancelled(conversationId)) return;

    // Step 5: Determine model — manual override uses model directly; auto-routing via complexity
    // AI service's selectOptimalModel (DB-backed cache) handles actual model selection
    const complexity = quickComplexity(userContent);
    const selectedModel: string | undefined = modelOverride || undefined;
    if (debug) console.log("[DEBUG-AF] model:", selectedModel || "(auto via complexity)", "complexity:", complexity);

    agentEvt.emitChatEvent({
      streamKey: conversationId,
      eventType: "agent.status",
      data: { status: "running", phase: "Genererer svar" },
    }).catch(() => {});

    // Fase I.1 (regression fix) — Project context goes in its OWN system-prompt
    // section with explicit "do not announce" instructions. NOT merged into
    // memoryContext (where it would be listed as numbered "relevant context"
    // and the AI would narrate it back on a simple greeting).
    const projectContext = await buildProjectContextBlock(conversationId);

    // Call AI with tools (ALWAYS includes CHAT_TOOLS — AI decides whether to use them)
    // Per-phase token-budget log. Rough estimate — 1 token ≈ 4 chars. Helps
    // monitor prompt-bloat regressions. Example output for a social greeting
    // should show orienting_tokens≈0, memory_tokens=0, skills_tokens<150,
    // manifest_tokens=0, history_tokens≈<60 per message × N.
    const est = (s: string | undefined | null): number =>
      s ? Math.ceil(s.length / 4) : 0;
    const skillsTokens = est(resolvedSkills?.result?.injectedPrompt);
    const memoryTokens = (memories.results || []).reduce((sum, r) => sum + est(r.content), 0);
    const historyTokens = history.reduce((sum, m) => sum + est(m.content), 0);
    const manifestTokens = est(repoContext);
    const projectCtxTokens = est(projectContext?.systemPromptSnippet);
    console.log(
      "[CHAT-BUDGET]",
      `convId=${conversationId}`,
      `isSocialGreeting=${isSocialGreeting}`,
      `skills_tokens=${skillsTokens}`,
      `memory_tokens=${memoryTokens}`,
      `manifest_tokens=${manifestTokens}`,
      `project_ctx_tokens=${projectCtxTokens}`,
      `history_tokens=${historyTokens}`,
      `history_msgs=${history.length}`,
    );
    if (debug) console.log("[DEBUG-AF] Calling ai.chat with", history.length, "messages, intent:", intent);
    let aiResponse;
    try {
      aiResponse = await ai.chat({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        memoryContext: (memories.results || []).map((r) => r.content),
        projectContext: projectContext?.systemPromptSnippet,
        systemContext: "direct_chat",
        model: selectedModel,        // explicit override or undefined (let AI service auto-route)
        complexity,                  // hint for selectOptimalModel in ai-endpoints.ts
        repoName,
        repoOwner,
        repoContext: repoContext || undefined,
        conversationId,
        aiName,
        activePlanId,                // §3.3: filters create_task/start_task when plan is running
        userEmail: auth.email,        // Fase E: propagated to ToolContext for role gates
        firecrawlEnabled: firecrawlEnabled ?? true, // Per-turn toggle removed — web_scrape always available if API key exists (tool handler errors gracefully otherwise)
        projectType: projectContext?.projectType as ("code" | "framer" | "figma" | "framer_figma" | undefined),
        isSocialGreeting,
      });
    } catch (e) {
      console.error("AI call failed:", e);
      const errMsg = e instanceof Error ? e.message : String(e);
      const lower = errMsg.toLowerCase();
      let userMessage: string;
      if (lower.includes("credit") || lower.includes("billing") || lower.includes("quota") || lower.includes("402") || lower.includes("brukt opp")) {
        userMessage = "AI-leverandørens credits er brukt opp. Sjekk billing-innstillingene hos leverandøren.";
      } else if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many")) {
        userMessage = "For mange forespørsler — vent litt og prøv igjen.";
      } else if (lower.includes("401") || lower.includes("api key") || lower.includes("api-nøkkel") || lower.includes("unauthenticated") || lower.includes("unauthorized")) {
        userMessage = "API-nøkkelen er ugyldig eller utløpt. Sjekk AI-innstillingene.";
      } else if (lower.includes("overloaded") || lower.includes("503") || lower.includes("unavailable") || lower.includes("utilgjengelig")) {
        userMessage = "AI-tjenesten er midlertidig utilgjengelig. Prøv igjen om litt.";
      } else if (lower.includes("context length") || lower.includes("too long") || lower.includes("token limit")) {
        userMessage = "Meldingen er for lang. Prøv en kortere melding.";
      } else {
        userMessage = `Beklager, noe gikk galt: ${errMsg}`;
      }
      aiResponse = {
        content: userMessage,
        tokensUsed: 0,
        stopReason: "error",
        modelUsed: "none",
        costUsd: 0,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        truncated: false,
      };
    }

    if (debug) console.log("[DEBUG-AH] ai.chat returned content length:", aiResponse.content?.length);
    if (debug) console.log("[DEBUG-AH] Tools used:", aiResponse.toolsUsed || "none");
    if (debug) console.log("[DEBUG-AH] Stop reason:", aiResponse.stopReason);

    // Handle truncated responses
    if (aiResponse.truncated) {
      aiResponse.content += "\n\n---\nSvaret ble avbrutt fordi maks antall tokens ble nådd. Prøv et mer spesifikt spørsmål, eller be om at svaret deles opp.";
    }

    // Handle empty content — when tools were used but AI returned no text
    if (!aiResponse.content || !aiResponse.content.trim()) {
      if (debug) console.warn("[DEBUG-AH] AI returned empty content");
      if (aiResponse.toolsUsed && aiResponse.toolsUsed.length > 0) {
        aiResponse.content = `Utførte: ${aiResponse.toolsUsed.join(", ")}`;
        if (debug) console.log("[DEBUG-AH] Using tool summary as fallback:", aiResponse.content);
      } else {
        aiResponse.content = "Beklager, jeg fikk ikke generert et svar. Prøv igjen.";
      }
    }

    console.log(`AI Response: ${aiResponse.usage.totalTokens} tokens (${aiResponse.usage.inputTokens} inn, ${aiResponse.usage.outputTokens} ut), kostnad: $${aiResponse.costUsd.toFixed(4)}, stop: ${aiResponse.stopReason}`);

    if (isCancelled(conversationId)) return;

    // Step 6: Save AI response to DB FIRST so refreshMsgs() always finds completed content.
    // SSE emit follows below — by the time the frontend reacts to agent.done, the DB
    // already has the final assistant message.
    await updateMessageContent(placeholderId, aiResponse.content);
    await updateMessageType(placeholderId, "chat");

    // Emit full response via SSE (fast path for live UI). messageId = placeholderId
    // so the frontend dedup logic can match SSE msg with the DB msg from refreshMsgs().
    agentEvt.emitChatEvent({
      streamKey: conversationId,
      eventType: "agent.message",
      data: {
        role: "assistant",
        content: aiResponse.content,
        model: aiResponse.modelUsed,
        messageId: placeholderId,
      },
    }).catch(() => {});

    // Save token/cost metadata (include lastCreatedTaskId so frontend can detect agent handoff)
    // U11: modelSlug is the short human-readable form shown above the bubble.
    // v3 skills: persist activeSkills so the UI can render a SkillsCollapsible
    // badge on the saved assistant message — not just while streaming.
    const aiActiveSkills = (aiResponse as { activeSkills?: Array<{ id: string; name: string; description?: string }> }).activeSkills;
    await db.exec`UPDATE messages SET metadata = ${JSON.stringify({
      model: aiResponse.modelUsed,
      modelSlug: (aiResponse as { modelSlug?: string }).modelSlug,
      tokens: aiResponse.usage,
      cost: aiResponse.costUsd,
      stopReason: aiResponse.stopReason,
      truncated: aiResponse.truncated,
      toolsUsed: aiResponse.toolsUsed || [],
      ...(aiResponse.lastCreatedTaskId ? { lastCreatedTaskId: aiResponse.lastCreatedTaskId } : {}),
      ...(aiActiveSkills && aiActiveSkills.length > 0 ? { activeSkills: aiActiveSkills } : {}),
    })}::jsonb WHERE id = ${placeholderId}::uuid`;

    // Emit chat.message_update — the canonical "placeholder is now finalised"
    // signal. Previously the frontend relied on `agent.message` (delta-stream-
    // oriented) or on `agent.done` + a DB re-fetch. That broke when the SSE
    // connection closed before the message arrived: users saw the answer
    // only after refreshing. This dedicated event carries the full final
    // payload (content + skills + cost + tokens + model) on the chat stream
    // so the frontend can update the placeholder bubble in-place without
    // re-fetching. Keyed on conversationId (chat surface), not taskId.
    agentEvt.emitChatEvent({
      streamKey: conversationId,
      eventType: "chat.message_update",
      data: {
        messageId: placeholderId,
        role: "assistant",
        content: aiResponse.content,
        model: aiResponse.modelUsed,
        costUsd: aiResponse.costUsd ?? 0,
        tokens: aiResponse.usage,
        activeSkills: aiActiveSkills,
        toolsUsed: aiResponse.toolsUsed ?? [],
        status: "completed",
      },
    }).catch(() => {});

    // When agent took over via start_task tool: emit agent_started so the frontend SSE hook
    // switches its stream key from conversationId → agent taskId. Do NOT emit agent.done here —
    // the agent's own SSE stream will emit done when the full task (including review) is complete.
    // start_task can be called after create_task (lastCreatedTaskId) OR directly (lastStartedTaskId)
    const startedTaskId = aiResponse.lastStartedTaskId || aiResponse.lastCreatedTaskId;
    const agentTookOver = (aiResponse.toolsUsed || []).includes("start_task") && startedTaskId;
    if (agentTookOver) {
      // SSE agent_started was already emitted from ai/tools.ts during tool execution.
      // We skip agent.done here so the frontend stays in "sending" state until the agent finishes.
      return; // frontend switches SSE stream via agentStartedTaskId received during tool execution
    }

    // Direct chat (no agent): emit agent.done so frontend stops the sending indicator
    agentEvt.emitChatEvent({
      streamKey: conversationId,
      eventType: "agent.done",
      data: {
        finalText: aiResponse.content,
        toolsUsed: aiResponse.toolsUsed || [],
        filesWritten: 0,
        totalInputTokens: aiResponse.usage?.inputTokens || 0,
        totalOutputTokens: aiResponse.usage?.outputTokens || 0,
        costUsd: aiResponse.costUsd || 0,
        loopsUsed: 0,
        stoppedAtMaxLoops: false,
      },
    }).catch(() => {});

    // Log repo activity (fire-and-forget)
    if (repoName) {
      logRepoActivity(repoName, "chat", "Melding sendt", userContent.substring(0, 100), auth.userID);
      if (aiResponse.toolsUsed && aiResponse.toolsUsed.length > 0) {
        for (const tool of aiResponse.toolsUsed) {
          logRepoActivity(repoName, "tool_use", `Verktoy: ${tool}`, undefined, undefined, { tool });
        }
      }
      logRepoActivity(repoName, "ai_response", `${aiName || "TheFold"} svarte`, aiResponse.content.substring(0, 100), undefined, {
        model: aiResponse.modelUsed,
        tokens: aiResponse.usage?.totalTokens,
        cost: aiResponse.costUsd,
      });
    }

    // Budget alert: check daily cost
    try {
      const dailyCost = await db.queryRow<{ total: number }>`
        SELECT COALESCE(SUM((metadata->>'cost')::numeric), 0) as total
        FROM messages WHERE role = 'assistant' AND metadata->>'cost' IS NOT NULL
        AND created_at >= CURRENT_DATE
      `;
      if (dailyCost && dailyCost.total > 5.0) {
        console.warn(`BUDGET ALERT: Daily cost $${dailyCost.total.toFixed(2)} exceeds $5.00`);
      }
    } catch {
      // Non-critical
    }

    // Store memory_insight message if memories were used (7.1: memory visibility in chat)
    if (memories.results && memories.results.length > 0) {
      const insightContent = JSON.stringify({
        type: "memory_insight",
        memories: (memories.results as Array<{ content: string; memoryType?: string; decayedScore?: number; createdAt?: string }>)
          .slice(0, 3)
          .map((r) => ({
            content: r.content.substring(0, 200),
            memoryType: r.memoryType || "general",
            decayedScore: r.decayedScore || 0,
            createdAt: r.createdAt,
          })),
        count: memories.results.length,
      });
      db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${conversationId}, 'assistant', ${insightContent}, 'memory_insight',
                ${JSON.stringify({ memoryCount: memories.results.length })}::jsonb)
      `.catch(() => {});
    }

    // Extract memories (fire-and-forget)
    memory.extract({
      conversationId,
      content: `User: ${userContent}\nAssistant: ${aiResponse.content}`,
      category: "conversation",
    }).catch(() => {});

  } catch (e) {
    // CATCH ALL — never leave user stuck in "Tenker..."
    console.error("processAIResponse crashed:", e);
    try {
      await updateMessageContent(placeholderId,
        "Noe gikk galt under prosessering. Feil: " + (e instanceof Error ? e.message : "Ukjent feil") + "\n\nPrøv igjen."
      );
      await updateMessageType(placeholderId, "chat");
    } catch {}
  } finally {
    // ALWAYS stop heartbeat
    clearInterval(heartbeat);
  }
}

// Cancel ongoing AI generation
export const cancelGeneration = api(
  { method: "POST", path: "/chat/cancel", expose: true, auth: true },
  async (req: { conversationId: string }): Promise<{ success: boolean }> => {
    await verifyConversationAccess(req.conversationId);
    cancelledConversations.add(req.conversationId);

    // Update any active agent_status messages to cancelled
    await db.exec`
      UPDATE messages
      SET content = 'Generering avbrutt.', message_type = 'chat'
      WHERE conversation_id = ${req.conversationId}
        AND message_type = 'agent_status'
    `;

    return { success: true };
  }
);

// Get conversation history
export const history = api(
  { method: "POST", path: "/chat/history", expose: true, auth: true },
  async (req: HistoryRequest): Promise<HistoryResponse> => {
    await verifyConversationAccess(req.conversationId);
    const limit = Math.min(req.limit ?? 50, 200);

    const rows = req.before
      ? await db.query<Message>`
          SELECT id, conversation_id as "conversationId", role, content,
                 message_type as "messageType", metadata, created_at as "createdAt",
                 updated_at as "updatedAt"
          FROM messages
          WHERE conversation_id = ${req.conversationId} AND created_at < ${req.before}
          ORDER BY created_at DESC LIMIT ${limit + 1}
        `
      : await db.query<Message>`
          SELECT id, conversation_id as "conversationId", role, content,
                 message_type as "messageType", metadata, created_at as "createdAt",
                 updated_at as "updatedAt"
          FROM messages
          WHERE conversation_id = ${req.conversationId}
          ORDER BY created_at DESC LIMIT ${limit + 1}
        `;

    const messages: Message[] = [];
    for await (const row of rows) messages.push(row);

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    messages.reverse();

    return { messages, hasMore };
  }
);

// List all conversations (filtered by owner — OWASP A01)
export const conversations = api(
  { method: "GET", path: "/chat/conversations", expose: true, auth: true },
  async (): Promise<ConversationsResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");

    // Ownership-filtered query (OWASP A01 — only show user's own conversations)
    // Exclude agent_status from "last message" and use first USER message as title
    const rows = await db.query`
      SELECT
        m.conversation_id as id,
        m.content as "lastMessage",
        m.created_at as "lastActivity",
        c.scope as "scope",
        c.project_id as "projectId",
        (SELECT content FROM messages
         WHERE conversation_id = m.conversation_id AND role = 'user'
         ORDER BY created_at ASC LIMIT 1) as "firstUserMessage"
      FROM messages m
      INNER JOIN (
        SELECT conversation_id, MAX(created_at) as max_created
        FROM messages
        WHERE message_type != 'agent_status'
        GROUP BY conversation_id
      ) latest ON m.conversation_id = latest.conversation_id
                AND m.created_at = latest.max_created
      INNER JOIN conversations c ON c.id = m.conversation_id
      WHERE c.owner_email = ${auth.email} AND c.archived = false
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    const convList: ConversationSummary[] = [];
    for await (const row of rows) {
      const titleSource = (row.firstUserMessage as string) || (row.lastMessage as string);
      const lastMsg = row.lastMessage as string;
      const scopeVal = row.scope as string | null;
      convList.push({
        id: row.id as string,
        title: titleSource.substring(0, 80) + (titleSource.length > 80 ? "..." : ""),
        lastMessage: lastMsg,
        lastActivity: row.lastActivity as string,
        scope: scopeVal === "designer" ? "designer" : "cowork",
        projectId: (row.projectId as string | null) ?? null,
      });
    }

    // [debug] history-bug investigation: log id list per email so we can
    // confirm whether a missing repo conversation is truly absent from the
    // joined query or filtered out elsewhere. Remove once confirmed.
    log.info("conversations endpoint result", {
      email: auth.email,
      count: convList.length,
      ids: convList.map(c => c.id),
    });

    return { conversations: convList };
  }
);

// --- Conversation archive/restore/delete endpoints ---

interface ArchiveConversationRequest { conversationId: string; }
interface ArchiveConversationResponse { success: boolean; }

// --- Transfer a conversation to a specific project (moves an incognito/project-less
// chat into a named project, preserving all messages). ---

interface TransferConversationRequest {
  conversationId: string;
  targetProjectId: string;
}

interface TransferConversationResponse {
  success: boolean;
  projectName: string;
  projectScope: "cowork" | "designer";
}

export const transferConversation = api(
  { method: "POST", path: "/chat/conversations/transfer", expose: true, auth: true },
  async (req: TransferConversationRequest): Promise<TransferConversationResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");

    // Resolve target project — must belong to the authed user.
    const proj = await db.queryRow<{ id: string; name: string; project_type: string; owner_email: string }>`
      SELECT p.id, p.name, p.project_type, p.owner_email
      FROM projects p
      WHERE p.id = ${req.targetProjectId}::uuid AND p.archived_at IS NULL
    `;
    if (!proj) throw APIError.notFound("target project not found");
    if (proj.owner_email !== auth.email) throw APIError.permissionDenied("not project owner");

    const projScope: "cowork" | "designer" =
      proj.project_type === "framer" || proj.project_type === "figma" || proj.project_type === "framer_figma"
        ? "designer" : "cowork";

    // Ensure the conversation exists + is owned by authed user.
    const existing = await db.queryRow<{ owner_email: string | null }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;
    if (!existing) {
      // Auto-create ownership row if conversation has messages but no ownership record yet.
      await db.exec`
        INSERT INTO conversations (id, owner_email, project_id, scope)
        VALUES (${req.conversationId}, ${auth.email}, ${req.targetProjectId}::uuid, ${projScope})
        ON CONFLICT (id) DO NOTHING
      `;
    } else {
      if (existing.owner_email && existing.owner_email !== auth.email) {
        throw APIError.permissionDenied("not conversation owner");
      }
      await db.exec`
        UPDATE conversations
        SET project_id = ${req.targetProjectId}::uuid, scope = ${projScope}
        WHERE id = ${req.conversationId}
      `;
    }

    // Also propagate to any already-uploaded files in this conversation.
    await db.exec`
      UPDATE chat_files SET project_id = ${req.targetProjectId}::uuid
      WHERE conversation_id = ${req.conversationId} AND user_email = ${auth.email}
        AND project_id IS NULL
    `;

    log.info("conversation transferred to project", {
      conversationId: req.conversationId,
      targetProjectId: req.targetProjectId,
      scope: projScope,
    });

    return { success: true, projectName: proj.name, projectScope: projScope };
  },
);

// --- Backfill: link legacy repo-named conversations to a freshly-created project ---
// Called internally by projects.linkRepo so conversations with id-prefix
// "repo-<reponame>-..." and project_id IS NULL inherit the new project binding.

export const backfillProjectConversations = api(
  { method: "POST", path: "/chat/backfill-project-conversations", expose: false },
  async (req: {
    ownerEmail: string;
    projectId: string;
    repoName: string;             // basename, e.g. "krakefjes" (lowercase match)
    projectScope: "cowork" | "designer";
  }): Promise<{ updated: number }> => {
    const pattern = `repo-${req.repoName.toLowerCase()}-%`;
    const row = await db.queryRow<{ count: number }>`
      WITH updated AS (
        UPDATE conversations
        SET project_id = ${req.projectId}::uuid,
            scope = COALESCE(scope, ${req.projectScope})
        WHERE owner_email = ${req.ownerEmail}
          AND LOWER(id) LIKE ${pattern}
          AND project_id IS NULL
          AND archived = false
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM updated
    `.catch((err) => {
      log.warn("backfillProjectConversations: query failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { count: 0 };
    });

    log.info("backfillProjectConversations: done", {
      owner: req.ownerEmail,
      projectId: req.projectId,
      repoName: req.repoName,
      scope: req.projectScope,
      updated: row?.count ?? 0,
    });
    return { updated: row?.count ?? 0 };
  },
);

export const archiveConversation = api(
  { method: "POST", path: "/chat/conversations/archive", expose: true, auth: true },
  async (req: ArchiveConversationRequest): Promise<ArchiveConversationResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");
    await db.exec`
      UPDATE conversations
      SET archived = true, archived_at = NOW()
      WHERE id = ${req.conversationId} AND owner_email = ${auth.email}
    `;
    return { success: true };
  }
);

export const restoreConversation = api(
  { method: "POST", path: "/chat/conversations/restore", expose: true, auth: true },
  async (req: ArchiveConversationRequest): Promise<ArchiveConversationResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");
    await db.exec`
      UPDATE conversations
      SET archived = false, archived_at = NULL
      WHERE id = ${req.conversationId} AND owner_email = ${auth.email}
    `;
    return { success: true };
  }
);

export const deleteConversationPermanent = api(
  { method: "POST", path: "/chat/conversations/delete", expose: true, auth: true },
  async (req: ArchiveConversationRequest): Promise<ArchiveConversationResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");
    // Only allow permanent delete of archived conversations (safety gate)
    await db.exec`
      DELETE FROM messages WHERE conversation_id = ${req.conversationId}
      AND EXISTS (
        SELECT 1 FROM conversations
        WHERE id = ${req.conversationId} AND owner_email = ${auth.email} AND archived = true
      )
    `;
    await db.exec`
      DELETE FROM conversations
      WHERE id = ${req.conversationId} AND owner_email = ${auth.email} AND archived = true
    `;
    return { success: true };
  }
);

interface ArchivedConversationsResponse {
  conversations: ConversationSummary[];
}

export const archivedConversations = api(
  { method: "GET", path: "/chat/conversations/archived", expose: true, auth: true },
  async (): Promise<ArchivedConversationsResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");

    const rows = await db.query`
      SELECT
        c.id,
        c.archived_at,
        (SELECT content FROM messages
         WHERE conversation_id = c.id AND role = 'user'
         ORDER BY created_at ASC LIMIT 1) as "firstUserMessage",
        (SELECT created_at FROM messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC LIMIT 1) as "lastActivity"
      FROM conversations c
      WHERE c.owner_email = ${auth.email} AND c.archived = true
      ORDER BY c.archived_at DESC
      LIMIT 100
    `;

    const convList: ConversationSummary[] = [];
    for await (const row of rows) {
      const title = (row.firstUserMessage as string) || "(Ingen meldinger)";
      convList.push({
        id: row.id as string,
        title: title.substring(0, 80) + (title.length > 80 ? "..." : ""),
        lastMessage: row.firstUserMessage as string || "",
        lastActivity: (row.lastActivity || row.archived_at) as string,
      });
    }

    return { conversations: convList };
  }
);

// --- Re-exports from sub-files (backwards compat) ---
export { approveFromChat, requestChangesFromChat, rejectFromChat } from "./chat-review";
export { getRepoActivity, getCostSummary, notifications } from "./chat-crud";

// --- Internal helper: log repo activity ---

async function logRepoActivity(
  repoName: string,
  eventType: string,
  title: string,
  description?: string,
  userId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await db.exec`
      INSERT INTO repo_activity (repo_name, event_type, title, description, user_id, metadata)
      VALUES (${repoName}, ${eventType}, ${title}, ${description || null}, ${userId || null}, ${JSON.stringify(metadata || {})}::jsonb)
    `;
  } catch (e) {
    console.error("Failed to log activity:", e);
  }
}

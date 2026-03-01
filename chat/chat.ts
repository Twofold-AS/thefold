import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic, Subscription } from "encore.dev/pubsub";

// --- Database ---

const db = new SQLDatabase("chat", {
  migrations: "./migrations",
});

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[chat] db warmed"); }
  catch (e) { console.warn("[chat] warmup failed:", e); }
})();

// --- Pub/Sub: Agent reports back to chat ---

export interface AgentReport {
  conversationId: string;
  taskId: string;
  content: string;
  status: "working" | "completed" | "failed" | "needs_input";
  prUrl?: string;
  filesChanged?: string[];
  completionMessage?: string;
}

export const agentReports = new Topic<AgentReport>("agent-reports", {
  deliveryGuarantee: "at-least-once",
});

// --- Pub/Sub: Chat response routing (two-way Slack/Discord) ---

export interface ChatResponse {
  conversationId: string;
  content: string;
  source: string;  // "web" | "slack" | "discord" | "api"
  metadata: Record<string, string>;
}

export const chatResponses = new Topic<ChatResponse>("chat-responses", {
  deliveryGuarantee: "at-least-once",
});

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

import { deserializeMessage, mapReportStatusToPhase, buildStatusContent, deserializeProgress, useNewContract } from "./agent-message-parser";

// Subscribe to agent reports and UPDATE existing agent_status (not create new agent_report)
const _ = new Subscription(agentReports, "store-agent-report", {
  handler: async (report) => {
    console.log("[DEBUG-AF] === PUB/SUB agent report received ===");
    console.log("[DEBUG-AF] taskId:", report.taskId, "status:", report.status);
    console.log("[DEBUG-AF] conversationId:", report.conversationId);
    console.log("[DEBUG-AF] content:", report.content?.substring(0, 200));

    // === NEW CONTRACT: AgentProgress → single agent_progress row per task ===
    if (useNewContract()) {
      const progress = deserializeProgress(report.content);
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
import { buildProgress } from "../builder/db";

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
import { taskEvents } from "../tasks/tasks";

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
import { healingEvents } from "../registry/registry";

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
  messageType: "chat" | "agent_report" | "task_start" | "context_transfer" | "agent_status" | "agent_thought" | "agent_progress";
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  // If set, TheFold works on this task autonomously
  linearTaskId?: string;
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
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
}

// --- Ownership helpers (OWASP A01:2025 — Broken Access Control) ---

/** Ensure the current user owns this conversation, or create ownership for new ones */
async function ensureConversationOwner(conversationId: string): Promise<void> {
  const auth = getAuthData();
  if (!auth) throw APIError.unauthenticated("not authenticated");

  const existing = await db.queryRow<{ owner_email: string }>`
    SELECT owner_email FROM conversations WHERE id = ${conversationId}
  `;

  if (existing) {
    if (existing.owner_email !== auth.email) {
      throw APIError.permissionDenied("du har ikke tilgang til denne samtalen");
    }
    return;
  }

  // New conversation — register ownership
  await db.exec`
    INSERT INTO conversations (id, owner_email)
    VALUES (${conversationId}, ${auth.email})
    ON CONFLICT (id) DO NOTHING
  `;
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

// --- Endpoints ---

// Send a message — either triggers agent work or direct chat
export const send = api(
  { method: "POST", path: "/chat/send", expose: true, auth: true },
  async (req: SendRequest): Promise<SendResponse> => {
    await ensureConversationOwner(req.conversationId);

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
        // === NEW CONTRACT: Check agent_progress messages with status="waiting" ===
        if (useNewContract()) {
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
              // Route to agent as clarification response
              const { agent: agentClient } = await import("~encore/clients");
              await agentClient.respondToClarification({
                taskId: progressMeta.taskId,
                response: req.message,
                conversationId: req.conversationId,
              });
              return { message: msg, agentTriggered: false };
            }
          }
        }

        // === LEGACY CONTRACT: Check agent_status messages ===
        const agentStatusMsg = await db.queryRow<{ content: string; metadata: string }>`
          SELECT content, metadata::text FROM messages
          WHERE conversation_id = ${req.conversationId}
            AND message_type = 'agent_status'
          ORDER BY created_at DESC LIMIT 1
        `;
        if (agentStatusMsg) {
          const agentParsed = deserializeMessage(agentStatusMsg.content);
          const meta = typeof agentStatusMsg.metadata === "string" ? JSON.parse(agentStatusMsg.metadata) : agentStatusMsg.metadata;
          // Detect clarification: new format "clarification" type OR legacy "Venter" phase without reviewData
          const isClarification = agentParsed?.type === "clarification"
            || (agentParsed?.type === "status" && agentParsed.phase === "needs_input")
            || (!agentParsed && (() => { try { const p = JSON.parse(agentStatusMsg.content); return p.phase === "Venter" && !p.reviewData; } catch { return false; } })());
          if (isClarification && meta?.taskId) {
            // Route to agent as clarification response
            const { agent: agentClient } = await import("~encore/clients");
            await agentClient.respondToClarification({
              taskId: meta.taskId,
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

    // Determine: agent work, project decomposition, or direct chat?
    const shouldTriggerAgent = req.linearTaskId && !req.chatOnly;

    // Project detection heuristics
    const isProjectRequest = !req.chatOnly && !req.linearTaskId && detectProjectRequest(req.message);

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

        let summary = `📋 **Prosjektplan** (${decomposition.estimatedTotalTasks} oppgaver i ${decomposition.phases.length} faser):\n\n`;
        for (const phase of decomposition.phases) {
          summary += `**Fase: ${phase.name}** — ${phase.description}\n`;
          for (const task of phase.tasks) {
            summary += `  - ${task.title}\n`;
          }
          summary += "\n";
        }
        summary += `\n_${decomposition.reasoning}_\n\nSkal jeg starte? (Du kan også justere planen)`;

        // Store plan summary as assistant message
        await db.exec`
          INSERT INTO messages (conversation_id, role, content, message_type, metadata)
          VALUES (${req.conversationId}, 'assistant', ${summary}, 'agent_report',
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

      // Fire off agent work asynchronously via pub/sub
      // The agent will report back via agentReports topic
      await agent.startTask({
        conversationId: req.conversationId,
        taskId: req.linearTaskId!,
        userMessage: req.message,
        modelOverride: req.modelOverride ?? undefined,
        repoName: req.repoName,
        repoOwner: req.repoOwner,
      });

      // Store a "task started" message
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${req.conversationId}, 'assistant',
                ${"Jeg har startet arbeidet med " + req.linearTaskId + ". Jeg rapporterer fremgang her."},
                'task_start', ${JSON.stringify({ taskId: req.linearTaskId })})
      `;

      // Create initial agent_status message for immediate frontend rendering (new contract)
      const initialStatus = buildStatusContent("Forbereder", [
        { label: "Starter oppgave...", status: "active" },
      ]);
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${req.conversationId}, 'assistant', ${initialStatus}, 'agent_status',
          ${JSON.stringify({ taskId: req.linearTaskId, status: "working" })}::jsonb)
      `;

      return {
        message: msg,
        agentTriggered: true,
        taskId: req.linearTaskId,
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
) {
  // Start heartbeat — updates updated_at every 10s so frontend knows we're alive
  const heartbeat = setInterval(async () => {
    try {
      await db.exec`UPDATE messages SET updated_at = NOW() WHERE id = ${placeholderId}::uuid`;
    } catch {}
  }, 10000);

  try {
    console.log("[DEBUG-AF] processAIResponse started for conversation:", conversationId);

    const { ai } = await import("~encore/clients");
    const { memory } = await import("~encore/clients");

    // Detect intent for richer context
    const intent = detectMessageIntent(userContent);

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

    // Step 3: Resolve skills (try/catch — don't crash on failure)
    let resolvedSkills = { result: { injectedPrompt: "", injectedSkillIds: [] as string[], tokensUsed: 0, preRunResults: [] as any[], postRunSkills: [] as any[] } };
    try {
      const { skills: skillsClient } = await import("~encore/clients");
      resolvedSkills = await skillsClient.resolve({
        context: {
          task: userContent,
          userId: auth.userID,
          repo: repoName,
          totalTokenBudget: 4000,
        },
      });
    } catch (e) {
      console.error("Skills resolve failed:", e);
    }

    if (isCancelled(conversationId)) return;

    // Step 4: Search memories — only for complex queries (saves tokens and time)
    let memories: { results: { content: string }[] } = { results: [] };
    if (intent === "task_request" || intent === "repo_review" || userContent.length > 100) {
      try {
        memories = await memory.search({ query: userContent, limit: 5 });
      } catch (e) {
        console.error("Memory search failed:", e);
      }
    }

    // Step 4.5: Fetch GitHub context if in repo-chat
    let repoContext = "";

    if (repoName && repoOwner) {
      if (isCancelled(conversationId)) return;

      try {
        const { github } = await import("~encore/clients");

        // Fetch file tree (try/catch — empty repos return fallback)
        let tree: { tree: string[]; treeString: string; empty?: boolean } = { tree: [], treeString: "" };
        try {
          tree = await github.getTree({ owner: repoOwner, repo: repoName });
        } catch (e) {
          console.warn(`getTree failed for ${repoOwner}/${repoName} (likely empty repo):`, e);
        }
        if (tree?.tree?.length > 0) {
          repoContext += `\nFilstruktur for ${repoName} (${tree.tree.length} filer):\n${tree.treeString || tree.tree.join("\n")}`;
        }

        // Find relevant files based on the user's message
        try {
          const relevant = await github.findRelevantFiles({
            owner: repoOwner,
            repo: repoName,
            taskDescription: userContent,
            tree: tree.tree,
          });

          // Fetch content for top 5 relevant files
          const filesToFetch = (relevant.paths || []).slice(0, 5);
          for (const filePath of filesToFetch) {
            try {
              const file = await github.getFile({ owner: repoOwner, repo: repoName, path: filePath });
              if (file?.content) {
                const trimmed = file.content.split("\n").slice(0, 200).join("\n");
                repoContext += `\n\n--- ${filePath} ---\n${trimmed}`;
              }
            } catch {
              // Skip files that fail to load
            }
          }
        } catch {
          // Fallback: fetch key files
          for (const keyFile of ["package.json", "README.md", "encore.app"]) {
            try {
              const file = await github.getFile({ owner: repoOwner, repo: repoName, path: keyFile });
              if (file?.content) {
                repoContext += `\n\n--- ${keyFile} ---\n${file.content.slice(0, 3000)}`;
              }
            } catch {
              // Skip
            }
          }
        }
      } catch (e) {
        console.error("GitHub context fetch failed:", e);
      }

      // If repoContext is still empty after all attempts, tell AI the repo is empty
      if (!repoContext || repoContext.length === 0) {
        repoContext = "\n\nDette repoet er TOMT — det har ingen filer. GitHub returnerte at repoet er tomt. Du MÅ informere brukeren om at repoet er tomt. IKKE dikt opp filer.";
      }
    }

    if (isCancelled(conversationId)) return;

    // Step 5: Determine model — manual override or auto-routing (C1/C2)
    let selectedModel: string | undefined;
    if (modelOverride) {
      selectedModel = modelOverride;
      console.log("[DEBUG-AF] Using manual model override:", selectedModel);
    } else {
      // C2: Auto-routing based on message complexity
      const complexity = quickComplexity(userContent);
      if (complexity <= 3) selectedModel = "claude-haiku-4-5-20251001";
      else if (complexity <= 7) selectedModel = undefined; // Sonnet default
      else selectedModel = "claude-opus-4-5-20251101";
      console.log("[DEBUG-AF] Auto-routed, complexity:", complexity, "model:", selectedModel || "(default sonnet)");
    }

    // Call AI with tools (ALWAYS includes CHAT_TOOLS — AI decides whether to use them)
    console.log("[DEBUG-AF] Calling ai.chat with", history.length, "messages, intent:", intent);
    let aiResponse;
    try {
      aiResponse = await ai.chat({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        memoryContext: (memories.results || []).map((r) => r.content),
        systemContext: "direct_chat",
        model: selectedModel,
        repoName,
        repoOwner,
        repoContext: repoContext || undefined,
        conversationId,
        aiName,
      });
    } catch (e) {
      console.error("AI call failed:", e);
      aiResponse = {
        content: "Beklager, jeg klarte ikke å generere et svar. Feilmelding: " + (e instanceof Error ? e.message : "Ukjent feil"),
        tokensUsed: 0,
        stopReason: "error",
        modelUsed: "none",
        costUsd: 0,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        truncated: false,
      };
    }

    console.log("[DEBUG-AH] ai.chat returned content length:", aiResponse.content?.length);
    console.log("[DEBUG-AH] Tools used:", aiResponse.toolsUsed || "none");
    console.log("[DEBUG-AH] Stop reason:", aiResponse.stopReason);

    // Handle truncated responses
    if (aiResponse.truncated) {
      aiResponse.content += "\n\n---\nSvaret ble avbrutt fordi maks antall tokens ble nådd. Prøv et mer spesifikt spørsmål, eller be om at svaret deles opp.";
    }

    // Handle empty content — when tools were used but AI returned no text
    if (!aiResponse.content || !aiResponse.content.trim()) {
      console.warn("[DEBUG-AH] AI returned empty content");
      if (aiResponse.toolsUsed && aiResponse.toolsUsed.length > 0) {
        aiResponse.content = `Utførte: ${aiResponse.toolsUsed.join(", ")}`;
        console.log("[DEBUG-AH] Using tool summary as fallback:", aiResponse.content);
      } else {
        aiResponse.content = "Beklager, jeg fikk ikke generert et svar. Prøv igjen.";
      }
    }

    console.log(`AI Response: ${aiResponse.usage.totalTokens} tokens (${aiResponse.usage.inputTokens} inn, ${aiResponse.usage.outputTokens} ut), kostnad: $${aiResponse.costUsd.toFixed(4)}, stop: ${aiResponse.stopReason}`);

    if (isCancelled(conversationId)) return;

    // Step 6: Replace placeholder with actual response + metadata
    await updateMessageContent(placeholderId, aiResponse.content);
    await updateMessageType(placeholderId, "chat");

    // Save token/cost metadata on the AI message (include lastCreatedTaskId for BUG 7 fix)
    await db.exec`UPDATE messages SET metadata = ${JSON.stringify({
      model: aiResponse.modelUsed,
      tokens: aiResponse.usage,
      cost: aiResponse.costUsd,
      stopReason: aiResponse.stopReason,
      truncated: aiResponse.truncated,
      toolsUsed: aiResponse.toolsUsed || [],
      ...(aiResponse.lastCreatedTaskId ? { lastCreatedTaskId: aiResponse.lastCreatedTaskId } : {}),
    })}::jsonb WHERE id = ${placeholderId}::uuid`;

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
      WHERE c.owner_email = ${auth.email}
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    const convList: ConversationSummary[] = [];
    for await (const row of rows) {
      const titleSource = (row.firstUserMessage as string) || (row.lastMessage as string);
      const lastMsg = row.lastMessage as string;
      convList.push({
        id: row.id as string,
        title: titleSource.substring(0, 80) + (titleSource.length > 80 ? "..." : ""),
        lastMessage: lastMsg,
        lastActivity: row.lastActivity as string,
      });
    }

    return { conversations: convList };
  }
);

// --- Repo Activity ---

interface RepoActivity {
  id: string;
  repoName: string;
  eventType: string;
  title: string;
  description: string | null;
  userId: string | null;
  metadata: string | null;
  createdAt: string;
}

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

export const getRepoActivity = api(
  { method: "GET", path: "/chat/activity/:repoName", expose: true, auth: true },
  async (req: { repoName: string }): Promise<{ activities: RepoActivity[] }> => {
    const rows = db.query<RepoActivity>`
      SELECT id, repo_name as "repoName", event_type as "eventType", title, description,
             user_id as "userId", metadata, created_at as "createdAt"
      FROM repo_activity
      WHERE repo_name = ${req.repoName}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const activities: RepoActivity[] = [];
    for await (const row of rows) activities.push(row);
    return { activities };
  }
);

// --- Cost Summary ---

interface CostPeriod {
  total: number;
  tokens: number;
  count: number;
}

interface ModelCost {
  model: string;
  total: number;
  tokens: number;
  count: number;
}

interface DailyTrend {
  date: string;
  total: number;
  tokens: number;
}

interface CostSummary {
  today: CostPeriod;
  thisWeek: CostPeriod;
  thisMonth: CostPeriod;
  perModel: ModelCost[];
  dailyTrend: DailyTrend[];
}

export const getCostSummary = api(
  { method: "GET", path: "/chat/costs", expose: true, auth: true },
  async (): Promise<CostSummary> => {
    const today = await db.queryRow<CostPeriod>`
      SELECT
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= CURRENT_DATE
    `;

    const thisWeek = await db.queryRow<CostPeriod>`
      SELECT
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= date_trunc('week', CURRENT_DATE)
    `;

    const thisMonth = await db.queryRow<CostPeriod>`
      SELECT
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= date_trunc('month', CURRENT_DATE)
    `;

    // Per-model breakdown
    const perModelRows = await db.query<ModelCost>`
      SELECT
        metadata->>'model' as model,
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'model' IS NOT NULL
      AND created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY metadata->>'model'
      ORDER BY total DESC
    `;
    const perModel: ModelCost[] = [];
    for await (const row of perModelRows) perModel.push(row);

    // Daily trend last 14 days
    const dailyRows = await db.query<DailyTrend>`
      SELECT
        created_at::date::text as date,
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY created_at::date
      ORDER BY date ASC
    `;
    const dailyTrend: DailyTrend[] = [];
    for await (const row of dailyRows) dailyTrend.push(row);

    return {
      today: today || { total: 0, tokens: 0, count: 0 },
      thisWeek: thisWeek || { total: 0, tokens: 0, count: 0 },
      thisMonth: thisMonth || { total: 0, tokens: 0, count: 0 },
      perModel,
      dailyTrend,
    };
  }
);

// --- Context Transfer ---

interface TransferContextRequest {
  sourceConversationId: string;
  targetRepo: string;
}

interface TransferContextResponse {
  targetConversationId: string;
  contextSummary: string;
  success: boolean;
}

// Transfer context from main chat to a repo chat
export const transferContext = api(
  { method: "POST", path: "/chat/transfer-context", expose: true, auth: true },
  async (req: TransferContextRequest): Promise<TransferContextResponse> => {
    // Verify source ownership and register target ownership
    await verifyConversationAccess(req.sourceConversationId);

    // 1. Hent alle meldinger fra source conversation
    const sourceRows = await db.query<Message>`
      SELECT id, conversation_id as "conversationId", role, content,
             message_type as "messageType", metadata, created_at as "createdAt",
             updated_at as "updatedAt"
      FROM messages
      WHERE conversation_id = ${req.sourceConversationId}
      ORDER BY created_at ASC
    `;

    const sourceMessages: Message[] = [];
    for await (const row of sourceRows) sourceMessages.push(row);

    if (sourceMessages.length === 0) {
      throw APIError.invalidArgument("Ingen meldinger i kildesamtalen");
    }

    // 2. Bygg context
    const conversationText = sourceMessages
      .map((m) => `${m.role === "user" ? "Bruker" : "TheFold"}: ${m.content}`)
      .join("\n\n");

    // 3. Prøv AI-sammendrag, fall tilbake til rå meldinger hvis det feiler
    let summaryText: string;
    try {
      const { ai } = await import("~encore/clients");
      const summary = await ai.chat({
        messages: [
          {
            role: "user",
            content: `Følgende er en planleggingssamtale. Ekstraher KUN:
- Hovedmål for prosjektet
- Tekniske krav
- Arkitektur-beslutninger
- Viktige constraints

Ignorer småprat, repetisjon, og irrelevante detaljer.

SAMTALE:
${conversationText}

Ekstraher nødvendig context som skal sendes til utviklings-teamet:`,
          },
        ],
        systemContext: "direct_chat",
        memoryContext: [],
      });
      summaryText = summary.content;
    } catch {
      // AI-sammendrag feilet — bruk siste meldinger direkte
      const recent = sourceMessages.slice(-10);
      summaryText = recent
        .map((m) => `${m.role === "user" ? "Bruker" : "TheFold"}: ${m.content}`)
        .join("\n\n");
    }

    // 4. Opprett ny conversation i target repo
    const targetConvId = `repo-${req.targetRepo}-${Date.now()}`;

    // Register ownership on target conversation
    await ensureConversationOwner(targetConvId);

    // 5. Legg til system-melding med context
    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (
        ${targetConvId},
        'assistant',
        ${`Context fra hovedchat:\n\n${summaryText}`},
        'context_transfer',
        ${JSON.stringify({ sourceConversationId: req.sourceConversationId })}
      )
    `;

    return {
      targetConversationId: targetConvId,
      contextSummary: summaryText,
      success: true,
    };
  }
);

// --- File upload ---

interface UploadFileRequest {
  conversationId: string;
  filename: string;
  contentType: string;
  content: string;
  sizeBytes: number;
}

interface UploadFileResponse {
  fileId: string;
  filename: string;
}

export const uploadFile = api(
  { method: "POST", path: "/chat/upload", expose: true, auth: true },
  async (req: UploadFileRequest): Promise<UploadFileResponse> => {
    await ensureConversationOwner(req.conversationId);

    // Limit: 500KB max
    if (req.sizeBytes > 500_000) {
      throw APIError.invalidArgument("Fil for stor — maks 500KB");
    }

    const file = await db.queryRow<{ id: string }>`
      INSERT INTO chat_files (conversation_id, filename, content_type, content, size_bytes)
      VALUES (${req.conversationId}, ${req.filename}, ${req.contentType}, ${req.content}, ${req.sizeBytes})
      RETURNING id
    `;

    if (!file) throw APIError.internal("failed to store file");

    return { fileId: file.id, filename: req.filename };
  }
);

// Delete a conversation and all its messages
export const deleteConversation = api(
  { method: "POST", path: "/chat/delete", expose: true, auth: true },
  async (req: { conversationId: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authenticated");

    // Verify ownership
    const conv = await db.queryRow<{ owner_email: string }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;

    if (!conv || conv.owner_email !== auth.email) {
      throw APIError.permissionDenied("du har ikke tilgang til denne samtalen");
    }

    // Delete files, messages, then conversation record
    await db.exec`DELETE FROM chat_files WHERE conversation_id = ${req.conversationId}`;
    await db.exec`DELETE FROM messages WHERE conversation_id = ${req.conversationId}`;
    await db.exec`DELETE FROM conversations WHERE id = ${req.conversationId}`;

    return { success: true };
  }
);

// --- ZD: Chat-based review actions (approve/changes/reject from chat) ---

export const approveFromChat = api(
  { method: "POST", path: "/chat/review/approve", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string }): Promise<{ prUrl: string }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    // Verify conversation ownership (OWASP A01)
    const conv = await db.queryRow<{ owner_email: string }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;
    if (!conv || conv.owner_email !== authData.email) {
      throw APIError.permissionDenied("Not your conversation");
    }

    const { agent } = await import("~encore/clients");
    return agent.approveReview({ reviewId: req.reviewId });
  }
);

export const requestChangesFromChat = api(
  { method: "POST", path: "/chat/review/changes", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string; feedback: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    // Verify conversation ownership (OWASP A01)
    const conv = await db.queryRow<{ owner_email: string }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;
    if (!conv || conv.owner_email !== authData.email) {
      throw APIError.permissionDenied("Not your conversation");
    }

    const { agent } = await import("~encore/clients");
    await agent.requestChanges({ reviewId: req.reviewId, feedback: req.feedback });
    return { success: true };
  }
);

export const rejectFromChat = api(
  { method: "POST", path: "/chat/review/reject", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string; feedback?: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    // Verify conversation ownership (OWASP A01)
    const conv = await db.queryRow<{ owner_email: string }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;
    if (!conv || conv.owner_email !== authData.email) {
      throw APIError.permissionDenied("Not your conversation");
    }

    const { agent } = await import("~encore/clients");
    await agent.rejectReview({ reviewId: req.reviewId, reason: req.feedback });
    return { success: true };
  }
);

// G5: Notifications endpoint — returns recent agent reports and status messages
export const notifications = api(
  { method: "GET", path: "/chat/notifications", expose: true, auth: true },
  async (): Promise<{ notifications: Array<{ id: string; content: string; type: string; createdAt: string }> }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    const rows = db.query<{ id: string; content: string; message_type: string; created_at: Date }>`
      SELECT m.id, m.content, m.message_type, m.created_at
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.owner_email = ${authData.email}
        AND m.message_type IN ('agent_report', 'agent_status', 'task_start')
        AND m.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY m.created_at DESC
      LIMIT 20
    `;
    const result: Array<{ id: string; content: string; type: string; createdAt: string }> = [];
    for await (const row of rows) {
      result.push({
        id: row.id,
        content: String(row.content).substring(0, 100),
        type: row.message_type,
        createdAt: String(row.created_at),
      });
    }
    return { notifications: result };
  }
);

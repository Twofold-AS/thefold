import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic, Subscription } from "encore.dev/pubsub";

// --- Database ---

const db = new SQLDatabase("chat", {
  migrations: "./migrations",
});

// --- Pub/Sub: Agent reports back to chat ---

export interface AgentReport {
  conversationId: string;
  taskId: string;
  content: string;
  status: "working" | "completed" | "failed" | "needs_input";
  prUrl?: string;
  filesChanged?: string[];
}

export const agentReports = new Topic<AgentReport>("agent-reports", {
  deliveryGuarantee: "at-least-once",
});

// Subscribe to agent reports and store them as messages
const _ = new Subscription(agentReports, "store-agent-report", {
  handler: async (report) => {
    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (
        ${report.conversationId},
        'assistant',
        ${report.content},
        'agent_report',
        ${JSON.stringify({
          taskId: report.taskId,
          status: report.status,
          prUrl: report.prUrl,
          filesChanged: report.filesChanged,
        })}
      )
    `;
  },
});

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
  messageType: "chat" | "agent_report" | "task_start" | "context_transfer" | "agent_status";
  metadata: string | null;
  createdAt: string;
}

// --- Helper: update message content in-place (for progress tracking) ---

async function updateMessageContent(messageId: string, content: string) {
  await db.exec`UPDATE messages SET content = ${content} WHERE id = ${messageId}::uuid`;
}

async function updateMessageType(messageId: string, messageType: string) {
  await db.exec`UPDATE messages SET message_type = ${messageType} WHERE id = ${messageId}::uuid`;
}

async function updateAgentStatus(messageId: string, status: object) {
  await db.exec`UPDATE messages SET content = ${JSON.stringify({ type: "agent_status", ...status })} WHERE id = ${messageId}::uuid`;
}

// --- Timeout helper ---

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    console.error(`Call timed out after ${ms}ms, using fallback`);
    return fallback;
  }
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
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (${req.conversationId}, 'user', ${req.message}, 'chat', ${userMetadata})
      RETURNING id, conversation_id as "conversationId", role, content,
                message_type as "messageType", metadata, created_at as "createdAt"
    `;

    if (!msg) throw APIError.internal("failed to store message");

    // Determine: agent work, project decomposition, or direct chat?
    const shouldTriggerAgent = req.linearTaskId && !req.chatOnly;

    // Project detection heuristics
    const isProjectRequest = !req.chatOnly && !req.linearTaskId && detectProjectRequest(req.message);

    if (isProjectRequest) {
      // Large project request — decompose into phases + tasks
      const { ai: aiClient } = await import("~encore/clients");
      const { github: ghClient } = await import("~encore/clients");
      const { agent: agentClient } = await import("~encore/clients");

      try {
        // Get project structure
        const tree = await ghClient.getTree({ owner: "Twofold-AS", repo: "thefold" });

        // Decompose project
        const decomposition = await aiClient.decomposeProject({
          userMessage: req.message,
          repoOwner: "Twofold-AS",
          repoName: "thefold",
          projectStructure: tree.treeString,
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
      });

      // Store a "task started" message
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${req.conversationId}, 'assistant',
                ${"🔧 Jeg har startet arbeidet med " + req.linearTaskId + ". Jeg rapporterer fremgang her."},
                'task_start', ${JSON.stringify({ taskId: req.linearTaskId })})
      `;

      return {
        message: msg,
        agentTriggered: true,
        taskId: req.linearTaskId,
      };
    } else {
      // Direct chat — return immediately, process AI async
      // Insert a placeholder agent_status message
      const placeholderMsg = await db.queryRow<Message>`
        INSERT INTO messages (conversation_id, role, content, message_type)
        VALUES (${req.conversationId}, 'assistant',
                ${JSON.stringify({
                  type: "agent_status",
                  phase: "Tenker",
                  steps: [{ label: "Starter...", icon: "search", status: "active" }],
                })},
                'agent_status')
        RETURNING id, conversation_id as "conversationId", role, content,
                  message_type as "messageType", metadata, created_at as "createdAt"
      `;
      if (!placeholderMsg) throw APIError.internal("failed to create placeholder message");

      // Fire-and-forget async processing
      processAIResponse(
        req.conversationId,
        req.message,
        placeholderMsg.id,
        { email: getAuthData()!.email, userID: getAuthData()!.userID },
        req.skillIds,
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

async function processAIResponse(
  conversationId: string,
  userContent: string,
  placeholderId: string,
  auth: { email: string; userID: string },
  skillIds?: string[],
) {
  const { ai } = await import("~encore/clients");
  const { memory } = await import("~encore/clients");

  // Step 1: Update status — understanding request
  await updateAgentStatus(placeholderId, {
    phase: "Forbereder",
    steps: [
      { label: "Forstår forespørselen", icon: "search", status: "done" },
      { label: "Henter relevante skills", icon: "sparkle", status: "active" },
      { label: "Søker i minne", icon: "search", status: "pending" },
      { label: "Genererer svar", icon: "code", status: "pending" },
    ],
  });

  if (isCancelled(conversationId)) return;

  // Step 2: Get conversation history
  const historyRows = await db.query<Message>`
    SELECT id, conversation_id as "conversationId", role, content,
           message_type as "messageType", metadata, created_at as "createdAt"
    FROM messages
    WHERE conversation_id = ${conversationId} AND message_type != 'agent_status'
    ORDER BY created_at DESC LIMIT 30
  `;
  const history: Message[] = [];
  for await (const row of historyRows) history.push(row);
  history.reverse();

  // Step 3: Search memories with timeout
  await updateAgentStatus(placeholderId, {
    phase: "Forbereder",
    steps: [
      { label: "Forstår forespørselen", icon: "search", status: "done" },
      { label: "Skills klar", icon: "sparkle", status: "done" },
      { label: "Søker i minne", icon: "search", status: "active" },
      { label: "Genererer svar", icon: "code", status: "pending" },
    ],
  });

  if (isCancelled(conversationId)) return;

  const memories = await withTimeout(
    memory.search({ query: userContent, limit: 5 }),
    5000,
    { results: [], totalFound: 0 }
  );

  // Step 4: Call AI with timeout
  await updateAgentStatus(placeholderId, {
    phase: "Genererer svar",
    steps: [
      { label: "Forstår forespørselen", icon: "search", status: "done" },
      { label: "Skills klar", icon: "sparkle", status: "done" },
      { label: `${memories.results?.length || 0} minner funnet`, icon: "search", status: "done" },
      { label: "Genererer svar...", icon: "code", status: "active" },
    ],
  });

  if (isCancelled(conversationId)) return;

  const aiResponse = await withTimeout(
    ai.chat({
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      memoryContext: (memories.results || []).map((r: { content: string }) => r.content),
      systemContext: "direct_chat",
    }),
    60000,
    { content: "Beklager, AI-kallet tok for lang tid. Prøv igjen med en enklere melding.", tokensUsed: 0, stopReason: "timeout", modelUsed: "none", costUsd: 0 }
  );

  if (isCancelled(conversationId)) return;

  // Step 5: Replace placeholder with actual response
  await updateMessageContent(placeholderId, aiResponse.content);
  await updateMessageType(placeholderId, "chat");

  // Extract memories (fire-and-forget)
  memory.extract({
    conversationId,
    content: `User: ${userContent}\nAssistant: ${aiResponse.content}`,
    category: "conversation",
  }).catch(() => {});
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
                 message_type as "messageType", metadata, created_at as "createdAt"
          FROM messages
          WHERE conversation_id = ${req.conversationId} AND created_at < ${req.before}
          ORDER BY created_at DESC LIMIT ${limit + 1}
        `
      : await db.query<Message>`
          SELECT id, conversation_id as "conversationId", role, content,
                 message_type as "messageType", metadata, created_at as "createdAt"
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
    const rows = await db.query`
      SELECT
        m.conversation_id as id,
        m.content as "lastMessage",
        m.created_at as "lastActivity"
      FROM messages m
      INNER JOIN (
        SELECT conversation_id, MAX(created_at) as max_created
        FROM messages GROUP BY conversation_id
      ) latest ON m.conversation_id = latest.conversation_id
                AND m.created_at = latest.max_created
      LEFT JOIN conversations c ON c.id = m.conversation_id
      WHERE c.owner_email = ${auth.email} OR c.id IS NULL
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    const convList: ConversationSummary[] = [];
    for await (const row of rows) {
      const lastMsg = row.lastMessage as string;
      convList.push({
        id: row.id as string,
        title: lastMsg.substring(0, 80) + (lastMsg.length > 80 ? "..." : ""),
        lastMessage: lastMsg,
        lastActivity: row.lastActivity as string,
      });
    }

    return { conversations: convList };
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
             message_type as "messageType", metadata, created_at as "createdAt"
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

    if (conv && conv.owner_email !== auth.email) {
      throw APIError.permissionDenied("du har ikke tilgang til denne samtalen");
    }

    // Delete messages first, then conversation record
    await db.exec`DELETE FROM messages WHERE conversation_id = ${req.conversationId}`;
    await db.exec`DELETE FROM conversations WHERE id = ${req.conversationId}`;

    return { success: true };
  }
);

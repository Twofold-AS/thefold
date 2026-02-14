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

// --- Types ---

interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  messageType: "chat" | "agent_report" | "task_start" | "context_transfer";
  metadata: string | null;
  createdAt: string;
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

    // Determine: agent work or direct chat?
    const shouldTriggerAgent = req.linearTaskId && !req.chatOnly;

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
      // Direct chat — get AI response immediately
      const { ai } = await import("~encore/clients");
      const { memory } = await import("~encore/clients");

      // Get conversation history
      const historyRows = await db.query<Message>`
        SELECT id, conversation_id as "conversationId", role, content,
               message_type as "messageType", metadata, created_at as "createdAt"
        FROM messages
        WHERE conversation_id = ${req.conversationId}
        ORDER BY created_at DESC LIMIT 30
      `;
      const history: Message[] = [];
      for await (const row of historyRows) history.push(row);
      history.reverse();

      // Get relevant memories
      const memories = await memory.search({ query: req.message, limit: 5 });

      // Get AI response
      const response = await ai.chat({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        memoryContext: memories.results.map((r) => r.content),
        systemContext: "direct_chat",
      });

      // Store response
      const reply = await db.queryRow<Message>`
        INSERT INTO messages (conversation_id, role, content, message_type)
        VALUES (${req.conversationId}, 'assistant', ${response.content}, 'chat')
        RETURNING id, conversation_id as "conversationId", role, content,
                  message_type as "messageType", metadata, created_at as "createdAt"
      `;

      if (!reply) throw APIError.internal("failed to store reply");

      // Extract memories from exchange
      await memory.extract({
        conversationId: req.conversationId,
        content: `User: ${req.message}\nAssistant: ${response.content}`,
        category: "conversation",
      });

      return { message: reply, agentTriggered: false };
    }
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

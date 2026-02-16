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
  updatedAt: string;
}

// --- Helper: update message content in-place (for progress tracking) ---

async function updateMessageContent(messageId: string, content: string) {
  await db.exec`UPDATE messages SET content = ${content} WHERE id = ${messageId}::uuid`;
}

async function updateMessageType(messageId: string, messageType: string) {
  await db.exec`UPDATE messages SET message_type = ${messageType} WHERE id = ${messageId}::uuid`;
}

async function updateAgentStatus(messageId: string, status: object) {
  await db.exec`UPDATE messages SET content = ${JSON.stringify({ type: "agent_status", ...status })}, updated_at = NOW() WHERE id = ${messageId}::uuid`;
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
  repoName?: string,
  aiName?: string,
) {
  // Start heartbeat — updates updated_at every 10s so frontend knows we're alive
  const heartbeat = setInterval(async () => {
    try {
      await db.exec`UPDATE messages SET updated_at = NOW() WHERE id = ${placeholderId}::uuid`;
    } catch {}
  }, 10000);

  try {
    const { ai } = await import("~encore/clients");
    const { memory } = await import("~encore/clients");

    // Detect intent for richer steps
    const intent = detectMessageIntent(userContent);

    // Build dynamic steps based on what we'll actually do
    const initialPhase = intent === "repo_review" ? "Forbereder" : intent === "task_request" ? "Planlegger" : "Tenker";
    const initialTitle = intent === "repo_review" ? `Samler kontekst for ${repoName || "repoet"}` : intent === "task_request" ? "Forstår forespørselen" : "Forbereder svar";

    const dynamicSteps: Array<{ label: string; icon: string; status: "active" | "pending" | "done" }> = [];
    dynamicSteps.push({ label: "Forstår forespørselen", icon: "search", status: "active" });
    if (repoName) {
      dynamicSteps.push({ label: `Henter filer fra ${repoName}`, icon: "service", status: "pending" });
    }
    if (intent === "task_request" || intent === "repo_review" || userContent.length > 100) {
      dynamicSteps.push({ label: "Søker i tidligere erfaringer", icon: "memory", status: "pending" });
    }
    if (intent === "task_request") {
      dynamicSteps.push({ label: "Planlegger oppgave", icon: "plan", status: "pending" });
    } else if (intent === "repo_review") {
      dynamicSteps.push({ label: "Skriver analyse", icon: "write", status: "pending" });
    } else {
      dynamicSteps.push({ label: "Formulerer svar", icon: "write", status: "pending" });
    }

    await updateAgentStatus(placeholderId, {
      phase: initialPhase,
      title: initialTitle,
      steps: dynamicSteps,
    });

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
    let resolvedSkills = { result: { injectedPrompt: "", injectedSkillIds: [] as string[], tokensUsed: 0, preRunResults: [], postRunSkills: [] } };
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

    // Mark first step done, advance to next
    const postSkillsSteps = dynamicSteps.map((s, i) => {
      if (i === 0) return { ...s, status: "done" as const };
      if (i === 1) return { ...s, status: "active" as const };
      return s;
    });
    if (resolvedSkills.result.injectedSkillIds?.length > 0) {
      postSkillsSteps.splice(1, 0, { label: `${resolvedSkills.result.injectedSkillIds.length} skills aktive`, icon: "sparkle", status: "done" });
    }

    await updateAgentStatus(placeholderId, {
      phase: initialPhase,
      title: initialTitle,
      steps: postSkillsSteps,
    });

    if (isCancelled(conversationId)) return;

    // Step 4: Search memories — only for complex queries (saves tokens and time)
    let memories = { results: [] as { content: string }[], totalFound: 0 };
    if (intent === "task_request" || intent === "repo_review" || userContent.length > 100) {
      try {
        memories = await memory.search({ query: userContent, limit: 5 });
      } catch (e) {
        console.error("Memory search failed:", e);
      }
    }

    // Step 4.5: Fetch GitHub context if in repo-chat
    let repoContext = "";

    if (repoName) {
      await updateAgentStatus(placeholderId, {
        phase: "Analyserer",
        title: `Ser over ${repoName}`,
        steps: [
          { label: "Analyserer meldingen", icon: "search", status: "done" },
          { label: `${resolvedSkills.result.injectedSkillIds?.length || 0} skills funnet`, icon: "sparkle", status: "done" },
          { label: `${memories.results?.length || 0} relevante minner`, icon: "search", status: "done" },
          { label: "Henter filstruktur fra GitHub", icon: "service", status: "active" },
          { label: "Genererer svar", icon: "code", status: "pending" },
        ],
      });

      if (isCancelled(conversationId)) return;

      try {
        const { github } = await import("~encore/clients");

        // Fetch file tree
        const tree = await github.getTree({ owner: "Twofold-AS", repo: repoName });
        if (tree?.tree?.length > 0) {
          repoContext += `\nFilstruktur for ${repoName} (${tree.tree.length} filer):\n${tree.treeString}`;
        }

        await updateAgentStatus(placeholderId, {
          phase: "Analyserer",
          title: `Ser over ${repoName}`,
          steps: [
            { label: "Analyserer meldingen", icon: "search", status: "done" },
            { label: `${resolvedSkills.result.injectedSkillIds?.length || 0} skills funnet`, icon: "sparkle", status: "done" },
            { label: `${memories.results?.length || 0} relevante minner`, icon: "search", status: "done" },
            { label: `Filstruktur hentet (${tree.tree?.length || 0} filer)`, icon: "service", status: "done" },
            { label: "Henter relevante filer", icon: "code", status: "active" },
            { label: "Genererer svar", icon: "code", status: "pending" },
          ],
        });

        // Find relevant files based on the user's message
        try {
          const relevant = await github.findRelevantFiles({
            owner: "Twofold-AS",
            repo: repoName,
            taskDescription: userContent,
            tree: tree.tree,
          });

          // Fetch content for top 5 relevant files
          const filesToFetch = (relevant.paths || []).slice(0, 5);
          for (const filePath of filesToFetch) {
            try {
              const file = await github.getFile({ owner: "Twofold-AS", repo: repoName, path: filePath });
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
              const file = await github.getFile({ owner: "Twofold-AS", repo: repoName, path: keyFile });
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

    // Update status — all prep done, now generating
    const preAiPhase = intent === "repo_review" ? "Analyserer" : intent === "task_request" ? "Utfører" : "Genererer";
    const preAiTitle = intent === "repo_review" ? "Gjennomgår kodebasen" : intent === "task_request" ? "Gjennomfører handlinger" : "Skriver svar";
    const preAiSteps: Array<{ label: string; icon: string; status: "done" | "active" }> = [
      { label: "Forstår forespørselen", icon: "search", status: "done" },
    ];
    if (resolvedSkills.result.injectedSkillIds?.length > 0) {
      preAiSteps.push({ label: `${resolvedSkills.result.injectedSkillIds.length} skills aktive`, icon: "sparkle", status: "done" });
    }
    if (memories.results?.length > 0) {
      preAiSteps.push({ label: `${memories.results.length} relevante minner`, icon: "memory", status: "done" });
    }
    if (repoName) {
      preAiSteps.push({ label: "Repo-kontekst hentet", icon: "service", status: "done" });
    }
    preAiSteps.push({
      label: intent === "task_request" ? "Planlegger oppgave" : intent === "repo_review" ? "Skriver analyse" : "Formulerer svar",
      icon: "write",
      status: "active",
    });

    await updateAgentStatus(placeholderId, {
      phase: preAiPhase,
      title: preAiTitle,
      steps: preAiSteps,
    });

    if (isCancelled(conversationId)) return;

    // Step 5: Call AI (try/catch — graceful error message on failure)
    let aiResponse;
    try {
      aiResponse = await ai.chat({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        memoryContext: (memories.results || []).map((r) => r.content),
        systemContext: "direct_chat",
        repoName,
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

    // Handle truncated responses
    if (aiResponse.truncated) {
      aiResponse.content += "\n\n---\nSvaret ble avbrutt fordi maks antall tokens ble nådd. Prøv et mer spesifikt spørsmål, eller be om at svaret deles opp.";
    }

    console.log(`AI Response: ${aiResponse.usage.totalTokens} tokens (${aiResponse.usage.inputTokens} inn, ${aiResponse.usage.outputTokens} ut), kostnad: $${aiResponse.costUsd.toFixed(4)}, stop: ${aiResponse.stopReason}`);

    if (isCancelled(conversationId)) return;

    // Show tool usage if any
    if (aiResponse.toolsUsed && aiResponse.toolsUsed.length > 0) {
      const toolLabels: Record<string, string> = {
        create_task: "Opprettet ny task",
        start_task: "Startet agent på task",
        list_tasks: "Hentet task-oversikt",
        read_file: "Leste fil fra repo",
        search_code: "Søkte i kodebasen",
      };
      const toolSteps = aiResponse.toolsUsed.map((t: string) => ({
        label: toolLabels[t] || t,
        icon: "service",
        status: "done" as const,
      }));

      await updateAgentStatus(placeholderId, {
        phase: "Utfører",
        title: "Gjennomfører handlinger",
        steps: [
          ...preAiSteps.map((s) => ({ ...s, status: "done" as const })),
          ...toolSteps,
          { label: "Skriver svar", icon: "write", status: "active" },
        ],
      });
    }

    // Step 6: Replace placeholder with actual response + metadata
    await updateMessageContent(placeholderId, aiResponse.content);
    await updateMessageType(placeholderId, "chat");

    // Save token/cost metadata on the AI message
    await db.exec`UPDATE messages SET metadata = ${JSON.stringify({
      model: aiResponse.modelUsed,
      tokens: aiResponse.usage,
      cost: aiResponse.costUsd,
      stopReason: aiResponse.stopReason,
      truncated: aiResponse.truncated,
      toolsUsed: aiResponse.toolsUsed || [],
    })}::jsonb WHERE id = ${placeholderId}::uuid`;

    // Log repo activity (fire-and-forget)
    if (repoName) {
      logRepoActivity(repoName, "chat", "Melding sendt", userContent.substring(0, 100), auth.userID);
      if (aiResponse.toolsUsed && aiResponse.toolsUsed.length > 0) {
        for (const tool of aiResponse.toolsUsed) {
          logRepoActivity(repoName, "tool_use", `Verktoy: ${tool}`, null, undefined, { tool });
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
      await updateAgentStatus(placeholderId, {
        phase: "Feilet",
        title: "Noe gikk galt",
        steps: [],
        error: (e instanceof Error ? e.message : "Ukjent feil") + "\n\nPrøv igjen.",
      });
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
      LEFT JOIN conversations c ON c.id = m.conversation_id
      WHERE c.owner_email = ${auth.email} OR c.id IS NULL
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

    if (conv && conv.owner_email !== auth.email) {
      throw APIError.permissionDenied("du har ikke tilgang til denne samtalen");
    }

    // Delete files, messages, then conversation record
    await db.exec`DELETE FROM chat_files WHERE conversation_id = ${req.conversationId}`;
    await db.exec`DELETE FROM messages WHERE conversation_id = ${req.conversationId}`;
    await db.exec`DELETE FROM conversations WHERE id = ${req.conversationId}`;

    return { success: true };
  }
);

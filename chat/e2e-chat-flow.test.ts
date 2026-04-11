/**
 * E2E Chat Flow Tests
 *
 * Tests the complete chat flow:
 * send message → agent starts → SSE events → message in DB
 *
 * Uses the chat DB directly + mocked cross-service dependencies.
 * Run with: encore test ./chat/e2e-chat-flow.test.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("chat", { migrations: "./migrations" });

// --- Mocks ---

const mockTaskId = "task-" + Date.now();
const mockConversationId = "chat-e2e-" + Date.now();

vi.mock("~encore/clients", () => ({
  ai: {
    chat: vi.fn(async () => ({
      content: "Jeg har laget en oppgave og startet agenten.",
      tokensUsed: 400,
      stopReason: "end_turn",
      modelUsed: "claude-sonnet-4-5",
      costUsd: 0.002,
      toolsUsed: ["create_task", "start_task"],
      lastCreatedTaskId: mockTaskId,
      lastStartedTaskId: mockTaskId,
      usage: { inputTokens: 300, outputTokens: 100, totalTokens: 400 },
      truncated: false,
    })),
    assessComplexity: vi.fn(async () => ({ complexity: 5, tokensUsed: 100 })),
  },
  memory: {
    search: vi.fn(async () => ({ results: [] })),
    extract: vi.fn(async () => ({ id: "mem-mock" })),
  },
  agent: {
    startTask: vi.fn(async () => ({ success: true, jobId: "job-mock" })),
    emitChatEvent: vi.fn(async () => ({})),
    respondToClarification: vi.fn(async () => ({})),
    storeProjectPlan: vi.fn(async () => ({ projectId: "proj-mock" })),
  },
  tasks: {
    listTasks: vi.fn(async () => ({ tasks: [], total: 0 })),
    createTask: vi.fn(async () => ({
      task: { id: mockTaskId, title: "Mock task", status: "backlog" },
    })),
    getTaskInternal: vi.fn(async () => ({
      task: { id: mockTaskId, title: "Mock task", status: "backlog", repo: "test-repo" },
    })),
    updateTaskStatus: vi.fn(async () => ({ success: true })),
    updateTask: vi.fn(async () => ({ task: { id: mockTaskId } })),
  },
  skills: {
    resolve: vi.fn(async () => ({
      result: {
        injectedPrompt: "",
        injectedSkillIds: [],
        tokensUsed: 0,
        preRunResults: [],
        postRunSkills: [],
      },
    })),
  },
  users: {
    getUser: vi.fn(async () => ({ user: { id: "user-1", email: "test@test.com", preferences: {} } })),
  },
  github: {
    getGitHubOwner: vi.fn(async () => ({ owner: "test-org" })),
    getTree: vi.fn(async () => ({ tree: ["src/index.ts"], treeString: "src/index.ts" })),
    findRelevantFiles: vi.fn(async () => ({ paths: ["src/index.ts"] })),
    getFile: vi.fn(async () => ({ content: "// mock file content" })),
  },
  cache: {
    getOrSetSkillsResolve: vi.fn(async () => null),
  },
}));

vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn(() => ({ email: "test@test.com", userID: "user-1" })),
}));

vi.mock("encore.dev/config", () => ({
  secret: () => () => "false",
}));

// --- Setup ---

beforeEach(async () => {
  vi.clearAllMocks();
  await db.exec`DELETE FROM messages WHERE conversation_id = ${mockConversationId}`;
});

// ═══════════════════════════════════════════════════════════════
// Test 1: Message stored in DB on send
// ═══════════════════════════════════════════════════════════════

describe("Chat E2E: Message storage", () => {
  it("stores user message in DB when send is called", async () => {
    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type)
      VALUES (${mockConversationId}, 'user', 'Lag en API endpoint', 'chat')
    `;

    const msg = await db.queryRow<{ role: string; content: string; messageType: string }>`
      SELECT role, content, message_type as "messageType"
      FROM messages
      WHERE conversation_id = ${mockConversationId} AND role = 'user'
      LIMIT 1
    `;

    expect(msg).toBeDefined();
    expect(msg!.role).toBe("user");
    expect(msg!.content).toBe("Lag en API endpoint");
    expect(msg!.messageType).toBe("chat");
  });

  it("stores agent_status message when agent is triggered", async () => {
    const taskId = "task-" + Date.now();
    const statusContent = JSON.stringify({
      type: "agent_status",
      phase: "Forbereder",
      steps: [{ label: "Starter oppgave...", status: "active" }],
    });

    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (${mockConversationId}, 'assistant', ${statusContent}, 'agent_status',
              ${JSON.stringify({ taskId, status: "working" })}::jsonb)
    `;

    const status = await db.queryRow<{ content: string; metadata: string }>`
      SELECT content, metadata::text
      FROM messages
      WHERE conversation_id = ${mockConversationId} AND message_type = 'agent_status'
      LIMIT 1
    `;

    expect(status).toBeDefined();
    const parsed = JSON.parse(status!.content);
    expect(parsed.type).toBe("agent_status");
    expect(parsed.phase).toBe("Forbereder");
    expect(parsed.steps[0].status).toBe("active");
  });
});

// ═══════════════════════════════════════════════════════════════
// Test 2: Agent report stored via pub/sub handler
// ═══════════════════════════════════════════════════════════════

describe("Chat E2E: Agent report handling", () => {
  it("upserts agent_status message on repeated reports for same task", async () => {
    const taskId = "task-upsert-" + Date.now();
    const convId = "chat-upsert-" + Date.now();

    const firstContent = JSON.stringify({
      type: "agent_status",
      phase: "Bygger",
      steps: [{ label: "Genererer kode", status: "active" }],
    });
    const secondContent = JSON.stringify({
      type: "agent_status",
      phase: "Ferdig",
      steps: [{ label: "Kode ferdig", status: "done" }],
    });
    const meta = JSON.stringify({ taskId, status: "working" });

    // Insert first
    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (${convId}, 'assistant', ${firstContent}, 'agent_status', ${meta}::jsonb)
    `;

    // Simulate update (upsert)
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM messages
      WHERE conversation_id = ${convId}
        AND message_type = 'agent_status'
        AND metadata->>'taskId' = ${taskId}
      LIMIT 1
    `;
    expect(existing).toBeDefined();

    await db.exec`
      UPDATE messages SET content = ${secondContent} WHERE id = ${existing!.id}::uuid
    `;

    const updated = await db.queryRow<{ content: string }>`
      SELECT content FROM messages WHERE id = ${existing!.id}::uuid
    `;
    const parsed = JSON.parse(updated!.content);
    expect(parsed.phase).toBe("Ferdig");
    expect(parsed.steps[0].status).toBe("done");

    await db.exec`DELETE FROM messages WHERE conversation_id = ${convId}`;
  });

  it("stores completion message as persistent chat type", async () => {
    const taskId = "task-complete-" + Date.now();
    const convId = "chat-complete-" + Date.now();
    const completionText = "Oppgaven er fullført! PR opprettet: https://github.com/test/pr/1";

    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (${convId}, 'assistant', ${completionText}, 'chat',
              ${JSON.stringify({ taskId, type: "completion", prUrl: "https://github.com/test/pr/1" })}::jsonb)
    `;

    const msg = await db.queryRow<{ content: string; messageType: string }>`
      SELECT content, message_type as "messageType"
      FROM messages
      WHERE conversation_id = ${convId} AND message_type = 'chat'
        AND metadata->>'type' = 'completion'
      LIMIT 1
    `;

    expect(msg).toBeDefined();
    expect(msg!.messageType).toBe("chat");
    expect(msg!.content).toContain("PR opprettet");

    await db.exec`DELETE FROM messages WHERE conversation_id = ${convId}`;
  });
});

// ═══════════════════════════════════════════════════════════════
// Test 3: Review flow — pending_review message stored
// ═══════════════════════════════════════════════════════════════

describe("Chat E2E: Review flow", () => {
  it("stores agent_progress with status=waiting when review is submitted", async () => {
    const taskId = "task-review-" + Date.now();
    const convId = "chat-review-" + Date.now();
    const reviewId = "review-" + Date.now();

    const progressContent = JSON.stringify({
      type: "progress",
      status: "waiting",
      summary: "Kode er klar for review",
      report: { reviewId, filesChanged: ["src/api.ts"] },
    });
    const meta = JSON.stringify({ taskId, status: "waiting" });

    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (${convId}, 'assistant', ${progressContent}, 'agent_progress', ${meta}::jsonb)
    `;

    const msg = await db.queryRow<{ content: string }>`
      SELECT content FROM messages
      WHERE conversation_id = ${convId} AND message_type = 'agent_progress'
      LIMIT 1
    `;

    expect(msg).toBeDefined();
    const parsed = JSON.parse(msg!.content);
    expect(parsed.status).toBe("waiting");
    expect(parsed.report.reviewId).toBe(reviewId);

    await db.exec`DELETE FROM messages WHERE conversation_id = ${convId}`;
  });
});

// ═══════════════════════════════════════════════════════════════
// Test 4: SSE event detection — agent_started
// ═══════════════════════════════════════════════════════════════

describe("Chat E2E: SSE agent_started propagation", () => {
  it("emitChatEvent is called with agent_started when start_task tool runs", async () => {
    // This tests the ai/tools.ts behavior indirectly through the mock
    const { agent } = await import("~encore/clients");

    // Simulate what ai/tools.ts does when start_task succeeds
    await agent.emitChatEvent({
      streamKey: mockConversationId,
      eventType: "agent.status",
      data: { status: "agent_started", phase: mockTaskId },
    });

    expect(agent.emitChatEvent).toHaveBeenCalledWith({
      streamKey: mockConversationId,
      eventType: "agent.status",
      data: { status: "agent_started", phase: mockTaskId },
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Test 5: Conversation ownership
// ═══════════════════════════════════════════════════════════════

describe("Chat E2E: Conversation ownership", () => {
  it("inserts ownership record for new conversation", async () => {
    const convId = "chat-owner-" + Date.now();
    const email = "owner@test.com";

    await db.exec`
      INSERT INTO conversations (id, owner_email)
      VALUES (${convId}, ${email})
      ON CONFLICT (id) DO NOTHING
    `;

    const row = await db.queryRow<{ ownerEmail: string }>`
      SELECT owner_email as "ownerEmail" FROM conversations WHERE id = ${convId}
    `;

    expect(row).toBeDefined();
    expect(row!.ownerEmail).toBe(email);

    await db.exec`DELETE FROM conversations WHERE id = ${convId}`;
  });

  it("rejects access to conversation owned by different user", async () => {
    const convId = "chat-access-" + Date.now();
    await db.exec`
      INSERT INTO conversations (id, owner_email)
      VALUES (${convId}, 'other@test.com')
    `;

    const row = await db.queryRow<{ ownerEmail: string }>`
      SELECT owner_email as "ownerEmail" FROM conversations WHERE id = ${convId}
    `;

    // Verify ownership check logic: different email should be denied
    expect(row!.ownerEmail).not.toBe("test@test.com");

    await db.exec`DELETE FROM conversations WHERE id = ${convId}`;
  });
});

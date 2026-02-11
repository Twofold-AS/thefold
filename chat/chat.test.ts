import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("chat", {
  migrations: "./migrations",
});

describe("Chat database", () => {
  const testConversationId = "test-conv-" + Date.now();

  beforeEach(async () => {
    // Clean up test messages before each test
    await db.exec`DELETE FROM messages WHERE conversation_id = ${testConversationId}`;
  });

  describe("Message insertion", () => {
    it("should insert a user message", async () => {
      const result = await db.queryRow<{
        id: string;
        conversationId: string;
        role: string;
        content: string;
        messageType: string;
      }>`
        INSERT INTO messages (conversation_id, role, content, message_type)
        VALUES (${testConversationId}, 'user', 'Hello TheFold', 'chat')
        RETURNING id, conversation_id as "conversationId", role, content, message_type as "messageType"
      `;

      expect(result).toBeDefined();
      expect(result!.conversationId).toBe(testConversationId);
      expect(result!.role).toBe("user");
      expect(result!.content).toBe("Hello TheFold");
      expect(result!.messageType).toBe("chat");
    });

    it("should insert an assistant message", async () => {
      const result = await db.queryRow<{
        id: string;
        role: string;
        content: string;
      }>`
        INSERT INTO messages (conversation_id, role, content, message_type)
        VALUES (${testConversationId}, 'assistant', 'Hello! How can I help?', 'chat')
        RETURNING id, role, content
      `;

      expect(result).toBeDefined();
      expect(result!.role).toBe("assistant");
      expect(result!.content).toBe("Hello! How can I help?");
    });

    it("should insert an agent_report message with metadata", async () => {
      const metadata = {
        taskId: "TEST-123",
        status: "working",
        filesChanged: ["src/api.ts"],
      };

      const result = await db.queryRow<{
        id: string;
        messageType: string;
        metadata: any;
      }>`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (
          ${testConversationId},
          'assistant',
          'Working on task TEST-123',
          'agent_report',
          ${JSON.stringify(metadata)}
        )
        RETURNING id, message_type as "messageType", metadata
      `;

      expect(result).toBeDefined();
      expect(result!.messageType).toBe("agent_report");
      // PostgreSQL returns JSONB as string, need to parse it
      expect(JSON.parse(result!.metadata)).toEqual(metadata);
    });

    it("should reject invalid role", async () => {
      await expect(
        db.exec`
          INSERT INTO messages (conversation_id, role, content, message_type)
          VALUES (${testConversationId}, 'invalid_role', 'Test', 'chat')
        `
      ).rejects.toThrow();
    });

    it("should reject invalid message_type", async () => {
      await expect(
        db.exec`
          INSERT INTO messages (conversation_id, role, content, message_type)
          VALUES (${testConversationId}, 'user', 'Test', 'invalid_type')
        `
      ).rejects.toThrow();
    });
  });

  describe("Message querying", () => {
    beforeEach(async () => {
      // Insert test messages
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, created_at)
        VALUES
          (${testConversationId}, 'user', 'First message', 'chat', NOW() - INTERVAL '3 minutes'),
          (${testConversationId}, 'assistant', 'First response', 'chat', NOW() - INTERVAL '2 minutes'),
          (${testConversationId}, 'user', 'Second message', 'chat', NOW() - INTERVAL '1 minute'),
          (${testConversationId}, 'assistant', 'Second response', 'chat', NOW())
      `;
    });

    it("should query messages by conversation_id", async () => {
      const rows = await db.query<{ content: string }>`
        SELECT content
        FROM messages
        WHERE conversation_id = ${testConversationId}
        ORDER BY created_at ASC
      `;

      const messages: string[] = [];
      for await (const row of rows) {
        messages.push(row.content);
      }

      expect(messages).toHaveLength(4);
      expect(messages[0]).toBe("First message");
      expect(messages[3]).toBe("Second response");
    });

    it("should query messages in descending order", async () => {
      const rows = await db.query<{ content: string }>`
        SELECT content
        FROM messages
        WHERE conversation_id = ${testConversationId}
        ORDER BY created_at DESC
      `;

      const messages: string[] = [];
      for await (const row of rows) {
        messages.push(row.content);
      }

      expect(messages[0]).toBe("Second response");
      expect(messages[3]).toBe("First message");
    });

    it("should limit query results", async () => {
      const rows = await db.query<{ content: string }>`
        SELECT content
        FROM messages
        WHERE conversation_id = ${testConversationId}
        ORDER BY created_at DESC
        LIMIT 2
      `;

      const messages: string[] = [];
      for await (const row of rows) {
        messages.push(row.content);
      }

      expect(messages).toHaveLength(2);
      expect(messages[0]).toBe("Second response");
      expect(messages[1]).toBe("Second message");
    });

    it("should filter by message_type", async () => {
      // Insert an agent_report message
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type)
        VALUES (${testConversationId}, 'assistant', 'Agent report', 'agent_report')
      `;

      const rows = await db.query<{ content: string; messageType: string }>`
        SELECT content, message_type as "messageType"
        FROM messages
        WHERE conversation_id = ${testConversationId} AND message_type = 'agent_report'
      `;

      const messages: any[] = [];
      for await (const row of rows) {
        messages.push(row);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Agent report");
      expect(messages[0].messageType).toBe("agent_report");
    });

    it("should query with pagination using created_at cursor", async () => {
      // Get first page
      const firstPage = await db.query<{ id: string; createdAt: string; content: string }>`
        SELECT id, created_at as "createdAt", content
        FROM messages
        WHERE conversation_id = ${testConversationId}
        ORDER BY created_at DESC
        LIMIT 2
      `;

      const firstPageMessages: any[] = [];
      for await (const row of firstPage) {
        firstPageMessages.push(row);
      }

      expect(firstPageMessages).toHaveLength(2);

      // Get second page using cursor
      const cursor = firstPageMessages[1].createdAt;
      const secondPage = await db.query<{ content: string }>`
        SELECT content
        FROM messages
        WHERE conversation_id = ${testConversationId} AND created_at < ${cursor}
        ORDER BY created_at DESC
        LIMIT 2
      `;

      const secondPageMessages: string[] = [];
      for await (const row of secondPage) {
        secondPageMessages.push(row.content);
      }

      expect(secondPageMessages).toHaveLength(2);
      expect(secondPageMessages).not.toContain(firstPageMessages[0].content);
    });
  });

  describe("Conversation queries", () => {
    it("should find latest message per conversation", async () => {
      const conv1 = "conv-1-" + Date.now();
      const conv2 = "conv-2-" + Date.now();

      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, created_at)
        VALUES
          (${conv1}, 'user', 'Conv1 old', 'chat', NOW() - INTERVAL '2 hours'),
          (${conv1}, 'user', 'Conv1 latest', 'chat', NOW() - INTERVAL '1 hour'),
          (${conv2}, 'user', 'Conv2 latest', 'chat', NOW())
      `;

      const rows = await db.query`
        SELECT
          m.conversation_id as id,
          m.content as "lastMessage"
        FROM messages m
        INNER JOIN (
          SELECT conversation_id, MAX(created_at) as max_created
          FROM messages
          WHERE conversation_id IN (${conv1}, ${conv2})
          GROUP BY conversation_id
        ) latest ON m.conversation_id = latest.conversation_id
                  AND m.created_at = latest.max_created
        ORDER BY m.created_at DESC
      `;

      const conversations: any[] = [];
      for await (const row of rows) {
        conversations.push(row);
      }

      expect(conversations).toHaveLength(2);
      expect(conversations[0].lastMessage).toBe("Conv2 latest");
      expect(conversations[1].lastMessage).toBe("Conv1 latest");
    });
  });
});

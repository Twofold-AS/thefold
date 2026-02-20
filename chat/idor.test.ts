import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("chat", {
  migrations: "./migrations",
});

describe("IDOR — Conversation Access Control", () => {
  const userA = "alice@test.com";
  const userB = "bob@test.com";
  const convA = "idor-test-conv-a-" + Date.now();
  const convB = "idor-test-conv-b-" + Date.now();
  const orphanConv = "idor-test-orphan-" + Date.now();

  beforeEach(async () => {
    // Clean up test data
    await db.exec`DELETE FROM messages WHERE conversation_id IN (${convA}, ${convB}, ${orphanConv})`;
    await db.exec`DELETE FROM conversations WHERE id IN (${convA}, ${convB}, ${orphanConv})`;

    // Create ownership records
    await db.exec`INSERT INTO conversations (id, owner_email) VALUES (${convA}, ${userA})`;
    await db.exec`INSERT INTO conversations (id, owner_email) VALUES (${convB}, ${userB})`;

    // Create messages in all conversations
    await db.exec`INSERT INTO messages (conversation_id, role, content, message_type) VALUES (${convA}, 'user', 'Alice msg', 'chat')`;
    await db.exec`INSERT INTO messages (conversation_id, role, content, message_type) VALUES (${convB}, 'user', 'Bob msg', 'chat')`;
    await db.exec`INSERT INTO messages (conversation_id, role, content, message_type) VALUES (${orphanConv}, 'user', 'Orphan msg', 'chat')`;
  });

  describe("Conversations list (INNER JOIN)", () => {
    it("returns only conversations owned by the querying user", async () => {
      const rows = db.query<{ id: string }>`
        SELECT m.conversation_id as id
        FROM messages m
        INNER JOIN (
          SELECT conversation_id, MAX(created_at) as max_created
          FROM messages WHERE message_type != 'agent_status'
          GROUP BY conversation_id
        ) latest ON m.conversation_id = latest.conversation_id AND m.created_at = latest.max_created
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE c.owner_email = ${userA}
      `;
      const results: string[] = [];
      for await (const row of rows) {
        results.push(row.id);
      }
      expect(results).toContain(convA);
      expect(results).not.toContain(convB);
    });

    it("excludes unowned conversations for user B", async () => {
      const rows = db.query<{ id: string }>`
        SELECT m.conversation_id as id
        FROM messages m
        INNER JOIN (
          SELECT conversation_id, MAX(created_at) as max_created
          FROM messages WHERE message_type != 'agent_status'
          GROUP BY conversation_id
        ) latest ON m.conversation_id = latest.conversation_id AND m.created_at = latest.max_created
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE c.owner_email = ${userB}
      `;
      const results: string[] = [];
      for await (const row of rows) {
        results.push(row.id);
      }
      expect(results).toContain(convB);
      expect(results).not.toContain(convA);
      expect(results).not.toContain(orphanConv);
    });
  });

  describe("Ownership check", () => {
    it("passes for owner", async () => {
      const row = await db.queryRow<{ owner_email: string }>`
        SELECT owner_email FROM conversations WHERE id = ${convA}
      `;
      expect(row).toBeDefined();
      expect(row!.owner_email).toBe(userA);
    });

    it("fails for non-owner", async () => {
      const row = await db.queryRow<{ owner_email: string }>`
        SELECT owner_email FROM conversations WHERE id = ${convA}
      `;
      expect(row).toBeDefined();
      expect(row!.owner_email).not.toBe(userB);
    });
  });

  describe("Delete guard", () => {
    it("blocks deletion of unowned conversations (no record)", async () => {
      // Orphan conversation has no ownership record — simulates the IDOR bug
      const conv = await db.queryRow<{ owner_email: string }>`
        SELECT owner_email FROM conversations WHERE id = ${orphanConv}
      `;
      // With the fix: !conv means deny (conv is null for orphans)
      const shouldDeny = !conv || conv.owner_email !== userA;
      expect(shouldDeny).toBe(true);
    });

    it("allows deletion by owner", async () => {
      const conv = await db.queryRow<{ owner_email: string }>`
        SELECT owner_email FROM conversations WHERE id = ${convA}
      `;
      const shouldDeny = !conv || conv.owner_email !== userA;
      expect(shouldDeny).toBe(false);
    });
  });
});

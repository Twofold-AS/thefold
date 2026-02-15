import { describe, it, expect } from "vitest";
import { db } from "./db";
import type { CodeReview, ReviewFile, AIReviewData } from "./types";

describe("Code Reviews", () => {
  // --- DB Operations ---

  describe("database operations", () => {
    it("should insert a code review", async () => {
      const filesChanged: ReviewFile[] = [
        { path: "src/test.ts", content: "console.log('test');", action: "create" },
      ];

      const aiReview: AIReviewData = {
        documentation: "Test change",
        qualityScore: 8,
        concerns: [],
        memoriesExtracted: ["learned something"],
      };

      const row = await db.queryRow<{ id: string; status: string }>`
        INSERT INTO code_reviews (
          conversation_id, task_id, sandbox_id,
          files_changed, ai_review, status
        ) VALUES (
          'test-conv-1', 'test-task-1', 'sandbox-1',
          ${JSON.stringify(filesChanged)}::jsonb,
          ${JSON.stringify(aiReview)}::jsonb,
          'pending'
        )
        RETURNING id, status
      `;

      expect(row).toBeDefined();
      expect(row!.id).toBeDefined();
      expect(row!.status).toBe("pending");
    });

    it("should query reviews by status", async () => {
      // Insert test data
      await db.exec`
        INSERT INTO code_reviews (conversation_id, task_id, sandbox_id, files_changed, status)
        VALUES ('test-conv-2', 'task-a', 'sb-a', '[]'::jsonb, 'pending')
      `;
      await db.exec`
        INSERT INTO code_reviews (conversation_id, task_id, sandbox_id, files_changed, status)
        VALUES ('test-conv-2', 'task-b', 'sb-b', '[]'::jsonb, 'approved')
      `;

      const pendingCount = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM code_reviews
        WHERE status = 'pending' AND conversation_id = 'test-conv-2'
      `;
      expect(pendingCount!.count).toBeGreaterThanOrEqual(1);

      const approvedCount = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM code_reviews
        WHERE status = 'approved' AND conversation_id = 'test-conv-2'
      `;
      expect(approvedCount!.count).toBeGreaterThanOrEqual(1);
    });

    it("should update review status transitions", async () => {
      const row = await db.queryRow<{ id: string }>`
        INSERT INTO code_reviews (conversation_id, task_id, sandbox_id, files_changed, status)
        VALUES ('test-conv-3', 'task-c', 'sb-c', '[]'::jsonb, 'pending')
        RETURNING id
      `;

      // pending -> changes_requested
      await db.exec`
        UPDATE code_reviews SET status = 'changes_requested', feedback = 'fix the bug'
        WHERE id = ${row!.id}
      `;
      const updated = await db.queryRow<{ status: string; feedback: string }>`
        SELECT status, feedback FROM code_reviews WHERE id = ${row!.id}
      `;
      expect(updated!.status).toBe("changes_requested");
      expect(updated!.feedback).toBe("fix the bug");

      // changes_requested -> approved
      await db.exec`
        UPDATE code_reviews SET status = 'approved', reviewed_at = NOW()
        WHERE id = ${row!.id}
      `;
      const approved = await db.queryRow<{ status: string; reviewed_at: Date }>`
        SELECT status, reviewed_at FROM code_reviews WHERE id = ${row!.id}
      `;
      expect(approved!.status).toBe("approved");
      expect(approved!.reviewed_at).toBeDefined();
    });
  });

  // --- Type Validation ---

  describe("type validation", () => {
    it("should validate CodeReview shape", () => {
      const review: CodeReview = {
        id: "test-id",
        conversationId: "conv-1",
        taskId: "task-1",
        sandboxId: "sb-1",
        filesChanged: [{ path: "test.ts", content: "code", action: "create" }],
        status: "pending",
        createdAt: new Date(),
      };

      expect(review.id).toBe("test-id");
      expect(review.status).toBe("pending");
      expect(review.filesChanged).toHaveLength(1);
      expect(review.aiReview).toBeUndefined();
      expect(review.reviewerId).toBeUndefined();
    });

    it("should validate ReviewFile shape", () => {
      const files: ReviewFile[] = [
        { path: "src/a.ts", content: "export const a = 1;", action: "create" },
        { path: "src/b.ts", content: "export const b = 2;", action: "modify" },
        { path: "src/old.ts", content: "", action: "delete" },
      ];

      expect(files).toHaveLength(3);
      expect(files[0].action).toBe("create");
      expect(files[1].action).toBe("modify");
      expect(files[2].action).toBe("delete");
    });

    it("should validate AIReviewData shape", () => {
      const aiReview: AIReviewData = {
        documentation: "# Changes\n\nAdded tests",
        qualityScore: 9,
        concerns: ["No error handling"],
        memoriesExtracted: ["Always add error handling"],
      };

      expect(aiReview.qualityScore).toBe(9);
      expect(aiReview.concerns).toHaveLength(1);
      expect(aiReview.memoriesExtracted).toHaveLength(1);
    });
  });

  // --- JSONB Round-trip ---

  describe("JSONB round-trip", () => {
    it("should store and retrieve files_changed JSONB correctly", async () => {
      const filesChanged: ReviewFile[] = [
        { path: "src/index.ts", content: "export function hello() { return 'world'; }", action: "create" },
        { path: "src/old.ts", content: "", action: "delete" },
      ];

      const row = await db.queryRow<{ id: string }>`
        INSERT INTO code_reviews (conversation_id, task_id, sandbox_id, files_changed, status)
        VALUES ('test-roundtrip-1', 'task-rt-1', 'sb-rt-1', ${JSON.stringify(filesChanged)}::jsonb, 'pending')
        RETURNING id
      `;

      const retrieved = await db.queryRow<{ files_changed: string | ReviewFile[] }>`
        SELECT files_changed FROM code_reviews WHERE id = ${row!.id}
      `;

      const parsed: ReviewFile[] = typeof retrieved!.files_changed === "string"
        ? JSON.parse(retrieved!.files_changed)
        : retrieved!.files_changed;

      expect(parsed).toHaveLength(2);
      expect(parsed[0].path).toBe("src/index.ts");
      expect(parsed[0].action).toBe("create");
      expect(parsed[1].action).toBe("delete");
    });

    it("should store and retrieve ai_review JSONB correctly", async () => {
      const aiReview: AIReviewData = {
        documentation: "Added new feature\n\n## Details\nThis is a test",
        qualityScore: 7,
        concerns: ["Missing tests", "No error handling"],
        memoriesExtracted: ["Use try-catch for async ops"],
      };

      const row = await db.queryRow<{ id: string }>`
        INSERT INTO code_reviews (conversation_id, task_id, sandbox_id, files_changed, ai_review, status)
        VALUES ('test-roundtrip-2', 'task-rt-2', 'sb-rt-2', '[]'::jsonb, ${JSON.stringify(aiReview)}::jsonb, 'pending')
        RETURNING id
      `;

      const retrieved = await db.queryRow<{ ai_review: string | AIReviewData }>`
        SELECT ai_review FROM code_reviews WHERE id = ${row!.id}
      `;

      const parsed: AIReviewData = typeof retrieved!.ai_review === "string"
        ? JSON.parse(retrieved!.ai_review)
        : retrieved!.ai_review;

      expect(parsed.documentation).toContain("Added new feature");
      expect(parsed.qualityScore).toBe(7);
      expect(parsed.concerns).toHaveLength(2);
      expect(parsed.concerns[0]).toBe("Missing tests");
      expect(parsed.memoriesExtracted).toHaveLength(1);
    });

    it("should handle null ai_review", async () => {
      const row = await db.queryRow<{ id: string }>`
        INSERT INTO code_reviews (conversation_id, task_id, sandbox_id, files_changed, status)
        VALUES ('test-roundtrip-3', 'task-rt-3', 'sb-rt-3', '[]'::jsonb, 'pending')
        RETURNING id
      `;

      const retrieved = await db.queryRow<{ ai_review: string | AIReviewData | null }>`
        SELECT ai_review FROM code_reviews WHERE id = ${row!.id}
      `;

      expect(retrieved!.ai_review).toBeNull();
    });
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { listAuditLog, getTaskTrace, getAuditStats } from "./agent";
import { SQLDatabase } from "encore.dev/storage/sqldb";

// Use the same database as the agent service
const db = SQLDatabase.named("agent");

// Seed some test audit entries
async function seedTestData() {
  const testSessionId = "test-session-audit";
  const testTaskId = "TEST-AUDIT-001";
  const testRepo = "Twofold-AS/thefold";

  // Insert a series of entries that simulate a task execution
  await db.exec`
    INSERT INTO agent_audit_log (session_id, action_type, details, success, task_id, repo_name, duration_ms, confidence_score)
    VALUES
      (${testSessionId}, 'task_read', '{"taskId": "TEST-AUDIT-001"}'::jsonb, TRUE, ${testTaskId}, ${testRepo}, 150, NULL),
      (${testSessionId}, 'project_tree_read', '{"owner": "Twofold-AS"}'::jsonb, TRUE, ${testTaskId}, ${testRepo}, 320, NULL),
      (${testSessionId}, 'confidence_details', '{"overall": 85, "breakdown": {"task_understanding": 90}}'::jsonb, TRUE, ${testTaskId}, ${testRepo}, 2100, 85),
      (${testSessionId}, 'plan_created', '{"stepCount": 3}'::jsonb, TRUE, ${testTaskId}, ${testRepo}, 4500, NULL),
      (${testSessionId}, 'file_written', '{"path": "src/test.ts", "action": "create_file"}'::jsonb, TRUE, ${testTaskId}, ${testRepo}, 50, NULL),
      (${testSessionId}, 'validation_run', '{"attempt": 1}'::jsonb, TRUE, ${testTaskId}, ${testRepo}, 8000, NULL),
      (${testSessionId}, 'task_completed', '{"filesChanged": ["src/test.ts"]}'::jsonb, TRUE, ${testTaskId}, ${testRepo}, 15000, NULL)
  `;

  // Also insert a failed entry from a different task
  await db.exec`
    INSERT INTO agent_audit_log (session_id, action_type, details, success, error_message, task_id, repo_name, duration_ms)
    VALUES
      ('test-session-fail', 'validation_failed', '{"attempt": 3}'::jsonb, FALSE, 'tsc: Cannot find module', 'TEST-AUDIT-002', ${testRepo}, 7500)
  `;
}

describe("Audit Log Endpoints", () => {
  beforeAll(async () => {
    await seedTestData();
  });

  describe("listAuditLog", () => {
    it("should return audit entries", async () => {
      const result = await listAuditLog({});
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
    });

    it("should filter by actionType", async () => {
      const result = await listAuditLog({ actionType: "task_completed" });
      expect(result.entries.length).toBeGreaterThan(0);
      for (const entry of result.entries) {
        expect(entry.actionType).toBe("task_completed");
      }
    });

    it("should filter by taskId", async () => {
      const result = await listAuditLog({ taskId: "TEST-AUDIT-001" });
      expect(result.entries.length).toBeGreaterThanOrEqual(7); // our 7 seeded entries
      for (const entry of result.entries) {
        expect(entry.taskId).toBe("TEST-AUDIT-001");
      }
    });

    it("should filter by sessionId", async () => {
      const result = await listAuditLog({ sessionId: "test-session-audit" });
      expect(result.entries.length).toBeGreaterThanOrEqual(7);
      for (const entry of result.entries) {
        expect(entry.sessionId).toBe("test-session-audit");
      }
    });

    it("should filter failed only", async () => {
      const result = await listAuditLog({ failedOnly: true });
      expect(result.entries.length).toBeGreaterThan(0);
      for (const entry of result.entries) {
        expect(entry.success).toBe(false);
      }
    });

    it("should respect limit and offset", async () => {
      const page1 = await listAuditLog({ limit: 3, offset: 0 });
      expect(page1.entries.length).toBeLessThanOrEqual(3);

      const page2 = await listAuditLog({ limit: 3, offset: 3 });
      // Pages should have different entries
      if (page1.entries.length > 0 && page2.entries.length > 0) {
        expect(page1.entries[0].id).not.toBe(page2.entries[0].id);
      }
    });

    it("should return entry with all expected fields", async () => {
      const result = await listAuditLog({ taskId: "TEST-AUDIT-001" });
      const entry = result.entries[0];

      expect(entry.id).toBeDefined();
      expect(entry.sessionId).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.actionType).toBeDefined();
      expect(entry.details).toBeDefined();
      expect(typeof entry.details).toBe("object");
    });
  });

  describe("getTaskTrace", () => {
    it("should return full trace for a task", async () => {
      const result = await getTaskTrace({ taskId: "TEST-AUDIT-001" });

      expect(result.taskId).toBe("TEST-AUDIT-001");
      expect(result.entries.length).toBeGreaterThanOrEqual(7);
      expect(result.summary).toBeDefined();
      expect(result.summary.totalSteps).toBeGreaterThanOrEqual(7);
      expect(result.summary.successCount).toBeGreaterThan(0);
      expect(result.summary.outcome).toBe("completed");
    });

    it("should include confidence score in summary", async () => {
      const result = await getTaskTrace({ taskId: "TEST-AUDIT-001" });
      expect(result.summary.confidenceScore).toBe(85);
    });

    it("should order entries chronologically", async () => {
      const result = await getTaskTrace({ taskId: "TEST-AUDIT-001" });

      for (let i = 1; i < result.entries.length; i++) {
        const prev = new Date(result.entries[i - 1].timestamp).getTime();
        const curr = new Date(result.entries[i].timestamp).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it("should return empty trace for unknown task", async () => {
      const result = await getTaskTrace({ taskId: "NONEXISTENT-999" });
      expect(result.entries.length).toBe(0);
      expect(result.summary.totalSteps).toBe(0);
      expect(result.summary.outcome).toBe("in_progress");
    });
  });

  describe("getAuditStats", () => {
    it("should return overall statistics", async () => {
      const result = await getAuditStats();

      expect(result.totalEntries).toBeGreaterThan(0);
      expect(result.totalTasks).toBeGreaterThan(0);
      expect(result.successRate).toBeGreaterThanOrEqual(0);
      expect(result.successRate).toBeLessThanOrEqual(100);
      expect(typeof result.averageDurationMs).toBe("number");
    });

    it("should return action type counts", async () => {
      const result = await getAuditStats();

      expect(result.actionTypeCounts).toBeDefined();
      expect(typeof result.actionTypeCounts).toBe("object");
      expect(Object.keys(result.actionTypeCounts).length).toBeGreaterThan(0);

      // Should have our seeded action types
      expect(result.actionTypeCounts["task_completed"]).toBeGreaterThan(0);
    });

    it("should return recent failures", async () => {
      const result = await getAuditStats();

      expect(Array.isArray(result.recentFailures)).toBe(true);
      // We seeded a validation_failed entry
      expect(result.recentFailures.length).toBeGreaterThan(0);
      for (const entry of result.recentFailures) {
        expect(entry.success).toBe(false);
      }
    });
  });
});

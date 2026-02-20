import { describe, it, expect, beforeEach, vi } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { checkRateLimit, recordTaskStart, MAX_TASKS_PER_HOUR, MAX_TASKS_PER_DAY } from "./rate-limiter";
import { validateAgentScope } from "./helpers";
import type { AgentExecutionContext } from "./types";

// Mock ~encore/clients (helpers.ts imports them)
vi.mock("~encore/clients", () => ({
  github: {}, linear: {}, sandbox: {}, tasks: {
    isCancelled: vi.fn().mockResolvedValue({ cancelled: false }),
    getTaskInternal: vi.fn().mockResolvedValue({ task: { status: "in_progress" } }),
    createTask: vi.fn(), updateTaskStatus: vi.fn(),
  }, mcp: { installed: vi.fn().mockResolvedValue({ servers: [] }) },
}));
vi.mock("../chat/chat", () => ({
  agentReports: { publish: vi.fn().mockResolvedValue("msg-id") },
}));
vi.mock("./db", () => {
  const { SQLDatabase } = require("encore.dev/storage/sqldb");
  return { db: new SQLDatabase("agent", { migrations: "./migrations" }) };
});
vi.mock("./messages", () => ({
  serializeMessage: vi.fn().mockReturnValue("{}"),
  buildStatusMessage: vi.fn().mockReturnValue({}),
  buildThoughtMessage: vi.fn().mockReturnValue({}),
  buildReportMessage: vi.fn().mockReturnValue({}),
  buildClarificationMessage: vi.fn().mockReturnValue({}),
}));
vi.mock("./circuit-breaker", () => ({
  aiBreaker: { call: (fn: () => unknown) => fn() },
  githubBreaker: { call: (fn: () => unknown) => fn() },
  sandboxBreaker: { call: (fn: () => unknown) => fn() },
}));

const db = new SQLDatabase("agent", { migrations: "./migrations" });

// --- GitHub scope validation tests (pure function, no DB) ---

describe("GitHub scope validation (ASI02)", () => {
  const baseCtx = {
    repoOwner: "Twofold-AS",
    repoName: "thefold",
  } as AgentExecutionContext;

  it("should allow operations on correct repo", () => {
    expect(() => validateAgentScope(baseCtx, "Twofold-AS", "thefold")).not.toThrow();
  });

  it("should throw on mismatched repo", () => {
    expect(() => validateAgentScope(baseCtx, "Twofold-AS", "other-repo"))
      .toThrow("Scope violation");
  });

  it("should throw on mismatched owner", () => {
    expect(() => validateAgentScope(baseCtx, "evil-actor", "thefold"))
      .toThrow("Scope violation");
  });
});

// --- Rate limiting tests ---

describe("Rate limiting (ASI02)", () => {
  const testUserId = "test-user-" + Date.now();
  const otherUserId = "other-user-" + Date.now();

  beforeEach(async () => {
    await db.exec`DELETE FROM agent_rate_limits WHERE user_id LIKE 'test-user-%' OR user_id LIKE 'other-user-%'`;
  });

  it("should allow tasks under hourly limit", async () => {
    // Insert 5 tasks in current hour (well under limit)
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    await db.exec`
      INSERT INTO agent_rate_limits (user_id, window_start, task_count)
      VALUES (${testUserId}, ${hourStart.toISOString()}::timestamptz, 5)
    `;

    const result = await checkRateLimit(testUserId);
    expect(result.allowed).toBe(true);
  });

  it("should block tasks over hourly limit", async () => {
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    await db.exec`
      INSERT INTO agent_rate_limits (user_id, window_start, task_count)
      VALUES (${testUserId}, ${hourStart.toISOString()}::timestamptz, ${MAX_TASKS_PER_HOUR})
    `;

    const result = await checkRateLimit(testUserId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("per time");
  });

  it("should block tasks over daily limit", async () => {
    // Spread tasks across 11 hours with 10 tasks each = 110 total (over daily limit of 100)
    // Each hour has 10 tasks — under hourly limit of 20, so only day-check triggers
    const now = new Date();
    now.setMinutes(0, 0, 0);
    for (let i = 0; i < 11; i++) {
      const hourStart = new Date(now.getTime() - i * 3600_000);
      await db.exec`
        INSERT INTO agent_rate_limits (user_id, window_start, task_count)
        VALUES (${testUserId}, ${hourStart.toISOString()}::timestamptz, 10)
        ON CONFLICT (user_id, window_start) DO UPDATE SET task_count = agent_rate_limits.task_count + 10
      `;
    }

    const result = await checkRateLimit(testUserId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("per dag");
  });

  it("should track per-user independently", async () => {
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    // testUserId is at limit, otherUserId has none
    await db.exec`
      INSERT INTO agent_rate_limits (user_id, window_start, task_count)
      VALUES (${testUserId}, ${hourStart.toISOString()}::timestamptz, ${MAX_TASKS_PER_HOUR})
    `;

    const blocked = await checkRateLimit(testUserId);
    const allowed = await checkRateLimit(otherUserId);

    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it("should increment task count on recordTaskStart", async () => {
    await recordTaskStart(testUserId);
    await recordTaskStart(testUserId);

    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    const row = await db.queryRow<{ count: number }>`
      SELECT task_count as count FROM agent_rate_limits
      WHERE user_id = ${testUserId}
        AND window_start = ${hourStart.toISOString()}::timestamptz
    `;

    expect(row?.count).toBe(2);
  });
});

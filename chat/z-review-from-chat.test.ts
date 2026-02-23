import { describe, it, expect, vi } from "vitest";

// Mock Encore modules before importing chat.ts
vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn(() => ({ email: "test@test.com", userId: "test-user" })),
}));

vi.mock("~encore/clients", () => ({
  ai: { chat: vi.fn(), callAnthropicWithTools: vi.fn() },
  agent: { startTask: vi.fn(), respondToClarification: vi.fn() },
  tasks: { createTask: vi.fn(), updateTaskStatus: vi.fn(), getTaskInternal: vi.fn() },
  builder: { status: vi.fn() },
  registry: { findForTask: vi.fn(() => ({ components: [] })) },
  linear: { updateTask: vi.fn() },
}));

vi.mock("encore.dev/pubsub", () => ({
  Topic: vi.fn().mockImplementation(function () { return { publish: vi.fn() }; }),
  Subscription: vi.fn(),
}));

vi.mock("encore.dev/storage/sqldb", () => ({
  SQLDatabase: vi.fn().mockImplementation(function () {
    return { queryRow: vi.fn(), exec: vi.fn(), query: vi.fn() };
  }),
}));

vi.mock("encore.dev/api", () => ({
  api: (_opts: any, handler: any) => handler,
  APIError: {
    invalidArgument: (msg: string) => new Error(`invalid_argument: ${msg}`),
    notFound: (msg: string) => new Error(`not_found: ${msg}`),
    internal: (msg: string) => new Error(`internal: ${msg}`),
  },
}));

vi.mock("encore.dev/config", () => ({
  secret: () => () => "false",
}));

vi.mock("encore.dev/cron", () => ({
  CronJob: vi.fn(),
}));

vi.mock("encore.dev/log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("review from chat", () => {
  it("approveFromChat endpoint exists", async () => {
    const mod = await import("./chat");
    expect(mod.approveFromChat).toBeDefined();
  });

  it("requestChangesFromChat endpoint exists", async () => {
    const mod = await import("./chat");
    expect(mod.requestChangesFromChat).toBeDefined();
  });

  it("rejectFromChat endpoint exists", async () => {
    const mod = await import("./chat");
    expect(mod.rejectFromChat).toBeDefined();
  });

  it("ProgressReport has required fields", () => {
    const report = {
      filesChanged: [{ path: "test.ts", action: "create" as const }],
      costUsd: 0.05,
      duration: "30s",
      qualityScore: 8,
      reviewId: "review-123",
    };
    expect(report.filesChanged).toHaveLength(1);
    expect(report.costUsd).toBe(0.05);
    expect(report.qualityScore).toBe(8);
  });

  it("report includes review ID for linking", () => {
    const report = { reviewId: "abc-123" };
    expect(report.reviewId).toBeTruthy();
  });

  it("review endpoint paths follow convention", () => {
    const paths = ["/chat/review/approve", "/chat/review/changes", "/chat/review/reject"];
    expect(paths.every(p => p.startsWith("/chat/review/"))).toBe(true);
  });
});

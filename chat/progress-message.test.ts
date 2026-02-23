import { describe, it, expect, vi } from "vitest";

// Mock Encore modules before importing agent/helpers (which imports ~encore/clients)
vi.mock("~encore/clients", () => ({
  github: { getTree: vi.fn(), getFile: vi.fn(), findRelevantFiles: vi.fn(), createPR: vi.fn() },
  linear: { updateTask: vi.fn(), getTask: vi.fn() },
  sandbox: { create: vi.fn(), validate: vi.fn(), destroy: vi.fn() },
  tasks: { updateTaskStatus: vi.fn(), isCancelled: vi.fn(() => ({ cancelled: false })) },
}));

vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn(() => ({ email: "test@test.com", userId: "test-user" })),
}));

vi.mock("encore.dev/pubsub", () => ({
  Topic: vi.fn().mockImplementation(function () { return { publish: vi.fn() }; }),
  Subscription: vi.fn(),
}));

vi.mock("encore.dev/config", () => ({
  secret: () => () => "false",
}));

import { addStep, buildSteps } from "../agent/helpers";
import { serializeProgress, deserializeProgress } from "../agent/messages";
import type { AgentProgress, ProgressStep } from "../agent/messages";

describe("progress message system", () => {
  it("addStep adds new step to context", () => {
    const ctx: any = { taskId: "test", progressSteps: [] };
    addStep(ctx, { id: "context", label: "Reading repo", done: false });
    expect(buildSteps(ctx)).toHaveLength(1);
    expect(buildSteps(ctx)[0].id).toBe("context");
  });

  it("addStep updates existing step by id", () => {
    const ctx: any = { taskId: "test", progressSteps: [
      { id: "context", label: "Reading repo", done: false }
    ]};
    addStep(ctx, { id: "context", label: "Reading repo", detail: "14 files", done: true });
    expect(buildSteps(ctx)).toHaveLength(1);
    expect(buildSteps(ctx)[0].done).toBe(true);
    expect(buildSteps(ctx)[0].detail).toBe("14 files");
  });

  it("buildSteps returns empty array when no steps", () => {
    const ctx: any = { taskId: "test" };
    expect(buildSteps(ctx)).toEqual([]);
  });

  it("two tasks in same conversation have separate step lists", () => {
    const ctx1: any = { taskId: "task-1", progressSteps: [] };
    const ctx2: any = { taskId: "task-2", progressSteps: [] };
    addStep(ctx1, { id: "context", label: "Task 1 context", done: true });
    addStep(ctx2, { id: "context", label: "Task 2 context", done: false });
    expect(buildSteps(ctx1)[0].label).toBe("Task 1 context");
    expect(buildSteps(ctx2)[0].label).toBe("Task 2 context");
  });

  it("serialized progress can be deserialized", () => {
    const progress: AgentProgress = {
      status: "working",
      phase: "building",
      summary: "Building auth.ts",
      steps: [{ id: "build:1", label: "auth.ts", done: false }],
    };
    const serialized = serializeProgress(progress);
    const deserialized = deserializeProgress(serialized);
    expect(deserialized?.status).toBe("working");
    expect(deserialized?.steps).toHaveLength(1);
  });

  it("terminal status (done) preserves report data", () => {
    const progress: AgentProgress = {
      status: "done",
      phase: "completing",
      summary: "Ferdig",
      steps: [],
      report: {
        filesChanged: [{ path: "auth.ts", action: "create" }],
        costUsd: 0.05,
        duration: "30s",
        qualityScore: 8,
        reviewId: "review-123",
      },
    };
    const serialized = serializeProgress(progress);
    const deserialized = deserializeProgress(serialized);
    expect(deserialized?.report?.qualityScore).toBe(8);
    expect(deserialized?.report?.filesChanged).toHaveLength(1);
  });
});

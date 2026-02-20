import { describe, it, expect } from "vitest";
import { createPhaseTracker } from "./metrics";

describe("PhaseTracker", () => {
  // Test 1: Basic phase tracking
  it("should track a single phase with AI calls", () => {
    const tracker = createPhaseTracker();
    tracker.start("building");
    tracker.recordAICall({ inputTokens: 1000, outputTokens: 500, costEstimate: { totalCost: 0.05 }, modelUsed: "claude-sonnet" });
    tracker.recordAICall({ inputTokens: 800, outputTokens: 300, costEstimate: { totalCost: 0.03 }, modelUsed: "claude-sonnet" });
    const result = tracker.end();

    expect(result).not.toBeNull();
    expect(result!.phase).toBe("building");
    expect(result!.tokensInput).toBe(1800);
    expect(result!.tokensOutput).toBe(800);
    expect(result!.costUsd).toBeCloseTo(0.08, 2);
    expect(result!.aiCalls).toBe(2);
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
  });

  // Test 2: Multiple phases
  it("should track multiple phases sequentially", () => {
    const tracker = createPhaseTracker();
    tracker.start("context");
    tracker.end();
    tracker.start("confidence");
    tracker.recordAICall({ inputTokens: 500, outputTokens: 200, costEstimate: { totalCost: 0.02 } });
    tracker.end();
    tracker.start("building");
    tracker.recordAICall({ inputTokens: 2000, outputTokens: 1000, costEstimate: { totalCost: 0.10 } });
    tracker.end();

    const all = tracker.getAll();
    expect(all.length).toBe(3);
    expect(all[0].phase).toBe("context");
    expect(all[1].phase).toBe("confidence");
    expect(all[2].phase).toBe("building");
    expect(all[2].costUsd).toBeCloseTo(0.10, 2);
  });

  // Test 3: Auto-end previous phase
  it("should auto-end previous phase when starting new", () => {
    const tracker = createPhaseTracker();
    tracker.start("context");
    tracker.recordAICall({ inputTokens: 100, outputTokens: 50 });
    tracker.start("confidence"); // auto-ends "context"
    tracker.end();

    const all = tracker.getAll();
    expect(all.length).toBe(2);
    expect(all[0].phase).toBe("context");
    expect(all[0].tokensInput).toBe(100);
  });

  // Test 4: getAll includes current phase
  it("should include current phase in getAll", () => {
    const tracker = createPhaseTracker();
    tracker.start("building");
    tracker.recordAICall({ inputTokens: 500, outputTokens: 200 });

    const all = tracker.getAll();
    expect(all.length).toBe(1);
    expect(all[0].phase).toBe("building");
    expect(all[0].tokensInput).toBe(500);
  });

  // Test 5: Empty tracker
  it("should return empty array when no phases tracked", () => {
    const tracker = createPhaseTracker();
    expect(tracker.getAll()).toEqual([]);
    expect(tracker.end()).toBeNull();
  });

  // Test 6: Cache tokens
  it("should track cache tokens", () => {
    const tracker = createPhaseTracker();
    tracker.start("planning");
    tracker.recordAICall({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 800 });
    const result = tracker.end();
    expect(result!.cachedTokens).toBe(800);
  });

  // Test 7: Cost accumulation within phase (retries)
  it("should accumulate cost across retries within same phase", () => {
    const tracker = createPhaseTracker();
    tracker.start("building");
    // First attempt
    tracker.recordAICall({ inputTokens: 2000, outputTokens: 1000, costEstimate: { totalCost: 0.10 } });
    // Retry after validation failure
    tracker.recordAICall({ inputTokens: 500, outputTokens: 200, costEstimate: { totalCost: 0.02 } });
    // Second attempt
    tracker.recordAICall({ inputTokens: 2000, outputTokens: 1000, costEstimate: { totalCost: 0.10 } });
    const result = tracker.end();

    expect(result!.aiCalls).toBe(3);
    expect(result!.costUsd).toBeCloseTo(0.22, 2);
    expect(result!.tokensInput).toBe(4500);
  });
});

// DB-dependent tests (savePhaseMetrics, getTaskCostBreakdown)
// require agent_jobs + agent_phase_metrics tables

describe("Phase Metrics DB", () => {
  it("should save and retrieve phase metrics", async () => {
    const { createJob, startJob } = await import("./db");
    const jobId = await createJob({
      taskId: "metrics-test-1",
      conversationId: "conv-metrics",
      repoOwner: "test",
      repoName: "metrics-repo",
    });
    await startJob(jobId);

    const { savePhaseMetrics, getTaskCostBreakdown } = await import("./metrics");

    await savePhaseMetrics(jobId, "metrics-test-1", [
      { phase: "context", tokensInput: 500, tokensOutput: 100, cachedTokens: 0, costUsd: 0.01, durationMs: 200, model: "sonnet", aiCalls: 0 },
      { phase: "confidence", tokensInput: 1000, tokensOutput: 300, cachedTokens: 500, costUsd: 0.03, durationMs: 1500, model: "sonnet", aiCalls: 1 },
      { phase: "building", tokensInput: 5000, tokensOutput: 2000, cachedTokens: 1000, costUsd: 0.15, durationMs: 8000, model: "sonnet", aiCalls: 3 },
    ]);

    const breakdown = await getTaskCostBreakdown("metrics-test-1");
    expect(breakdown).not.toBeNull();
    expect(breakdown!.phases.length).toBe(3);
    expect(breakdown!.totalCostUsd).toBeCloseTo(0.19, 2);
    expect(breakdown!.phases[2].phase).toBe("building");
    expect(breakdown!.phases[2].aiCalls).toBe(3);
  });
});

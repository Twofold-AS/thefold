import { describe, it, expect } from "vitest";
import {
  createJob,
  startJob,
  updateJobCheckpoint,
  completeJob,
  failJob,
  findResumableJobs,
  expireOldJobs,
  getActiveJobForRepo,
} from "./db";

describe("Agent Jobs", () => {
  // Test 1: Opprett job
  it("should create a new job with pending status", async () => {
    const jobId = await createJob({
      taskId: "task-1",
      conversationId: "conv-1",
      repoOwner: "owner",
      repoName: "repo",
    });
    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
  });

  // Test 2: Start job
  it("should start a job and set status to running", async () => {
    const repo = "r-start-" + Date.now();
    const jobId = await createJob({ taskId: "task-2", conversationId: "conv-2", repoOwner: "o", repoName: repo });
    await startJob(jobId);
    const active = await getActiveJobForRepo("o", repo);
    expect(active).not.toBeNull();
    expect(active!.status).toBe("running");
    expect(active!.attempts).toBe(1);
  });

  // Test 3: Checkpoint oppdatering
  it("should update checkpoint with phase and cost data", async () => {
    const repo = "r-cp-" + Date.now();
    const jobId = await createJob({ taskId: "task-3", conversationId: "conv-3", repoOwner: "o", repoName: repo });
    await startJob(jobId);
    await updateJobCheckpoint(jobId, "building", { sandboxId: "sb-123", attempt: 1 }, { costUsd: 0.05, tokensUsed: 5000 });
    const job = await getActiveJobForRepo("o", repo);
    expect(job!.currentPhase).toBe("building");
    expect(job!.costUsd).toBeCloseTo(0.05, 2);
    expect(job!.tokensUsed).toBe(5000);
  });

  // Test 4: Fullfør job
  it("should complete a job and remove from active", async () => {
    const repo = "r-done-" + Date.now();
    const jobId = await createJob({ taskId: "task-4", conversationId: "conv-4", repoOwner: "o", repoName: repo });
    await startJob(jobId);
    await completeJob(jobId);
    const active = await getActiveJobForRepo("o", repo);
    expect(active).toBeNull();
  });

  // Test 5: Feil-marker job
  it("should fail a job with error message and remove from active", async () => {
    const repo = "r-fail-" + Date.now();
    const jobId = await createJob({ taskId: "task-5", conversationId: "conv-5", repoOwner: "o", repoName: repo });
    await startJob(jobId);
    await failJob(jobId, "Sandbox timeout");
    const active = await getActiveJobForRepo("o", repo);
    expect(active).toBeNull();
  });

  // Test 6: Finn resumable jobs
  it("should find running jobs as resumable", async () => {
    const repo = "r-resume-" + Date.now();
    const jobId = await createJob({ taskId: "task-6", conversationId: "conv-6", repoOwner: "o", repoName: repo });
    await startJob(jobId);
    // Simulate crash — do not complete
    const resumable = await findResumableJobs();
    expect(resumable.length).toBeGreaterThanOrEqual(1);
    expect(resumable.some(j => j.taskId === "task-6")).toBe(true);
    // Cleanup
    await failJob(jobId, "test cleanup");
  });

  // Test 7: getActiveJobForRepo returnerer null når ingen aktiv job
  it("should return null when no active job exists", async () => {
    const active = await getActiveJobForRepo("nonexistent-owner-" + Date.now(), "nonexistent-repo");
    expect(active).toBeNull();
  });

  // Test 8: Kostnads-akkumulering over flere checkpoints
  it("should accumulate cost across multiple checkpoints", async () => {
    const repo = "r-cost-" + Date.now();
    const jobId = await createJob({ taskId: "task-8", conversationId: "conv-8", repoOwner: "o", repoName: repo });
    await startJob(jobId);
    await updateJobCheckpoint(jobId, "context", {}, { costUsd: 0.02, tokensUsed: 2000 });
    await updateJobCheckpoint(jobId, "building", {}, { costUsd: 0.08, tokensUsed: 8000 });
    const job = await getActiveJobForRepo("o", repo);
    expect(job!.costUsd).toBeCloseTo(0.10, 2);
    expect(job!.tokensUsed).toBe(10000);
    await failJob(jobId, "test cleanup");
  });
});

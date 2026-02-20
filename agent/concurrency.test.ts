import { describe, it, expect } from "vitest";
import { acquireRepoLock, releaseRepoLock } from "./db";

describe("Advisory Lock per Repo", () => {
  const owner = "test-org";
  const repo = "test-repo-" + Date.now();

  it("acquires lock on fresh repo", async () => {
    const locked = await acquireRepoLock(owner, repo);
    expect(locked).toBe(true);
    await releaseRepoLock(owner, repo);
  });

  it("same-session re-acquire is reentrant", async () => {
    const first = await acquireRepoLock(owner, repo);
    expect(first).toBe(true);
    // pg_try_advisory_lock is reentrant within the same session
    const second = await acquireRepoLock(owner, repo);
    expect(second).toBe(true);
    // Release both (must release same number of times as acquired)
    await releaseRepoLock(owner, repo);
    await releaseRepoLock(owner, repo);
  });

  it("release then re-acquire succeeds", async () => {
    const first = await acquireRepoLock(owner, repo);
    expect(first).toBe(true);
    await releaseRepoLock(owner, repo);
    const second = await acquireRepoLock(owner, repo);
    expect(second).toBe(true);
    await releaseRepoLock(owner, repo);
  });

  it("different repos can be locked simultaneously", async () => {
    const repoA = repo + "-a";
    const repoB = repo + "-b";
    const lockA = await acquireRepoLock(owner, repoA);
    const lockB = await acquireRepoLock(owner, repoB);
    expect(lockA).toBe(true);
    expect(lockB).toBe(true);
    await releaseRepoLock(owner, repoA);
    await releaseRepoLock(owner, repoB);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as childProcess from "child_process";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

// Import after mock
import {
  createDockerSandbox,
  execInDocker,
  writeFileDocker,
  deleteFileDocker,
  destroyDockerSandbox,
  cleanupOldContainers,
} from "./docker";

const mockExecSync = vi.mocked(childProcess.execSync);

describe("Docker sandbox", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createDockerSandbox", () => {
    it("should create a container, clone repo, and return an ID", async () => {
      // Mock all execSync calls in sequence:
      // 1. docker create
      // 2. docker start
      // 3. docker exec apk add git
      // 4. mkdir temp dir
      // 5. git clone
      // 6. docker cp
      // 7. rm temp dir
      // 8. docker exec npm install
      mockExecSync.mockReturnValue(Buffer.from("ok"));

      const id = await createDockerSandbox({
        repoOwner: "test-owner",
        repoName: "test-repo",
        ref: "main",
        githubToken: "fake-token",
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id.length).toBe(36); // UUID format

      // Verify docker create was called with security flags
      const createCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("docker create")
      );
      expect(createCall).toBeDefined();
      expect(createCall![0]).toContain("--memory=512m");
      expect(createCall![0]).toContain("--cpus=0.5");
      expect(createCall![0]).toContain("--network=none");
      expect(createCall![0]).toContain("--read-only");
      expect(createCall![0]).toContain("node:20-alpine");

      // Verify docker start was called
      const startCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("docker start")
      );
      expect(startCall).toBeDefined();

      // Verify git clone was called
      const cloneCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("git clone")
      );
      expect(cloneCall).toBeDefined();
      expect(cloneCall![0]).toContain("test-owner/test-repo");
    });

    it("should default ref to main when not provided", async () => {
      mockExecSync.mockReturnValue(Buffer.from("ok"));

      await createDockerSandbox({
        repoOwner: "owner",
        repoName: "repo",
        githubToken: "token",
      });

      const cloneCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("git clone")
      );
      expect(cloneCall![0]).toContain("--branch main");
    });

    it("should clean up on failure", async () => {
      // First calls succeed, then git clone fails
      let callCount = 0;
      mockExecSync.mockImplementation((cmd) => {
        callCount++;
        const cmdStr = typeof cmd === "string" ? cmd : cmd.toString();
        if (cmdStr.includes("git clone")) {
          throw new Error("clone failed");
        }
        return Buffer.from("ok");
      });

      await expect(
        createDockerSandbox({
          repoOwner: "owner",
          repoName: "repo",
          githubToken: "token",
        })
      ).rejects.toThrow("clone failed");

      // Should have attempted docker rm -f for cleanup
      const rmCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("docker rm -f")
      );
      expect(rmCall).toBeDefined();
    });
  });

  describe("execInDocker", () => {
    it("should execute a command in the container and return output", async () => {
      mockExecSync.mockReturnValue(Buffer.from("hello world\n"));

      const result = await execInDocker("test-id", "echo hello world");

      expect(result.stdout).toBe("hello world\n");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);

      // Verify docker exec was called with shell escape
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("docker exec thefold-sandbox-test-id sh -c"),
        expect.any(Object)
      );
    });

    it("should return stderr and exit code on failure", async () => {
      const error: any = new Error("command failed");
      error.stdout = Buffer.from("partial output");
      error.stderr = Buffer.from("error details");
      error.status = 1;
      mockExecSync.mockImplementation(() => { throw error; });

      const result = await execInDocker("test-id", "bad-command");

      expect(result.stdout).toBe("partial output");
      expect(result.stderr).toBe("error details");
      expect(result.exitCode).toBe(1);
    });

    it("should truncate long output to 50000 chars", async () => {
      const longOutput = "x".repeat(60_000);
      mockExecSync.mockReturnValue(Buffer.from(longOutput));

      const result = await execInDocker("test-id", "echo long");

      expect(result.stdout.length).toBe(50_000);
    });
  });

  describe("writeFileDocker", () => {
    it("should create parent directory and write file via docker exec", async () => {
      // First call: mkdir, Second call: docker exec cat >
      mockExecSync.mockReturnValue(Buffer.from(""));

      await writeFileDocker("test-id", "src/utils/helper.ts", "export const x = 1;");

      // Verify mkdir -p was called for parent dir
      const mkdirCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("mkdir -p")
      );
      expect(mkdirCall).toBeDefined();

      // Verify content was written via stdin
      const writeCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("cat >")
      );
      expect(writeCall).toBeDefined();
      expect(writeCall![1]).toHaveProperty("input", "export const x = 1;");
    });
  });

  describe("deleteFileDocker", () => {
    it("should delete a file in the container", async () => {
      mockExecSync.mockReturnValue(Buffer.from(""));

      await deleteFileDocker("test-id", "old-file.ts");

      // Should execute rm -f inside container
      const rmCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("rm -f /workspace/repo/old-file.ts")
      );
      expect(rmCall).toBeDefined();
    });
  });

  describe("destroyDockerSandbox", () => {
    it("should remove the container", async () => {
      mockExecSync.mockReturnValue(Buffer.from(""));

      await destroyDockerSandbox("test-id");

      expect(mockExecSync).toHaveBeenCalledWith(
        "docker rm -f thefold-sandbox-test-id",
        expect.any(Object)
      );
    });

    it("should not throw if container already removed", async () => {
      mockExecSync.mockImplementation(() => { throw new Error("no such container"); });

      // Should not throw
      await destroyDockerSandbox("already-gone");
    });
  });

  describe("cleanupOldContainers", () => {
    it("should remove containers older than maxAgeMinutes", () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      mockExecSync.mockReturnValueOnce(
        Buffer.from(`abc123 thefold-sandbox-old-id ${oldDate}`)
      );
      // Second call: docker rm -f
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      const removed = cleanupOldContainers(30);

      expect(removed).toBe(1);
    });

    it("should not remove containers younger than maxAgeMinutes", () => {
      const recentDate = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
      mockExecSync.mockReturnValueOnce(
        Buffer.from(`abc123 thefold-sandbox-recent ${recentDate}`)
      );

      const removed = cleanupOldContainers(30);

      expect(removed).toBe(0);
    });

    it("should handle empty docker ps output", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      const removed = cleanupOldContainers(30);

      expect(removed).toBe(0);
    });

    it("should handle docker not available", () => {
      mockExecSync.mockImplementation(() => { throw new Error("docker not found"); });

      const removed = cleanupOldContainers(30);

      expect(removed).toBe(0);
    });
  });

  describe("security constraints", () => {
    it("should use --network=none for network isolation", async () => {
      mockExecSync.mockReturnValue(Buffer.from("ok"));

      await createDockerSandbox({
        repoOwner: "o",
        repoName: "r",
        githubToken: "t",
      });

      const createCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("docker create")
      );
      expect(createCall![0]).toContain("--network=none");
    });

    it("should use --read-only with tmpfs for filesystem isolation", async () => {
      mockExecSync.mockReturnValue(Buffer.from("ok"));

      await createDockerSandbox({
        repoOwner: "o",
        repoName: "r",
        githubToken: "t",
      });

      const createCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("docker create")
      );
      expect(createCall![0]).toContain("--read-only");
      expect(createCall![0]).toContain("--tmpfs /tmp");
      expect(createCall![0]).toContain("--tmpfs /workspace");
    });

    it("should enforce memory and CPU limits", async () => {
      mockExecSync.mockReturnValue(Buffer.from("ok"));

      await createDockerSandbox({
        repoOwner: "o",
        repoName: "r",
        githubToken: "t",
      });

      const createCall = mockExecSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("docker create")
      );
      expect(createCall![0]).toContain("--memory=512m");
      expect(createCall![0]).toContain("--cpus=0.5");
    });
  });
});

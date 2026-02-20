import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { takeSnapshot, compareSnapshots, takeDockerSnapshot, type FileSnapshot } from "./snapshot";

describe("Snapshot module", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("takeSnapshot", () => {
    it("should return files with hash and size", () => {
      // Create test files
      fs.writeFileSync(path.join(tempDir, "file1.ts"), "export const x = 1;");
      fs.writeFileSync(path.join(tempDir, "file2.js"), "console.log('hello');");

      const snapshot = takeSnapshot(tempDir);

      expect(snapshot.size).toBe(2);
      expect(snapshot.get("file1.ts")).toBeDefined();
      expect(snapshot.get("file2.js")).toBeDefined();

      const file1 = snapshot.get("file1.ts")!;
      expect(file1.hash).toBeDefined();
      expect(file1.hash.length).toBe(64); // SHA-256 hex = 64 chars
      expect(file1.size).toBeGreaterThan(0);
    });

    it("should ignore node_modules and .git", () => {
      // Create test structure
      fs.writeFileSync(path.join(tempDir, "src.ts"), "code");
      fs.mkdirSync(path.join(tempDir, "node_modules"));
      fs.writeFileSync(path.join(tempDir, "node_modules", "dep.js"), "dependency");
      fs.mkdirSync(path.join(tempDir, ".git"));
      fs.writeFileSync(path.join(tempDir, ".git", "config"), "git config");

      const snapshot = takeSnapshot(tempDir);

      expect(snapshot.size).toBe(1);
      expect(snapshot.has("src.ts")).toBe(true);
      expect(snapshot.has("node_modules/dep.js")).toBe(false);
      expect(snapshot.has(".git/config")).toBe(false);
    });

    it("should ignore binary files (.png, .jpg)", () => {
      fs.writeFileSync(path.join(tempDir, "code.ts"), "code");
      fs.writeFileSync(path.join(tempDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      fs.writeFileSync(path.join(tempDir, "photo.jpg"), Buffer.from([0xff, 0xd8, 0xff]));

      const snapshot = takeSnapshot(tempDir);

      expect(snapshot.size).toBe(1);
      expect(snapshot.has("code.ts")).toBe(true);
      expect(snapshot.has("image.png")).toBe(false);
      expect(snapshot.has("photo.jpg")).toBe(false);
    });

    it("should ignore files over 500KB", () => {
      fs.writeFileSync(path.join(tempDir, "small.ts"), "x".repeat(1000));
      fs.writeFileSync(path.join(tempDir, "large.ts"), "x".repeat(600_000));

      const snapshot = takeSnapshot(tempDir);

      expect(snapshot.has("small.ts")).toBe(true);
      expect(snapshot.has("large.ts")).toBe(false);
    });

    it("should handle nested directories", () => {
      fs.mkdirSync(path.join(tempDir, "src"));
      fs.mkdirSync(path.join(tempDir, "src", "utils"));
      fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "index");
      fs.writeFileSync(path.join(tempDir, "src", "utils", "helper.ts"), "helper");

      const snapshot = takeSnapshot(tempDir);

      expect(snapshot.size).toBe(2);
      expect(snapshot.has("src/index.ts")).toBe(true);
      expect(snapshot.has("src/utils/helper.ts")).toBe(true);
    });
  });

  describe("compareSnapshots", () => {
    it("should identify created files", () => {
      const before = new Map<string, FileSnapshot>();
      const after = new Map<string, FileSnapshot>([
        ["new.ts", { path: "new.ts", hash: "abc123", size: 100 }],
      ]);

      const diff = compareSnapshots(before, after);

      expect(diff.created).toEqual(["new.ts"]);
      expect(diff.modified).toEqual([]);
      expect(diff.deleted).toEqual([]);
      expect(diff.unchanged).toBe(0);
      expect(diff.totalDiffBytes).toBe(100);
    });

    it("should identify modified files (different hash)", () => {
      const before = new Map<string, FileSnapshot>([
        ["file.ts", { path: "file.ts", hash: "abc123", size: 100 }],
      ]);
      const after = new Map<string, FileSnapshot>([
        ["file.ts", { path: "file.ts", hash: "def456", size: 150 }],
      ]);

      const diff = compareSnapshots(before, after);

      expect(diff.created).toEqual([]);
      expect(diff.modified).toEqual(["file.ts"]);
      expect(diff.deleted).toEqual([]);
      expect(diff.unchanged).toBe(0);
      expect(diff.totalDiffBytes).toBe(50);
    });

    it("should identify deleted files", () => {
      const before = new Map<string, FileSnapshot>([
        ["deleted.ts", { path: "deleted.ts", hash: "abc123", size: 100 }],
      ]);
      const after = new Map<string, FileSnapshot>();

      const diff = compareSnapshots(before, after);

      expect(diff.created).toEqual([]);
      expect(diff.modified).toEqual([]);
      expect(diff.deleted).toEqual(["deleted.ts"]);
      expect(diff.unchanged).toBe(0);
      expect(diff.totalDiffBytes).toBe(100);
    });

    it("should count unchanged files correctly", () => {
      const before = new Map<string, FileSnapshot>([
        ["unchanged1.ts", { path: "unchanged1.ts", hash: "abc123", size: 100 }],
        ["unchanged2.ts", { path: "unchanged2.ts", hash: "def456", size: 200 }],
        ["modified.ts", { path: "modified.ts", hash: "old", size: 50 }],
      ]);
      const after = new Map<string, FileSnapshot>([
        ["unchanged1.ts", { path: "unchanged1.ts", hash: "abc123", size: 100 }],
        ["unchanged2.ts", { path: "unchanged2.ts", hash: "def456", size: 200 }],
        ["modified.ts", { path: "modified.ts", hash: "new", size: 60 }],
      ]);

      const diff = compareSnapshots(before, after);

      expect(diff.unchanged).toBe(2);
      expect(diff.modified).toEqual(["modified.ts"]);
      expect(diff.totalDiffBytes).toBe(10);
    });
  });

  describe("takeDockerSnapshot", () => {
    it("should parse find + sha256sum output correctly", async () => {
      const mockRun = async (cmd: string) => {
        return {
          stdout: "1234 abc123def456abc123def456abc123def456abc123def456abc123def456abc1 /workspace/repo/src/file.ts\n" +
                  "5678 def456789012def456789012def456789012def456789012def456789012def4 /workspace/repo/lib/util.js\n",
          exitCode: 0,
        };
      };

      const snapshot = await takeDockerSnapshot(mockRun);

      expect(snapshot.size).toBe(2);
      expect(snapshot.get("src/file.ts")).toEqual({
        path: "src/file.ts",
        hash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
        size: 1234,
      });
      expect(snapshot.get("lib/util.js")).toEqual({
        path: "lib/util.js",
        hash: "def456789012def456789012def456789012def456789012def456789012def4",
        size: 5678,
      });
    });

    it("should handle empty output gracefully", async () => {
      const mockRun = async () => ({ stdout: "", exitCode: 0 });

      const snapshot = await takeDockerSnapshot(mockRun);

      expect(snapshot.size).toBe(0);
    });

    it("should handle command failure gracefully", async () => {
      const mockRun = async () => ({ stdout: "", exitCode: 1 });

      const snapshot = await takeDockerSnapshot(mockRun);

      expect(snapshot.size).toBe(0);
    });

    it("should skip malformed lines", async () => {
      const mockRun = async () => {
        return {
          stdout: "malformed line\n" +
                  "1234 abc123def456abc123def456abc123def456abc123def456abc123def456abc1 /workspace/repo/valid.ts\n" +
                  "invalid hash length /workspace/repo/bad.ts\n",
          exitCode: 0,
        };
      };

      const snapshot = await takeDockerSnapshot(mockRun);

      expect(snapshot.size).toBe(1);
      expect(snapshot.has("valid.ts")).toBe(true);
      expect(snapshot.has("bad.ts")).toBe(false);
    });
  });
});

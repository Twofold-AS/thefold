import { describe, it, expect } from "vitest";
import { getTree, getFile, findRelevantFiles, getFileMetadata, getFileChunk } from "./github";

describe("GitHub service", () => {
  const testOwner = "Twofold-AS";
  const testRepo = "thefold";

  describe("getTree", () => {
    it(
      "should fetch file tree from repository",
      { timeout: 30000 },
      async () => {
        const result = await getTree({
          owner: testOwner,
          repo: testRepo,
        });

        expect(result).toBeDefined();
        expect(result.tree).toBeDefined();
        expect(Array.isArray(result.tree)).toBe(true);
        expect(result.tree.length).toBeGreaterThan(0);

        // Verify tree contains expected files
        expect(result.tree.some((path) => path === "package.json")).toBe(true);

        // Verify treeString is generated
        expect(result.treeString).toBeDefined();
        expect(typeof result.treeString).toBe("string");
        expect(result.treeString.length).toBeGreaterThan(0);

        // Verify packageJson is parsed if present
        if (result.packageJson) {
          expect(typeof result.packageJson).toBe("object");
        }
      }
    );

    it(
      "should filter out node_modules and build directories",
      { timeout: 30000 },
      async () => {
        const result = await getTree({
          owner: testOwner,
          repo: testRepo,
        });

        // Ensure filtered paths are not included
        expect(result.tree.some((path) => path.startsWith("node_modules/"))).toBe(
          false
        );
        expect(result.tree.some((path) => path.startsWith(".git/"))).toBe(false);
        expect(result.tree.some((path) => path.startsWith("dist/"))).toBe(false);
        expect(result.tree.some((path) => path.startsWith(".next/"))).toBe(false);
      }
    );
  });

  describe("getFile", () => {
    it(
      "should read package.json and return valid JSON content",
      { timeout: 30000 },
      async () => {
        const result = await getFile({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
        });

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(typeof result.content).toBe("string");
        expect(result.content.length).toBeGreaterThan(0);

        // Verify it's valid JSON
        const parsed = JSON.parse(result.content);
        expect(parsed).toBeDefined();
        expect(parsed.name).toBeDefined();

        // Verify SHA is returned
        expect(result.sha).toBeDefined();
        expect(typeof result.sha).toBe("string");
        expect(result.sha.length).toBeGreaterThan(0);
      }
    );

    it(
      "should read encore.app file",
      { timeout: 30000 },
      async () => {
        const result = await getFile({
          owner: testOwner,
          repo: testRepo,
          path: "encore.app",
        });

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(typeof result.content).toBe("string");
        expect(result.sha).toBeDefined();
      }
    );
  });

  describe("findRelevantFiles", () => {
    it(
      "should find relevant files for a task description",
      { timeout: 30000 },
      async () => {
        // First get the file tree
        const treeResult = await getTree({
          owner: testOwner,
          repo: testRepo,
        });

        // Then find relevant files for a chat-related task
        const result = await findRelevantFiles({
          owner: testOwner,
          repo: testRepo,
          taskDescription: "Update the chat service to add message threading",
          tree: treeResult.tree,
        });

        expect(result).toBeDefined();
        expect(result.paths).toBeDefined();
        expect(Array.isArray(result.paths)).toBe(true);
        expect(result.paths.length).toBeGreaterThan(0);

        // Should include essential files
        expect(result.paths.includes("package.json")).toBe(true);

        // Should prioritize files related to the task
        const hasChatRelated = result.paths.some((path) =>
          path.toLowerCase().includes("chat")
        );
        expect(hasChatRelated).toBe(true);
      }
    );

    it(
      "should limit results to maximum 20 files plus essentials",
      { timeout: 30000 },
      async () => {
        const treeResult = await getTree({
          owner: testOwner,
          repo: testRepo,
        });

        const result = await findRelevantFiles({
          owner: testOwner,
          repo: testRepo,
          taskDescription: "Add a new feature",
          tree: treeResult.tree,
        });

        // Max 20 scored files + essentials (package.json, tsconfig.json, encore.app)
        expect(result.paths.length).toBeLessThanOrEqual(23);
      }
    );

    it(
      "should boost TypeScript files and encore.service.ts files",
      { timeout: 30000 },
      async () => {
        const treeResult = await getTree({
          owner: testOwner,
          repo: testRepo,
        });

        const result = await findRelevantFiles({
          owner: testOwner,
          repo: testRepo,
          taskDescription: "Update the memory service",
          tree: treeResult.tree,
        });

        // Should include .ts files
        const hasTypeScriptFiles = result.paths.some((path) => path.endsWith(".ts"));
        expect(hasTypeScriptFiles).toBe(true);

        // Should include memory-related files
        const hasMemoryFiles = result.paths.some((path) =>
          path.toLowerCase().includes("memory")
        );
        expect(hasMemoryFiles).toBe(true);
      }
    );
  });

  describe("getFileMetadata", () => {
    it(
      "should return line count and size for a file",
      { timeout: 30000 },
      async () => {
        const result = await getFileMetadata({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
        });

        expect(result.path).toBe("package.json");
        expect(result.totalLines).toBeGreaterThan(0);
        expect(result.sizeBytes).toBeGreaterThan(0);
      }
    );
  });

  describe("getFileChunk", () => {
    it(
      "should return the first chunk of a file",
      { timeout: 30000 },
      async () => {
        const result = await getFileChunk({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
          startLine: 1,
          maxLines: 10,
        });

        expect(result.path).toBe("package.json");
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.startLine).toBe(1);
        expect(result.endLine).toBeLessThanOrEqual(10);
        expect(result.totalLines).toBeGreaterThan(0);
        expect(typeof result.hasMore).toBe("boolean");
        expect(result.tokenEstimate).toBeGreaterThan(0);
      }
    );

    it(
      "should handle reading from a specific start line",
      { timeout: 30000 },
      async () => {
        const result = await getFileChunk({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
          startLine: 3,
          maxLines: 5,
        });

        expect(result.startLine).toBe(3);
        expect(result.endLine).toBeLessThanOrEqual(8);
      }
    );

    it(
      "should indicate hasMore=false when reading to end of file",
      { timeout: 30000 },
      async () => {
        // Read with a very large maxLines to get the whole file
        const result = await getFileChunk({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
          startLine: 1,
          maxLines: 500,
        });

        expect(result.hasMore).toBe(false);
        expect(result.nextStartLine).toBeNull();
        expect(result.endLine).toBe(result.totalLines);
      }
    );

    it(
      "should return consistent totalLines with getFileMetadata",
      { timeout: 30000 },
      async () => {
        const meta = await getFileMetadata({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
        });

        const chunk = await getFileChunk({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
          startLine: 1,
          maxLines: 500,
        });

        expect(chunk.totalLines).toBe(meta.totalLines);
      }
    );

    it(
      "should support paginated reading across chunks",
      { timeout: 30000 },
      async () => {
        // Read first 3 lines
        const chunk1 = await getFileChunk({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
          startLine: 1,
          maxLines: 3,
        });

        expect(chunk1.hasMore).toBe(true);
        expect(chunk1.nextStartLine).toBe(4);

        // Read next chunk from where we left off
        const chunk2 = await getFileChunk({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
          startLine: chunk1.nextStartLine!,
          maxLines: 3,
        });

        expect(chunk2.startLine).toBe(4);
        // Content should be different
        expect(chunk2.content).not.toBe(chunk1.content);
      }
    );

    it(
      "should default to 100 maxLines when not specified",
      { timeout: 30000 },
      async () => {
        const meta = await getFileMetadata({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
        });

        const result = await getFileChunk({
          owner: testOwner,
          repo: testRepo,
          path: "package.json",
        });

        // If file has fewer than 100 lines, endLine should equal totalLines
        if (meta.totalLines <= 100) {
          expect(result.endLine).toBe(meta.totalLines);
          expect(result.hasMore).toBe(false);
        } else {
          expect(result.endLine).toBe(100);
          expect(result.hasMore).toBe(true);
        }
      }
    );
  });
});

import { describe, it, expect } from "vitest";
import { getTree, getFile, findRelevantFiles } from "./github";

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
});

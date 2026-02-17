import { describe, it, expect, vi } from "vitest";
import { getTree, getFile, findRelevantFiles, getFileMetadata, getFileChunk, createPR } from "./github";

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

  describe("getTree — empty repo handling", () => {
    it(
      "should return empty: true for a non-existent repo (simulates empty repo 404)",
      { timeout: 30000 },
      async () => {
        // A non-existent repo returns 404 — same as an empty repo
        const result = await getTree({
          owner: testOwner,
          repo: "this-repo-does-not-exist-thefold-test-2026",
        });

        expect(result.empty).toBe(true);
        expect(result.tree).toEqual([]);
        expect(result.treeString).toBe("");
        expect(result.packageJson).toBeUndefined();
      }
    );

    it(
      "should NOT set empty for a normal repo",
      { timeout: 30000 },
      async () => {
        const result = await getTree({
          owner: testOwner,
          repo: testRepo,
        });

        expect(result.empty).toBeUndefined();
        expect(result.tree.length).toBeGreaterThan(0);
      }
    );
  });

  describe("createPR — empty repo handling", () => {
    it(
      "should handle empty repo by creating initial commit then normal PR",
      { timeout: 30000 },
      async () => {
        // This test verifies the createPR logic flow using mocked fetch.
        // We mock fetch to simulate: empty repo (404 on ref), then successful
        // blob/tree/commit/ref/PR creation.
        const originalFetch = global.fetch;
        let fetchCalls: string[] = [];

        global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          fetchCalls.push(urlStr);

          // 1. getRefSha("main") → 404 (empty repo)
          if (urlStr.includes("/git/ref/heads/main")) {
            return new Response("", { status: 404 });
          }
          // 2. getRefSha("master") → 404 (empty repo)
          if (urlStr.includes("/git/ref/heads/master")) {
            return new Response("", { status: 404 });
          }
          // 3. Create blob (README + file blobs)
          if (urlStr.includes("/git/blobs") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "blob-sha-" + Math.random().toString(36).slice(2, 8) }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // 4. Create tree
          if (urlStr.includes("/git/trees") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "tree-sha-123" }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // 5. Create commit
          if (urlStr.includes("/git/commits") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "commit-sha-123", tree: { sha: "tree-sha-123" } }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // 6. Create/get ref
          if (urlStr.includes("/git/refs") && init?.method === "POST") {
            return new Response(JSON.stringify({ ref: "refs/heads/main", object: { sha: "commit-sha-123" } }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // 7. Get commit (for base_tree)
          if (urlStr.includes("/git/commits/") && (!init?.method || init.method === "GET")) {
            return new Response(JSON.stringify({ sha: "commit-sha-123", tree: { sha: "tree-sha-123" } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          // 8. Create pull request
          if (urlStr.includes("/pulls") && init?.method === "POST") {
            return new Response(JSON.stringify({ html_url: "https://github.com/test/repo/pull/1", number: 1 }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response("Not found", { status: 404 });
        }) as any;

        try {
          const result = await createPR({
            owner: "test-owner",
            repo: "empty-repo",
            branch: "feature/test",
            title: "Test PR",
            body: "Test body",
            files: [{ path: "index.ts", content: "console.log('hello');", action: "create" }],
          });

          expect(result.url).toBe("https://github.com/test/repo/pull/1");
          expect(result.number).toBe(1);

          // Verify the flow: should have checked main, checked master,
          // then created initial commit (blob + tree + commit + ref)
          // then created PR files (blob + tree + commit + branch ref + PR)
          expect(fetchCalls.some(u => u.includes("/git/ref/heads/main"))).toBe(true);
          expect(fetchCalls.some(u => u.includes("/git/ref/heads/master"))).toBe(true);
          // At least 2 blob calls: 1 for README init + 1 for the file
          const blobCalls = fetchCalls.filter(u => u.includes("/git/blobs"));
          expect(blobCalls.length).toBeGreaterThanOrEqual(2);
          // Should create a pull request at the end
          expect(fetchCalls.some(u => u.includes("/pulls"))).toBe(true);
        } finally {
          global.fetch = originalFetch;
        }
      }
    );

    it(
      "should skip initial commit for repos that already have commits",
      { timeout: 30000 },
      async () => {
        const originalFetch = global.fetch;
        let fetchCalls: string[] = [];

        global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          fetchCalls.push(urlStr);

          // getRefSha("main") → 200 (repo has commits)
          if (urlStr.includes("/git/ref/heads/main") && (!init?.method || init.method === "GET")) {
            return new Response(JSON.stringify({ object: { sha: "existing-sha-456" } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Create blob
          if (urlStr.includes("/git/blobs") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "blob-sha-789" }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Get commit (base tree)
          if (urlStr.includes("/git/commits/existing-sha-456")) {
            return new Response(JSON.stringify({ sha: "existing-sha-456", tree: { sha: "base-tree-sha" } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Create tree
          if (urlStr.includes("/git/trees") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "new-tree-sha" }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Create commit
          if (urlStr.includes("/git/commits") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "new-commit-sha" }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Create ref (branch)
          if (urlStr.includes("/git/refs") && init?.method === "POST") {
            return new Response(JSON.stringify({ ref: "refs/heads/feature/test" }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Create PR
          if (urlStr.includes("/pulls") && init?.method === "POST") {
            return new Response(JSON.stringify({ html_url: "https://github.com/test/repo/pull/2", number: 2 }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response("Not found", { status: 404 });
        }) as any;

        try {
          const result = await createPR({
            owner: "test-owner",
            repo: "existing-repo",
            branch: "feature/test",
            title: "Test PR",
            body: "Test body",
            files: [{ path: "index.ts", content: "console.log('hello');", action: "create" }],
          });

          expect(result.url).toBe("https://github.com/test/repo/pull/2");
          expect(result.number).toBe(2);

          // Should NOT check master (main succeeded)
          expect(fetchCalls.some(u => u.includes("/git/ref/heads/master"))).toBe(false);
          // Should only have 1 blob call (the file, no README init)
          const blobCalls = fetchCalls.filter(u => u.includes("/git/blobs"));
          expect(blobCalls.length).toBe(1);
        } finally {
          global.fetch = originalFetch;
        }
      }
    );

    it(
      "should handle file deletions in PR",
      { timeout: 30000 },
      async () => {
        const originalFetch = global.fetch;

        global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === "string" ? url : url.toString();

          if (urlStr.includes("/git/ref/heads/main")) {
            return new Response(JSON.stringify({ object: { sha: "base-sha" } }), {
              status: 200, headers: { "Content-Type": "application/json" },
            });
          }
          if (urlStr.includes("/git/blobs") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "blob-sha" }), {
              status: 201, headers: { "Content-Type": "application/json" },
            });
          }
          if (urlStr.includes("/git/commits/base-sha")) {
            return new Response(JSON.stringify({ sha: "base-sha", tree: { sha: "base-tree" } }), {
              status: 200, headers: { "Content-Type": "application/json" },
            });
          }
          if (urlStr.includes("/git/trees") && init?.method === "POST") {
            // Verify tree includes deletion (sha: null)
            const body = JSON.parse(init.body as string);
            const deleteItem = body.tree.find((t: any) => t.path === "old-file.ts");
            expect(deleteItem).toBeDefined();
            expect(deleteItem.sha).toBeNull();
            return new Response(JSON.stringify({ sha: "new-tree" }), {
              status: 201, headers: { "Content-Type": "application/json" },
            });
          }
          if (urlStr.includes("/git/commits") && init?.method === "POST") {
            return new Response(JSON.stringify({ sha: "new-commit" }), {
              status: 201, headers: { "Content-Type": "application/json" },
            });
          }
          if (urlStr.includes("/git/refs") && init?.method === "POST") {
            return new Response(JSON.stringify({ ref: "refs/heads/feat" }), {
              status: 201, headers: { "Content-Type": "application/json" },
            });
          }
          if (urlStr.includes("/pulls") && init?.method === "POST") {
            return new Response(JSON.stringify({ html_url: "https://github.com/t/r/pull/3", number: 3 }), {
              status: 201, headers: { "Content-Type": "application/json" },
            });
          }

          return new Response("", { status: 404 });
        }) as any;

        try {
          const result = await createPR({
            owner: "test",
            repo: "repo",
            branch: "feat",
            title: "Delete + Create",
            body: "body",
            files: [
              { path: "new-file.ts", content: "new", action: "create" },
              { path: "old-file.ts", content: "", action: "delete" },
            ],
          });

          expect(result.number).toBe(3);
        } finally {
          global.fetch = originalFetch;
        }
      }
    );
  });
});

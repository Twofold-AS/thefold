import { describe, it, expect, afterAll } from "vitest";
import { create, writeFile, validate, destroy } from "./sandbox";

describe("Sandbox service", () => {
  const testOwner = "Twofold-AS";
  const testRepo = "thefold";
  const createdSandboxes: string[] = [];

  // Clean up all created sandboxes after tests
  afterAll(async () => {
    for (const sandboxId of createdSandboxes) {
      try {
        await destroy({ sandboxId });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("create", () => {
    it(
      "should clone repository into a sandbox and return an ID",
      { timeout: 120000 },
      async () => {
        const result = await create({
          repoOwner: testOwner,
          repoName: testRepo,
        });

        expect(result).toBeDefined();
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe("string");
        expect(result.id.length).toBeGreaterThan(0);

        // Track for cleanup
        createdSandboxes.push(result.id);

        // Verify sandbox was created by trying to write a file
        const writeResult = await writeFile({
          sandboxId: result.id,
          path: "test-sandbox-creation.txt",
          content: "Sandbox created successfully",
        });

        expect(writeResult.written).toBe(true);
      }
    );
  });

  describe("writeFile", () => {
    it(
      "should write a new TypeScript file to the sandbox",
      { timeout: 120000 },
      async () => {
        // Create a sandbox
        const sandbox = await create({
          repoOwner: testOwner,
          repoName: testRepo,
        });
        createdSandboxes.push(sandbox.id);

        // Write a new TypeScript file
        const tsContent = `export const testFunction = (): string => {
  return "Hello from test";
};
`;

        const result = await writeFile({
          sandboxId: sandbox.id,
          path: "test-file.ts",
          content: tsContent,
        });

        expect(result).toBeDefined();
        expect(result.written).toBe(true);
      }
    );
  });

  describe("validate", () => {
    it(
      "should run validation and return output",
      { timeout: 120000 },
      async () => {
        // Create a sandbox
        const sandbox = await create({
          repoOwner: testOwner,
          repoName: testRepo,
        });
        createdSandboxes.push(sandbox.id);

        // Run validation on the cloned repo
        const result = await validate({
          sandboxId: sandbox.id,
        });

        expect(result).toBeDefined();
        expect(result.output).toBeDefined();
        expect(typeof result.output).toBe("string");
        expect(result.output.length).toBeGreaterThan(0);
        expect(Array.isArray(result.errors)).toBe(true);

        // Validation output should mention TypeScript
        expect(result.output.toLowerCase()).toContain("typescript");
      }
    );

    it(
      "should detect type errors and return validation failure",
      { timeout: 120000 },
      async () => {
        // Create a sandbox
        const sandbox = await create({
          repoOwner: testOwner,
          repoName: testRepo,
        });
        createdSandboxes.push(sandbox.id);

        // Write a TypeScript file with a deliberate type error
        const invalidCode = `export const brokenFunction = (): string => {
  const num: number = "this is not a number"; // Type error!
  return num;
};
`;

        await writeFile({
          sandboxId: sandbox.id,
          path: "broken-code.ts",
          content: invalidCode,
        });

        // Run validation
        const result = await validate({
          sandboxId: sandbox.id,
        });

        expect(result).toBeDefined();
        expect(result.success).toBe(false);
        expect(result.output).toBeDefined();
        expect(result.output.length).toBeGreaterThan(0);
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0);

        // Verify error message is readable
        const errorMessage = result.errors[0];
        expect(errorMessage).toBeDefined();
        expect(typeof errorMessage).toBe("string");
        expect(errorMessage.length).toBeGreaterThan(0);

        // Should mention TypeScript errors
        expect(
          result.output.toLowerCase().includes("typescript") ||
            result.output.toLowerCase().includes("error")
        ).toBe(true);
      }
    );
  });

  describe("path traversal protection", () => {
    it(
      "should reject attempts to write outside sandbox with ../../etc/passwd",
      { timeout: 120000 },
      async () => {
        // Create a sandbox
        const sandbox = await create({
          repoOwner: testOwner,
          repoName: testRepo,
        });
        createdSandboxes.push(sandbox.id);

        // Try to write to a path that escapes the sandbox
        await expect(
          writeFile({
            sandboxId: sandbox.id,
            path: "../../etc/passwd",
            content: "malicious content",
          })
        ).rejects.toThrow();
      }
    );

    it(
      "should reject complex path traversal attempts",
      { timeout: 120000 },
      async () => {
        const sandbox = await create({
          repoOwner: testOwner,
          repoName: testRepo,
        });
        createdSandboxes.push(sandbox.id);

        // Try more complex path traversal
        await expect(
          writeFile({
            sandboxId: sandbox.id,
            path: "../../../../../../../etc/passwd",
            content: "malicious content",
          })
        ).rejects.toThrow();
      }
    );
  });

  describe("destroy", () => {
    it(
      "should clean up and destroy a sandbox",
      { timeout: 120000 },
      async () => {
        // Create a sandbox
        const sandbox = await create({
          repoOwner: testOwner,
          repoName: testRepo,
        });

        // Destroy it
        const result = await destroy({
          sandboxId: sandbox.id,
        });

        expect(result).toBeDefined();
        expect(result.destroyed).toBe(true);

        // Verify sandbox is gone by trying to write to it
        await expect(
          writeFile({
            sandboxId: sandbox.id,
            path: "test.txt",
            content: "test",
          })
        ).rejects.toThrow();
      }
    );

    it(
      "should handle destroying non-existent sandbox gracefully",
      { timeout: 120000 },
      async () => {
        // Try to destroy a sandbox that doesn't exist
        const result = await destroy({
          sandboxId: "non-existent-sandbox-id-12345",
        });

        expect(result).toBeDefined();
        expect(result.destroyed).toBe(true);
      }
    );
  });
});

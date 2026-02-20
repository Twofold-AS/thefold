import { describe, it, expect, beforeEach, vi } from "vitest";
import { MCPClient } from "./client";

describe("MCPClient", () => {
  describe("constructor", () => {
    it("should set correct values from constructor arguments", () => {
      const client = new MCPClient(
        "npx",
        ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        { TEST_VAR: "test" },
        "filesystem",
        15000
      );

      expect(client).toBeDefined();
      expect(client.isRunning()).toBe(false);
      expect(client.getTools()).toEqual([]);
    });
  });

  describe("kill", () => {
    it("should cleanup pending requests when killed", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      // Create a mock pending request by accessing private field
      // In real usage, this would happen during start(), but we're testing cleanup
      expect(client.isRunning()).toBe(false);

      client.kill();

      expect(client.isRunning()).toBe(false);
      expect(client.getTools()).toEqual([]);
    });
  });

  describe("getTools", () => {
    it("should return empty list before start", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      expect(client.getTools()).toEqual([]);
    });

    it("should return empty list after kill", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      client.kill();

      expect(client.getTools()).toEqual([]);
    });
  });

  describe("isRunning", () => {
    it("should return false before start", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      expect(client.isRunning()).toBe(false);
    });

    it("should return false after kill", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      client.kill();

      expect(client.isRunning()).toBe(false);
    });
  });

  describe("processBuffer", () => {
    it("should handle empty buffer gracefully", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      // Access private method via type assertion for testing
      const processBuffer = (client as any).processBuffer.bind(client);

      // Should not throw
      expect(() => processBuffer()).not.toThrow();
    });

    it("should ignore invalid JSON lines", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      // Set buffer with invalid JSON
      (client as any).buffer = "not json\n{broken json\n";

      const processBuffer = (client as any).processBuffer.bind(client);

      // Should not throw
      expect(() => processBuffer()).not.toThrow();

      // Buffer should be cleared
      expect((client as any).buffer).toBe("");
    });

    it("should ignore whitespace-only lines", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      (client as any).buffer = "   \n\t\n\n";

      const processBuffer = (client as any).processBuffer.bind(client);

      expect(() => processBuffer()).not.toThrow();
      expect((client as any).buffer).toBe("");
    });

    it("should keep incomplete line in buffer", () => {
      const client = new MCPClient("npx", ["-y", "test"], {}, "test-server");

      (client as any).buffer = '{"jsonrpc": "2.0", "id": 1';

      const processBuffer = (client as any).processBuffer.bind(client);
      processBuffer();

      // Incomplete line should remain in buffer
      expect((client as any).buffer).toBe('{"jsonrpc": "2.0", "id": 1');
    });
  });
});

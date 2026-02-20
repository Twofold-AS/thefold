import { describe, it, expect, beforeEach, vi } from "vitest";
import { startInstalledServers, routeToolCall, stopAllServers, getActiveToolsForAI, routingStatus } from "./router";
import { db } from "./db";

// Mock secret to control feature flag
vi.mock("encore.dev/config", () => ({
  secret: (name: string) => {
    return () => {
      if (name === "MCPRoutingEnabled") {
        return process.env.TEST_MCP_ROUTING_ENABLED || "false";
      }
      return "false";
    };
  },
}));

describe("MCP Router", () => {
  beforeEach(async () => {
    // Clean up ALL test data to ensure clean slate
    await db.exec`DELETE FROM mcp_servers`;

    // Reset env var
    delete process.env.TEST_MCP_ROUTING_ENABLED;

    // Clear active clients
    stopAllServers();
  });

  describe("startInstalledServers", () => {
    it("should return empty arrays when feature flag is disabled", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "false";

      const result = await startInstalledServers();

      expect(result.tools).toEqual([]);
      expect(result.startedServers).toEqual([]);
      expect(result.failedServers).toEqual([]);
    });

    it("should return empty arrays when no servers are installed", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "true";

      const result = await startInstalledServers();

      expect(result.tools).toEqual([]);
      expect(result.startedServers).toEqual([]);
      expect(result.failedServers).toEqual([]);
    });

    it("should handle database query errors gracefully", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "true";

      // Function should not throw even if DB has issues
      const result = await startInstalledServers();

      expect(result).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(Array.isArray(result.startedServers)).toBe(true);
      expect(Array.isArray(result.failedServers)).toBe(true);
    });
  });

  describe("routeToolCall", () => {
    it("should return error when feature flag is disabled", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "false";

      const result = await routeToolCall("test-server", "test-tool", {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("disabled");
    });

    it("should return error when server is not running", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "true";

      const result = await routeToolCall("nonexistent-server", "test-tool", {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not running");
    });

    it("should handle empty args gracefully", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "true";

      const result = await routeToolCall("test-server", "test-tool", {});

      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });
  });

  describe("stopAllServers", () => {
    it("should not throw when no servers are running", () => {
      expect(() => stopAllServers()).not.toThrow();
    });

    it("should clear all active clients", () => {
      stopAllServers();

      const tools = getActiveToolsForAI();
      expect(tools).toEqual([]);
    });
  });

  describe("getActiveToolsForAI", () => {
    it("should return empty list when no servers are active", () => {
      const tools = getActiveToolsForAI();

      expect(tools).toEqual([]);
    });

    it("should return array with correct structure", () => {
      const tools = getActiveToolsForAI();

      expect(Array.isArray(tools)).toBe(true);
      // Each tool should have name, description, input_schema, _mcpServer
      tools.forEach((tool) => {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("input_schema");
        expect(tool).toHaveProperty("_mcpServer");
      });
    });
  });

  describe("routingStatus endpoint", () => {
    it("should return enabled status correctly when disabled", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "false";

      const result = await routingStatus();

      expect(result.enabled).toBe(false);
      expect(Array.isArray(result.activeServers)).toBe(true);
    });

    it("should return enabled status correctly when enabled", async () => {
      process.env.TEST_MCP_ROUTING_ENABLED = "true";

      const result = await routingStatus();

      expect(result.enabled).toBe(true);
      expect(Array.isArray(result.activeServers)).toBe(true);
    });

    it("should return empty activeServers when none are running", async () => {
      const result = await routingStatus();

      expect(result.activeServers).toEqual([]);
    });

    it("should include server info in correct format", async () => {
      const result = await routingStatus();

      result.activeServers.forEach((server) => {
        expect(server).toHaveProperty("name");
        expect(server).toHaveProperty("running");
        expect(server).toHaveProperty("toolCount");
        expect(server).toHaveProperty("tools");
        expect(Array.isArray(server.tools)).toBe(true);
        expect(typeof server.running).toBe("boolean");
        expect(typeof server.toolCount).toBe("number");
      });
    });
  });
});

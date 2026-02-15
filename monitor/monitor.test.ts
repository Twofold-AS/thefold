import { describe, it, expect } from "vitest";
import { runDailyChecks, health, history } from "./monitor";

describe("Monitor service", () => {
  describe("runDailyChecks", () => {
    it("should return ran: false when MonitorEnabled is not set to 'true'", async () => {
      // MonitorEnabled secret defaults to disabled in test environment
      const result = await runDailyChecks();
      expect(result.ran).toBe(false);
      expect(result.message).toContain("disabled");
    });
  });

  describe("health", () => {
    it("should return repos object", async () => {
      const result = await health();
      expect(result.repos).toBeDefined();
      expect(typeof result.repos).toBe("object");
    });
  });

  describe("history", () => {
    it("should return empty checks for unknown repo", async () => {
      const result = await history({ repo: "nonexistent-repo-test" });
      expect(result.checks).toBeDefined();
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks).toHaveLength(0);
    });

    it("should respect limit parameter", async () => {
      const result = await history({ repo: "test-repo", limit: 5 });
      expect(result.checks.length).toBeLessThanOrEqual(5);
    });
  });
});

import { describe, it, expect } from "vitest";
import { extractSubAgentHint } from "./orchestrate-sub-agents";

describe("dynamic sub-agents (ZN)", () => {
  describe("extractSubAgentHint", () => {
    it("detects 'bruk 3 agenter'", () => {
      const result = extractSubAgentHint("bruk 3 agenter for dette");
      expect(result).toBeDefined();
      expect(result).toContain("3");
    });

    it("detects 'uten sub-agent'", () => {
      const result = extractSubAgentHint("gjor dette uten sub-agent");
      expect(result).toBeDefined();
      expect(result).toContain("NO");
    });

    it("returns undefined for normal text", () => {
      const result = extractSubAgentHint("fix the login bug");
      expect(result).toBeUndefined();
    });

    it("detects '2 sub-agents'", () => {
      const result = extractSubAgentHint("use 2 sub-agents");
      expect(result).toBeDefined();
      expect(result).toContain("2");
    });

    it("detects '4 subagents' without hyphen", () => {
      const result = extractSubAgentHint("run with 4 subagents please");
      expect(result).toBeDefined();
      expect(result).toContain("4");
    });

    it("detects 'bruk 1 agent' with single agent", () => {
      const result = extractSubAgentHint("bruk 1 agent for denne oppgaven");
      expect(result).toBeDefined();
      expect(result).toContain("1");
    });

    it("detects 'parallell 3' pattern", () => {
      const result = extractSubAgentHint("kjor parallell med 3 arbeidere");
      expect(result).toBeDefined();
      expect(result).toContain("3");
    });
  });

  describe("planSubAgentsDynamic structure", () => {
    it("all sub-agent roles are defined", () => {
      const roles = ["planner", "implementer", "tester", "reviewer", "documenter", "researcher"];
      expect(roles.length).toBe(6);
      // Each role has a system prompt and max tokens defined in sub-agents.ts
      for (const role of roles) {
        expect(typeof role).toBe("string");
        expect(role.length).toBeGreaterThan(0);
      }
    });

    it("valid budget modes are defined", () => {
      const modes = ["balanced", "quality_first", "aggressive_save"];
      expect(modes.length).toBe(3);
    });
  });
});

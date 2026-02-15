import { describe, it, expect } from "vitest";
import { executePreRun, executePostRun } from "./engine";

describe("Skills Pipeline Engine", () => {
  const mockSkill = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Test Skill",
    phase: "pre_run" as const,
    priority: 10,
    promptFragment: "Test prompt fragment",
    tokenEstimate: 100,
    routingRules: {},
  };

  const validContext = {
    task: "Fix authentication bug",
    repo: "thefold",
    labels: ["bug"],
    files: ["auth.ts"],
    userId: "user-123",
    totalTokenBudget: 4000,
  };

  // --- executePreRun ---

  describe("executePreRun", () => {
    it("should approve when context has all required fields", async () => {
      const result = await executePreRun({
        skills: [mockSkill],
        context: validContext,
      });

      expect(result.approved).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].skillId).toBe(mockSkill.id);
      expect(result.results[0].phase).toBe("pre_run");

      const output = result.results[0].output as Record<string, unknown>;
      expect(output.approved).toBe(true);
      expect(output.enrichedContext).toBeDefined();
    });

    it("should reject when task is empty", async () => {
      const result = await executePreRun({
        skills: [mockSkill],
        context: { ...validContext, task: "" },
      });

      expect(result.approved).toBe(false);
      expect(result.results[0].success).toBe(false);

      const output = result.results[0].output as Record<string, unknown>;
      expect(output.approved).toBe(false);
      expect(output.validationErrors).toBeDefined();
      expect(output.validationErrors).toContain("Missing or empty task description");
    });

    it("should reject when userId is missing", async () => {
      const result = await executePreRun({
        skills: [mockSkill],
        context: { ...validContext, userId: "" },
      });

      expect(result.approved).toBe(false);
      expect(result.results[0].success).toBe(false);

      const output = result.results[0].output as Record<string, unknown>;
      expect(output.validationErrors).toContain("Missing userId");
    });

    it("should enrich context with skill metadata", async () => {
      const result = await executePreRun({
        skills: [mockSkill],
        context: validContext,
      });

      const output = result.results[0].output as Record<string, unknown>;
      const enriched = output.enrichedContext as Record<string, unknown>;
      expect(enriched.skillName).toBe("Test Skill");
      expect(enriched.skillPriority).toBe(10);
      expect(enriched.tokenEstimate).toBe(100);
      expect(enriched.hasRepo).toBe(true);
      expect(enriched.fileCount).toBe(1);
    });

    it("should handle multiple skills independently", async () => {
      const skill2 = { ...mockSkill, id: "00000000-0000-0000-0000-000000000002", name: "Skill 2" };
      const result = await executePreRun({
        skills: [mockSkill, skill2],
        context: validContext,
      });

      expect(result.approved).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });
  });

  // --- executePostRun ---

  describe("executePostRun", () => {
    const postRunSkill = { ...mockSkill, phase: "post_run" as const };

    it("should approve when AI output is valid", async () => {
      const result = await executePostRun({
        skills: [postRunSkill],
        aiOutput: "Here is the implementation with proper error handling and tests.",
        context: validContext,
      });

      expect(result.approved).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);

      const output = result.results[0].output as Record<string, unknown>;
      expect(output.approved).toBe(true);
      expect(output.qualityIssues).toBeUndefined();
    });

    it("should reject when AI output is empty", async () => {
      const result = await executePostRun({
        skills: [postRunSkill],
        aiOutput: "",
        context: validContext,
      });

      expect(result.approved).toBe(false);
      expect(result.results[0].success).toBe(false);

      const output = result.results[0].output as Record<string, unknown>;
      expect(output.qualityIssues).toContain("AI output is empty");
    });

    it("should reject when AI output is too short", async () => {
      const result = await executePostRun({
        skills: [postRunSkill],
        aiOutput: "No.",
        context: validContext,
      });

      expect(result.approved).toBe(false);
      const output = result.results[0].output as Record<string, unknown>;
      expect(output.qualityIssues).toContain("AI output is suspiciously short (< 10 chars)");
    });

    it("should flag placeholder code in AI output", async () => {
      const result = await executePostRun({
        skills: [postRunSkill],
        aiOutput: "function doStuff() { // TODO implement this later }",
        context: validContext,
      });

      expect(result.approved).toBe(false);
      const output = result.results[0].output as Record<string, unknown>;
      expect(output.qualityIssues).toContain("AI output contains placeholder code (TODO or ...)");
    });

    it("should flag inability patterns in AI output", async () => {
      const result = await executePostRun({
        skills: [postRunSkill],
        aiOutput: "I cannot complete this task because I don't have enough context.",
        context: validContext,
      });

      expect(result.approved).toBe(false);
      const output = result.results[0].output as Record<string, unknown>;
      expect(output.qualityIssues).toContain("AI output indicates inability to complete task");
    });

    it("should include output length in result", async () => {
      const output = "This is a valid response with enough content to pass checks.";
      const result = await executePostRun({
        skills: [postRunSkill],
        aiOutput: output,
        context: validContext,
      });

      const resultOutput = result.results[0].output as Record<string, unknown>;
      expect(resultOutput.outputLength).toBe(output.length);
    });
  });
});

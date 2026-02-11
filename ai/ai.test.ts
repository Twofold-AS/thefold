import { describe, it, expect } from "vitest";
import { chat, planTask, reviewCode } from "./ai";

describe("AI service", () => {
  describe("chat", () => {
    it(
      "should return a response from Claude",
      { timeout: 30000 },
      async () => {
        const result = await chat({
          messages: [{ role: "user", content: "Say 'OK' only" }],
          memoryContext: [],
          systemContext: "direct_chat",
        });

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(typeof result.content).toBe("string");
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.stopReason).toBeDefined();
      }
    );
  });

  describe("planTask", () => {
    it(
      "should return a valid plan with steps",
      { timeout: 30000 },
      async () => {
        const result = await planTask({
          task: "Add a ping endpoint that returns 'pong'",
          projectStructure: "src/\n  api.ts",
          relevantFiles: [],
          memoryContext: [],
          docsContext: [],
        });

        expect(result).toBeDefined();
        expect(result.plan).toBeDefined();
        expect(Array.isArray(result.plan)).toBe(true);
        expect(result.plan.length).toBeGreaterThan(0);

        // Verify plan structure
        const firstStep = result.plan[0];
        expect(firstStep.description).toBeDefined();
        expect(firstStep.action).toBeDefined();
        expect(["create_file", "modify_file", "delete_file", "run_command"]).toContain(
          firstStep.action
        );

        expect(result.reasoning).toBeDefined();
        expect(typeof result.reasoning).toBe("string");
        expect(result.tokensUsed).toBeGreaterThan(0);
      }
    );
  });

  describe("reviewCode", () => {
    it(
      "should return valid review with documentation and quality score",
      { timeout: 30000 },
      async () => {
        const result = await reviewCode({
          taskDescription: "Added ping endpoint",
          filesChanged: [
            {
              path: "api.ts",
              content: 'export const ping = api({}, async () => ({ msg: "pong" }));',
              action: "modify",
            },
          ],
          validationOutput: "All checks passed",
          memoryContext: [],
        });

        expect(result).toBeDefined();
        expect(result.documentation).toBeDefined();
        expect(typeof result.documentation).toBe("string");
        expect(result.documentation.length).toBeGreaterThan(0);

        expect(Array.isArray(result.memoriesExtracted)).toBe(true);

        expect(result.qualityScore).toBeDefined();
        expect(typeof result.qualityScore).toBe("number");
        expect(result.qualityScore).toBeGreaterThanOrEqual(1);
        expect(result.qualityScore).toBeLessThanOrEqual(10);

        expect(Array.isArray(result.concerns)).toBe(true);
        expect(result.tokensUsed).toBeGreaterThan(0);
      }
    );
  });
});

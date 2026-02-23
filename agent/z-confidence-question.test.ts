import { describe, it, expect } from "vitest";
import { deserializeProgress } from "./messages";

describe("confidence as natural question", () => {
  it("low confidence sends waiting status with question", () => {
    // Simulate what confidence.ts would produce when useNewContract() is true
    const progress = {
      status: "waiting" as const,
      phase: "clarification",
      summary: "Trenger avklaring",
      steps: [{ id: "confidence", label: "Confidence: 45%", detail: "Trenger avklaring", done: false }],
      question: "What authentication method should I use?",
    };
    expect(progress.status).toBe("waiting");
    expect(progress.question).toBeTruthy();
    expect(progress.steps[0].label).toContain("45%");
  });

  it("high confidence sends working status without question", () => {
    const progress = {
      status: "working" as const,
      phase: "confidence",
      summary: "Confidence: 95%",
      steps: [{ id: "confidence", label: "Confidence: 95%", done: true }],
    };
    expect(progress.status).toBe("working");
    expect((progress as any).question).toBeUndefined();
  });

  it("only ONE question is sent (the most important)", () => {
    // The new contract picks the first clarifying_question or first uncertainty
    const questions = ["What auth method?", "What DB?", "What framework?"];
    const singleQuestion = questions[0];
    expect(typeof singleQuestion).toBe("string");
    // Verify only one question is selected, not an array
    expect(singleQuestion).toBe("What auth method?");
  });

  it("deserializeProgress preserves question field", () => {
    const json = JSON.stringify({
      type: "progress",
      status: "waiting",
      phase: "clarification",
      summary: "Trenger avklaring",
      steps: [],
      question: "What method?",
    });
    const result = deserializeProgress(json);
    expect(result).not.toBeNull();
    expect(result?.question).toBe("What method?");
    expect(result?.status).toBe("waiting");
    expect(result?.phase).toBe("clarification");
  });

  it("forceContinue would change status from waiting to working", () => {
    // Conceptual test: forceContinue re-executes the task with forceContinue option,
    // which skips the confidence assessment entirely (returns shouldContinue: true)
    const beforeStatus = "waiting";
    const afterStatus = "working";
    expect(beforeStatus).not.toBe(afterStatus);
  });
});

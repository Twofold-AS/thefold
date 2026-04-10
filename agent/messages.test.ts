import { describe, it, expect } from "vitest";
import {
  serializeProgress,
  deserializeProgress,
  serializeMessage,
  deserializeMessage,
  buildStatusMessage,
  buildThoughtMessage,
  buildReportMessage,
  buildClarificationMessage,
  buildReviewMessage,
  buildCompletionMessage,
  mapReportStatusToPhase,
  type AgentProgress,
  type AgentMessage,
} from "./messages";

// ============================================================
// NEW CONTRACT TESTS — AgentProgress
// ============================================================

describe("AgentProgress — new contract", () => {
  // Test 1: serializeProgress/deserializeProgress roundtrip for all statuses
  it("should roundtrip all AgentProgress statuses", () => {
    const statuses: AgentProgress["status"][] = ["thinking", "working", "waiting", "done", "failed"];

    for (const status of statuses) {
      const progress: AgentProgress = {
        status,
        phase: "building",
        summary: `Status: ${status}`,
        steps: [
          { id: "step1", label: "First step", detail: "detail1", done: true },
          { id: "step2", label: "Second step", done: false },
          { id: "step3", label: "Third step", done: null },
        ],
      };
      const serialized = serializeProgress(progress);
      const deserialized = deserializeProgress(serialized);
      expect(deserialized).not.toBeNull();
      expect(deserialized!.status).toBe(status);
      expect(deserialized!.phase).toBe("building");
      expect(deserialized!.summary).toBe(`Status: ${status}`);
      expect(deserialized!.steps).toHaveLength(3);
      expect(deserialized!.steps[0].done).toBe(true);
      expect(deserialized!.steps[1].done).toBe(false);
      expect(deserialized!.steps[2].done).toBeNull();
    }
  });

  // Test 2: Legacy "status" type converts correctly
  it("should convert legacy status message to AgentProgress", () => {
    const legacyStatus = JSON.stringify({
      type: "status",
      phase: "building",
      steps: [
        { label: "Skriver kode", status: "active", detail: "auth.ts" },
        { label: "Tester", status: "done" },
        { label: "Validering", status: "pending" },
      ],
      meta: { title: "Bygger gateway" },
    });

    const result = deserializeProgress(legacyStatus);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("working");
    expect(result!.phase).toBe("building");
    expect(result!.summary).toBe("Bygger gateway");
    expect(result!.steps).toHaveLength(3);
    expect(result!.steps[0]).toEqual({ id: "Skriver kode", label: "Skriver kode", detail: "auth.ts", done: false });
    expect(result!.steps[1]).toEqual({ id: "Tester", label: "Tester", detail: undefined, done: true });
    expect(result!.steps[2]).toEqual({ id: "Validering", label: "Validering", detail: undefined, done: null });
  });

  // Test 3: Legacy "clarification" converts with question
  it("should convert legacy clarification message with question", () => {
    const legacyClarification = JSON.stringify({
      type: "clarification",
      phase: "confidence",
      questions: ["Hvilken branch skal brukes?", "Er det produksjon?"],
      steps: [{ label: "Trenger svar", status: "info" }],
    });

    const result = deserializeProgress(legacyClarification);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("waiting");
    expect(result!.phase).toBe("clarification");
    expect(result!.summary).toBe("Trenger avklaring");
    expect(result!.question).toBe("Hvilken branch skal brukes?");
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0].id).toBe("Trenger svar");
    expect(result!.steps[0].done).toBeNull();
  });

  // Test 4: Legacy "review" converts with report
  it("should convert legacy review message with report data", () => {
    const legacyReview = JSON.stringify({
      type: "review",
      phase: "pending_review",
      reviewData: {
        reviewId: "review-abc",
        quality: 8,
        filesChanged: 3,
        concerns: ["Mangler tester", "CSP header"],
        reviewUrl: "/review/review-abc",
      },
      steps: [],
    });

    const result = deserializeProgress(legacyReview);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("waiting");
    expect(result!.phase).toBe("reviewing");
    expect(result!.summary).toBe("Venter pa godkjenning");
    expect(result!.report).toBeDefined();
    expect(result!.report!.reviewId).toBe("review-abc");
    expect(result!.report!.qualityScore).toBe(8);
    expect(result!.report!.concerns).toEqual(["Mangler tester", "CSP header"]);
    expect(result!.report!.costUsd).toBe(0);
    expect(result!.report!.filesChanged).toEqual([]);
  });

  // Test 5: Legacy "completion" converts to done
  it("should convert legacy completion message to done status", () => {
    const legacyCompletion = JSON.stringify({
      type: "completion",
      text: "PR opprettet: https://github.com/pr/42",
      prUrl: "https://github.com/pr/42",
      filesChanged: ["gateway/auth.ts", "gateway/token.ts"],
    });

    const result = deserializeProgress(legacyCompletion);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("done");
    expect(result!.phase).toBe("completing");
    expect(result!.summary).toBe("PR opprettet: https://github.com/pr/42");
    expect(result!.steps).toEqual([]);
  });

  // Test 6: Legacy "thought" returns null (not shown in new UI)
  it("should return null for legacy thought messages", () => {
    const legacyThought = JSON.stringify({
      type: "thought",
      text: "Analyserer prosjektstruktur...",
      timestamp: Date.now(),
    });

    const result = deserializeProgress(legacyThought);
    expect(result).toBeNull();
  });

  // Test 7: Invalid JSON returns null
  it("should return null for invalid JSON", () => {
    expect(deserializeProgress("not valid json")).toBeNull();
    expect(deserializeProgress("")).toBeNull();
    expect(deserializeProgress("{{}}")).toBeNull();
    expect(deserializeProgress("plain text report")).toBeNull();
  });

  // Test 8: Missing fields handled gracefully (defaults)
  it("should handle missing fields gracefully with defaults", () => {
    // Status with no meta, no steps
    const minimal = JSON.stringify({ type: "status", phase: "building" });
    const result = deserializeProgress(minimal);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("working");
    expect(result!.phase).toBe("building");
    expect(result!.summary).toBe("building");
    expect(result!.steps).toEqual([]);

    // Status with no phase
    const noPhase = JSON.stringify({ type: "status" });
    const resultNoPhase = deserializeProgress(noPhase);
    expect(resultNoPhase).not.toBeNull();
    expect(resultNoPhase!.phase).toBe("building");

    // Clarification with empty questions
    const emptyQuestions = JSON.stringify({ type: "clarification", questions: [] });
    const resultEmpty = deserializeProgress(emptyQuestions);
    expect(resultEmpty).not.toBeNull();
    expect(resultEmpty!.question).toBe("");

    // Completion with no text
    const noText = JSON.stringify({ type: "completion" });
    const resultNoText = deserializeProgress(noText);
    expect(resultNoText).not.toBeNull();
    expect(resultNoText!.summary).toBe("Ferdig");

    // Report with no text or status
    const emptyReport = JSON.stringify({ type: "report" });
    const resultReport = deserializeProgress(emptyReport);
    expect(resultReport).not.toBeNull();
    expect(resultReport!.status).toBe("working");
    expect(resultReport!.summary).toBe("");

    // Unknown type returns null
    const unknown = JSON.stringify({ type: "unknown_type", data: 123 });
    expect(deserializeProgress(unknown)).toBeNull();

    // No type at all returns null
    const noType = JSON.stringify({ phase: "building", steps: [] });
    expect(deserializeProgress(noType)).toBeNull();
  });

  // Test 9: Roundtrip with optional fields (report, question, subAgents, error)
  it("should roundtrip AgentProgress with all optional fields", () => {
    const full: AgentProgress = {
      status: "done",
      phase: "completing",
      summary: "Ferdig med alt",
      progress: { current: 4, total: 4, currentFile: "index.ts" },
      steps: [
        { id: "build:1", label: "gateway/auth.ts", done: true },
        { id: "build:2", label: "gateway/token.ts", done: true },
      ],
      report: {
        filesChanged: [
          { path: "gateway/auth.ts", action: "create" },
          { path: "gateway/token.ts", action: "modify", diff: "+export const token = ..." },
        ],
        costUsd: 0.023,
        duration: "2m 14s",
        qualityScore: 9,
        concerns: ["Mangler edge-case test"],
        reviewId: "rev-xyz",
      },
      subAgents: [
        { id: "sa-1", role: "implementer", model: "sonnet", status: "done", label: "Kode" },
        { id: "sa-2", role: "tester", model: "haiku", status: "done", label: "Tester" },
      ],
    };

    const serialized = serializeProgress(full);
    const deserialized = deserializeProgress(serialized);
    expect(deserialized).not.toBeNull();
    expect(deserialized!.report?.filesChanged).toHaveLength(2);
    expect(deserialized!.report?.qualityScore).toBe(9);
    expect(deserialized!.report?.reviewId).toBe("rev-xyz");
    expect(deserialized!.subAgents).toHaveLength(2);
    expect(deserialized!.progress?.currentFile).toBe("index.ts");
  });

  // Test 10: Roundtrip with error field
  it("should roundtrip AgentProgress with error", () => {
    const failed: AgentProgress = {
      status: "failed",
      phase: "building",
      summary: "Bygge-feil i auth.ts",
      steps: [],
      error: "TypeError: Cannot read properties of undefined",
    };

    const serialized = serializeProgress(failed);
    const deserialized = deserializeProgress(serialized);
    expect(deserialized).not.toBeNull();
    expect(deserialized!.status).toBe("failed");
    expect(deserialized!.error).toBe("TypeError: Cannot read properties of undefined");
  });
});

// ============================================================
// LEGACY CONTRACT TESTS — AgentMessage (backward compat)
// ============================================================

describe("AgentMessage — legacy contract", () => {
  it("should roundtrip all legacy message types", () => {
    const messages: AgentMessage[] = [
      buildStatusMessage("building", [{ label: "Skriver kode", status: "active" }], { title: "Bygger" }),
      buildThoughtMessage("Analyserer prosjektstruktur..."),
      buildReportMessage("Leser prosjektstruktur fra GitHub...", "working"),
      buildClarificationMessage("confidence", ["Hva er malet?"], [{ label: "Trenger svar", status: "info" }]),
      buildReviewMessage("pending_review", { reviewId: "r1", quality: 8, filesChanged: 3, concerns: [], reviewUrl: "/review/r1" }, []),
      buildCompletionMessage("PR opprettet!", { prUrl: "https://github.com/pr/1" }),
    ];
    for (const msg of messages) {
      const serialized = serializeMessage(msg);
      const deserialized = deserializeMessage(serialized);
      if (msg.type === "thought") {
        expect(deserialized).not.toBeNull();
        expect(deserialized!.type).toBe("thought");
        expect((deserialized as any).text).toBe((msg as any).text);
      } else {
        expect(deserialized).toEqual(msg);
      }
    }
  });

  it("should convert legacy agent_status format", () => {
    const legacy = JSON.stringify({
      type: "agent_status",
      phase: "Bygger",
      title: "Bygger kode",
      steps: [{ label: "Step 1", status: "done" }],
    });
    const result = deserializeMessage(legacy);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("status");
    if (result !== null && result.type === "status") {
      expect(result.phase).toBe("Bygger");
      expect(result.steps).toHaveLength(1);
      expect(result.meta?.title).toBe("Bygger kode");
    }
  });

  it("should return null for non-JSON content", () => {
    expect(deserializeMessage("plain text report")).toBeNull();
    expect(deserializeMessage("Builder: init phase (1/6) [running]")).toBeNull();
  });

  it("should return null for unknown message types", () => {
    expect(deserializeMessage(JSON.stringify({ type: "unknown", data: 123 }))).toBeNull();
  });

  it("should map report status to correct phase", () => {
    expect(mapReportStatusToPhase("working")).toBe("building");
    expect(mapReportStatusToPhase("completed")).toBe("completed");
    expect(mapReportStatusToPhase("failed")).toBe("failed");
    expect(mapReportStatusToPhase("needs_input")).toBe("needs_input");
  });
});

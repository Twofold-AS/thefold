import { describe, it, expect } from "vitest";
import {
  serializeMessage,
  deserializeMessage,
  buildStatusMessage,
  buildThoughtMessage,
  buildReportMessage,
  buildClarificationMessage,
  buildReviewMessage,
  buildCompletionMessage,
  mapReportStatusToPhase,
  type AgentMessage,
} from "./messages";

describe("Agent Messages", () => {
  // Test 1: Roundtrip serialization/deserialization for all types
  it("should roundtrip all message types", () => {
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
      // Thought timestamp may differ slightly, check all fields except timestamp for thought
      if (msg.type === "thought") {
        expect(deserialized).not.toBeNull();
        expect(deserialized!.type).toBe("thought");
        expect((deserialized as any).text).toBe((msg as any).text);
      } else {
        expect(deserialized).toEqual(msg);
      }
    }
  });

  // Test 2: Legacy agent_status converts correctly
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
    if (result!.type === "status") {
      expect(result.phase).toBe("Bygger");
      expect(result.steps).toHaveLength(1);
      expect(result.meta?.title).toBe("Bygger kode");
    }
  });

  // Test 3: Legacy agent_thought converts correctly
  it("should convert legacy agent_thought format", () => {
    const legacy = JSON.stringify({
      type: "agent_thought",
      thought: "Tenker...",
      timestamp: 123456,
    });
    const result = deserializeMessage(legacy);
    expect(result).toEqual({ type: "thought", text: "Tenker...", timestamp: 123456 });
  });

  // Test 4: Non-JSON content returns null
  it("should return null for non-JSON content", () => {
    expect(deserializeMessage("plain text report")).toBeNull();
    expect(deserializeMessage("Builder: init phase (1/6) [running]")).toBeNull();
  });

  // Test 5: Unknown type returns null
  it("should return null for unknown message types", () => {
    expect(deserializeMessage(JSON.stringify({ type: "unknown", data: 123 }))).toBeNull();
  });

  // Test 6: Thought builder produces correct structure
  it("should build thought with plain text and timestamp", () => {
    const msg = buildThoughtMessage("Analyserer...");
    expect(msg.type).toBe("thought");
    expect((msg as any).text).toBe("Analyserer...");
    expect(typeof (msg as any).timestamp).toBe("number");
  });

  // Test 7: Status builder with meta fields
  it("should build status with meta fields", () => {
    const msg = buildStatusMessage("building", [], {
      title: "Bygger",
      planProgress: { current: 2, total: 5 },
    });
    expect(msg.type).toBe("status");
    if (msg.type === "status") {
      expect(msg.meta?.planProgress?.total).toBe(5);
      expect(msg.meta?.title).toBe("Bygger");
    }
  });

  // Test 8: Completion builder with prUrl
  it("should build completion with PR details", () => {
    const msg = buildCompletionMessage("Ferdig!", { prUrl: "https://pr/1", filesChanged: ["a.ts"] });
    expect(msg.type).toBe("completion");
    if (msg.type === "completion") {
      expect(msg.prUrl).toBe("https://pr/1");
      expect(msg.filesChanged).toEqual(["a.ts"]);
    }
  });

  // Test 9: Legacy agent_status with reviewData converts to review type
  it("should convert legacy agent_status with reviewData to review type", () => {
    const legacy = JSON.stringify({
      type: "agent_status",
      phase: "Venter",
      reviewData: {
        reviewId: "r1",
        quality: 8,
        filesChanged: 3,
        concerns: ["test mangler"],
        reviewUrl: "/review/r1",
      },
      steps: [{ label: "Venter", status: "active" }],
    });
    const result = deserializeMessage(legacy);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("review");
  });

  // Test 10: Legacy agent_status with questions converts to clarification type
  it("should convert legacy agent_status with questions to clarification type", () => {
    const legacy = JSON.stringify({
      type: "agent_status",
      phase: "Venter",
      questions: ["Hva er malet?", "Hvilken branch?"],
      steps: [{ label: "Trenger svar", status: "info" }],
    });
    const result = deserializeMessage(legacy);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("clarification");
    if (result!.type === "clarification") {
      expect(result.questions).toHaveLength(2);
    }
  });

  // Test 11: mapReportStatusToPhase mapping
  it("should map report status to correct phase", () => {
    expect(mapReportStatusToPhase("working")).toBe("building");
    expect(mapReportStatusToPhase("completed")).toBe("completed");
    expect(mapReportStatusToPhase("failed")).toBe("failed");
    expect(mapReportStatusToPhase("needs_input")).toBe("needs_input");
  });
});

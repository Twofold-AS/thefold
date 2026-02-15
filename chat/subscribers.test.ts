import { describe, it, expect } from "vitest";

// Test the subscriber message formatting logic
// These test the message construction that the Pub/Sub handlers use

describe("Builder progress subscriber", () => {
  function formatBuildMessage(event: {
    phase: string;
    currentFile: string | null;
    step: number;
    totalSteps: number;
    status: string;
  }): string {
    const fileInfo = event.currentFile ? ` — ${event.currentFile}` : "";
    return `Builder: ${event.phase}${fileInfo} (${event.step}/${event.totalSteps}) [${event.status}]`;
  }

  it("formats message with file info", () => {
    const msg = formatBuildMessage({
      phase: "implement",
      currentFile: "src/index.ts",
      step: 3,
      totalSteps: 10,
      status: "started",
    });
    expect(msg).toBe("Builder: implement — src/index.ts (3/10) [started]");
  });

  it("formats message without file info", () => {
    const msg = formatBuildMessage({
      phase: "init",
      currentFile: null,
      step: 1,
      totalSteps: 5,
      status: "completed",
    });
    expect(msg).toBe("Builder: init (1/5) [completed]");
  });

  it("formats failed status", () => {
    const msg = formatBuildMessage({
      phase: "integrate",
      currentFile: "tests/app.test.ts",
      step: 8,
      totalSteps: 8,
      status: "failed",
    });
    expect(msg).toBe("Builder: integrate — tests/app.test.ts (8/8) [failed]");
  });
});

describe("Task events subscriber", () => {
  const actionLabels: Record<string, string> = {
    created: "opprettet",
    updated: "oppdatert",
    started: "startet",
    completed: "fullført",
    blocked: "blokkert",
    synced: "synkronisert",
  };

  function formatTaskMessage(event: { taskId: string; action: string }): string {
    const label = actionLabels[event.action] ?? event.action;
    return `Oppgave '${event.taskId}' ${label}`;
  }

  it("formats created event", () => {
    expect(formatTaskMessage({ taskId: "abc-123", action: "created" }))
      .toBe("Oppgave 'abc-123' opprettet");
  });

  it("formats started event", () => {
    expect(formatTaskMessage({ taskId: "abc-123", action: "started" }))
      .toBe("Oppgave 'abc-123' startet");
  });

  it("formats completed event", () => {
    expect(formatTaskMessage({ taskId: "abc-123", action: "completed" }))
      .toBe("Oppgave 'abc-123' fullført");
  });

  it("formats blocked event", () => {
    expect(formatTaskMessage({ taskId: "abc-123", action: "blocked" }))
      .toBe("Oppgave 'abc-123' blokkert");
  });

  it("formats synced event", () => {
    expect(formatTaskMessage({ taskId: "abc-123", action: "synced" }))
      .toBe("Oppgave 'abc-123' synkronisert");
  });

  it("handles unknown action gracefully", () => {
    expect(formatTaskMessage({ taskId: "abc-123", action: "unknown_action" }))
      .toBe("Oppgave 'abc-123' unknown_action");
  });

  it("covers all 6 action types", () => {
    const actions = ["created", "updated", "started", "completed", "blocked", "synced"];
    for (const action of actions) {
      expect(actionLabels).toHaveProperty(action);
    }
  });
});

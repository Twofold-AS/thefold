import { describe, it, expect } from "vitest";
import type { AgentProgress } from "./messages";

describe("sub-agent display in chat", () => {
  it("subAgents field shows in AgentProgress", () => {
    const progress: AgentProgress = {
      status: "working",
      phase: "building",
      summary: "Building with 3 agents",
      steps: [],
      subAgents: [
        { id: "sub-1", role: "implementer", model: "claude-sonnet", status: "working", label: "Implementing auth" },
        { id: "sub-2", role: "tester", model: "claude-haiku", status: "pending", label: "Writing tests" },
      ],
    };
    expect(progress.subAgents).toHaveLength(2);
    expect(progress.subAgents![0].status).toBe("working");
  });

  it("without sub-agents, subAgents field is undefined", () => {
    const progress: AgentProgress = {
      status: "working",
      phase: "building",
      summary: "Building directly",
      steps: [],
    };
    expect(progress.subAgents).toBeUndefined();
  });

  it("model name is truncated for display", () => {
    const fullModel = "claude-sonnet-4-5-20250929";
    const display = fullModel.split("-").slice(0, 2).join("-");
    expect(display).toBe("claude-sonnet");
  });
});

import type { AgentStep, AgentStatusData } from "./types";

/** Parse builder progress messages into AgentStatusData format */
export function parseAgentMessage(content: string): AgentStatusData | null {
  if (!content.startsWith("Builder:")) return null;

  const phases = [
    "init",
    "scaffold",
    "dependencies",
    "implement",
    "integrate",
    "finalize",
  ];
  const match = content.match(/Builder: (\w+).* \((\d+)\/(\d+)\) \[(\w+)\]/);
  if (!match) return null;

  const currentPhase = match[1];
  const status = match[4];

  const steps: AgentStep[] = phases.map((phase) => {
    const phaseIdx = phases.indexOf(phase);
    const currentIdx = phases.indexOf(currentPhase);

    let stepStatus: AgentStep["status"] = "pending";
    if (phaseIdx < currentIdx) stepStatus = "done";
    else if (phaseIdx === currentIdx) {
      stepStatus =
        status === "completed"
          ? "done"
          : status === "failed"
            ? "error"
            : "active";
    }

    return {
      label: phase.charAt(0).toUpperCase() + phase.slice(1),
      status: stepStatus,
    };
  });

  return {
    phase: "Bygger",
    title: "Bygger kode",
    steps,
  };
}

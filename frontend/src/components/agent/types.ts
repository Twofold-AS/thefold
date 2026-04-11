export interface AgentStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export interface AgentStatusData {
  phase: string;
  title: string;
  steps: AgentStep[];
}

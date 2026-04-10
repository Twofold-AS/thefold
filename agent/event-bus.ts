import { Topic } from "encore.dev/pubsub";

// --- Agent Review Events ---

export interface AgentReviewEvent {
  taskId: string;
  reviewId: string;
  /** Number of findings emitted */
  findingCount: number;
  /** Highest severity found: "error" | "warning" | "info" */
  highestSeverity: "error" | "warning" | "info";
  findings: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file: string;
    line?: number;
    rule: string;
  }>;
  createdAt: string;
}

export const agentReviewEvents = new Topic<AgentReviewEvent>("agent-review-events", {
  deliveryGuarantee: "at-least-once",
});

// --- Agent Error Events (for critical failure notifications) ---

export interface AgentErrorEvent {
  taskId: string;
  conversationId?: string;
  error: string;
  phase: string;
  attempts: number;
  repo?: string;
  createdAt: string;
}

export const agentErrorEvents = new Topic<AgentErrorEvent>("agent-error-events", {
  deliveryGuarantee: "at-least-once",
});

// chat/agent-message-parser.ts
// Legacy cross-service parser — now re-exports from agent/messages.ts
// Kept for backward compatibility during Z migration
//
// NOTE: Encore.ts prohibits direct cross-service imports for API endpoints,
// but type/utility re-exports work because they don't reference service infrastructure.
// The canonical source of truth is agent/messages.ts — this file is a thin re-export layer.

// === NEW CONTRACT (AgentProgress) ===
export {
  deserializeProgress,
  serializeProgress,
  type AgentProgress,
  type ProgressStep,
  type ProgressReport,
} from "../agent/messages";

// === LEGACY CONTRACT (AgentMessage) ===
export {
  deserializeMessage,
  serializeMessage,
  useNewContract,
  type AgentMessage,
  type StepInfo,
  type StatusMeta,
  type ReviewMeta,
} from "../agent/messages";

// === CHAT-SPECIFIC HELPERS ===
// These are NOT in agent/messages.ts — they contain chat-specific UI logic
// (Norwegian labels, JSON serialization for DB storage)

import type { StepInfo, StatusMeta } from "../agent/messages";

/** Map report status to a Norwegian UI phase string (chat-specific, legacy) */
export function mapReportStatusToPhase(status: string): string {
  switch (status) {
    case "working": return "Bygger";
    case "completed": return "Ferdig";
    case "failed": return "Feilet";
    case "needs_input": return "Venter";
    default: return "Bygger";
  }
}

/** Build a serialized status message for DB storage (chat-specific, legacy) */
export function buildStatusContent(phase: string, steps: StepInfo[], meta?: StatusMeta): string {
  return JSON.stringify({ type: "status", phase, steps, meta });
}

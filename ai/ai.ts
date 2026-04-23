// --- Types (re-exported from ./types) ---
export type {
  ChatRequest, ChatResponse, AgentThinkRequest, FileContent,
  AgentThinkResponse, TaskStep, CodeGenRequest, CodeGenResponse,
  GeneratedFile, ReviewRequest, ReviewResponse,
  AICallOptions, AICallResponse,
} from "./types";

// --- Endpoints and interfaces (re-exported from sub-files) ---

// ai-endpoints: chat, reviewCode, reviewProject, diagnoseFailure, revisePlan
export {
  chat, reviewCode, reviewProject, diagnoseFailure, revisePlan,
} from "./ai-endpoints";
export type { DiagnoseRequest, DiagnosisResult, RevisePlanRequest } from "./ai-endpoints";

// ai-planning: planTask, assessComplexity, assessConfidence, decomposeProject, reviseProjectPhase, planTaskOrder
export {
  planTask, assessComplexity, assessConfidence, decomposeProject, reviseProjectPhase, planTaskOrder, revisePlanUser,
} from "./ai-planning";
export type {
  AssessComplexityRequest, AssessComplexityResponse,
  TaskConfidence, AssessConfidenceRequest, AssessConfidenceResponse,
} from "./ai-planning";

// ai-generation: generateFile, fixFile, callForExtraction, consolidateMemories
export {
  generateFile, fixFile, callForExtraction, consolidateMemories,
} from "./ai-generation";

// ai-security: aiSecurityAudit (Commit 32 — security sub-agent endpoint)
export { aiSecurityAudit } from "./ai-security";

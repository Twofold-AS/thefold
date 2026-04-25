// ai/tools/index.ts
// Singleton ToolRegistry — all tools registrerer seg her.
// Tools legges til fortløpende per commit i Phase B migration.

import { ToolRegistry } from "./registry";
import type { Tool } from "./types";

import { createTaskTool } from "./task/create-task";
import { createSubtaskTool } from "./task/create-subtask";
import { updateSubtaskTool } from "./task/update-subtask";
import { deleteSubtaskTool } from "./task/delete-subtask";
import { startTaskTool } from "./task/start-task";
import { listTasksTool } from "./task/list-tasks";
import { readFileTool } from "./code/read-file";
import { searchCodeTool } from "./code/search-code";
import { executeProjectPlanTool } from "./project/execute-project-plan";
import { reviseProjectPlanTool } from "./project/revise-project-plan";
import { respondToReviewTool } from "./review/respond-to-review";

// Agent-surface tools (Commit 12a)
import { repoGetTreeTool } from "./repo/get-tree";
import { repoReadFileTool } from "./repo/read-file";
import { repoFindRelevantFilesTool } from "./repo/find-relevant-files";
import { repoWriteFileTool } from "./repo/write-file";
import { repoCreatePrTool } from "./repo/create-pr";
import { memorySearchTool } from "./memory/search";
import { memoryStoreTool } from "./memory/store";
import { memorySearchPatternsTool } from "./memory/search-patterns";
import { searchSkillsTool } from "./skills/search";
import { activateSkillTool } from "./skills/activate";

// Agent-surface tools (Commit 12b)
import { taskGetTool } from "./task/get";
import { taskUpdateStatusTool } from "./task/update-status";
import { taskPlanTool } from "./task/plan";
import { taskAssessComplexityTool } from "./task/assess-complexity";
import { taskDecomposeProjectTool } from "./task/decompose-project";
import { buildCreateSandboxTool } from "./build/create-sandbox";
import { buildValidateTool } from "./build/validate";
import { buildRunCommandTool } from "./build/run-command";
import { buildGetStatusTool } from "./build/get-status";

// Phase C — new tools (Commits 15–22)
import { recallMemoryTool } from "./memory/recall";
import { saveInsightTool } from "./memory/save-insight";
import { saveProjectFactTool } from "./memory/save-project-fact";
import { findComponentTool } from "./component/find";
import { useComponentTool } from "./component/use";
import { saveDecisionTool } from "./memory/save-decision";
import { requestClarificationTool } from "./meta/request-clarification";
import { sleepNowTool } from "./brain/sleep-now";
import { forgetMemoryTool } from "./memory/forget";

// Phase D — task-editing tools (Commits 23–26)
import { addTaskToPlanTool } from "./project/add-task-to-plan";
import { editTaskTool } from "./project/edit-task";
import { reorderTasksTool } from "./project/reorder-tasks";
import { removeTaskTool } from "./project/remove-task";

// Conversation management
import { transferConversationTool } from "./project/transfer-conversation";

// Web tools — Firecrawl-backed scraping (chat + agent surfaces)
import { webScrapeTool } from "./web/scrape";
import { listScrapesTool } from "./web/list-scrapes";
import { getCachedScrapeTool } from "./web/get-cached-scrape";

// Upload tools — read .zip contents uploaded via chat
import { listUploadsTool } from "./uploads/list-uploads";
import { readUploadedContentTool } from "./uploads/read-uploaded-content";
import { diffUploadsTool } from "./uploads/diff-uploads";

// Framer tools — Server API integration (agent surface, framer projects only)
import { framerCreateCodeFileTool } from "./framer/create-code-file";
import { framerSetFileContentTool } from "./framer/set-file-content";
import { framerListCodeFilesTool } from "./framer/list-code-files";
import { framerPublishTool } from "./framer/publish";
import { framerDeployTool } from "./framer/deploy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any>;

export { ToolRegistry } from "./registry";
export type {
  Tool,
  ToolCategory,
  ToolContext,
  ToolCostHint,
  ToolResult,
  ToolSurface,
} from "./types";
export { zodToAnthropicSchema, zodToOpenAISchema } from "./format";

const registeredTools: AnyTool[] = [
  // Task tools (Commit 7) + sub-task tools (Runde 2b + 3-C)
  createTaskTool,
  createSubtaskTool,
  updateSubtaskTool,
  deleteSubtaskTool,
  startTaskTool,
  listTasksTool,
  // Code tools (Commit 8)
  readFileTool,
  searchCodeTool,
  // Project tools (Commit 9)
  executeProjectPlanTool,
  reviseProjectPlanTool,
  // Review tools (Commit 10)
  respondToReviewTool,
  // Commit 12a: agent-surface repo/memory/skills tools
  repoGetTreeTool,
  repoReadFileTool,
  repoFindRelevantFilesTool,
  repoWriteFileTool,
  repoCreatePrTool,
  memorySearchTool,
  memoryStoreTool,
  memorySearchPatternsTool,
  searchSkillsTool,
  activateSkillTool,
  // Commit 12b: agent-surface task/build tools
  taskGetTool,
  taskUpdateStatusTool,
  taskPlanTool,
  taskAssessComplexityTool,
  taskDecomposeProjectTool,
  buildCreateSandboxTool,
  buildValidateTool,
  buildRunCommandTool,
  buildGetStatusTool,
  // Phase C — new tools (Commits 15–22) + save_project_fact (Sprint A)
  recallMemoryTool,
  saveInsightTool,
  saveProjectFactTool,
  findComponentTool,
  useComponentTool,
  saveDecisionTool,
  requestClarificationTool,
  sleepNowTool,
  forgetMemoryTool,
  // Phase D — task-editing tools (Commits 23–26)
  addTaskToPlanTool,
  editTaskTool,
  reorderTasksTool,
  removeTaskTool,
  // Conversation management
  transferConversationTool,
  // Web tools
  webScrapeTool,
  listScrapesTool,
  getCachedScrapeTool,
  // Upload tools
  listUploadsTool,
  readUploadedContentTool,
  diffUploadsTool,
  // Framer tools (filtered by projectType in tool-loop)
  framerCreateCodeFileTool,
  framerSetFileContentTool,
  framerListCodeFilesTool,
  framerPublishTool,
  framerDeployTool,
];

export const toolRegistry = new ToolRegistry(registeredTools);

// --- Agent Tool Types ---
// Shared types for agent-surface tool plumbing. Split out from agent-tools.ts
// in Commit 12c after all tool definitions moved to ai/tools/<category>/.

/**
 * Union of all agent tool names.
 * Kept as a nominal list so sub-agent toolSubset configurations can still
 * reference tools by name at compile-time. Must be kept in sync with the
 * registered tools in ai/tools/index.ts that carry surfaces: ["agent"].
 */
export type AgentToolName =
  // Repository
  | "repo_get_tree"
  | "repo_read_file"
  | "repo_find_relevant_files"
  | "repo_write_file"
  | "repo_create_pr"
  // Memory
  | "memory_search"
  | "memory_store"
  | "memory_search_patterns"
  // Task & Planning
  | "task_get"
  | "task_update_status"
  | "task_plan"
  | "task_assess_complexity"
  | "task_decompose_project"
  // Build & Validation
  | "build_create_sandbox"
  | "build_validate"
  | "build_run_command"
  | "build_get_status"
  // Skills
  | "search_skills"
  | "activate_skill";

/**
 * Per-task context passed into the tool loop. Surfaces repo + task IDs that
 * individual tools may default to when the AI does not supply them.
 */
export interface AgentToolContext {
  /** GitHub org / user owning the target repo */
  repoOwner: string;
  /** Target repository name */
  repoName: string;
  /** Conversation ID for pub/sub routing */
  conversationId: string;
  /** TheFold task ID (optional — available when running from /tasks) */
  thefoldTaskId?: string;
}

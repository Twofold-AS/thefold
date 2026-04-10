// --- Agent Tool Definitions ---
// 15 tools in 4 categories used by the agent's AI tool-use loop.
// Mirrors the pattern in ai/tools.ts (Anthropic tool_use format).
//
// Categories:
//   1. repository   — read/write files, tree, PRs
//   2. memory       — semantic search, store, patterns
//   3. task         — task CRUD, planning, complexity
//   4. build        — sandbox, validation, builder jobs

// --- Shared types ---

export interface AgentToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

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

// ─────────────────────────────────────────────────
// 1. REPOSITORY TOOLS
// ─────────────────────────────────────────────────

const REPOSITORY_TOOLS: AgentToolDefinition[] = [
  {
    name: "repo_get_tree" satisfies AgentToolName,
    description:
      "Get the full file tree of a repository. Use to understand project structure before reading or writing files.",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner (user or org)" },
        repo: { type: "string", description: "Repository name" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "repo_read_file" satisfies AgentToolName,
    description:
      "Read the content of a specific file from the repository. Use when you need to inspect existing code before making changes.",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", description: "File path relative to repo root" },
        ref: { type: "string", description: "Branch or commit SHA (default: main)" },
      },
      required: ["owner", "repo", "path"],
    },
  },
  {
    name: "repo_find_relevant_files" satisfies AgentToolName,
    description:
      "Find files in the repository that are relevant to a task description. Returns ranked list of file paths.",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        taskDescription: { type: "string", description: "What the task is about — used for semantic matching" },
        tree: {
          type: "array",
          items: { type: "string" },
          description: "File tree from repo_get_tree. Pass this to avoid a second API call.",
        },
      },
      required: ["owner", "repo", "taskDescription"],
    },
  },
  {
    name: "repo_write_file" satisfies AgentToolName,
    description:
      "Write or update a file in the sandbox workspace. Call this to stage changes before build_validate.",
    input_schema: {
      type: "object",
      properties: {
        sandboxId: { type: "string", description: "Sandbox ID from build_create_sandbox" },
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["sandboxId", "path", "content"],
    },
  },
  {
    name: "repo_create_pr" satisfies AgentToolName,
    description:
      "Create a pull request with all files from the approved review. Only call after the user has approved a review.",
    input_schema: {
      type: "object",
      properties: {
        reviewId: { type: "string", description: "Code review ID to turn into a PR" },
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description (markdown)" },
        branch: { type: "string", description: "Source branch name" },
      },
      required: ["reviewId", "title"],
    },
  },
];

// ─────────────────────────────────────────────────
// 2. MEMORY TOOLS
// ─────────────────────────────────────────────────

const MEMORY_TOOLS: AgentToolDefinition[] = [
  {
    name: "memory_search" satisfies AgentToolName,
    description:
      "Search for relevant memories from previous tasks. Use at the start of every task to retrieve known patterns, conventions, and prior solutions.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Semantic search query — describe what you are looking for" },
        repoName: { type: "string", description: "Scope search to a specific repository" },
        limit: { type: "number", description: "Max results (default: 10)" },
        types: {
          type: "array",
          items: { type: "string", enum: ["general", "skill", "task", "session", "error_pattern", "decision"] },
          description: "Filter by memory type",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_store" satisfies AgentToolName,
    description:
      "Store a memory for future tasks. Use after completing a task to record patterns, decisions, or solutions that were discovered.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to store" },
        type: {
          type: "string",
          enum: ["general", "skill", "task", "session", "error_pattern", "decision"],
          description: "Memory category",
        },
        repoName: { type: "string", description: "Associate with a specific repository" },
        tags: { type: "array", items: { type: "string" }, description: "Search tags" },
        importance: { type: "number", description: "Importance score 0-1 (default: 0.5)" },
      },
      required: ["content", "type"],
    },
  },
  {
    name: "memory_search_patterns" satisfies AgentToolName,
    description:
      "Search for error patterns from previous failures. Use when a validation step fails to find known fixes for similar errors.",
    input_schema: {
      type: "object",
      properties: {
        errorMessage: { type: "string", description: "The error message or stack trace to match" },
        language: { type: "string", description: "Programming language or framework (e.g. TypeScript, React)" },
        limit: { type: "number", description: "Max results (default: 5)" },
      },
      required: ["errorMessage"],
    },
  },
];

// ─────────────────────────────────────────────────
// 3. TASK & PLANNING TOOLS
// ─────────────────────────────────────────────────

const TASK_TOOLS: AgentToolDefinition[] = [
  {
    name: "task_get" satisfies AgentToolName,
    description:
      "Get the full details of a task including description, status, and metadata. Use to re-read the task after context trimming.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task UUID" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "task_update_status" satisfies AgentToolName,
    description:
      "Update the status of a task. Use to mark a task as in_progress when starting, or blocked when an unrecoverable error occurs.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        status: {
          type: "string",
          enum: ["backlog", "planned", "in_progress", "in_review", "done", "blocked"],
        },
        errorMessage: { type: "string", description: "Required when status is blocked" },
      },
      required: ["taskId", "status"],
    },
  },
  {
    name: "task_plan" satisfies AgentToolName,
    description:
      "Generate a structured implementation plan for a task. Returns ordered steps with file paths and descriptions. Call this before writing any code.",
    input_schema: {
      type: "object",
      properties: {
        taskDescription: { type: "string", description: "Full task description including context" },
        projectStructure: { type: "string", description: "Repository file tree as a string" },
        existingCode: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
          },
          description: "Relevant existing files for context",
        },
        complexityHint: { type: "number", description: "Complexity score 1-10 if already assessed" },
      },
      required: ["taskDescription", "projectStructure"],
    },
  },
  {
    name: "task_assess_complexity" satisfies AgentToolName,
    description:
      "Assess the complexity of a task (1-10) and select the appropriate AI model. Call before planning to determine resource requirements.",
    input_schema: {
      type: "object",
      properties: {
        taskDescription: { type: "string" },
        projectStructure: { type: "string" },
        fileCount: { type: "number", description: "Number of files in the repository" },
      },
      required: ["taskDescription", "projectStructure"],
    },
  },
  {
    name: "task_decompose_project" satisfies AgentToolName,
    description:
      "Decompose a large user request into phases and atomic tasks. Use when the request requires multiple systems or more than 3 files.",
    input_schema: {
      type: "object",
      properties: {
        userMessage: { type: "string", description: "The original user request" },
        repoOwner: { type: "string" },
        repoName: { type: "string" },
        projectStructure: { type: "string", description: "Existing file tree" },
        existingFiles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      },
      required: ["userMessage", "repoOwner", "repoName", "projectStructure"],
    },
  },
];

// ─────────────────────────────────────────────────
// 4. BUILD & VALIDATION TOOLS
// ─────────────────────────────────────────────────

const BUILD_TOOLS: AgentToolDefinition[] = [
  {
    name: "build_create_sandbox" satisfies AgentToolName,
    description:
      "Create an isolated sandbox environment for code execution and validation. Returns a sandboxId used by all other build tools.",
    input_schema: {
      type: "object",
      properties: {
        repoOwner: { type: "string" },
        repoName: { type: "string" },
        branch: { type: "string", description: "Branch to clone into the sandbox (default: main)" },
      },
      required: ["repoOwner", "repoName"],
    },
  },
  {
    name: "build_validate" satisfies AgentToolName,
    description:
      "Run the full validation pipeline in the sandbox: typecheck → lint → test → snapshot → performance. Returns pass/fail per step with error details.",
    input_schema: {
      type: "object",
      properties: {
        sandboxId: { type: "string" },
        incremental: {
          type: "boolean",
          description: "Run incremental validation (only changed files). Faster but less complete (default: false).",
        },
      },
      required: ["sandboxId"],
    },
  },
  {
    name: "build_run_command" satisfies AgentToolName,
    description:
      "Run an arbitrary shell command inside the sandbox. Use for npm install, running scripts, or inspecting build output.",
    input_schema: {
      type: "object",
      properties: {
        sandboxId: { type: "string" },
        command: { type: "string", description: "Shell command to run (e.g. 'npm install', 'ls -la')" },
        timeoutMs: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
      },
      required: ["sandboxId", "command"],
    },
  },
  {
    name: "build_get_status" satisfies AgentToolName,
    description:
      "Get the current status and logs of a builder job. Use to check on async build progress.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Builder job ID from builder.start()" },
      },
      required: ["jobId"],
    },
  },
];

// ─────────────────────────────────────────────────
// 5. SKILLS TOOLS
// ─────────────────────────────────────────────────

const SKILLS_TOOLS: AgentToolDefinition[] = [
  {
    name: "search_skills" satisfies AgentToolName,
    description:
      "Search for active skills that apply to the current context. Use to discover prompt fragments and coding conventions before planning.",
    input_schema: {
      type: "object",
      properties: {
        context: {
          type: "string",
          enum: ["planning", "coding", "review", "chat"],
          description: "Phase of work — determines which skills apply",
        },
        category: {
          type: "string",
          enum: ["framework", "language", "security", "style", "quality", "general"],
          description: "Filter by skill category (optional)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (e.g. ['encore', 'typescript'])",
        },
        enabledOnly: {
          type: "boolean",
          description: "Return only enabled skills (default: true)",
        },
      },
      required: ["context"],
    },
  },
  {
    name: "activate_skill" satisfies AgentToolName,
    description:
      "Enable or disable a skill by ID. Use when the user asks to turn a skill on or off, or when a skill is causing issues.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Skill UUID" },
        enabled: { type: "boolean", description: "true = enable, false = disable" },
      },
      required: ["id", "enabled"],
    },
  },
];

// ─────────────────────────────────────────────────
// Aggregated export
// ─────────────────────────────────────────────────

/** All agent tool definitions — 19 tools across 5 categories */
export const AGENT_TOOLS: AgentToolDefinition[] = [
  ...REPOSITORY_TOOLS,
  ...MEMORY_TOOLS,
  ...TASK_TOOLS,
  ...BUILD_TOOLS,
  ...SKILLS_TOOLS,
];

/** Tool names grouped by category — for documentation and routing */
export const AGENT_TOOL_CATEGORIES = {
  repository: REPOSITORY_TOOLS.map((t) => t.name as AgentToolName),
  memory: MEMORY_TOOLS.map((t) => t.name as AgentToolName),
  task: TASK_TOOLS.map((t) => t.name as AgentToolName),
  build: BUILD_TOOLS.map((t) => t.name as AgentToolName),
  skills: SKILLS_TOOLS.map((t) => t.name as AgentToolName),
} as const;

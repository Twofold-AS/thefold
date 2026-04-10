// --- Agent Tool Executor ---
// Routes each tool call from the AI tool-use loop to the correct backend service.
// Mirrors the pattern in ai/tools.ts executeToolCall, but for agent-internal tools.
//
// Tool categories and their service targets:
//   repository → github service
//   memory     → memory service
//   task       → tasks + ai services
//   build      → sandbox + builder services

import log from "encore.dev/log";
import { github, memory, sandbox, builder, tasks, ai, agent, skills } from "~encore/clients";
import type { AgentToolName } from "./agent-tools";

// --- Result type ---

export interface AgentToolResult {
  /** Serialized result returned to the AI as tool_result content */
  content: string;
  /** true = the AI should see this as an error */
  isError?: boolean;
}

// --- Executor context (per-task, passed in from the tool-use loop) ---

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

// --- Public interface ---

/**
 * Execute a single agent tool call and return the serialized result.
 * Called from the AI tool-use loop after parsing the tool_use block.
 *
 * @param name   Tool name from AgentToolName union
 * @param input  Raw input object from the AI (already parsed from JSON)
 * @param ctx    Per-task context (owner, repo, conversation, task IDs)
 */
export async function executeAgentTool(
  name: AgentToolName,
  input: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  try {
    const result = await dispatch(name, input, ctx);
    return { content: JSON.stringify(result) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("agent tool call failed", { tool: name, error: msg });
    return {
      content: JSON.stringify({ error: msg }),
      isError: true,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal dispatcher
// ─────────────────────────────────────────────────────────────────────────────

async function dispatch(
  name: AgentToolName,
  input: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<unknown> {
  switch (name) {

    // ─── REPOSITORY ───────────────────────────────────────────────────────────

    case "repo_get_tree": {
      const owner = str(input.owner) || ctx.repoOwner;
      const repo  = str(input.repo)  || ctx.repoName;
      const result = await github.getTree({ owner, repo });
      return { tree: result.tree };
    }

    case "repo_read_file": {
      const owner = str(input.owner) || ctx.repoOwner;
      const repo  = str(input.repo)  || ctx.repoName;
      const path  = requireStr(input.path, "path");
      // github.getFile does not accept a ref parameter — always reads head of default branch
      const result = await github.getFile({ owner, repo, path });
      return {
        path,
        content: result.content,
        sha: result.sha,
      };
    }

    case "repo_find_relevant_files": {
      const owner           = str(input.owner) || ctx.repoOwner;
      const repo            = str(input.repo)  || ctx.repoName;
      const taskDescription = requireStr(input.taskDescription, "taskDescription");

      // Reuse tree from input if the AI already fetched it; otherwise fetch now
      let tree: string[];
      if (Array.isArray(input.tree) && input.tree.length > 0) {
        tree = input.tree as string[];
      } else {
        const treeResult = await github.getTree({ owner, repo });
        tree = treeResult.tree;
      }

      const result = await github.findRelevantFiles({ owner, repo, taskDescription, tree });
      return { paths: result.paths };
    }

    case "repo_write_file": {
      const sandboxId = requireStr(input.sandboxId, "sandboxId");
      const path      = requireStr(input.path,      "path");
      const content   = requireStr(input.content,   "content");
      await sandbox.writeFile({ sandboxId, path, content });
      return { ok: true, path };
    }

    case "repo_create_pr": {
      const reviewId = requireStr(input.reviewId, "reviewId");
      const title    = requireStr(input.title,    "title");
      const body     = str(input.body) || "";
      const branch   = str(input.branch) || `thefold/${Date.now()}`;

      // Load review to get files
      const { review } = await agent.getReview({ reviewId });

      // Map ReviewFile[] → github.createPR files format
      const files = review.filesChanged.map((f: { path: string; content: string; action: string }) => ({
        path:    f.path,
        content: f.content,
        action:  f.action as "create" | "modify" | "delete",
      }));

      const pr = await github.createPR({
        owner:  review.repoOwner || ctx.repoOwner,
        repo:   review.repoName  || ctx.repoName,
        branch,
        title,
        body,
        files,
      });

      return { url: pr.url, number: pr.number };
    }

    // ─── MEMORY ───────────────────────────────────────────────────────────────

    case "memory_search": {
      const query    = requireStr(input.query, "query");
      const limit    = typeof input.limit === "number" ? input.limit : 10;
      const repoName = str(input.repoName) || ctx.repoName || undefined;
      const types    = Array.isArray(input.types) ? (input.types as string[]) : undefined;

      const result = await memory.search({
        query,
        limit,
        sourceRepo: repoName,
        // Pass first requested type — memory.search accepts a single memoryType filter
        memoryType: types?.[0] as any,
      });

      return {
        results: result.results.map((r: { id: string; content: string; memoryType: string; similarity: number; decayedScore: number; trustLevel: string; tags: string[] }) => ({
          id:          r.id,
          content:     r.content,
          memoryType:  r.memoryType,
          similarity:  r.similarity,
          decayedScore: r.decayedScore,
          trustLevel:  r.trustLevel,
          tags:        r.tags,
        })),
      };
    }

    case "memory_store": {
      const content  = requireStr(input.content, "content");
      const type     = requireStr(input.type, "type");
      const repoName = str(input.repoName) || ctx.repoName || undefined;
      const tags     = Array.isArray(input.tags) ? (input.tags as string[]) : [];
      const importance = typeof input.importance === "number" ? input.importance : 0.5;

      const result = await memory.store({
        content,
        category: "agent",
        memoryType: type as any,
        sourceRepo: repoName,
        tags,
        conversationId: ctx.conversationId,
        // Map importance (0–1) to ttlDays: low importance → shorter TTL
        ttlDays: Math.round(30 + importance * 60), // 30–90 days
        trustLevel: "agent",
      });

      return { id: result.id };
    }

    case "memory_search_patterns": {
      const errorMessage = requireStr(input.errorMessage, "errorMessage");
      const limit        = typeof input.limit === "number" ? input.limit : 5;
      const sourceRepo   = str(input.language) ? undefined : (ctx.repoName || undefined);

      const result = await memory.searchPatterns({
        query: errorMessage,
        sourceRepo,
        limit,
      });

      return {
        patterns: result.patterns.map((p: { id: string; patternType: string; problemDescription: string; solutionDescription: string }) => ({
          id:                  p.id,
          patternType:         p.patternType,
          problemDescription:  p.problemDescription,
          solutionDescription: p.solutionDescription,
        })),
      };
    }

    // ─── TASK & PLANNING ──────────────────────────────────────────────────────

    case "task_get": {
      const taskId = requireStr(input.taskId, "taskId");
      const result = await tasks.getTaskInternal({ id: taskId });
      return { task: result.task };
    }

    case "task_update_status": {
      const taskId       = requireStr(input.taskId, "taskId");
      const status       = requireStr(input.status,  "status");
      const errorMessage = str(input.errorMessage);
      await tasks.updateTaskStatus({ id: taskId, status: status as any, errorMessage: errorMessage || undefined });
      return { ok: true };
    }

    case "task_plan": {
      const taskDescription  = requireStr(input.taskDescription, "taskDescription");
      const projectStructure = requireStr(input.projectStructure, "projectStructure");
      const existingCode     = Array.isArray(input.existingCode)
        ? (input.existingCode as Array<{ path: string; content: string }>)
        : [];

      const result = await ai.planTask({
        task:            taskDescription,
        projectStructure,
        relevantFiles:   existingCode,
        memoryContext:   [],
        docsContext:     [],
      });

      return {
        plan:       result.plan,
        reasoning:  result.reasoning,
        tokensUsed: result.tokensUsed,
        costUsd:    result.costUsd,
      };
    }

    case "task_assess_complexity": {
      const taskDescription  = requireStr(input.taskDescription, "taskDescription");
      const projectStructure = requireStr(input.projectStructure, "projectStructure");
      const fileCount        = typeof input.fileCount === "number" ? input.fileCount : 0;

      const result = await ai.assessComplexity({
        taskDescription,
        projectStructure,
        fileCount,
      });

      return {
        complexity:     result.complexity,
        reasoning:      result.reasoning,
        suggestedModel: result.suggestedModel,
        tokensUsed:     result.tokensUsed,
        costUsd:        result.costUsd,
      };
    }

    case "task_decompose_project": {
      const userMessage      = requireStr(input.userMessage, "userMessage");
      const repoOwner        = str(input.repoOwner) || ctx.repoOwner;
      const repoName         = str(input.repoName)  || ctx.repoName;
      const projectStructure = requireStr(input.projectStructure, "projectStructure");
      const existingFiles    = Array.isArray(input.existingFiles)
        ? (input.existingFiles as Array<{ path: string; content: string }>)
        : undefined;

      const result = await ai.decomposeProject({
        userMessage,
        repoOwner,
        repoName,
        projectStructure,
        existingFiles,
      });

      return {
        phases:              result.phases,
        conventions:         result.conventions,
        reasoning:           result.reasoning,
        estimatedTotalTasks: result.estimatedTotalTasks,
        tokensUsed:          result.tokensUsed,
        costUsd:             result.costUsd,
      };
    }

    // ─── BUILD & VALIDATION ───────────────────────────────────────────────────

    case "build_create_sandbox": {
      const repoOwner = str(input.repoOwner) || ctx.repoOwner;
      const repoName  = str(input.repoName)  || ctx.repoName;
      const ref       = str(input.branch) || "main";

      const result = await sandbox.create({ repoOwner, repoName, ref });
      return { sandboxId: result.id };
    }

    case "build_validate": {
      const sandboxId = requireStr(input.sandboxId, "sandboxId");
      // validateIncremental requires a specific filePath — use the full pipeline here
      const result = await sandbox.validate({ sandboxId });
      return {
        success: result.success,
        output:  result.output,
        errors:  result.errors,
      };
    }

    case "build_run_command": {
      const sandboxId = requireStr(input.sandboxId, "sandboxId");
      const command   = requireStr(input.command,   "command");
      const timeout   = typeof input.timeoutMs === "number" ? input.timeoutMs : 30_000;

      const result = await sandbox.runCommand({ sandboxId, command, timeout });
      return {
        stdout:   result.stdout,
        stderr:   result.stderr,
        exitCode: result.exitCode,
      };
    }

    case "build_get_status": {
      const jobId = requireStr(input.jobId, "jobId");
      const result = await builder.status({ jobId });
      return {
        status:    result.job.status,
        phase:     result.job.currentPhase,
        filesBuilt: result.job.filesWritten,
        tokensUsed: result.job.totalTokensUsed,
        costUsd:   result.job.totalCostUsd,
        steps:     result.steps,
      };
    }

    // ─── SKILLS ───────────────────────────────────────────────────────────────

    case "search_skills": {
      const contextStr = requireStr(input.context, "context");
      const taskType   = str(input.context) || "all";

      // Use skills.resolve() for routing-rule-based filtering
      const result = await skills.resolve({
        context: {
          task:             contextStr,
          taskType,
          repo:             ctx.repoName || undefined,
          userId:           ctx.thefoldTaskId || "agent",
          totalTokenBudget: 20_000,
        },
      });

      // Extract matched skills from the injected prompt and postRun skills
      // Return skills with truncated promptFragment (max 2000 tokens ≈ 8000 chars)
      const MAX_FRAGMENT_CHARS = 8_000;
      const injectedIds = new Set(result.result.injectedSkillIds);

      // Fetch full skill list to get metadata for injected skills
      const listResult = await skills.listSkills({ enabledOnly: true });
      const matchedSkills = listResult.skills
        .filter((s: { id: string }) => injectedIds.has(s.id))
        .map((s: { id: string; name: string; description: string; promptFragment: string; category: string; tags: string[]; enabled: boolean; taskPhase: string }) => ({
          id:             s.id,
          name:           s.name,
          description:    s.description,
          promptFragment: s.promptFragment.length > MAX_FRAGMENT_CHARS
            ? s.promptFragment.substring(0, MAX_FRAGMENT_CHARS) + "... [truncated]"
            : s.promptFragment,
          category:       s.category,
          tags:           s.tags,
          taskPhase:      s.taskPhase,
        }));

      return {
        skills:        matchedSkills,
        count:         matchedSkills.length,
        tokensUsed:    result.result.tokensUsed,
        injectedPrompt: result.result.injectedPrompt.substring(0, 500) + (result.result.injectedPrompt.length > 500 ? "..." : ""),
      };
    }

    case "activate_skill": {
      const id      = requireStr(input.id,      "id");
      const enabled = typeof input.enabled === "boolean" ? input.enabled : true;

      const toggleResult = await skills.toggleSkill({ id, enabled });

      // After toggle, fetch full promptFragment so AI can use it immediately
      const MAX_FRAGMENT_CHARS = 8_000;
      const listResult = await skills.listSkills({ enabledOnly: false });
      const skill = listResult.skills.find((s: { id: string }) => s.id === id);

      return {
        id:             toggleResult.skill.id,
        name:           toggleResult.skill.name,
        enabled:        toggleResult.skill.enabled,
        promptFragment: skill
          ? (skill.promptFragment.length > MAX_FRAGMENT_CHARS
            ? skill.promptFragment.substring(0, MAX_FRAGMENT_CHARS) + "... [truncated]"
            : skill.promptFragment)
          : "",
      };
    }

    default: {
      const exhaustiveCheck: never = name;
      throw new Error(`Unknown agent tool: ${exhaustiveCheck}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Return string value or empty string */
function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

/** Return string value or throw if missing / empty */
function requireStr(value: unknown, field: string): string {
  const s = str(value);
  if (!s) throw new Error(`Missing required field: ${field}`);
  return s;
}

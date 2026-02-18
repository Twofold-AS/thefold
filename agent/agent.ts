import { api, APIError } from "encore.dev/api";
import { ai } from "~encore/clients";
import { github } from "~encore/clients";
import { linear } from "~encore/clients";
import { memory } from "~encore/clients";
import { docs } from "~encore/clients";
import { sandbox } from "~encore/clients";
import { users } from "~encore/clients";
import { tasks } from "~encore/clients";
import { builder } from "~encore/clients";
import { mcp } from "~encore/clients";
import { agentReports } from "../chat/chat";
import {
  selectOptimalModel,
  calculateSavings,
  type ModelMode,
} from "../ai/router";
import {
  planSubAgents,
  executeSubAgents,
  mergeResults,
  sumCosts,
  sumTokens,
} from "../ai/orchestrate-sub-agents";
import type { BudgetMode } from "../ai/sub-agents";
import type { AgentExecutionContext, AttemptRecord, ErrorPattern, CuratedContext, AIReviewData } from "./types";
import { submitReviewInternal } from "./review";
import { aiBreaker, githubBreaker, sandboxBreaker } from "./circuit-breaker";

// --- Database (shared) ---

import { db } from "./db";

// --- Constants ---

const REPO_OWNER = "Twofold-AS";
const REPO_NAME = "thefold";

// --- Types ---

export interface StartTaskRequest {
  conversationId: string;
  taskId: string;
  userMessage: string;
  userId?: string; // optional — used to fetch model preference
  modelOverride?: string; // manuelt modellvalg fra chat
  thefoldTaskId?: string; // TheFold task engine ID (if task comes from tasks service)
  repoName?: string; // repo name from caller (chat/tool)
  repoOwner?: string; // repo owner from caller
}

export interface StartTaskResponse {
  status: "started";
  taskId: string;
}

// TaskContext is now AgentExecutionContext from ./types
type TaskContext = AgentExecutionContext;

// --- ExecuteTask Options (for orchestrator integration) ---

export interface ExecuteTaskOptions {
  curatedContext?: CuratedContext;  // If set, skip steps 1-3 (context gathering)
  projectConventions?: string;     // Included in system prompt
  skipLinear?: boolean;            // Skip Linear read/update (orchestrator tasks)
  taskDescription?: string;        // Override task description (from orchestrator)
  collectOnly?: boolean;           // If true: run steps 1-7 only, skip review/PR/cleanup. Sandbox kept alive.
  sandboxId?: string;              // Reuse existing sandbox instead of creating new one
  forceContinue?: boolean;         // If true: skip assessConfidence, go straight to planning
  userClarification?: string;      // User's clarification response (appended to task description)
}

export interface ExecuteTaskResult {
  success: boolean;
  prUrl?: string;
  filesChanged: string[];
  filesContent?: Array<{ path: string; content: string; action: string }>; // populated when collectOnly=true
  costUsd: number;
  tokensUsed: number;
  errorMessage?: string;
  reviewId?: string;
  sandboxId?: string;              // returned when collectOnly=true (sandbox kept alive)
  status?: 'completed' | 'pending_review' | 'failed';
}

const MAX_RETRIES = 5;
const MAX_PLAN_REVISIONS = 2;
const MAX_FILE_FIX_RETRIES = 2; // per-file incremental fix attempts
const MAX_CHUNKS_PER_FILE = 5;
const CHUNK_SIZE = 100; // lines per chunk
const SMALL_FILE_THRESHOLD = 100;  // lines: read full
const MEDIUM_FILE_THRESHOLD = 500; // lines: read in chunks

// --- Helper: Report progress to chat ---

async function report(
  ctx: TaskContext,
  content: string,
  status: "working" | "completed" | "failed" | "needs_input",
  extra?: { prUrl?: string; filesChanged?: string[] }
) {
  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content,
    status,
    prUrl: extra?.prUrl,
    filesChanged: extra?.filesChanged,
  });
}

// --- Helper: Report structured steps to chat (for live AgentStatus) ---

async function reportSteps(
  ctx: TaskContext,
  phase: string,
  steps: Array<{ label: string; status: "active" | "done" | "error" | "info" }>,
  extra?: { title?: string; planProgress?: { current: number; total: number }; tasks?: Array<{ id: string; title: string; status: string }>; questions?: string[] }
) {
  // Use fixed phase title if no explicit title or plan progress, preventing title/content duplication
  const title = extra?.planProgress
    ? `Utfører plan ${extra.planProgress.current}/${extra.planProgress.total}`
    : extra?.title || PHASE_TITLES[phase] || phase;

  const statusContent = JSON.stringify({
    type: "agent_status",
    phase,
    title,
    planProgress: extra?.planProgress,
    activeTasks: extra?.tasks,
    questions: extra?.questions,
    steps,
  });

  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: statusContent,
    status: phase === "Ferdig" ? "completed" : phase === "Feilet" ? "failed" : "working",
  });
}

// --- Helper: Publish a thought to chat (lightweight, non-blocking feed) ---

async function think(ctx: TaskContext, thought: string) {
  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: JSON.stringify({
      type: "agent_thought",
      thought,
      timestamp: Date.now(),
    }),
    status: "working",
  });
}

// --- Helper: Update Linear only if task exists in Linear (skip local tasks) ---

async function updateLinearIfExists(ctx: TaskContext, comment: string, state?: string) {
  // If thefoldTaskId matches taskId, it's a local task — skip Linear
  if (ctx.thefoldTaskId && ctx.thefoldTaskId === ctx.taskId) {
    return;
  }

  try {
    await linear.updateTask({
      taskId: ctx.taskId,
      ...(state ? { state } : {}),
      comment,
    });
  } catch (e) {
    console.warn("Linear update failed (task may not exist in Linear):", e);
    // Don't crash — Linear update is optional
  }
}

// --- Audit Logging ---

interface AuditOptions {
  sessionId: string;
  actionType: string;
  details: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
  confidenceScore?: number;
  taskId?: string;
  repoName?: string;
  durationMs?: number;
}

async function audit(opts: AuditOptions) {
  await db.exec`
    INSERT INTO agent_audit_log (session_id, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms)
    VALUES (
      ${opts.sessionId},
      ${opts.actionType},
      ${JSON.stringify(opts.details)}::jsonb,
      ${opts.success ?? null},
      ${opts.errorMessage ?? null},
      ${opts.confidenceScore ?? null},
      ${opts.taskId ?? null},
      ${opts.repoName ?? null},
      ${opts.durationMs ?? null}
    )
  `;
}

// Helper to time an operation and audit it
async function auditedStep<T>(
  ctx: TaskContext,
  actionType: string,
  details: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await audit({
      sessionId: ctx.conversationId,
      actionType,
      details,
      success: true,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await audit({
      sessionId: ctx.conversationId,
      actionType,
      details,
      success: false,
      errorMessage: errorMsg,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

// --- Cancel Check ---

async function checkCancelled(ctx: TaskContext, activeSandboxId?: string): Promise<boolean> {
  try {
    const result = await tasks.isCancelled({ taskId: ctx.taskId });
    if (result.cancelled) {
      await report(ctx, "Oppgaven ble avbrutt av bruker.", "failed");
      // Destroy sandbox if active
      if (activeSandboxId) {
        await sandbox.destroy({ sandboxId: activeSandboxId }).catch(() => {});
      }
      return true;
    }
  } catch {
    // Non-critical — continue execution
  }
  return false;
}

// --- shouldStopTask: Check actual DB status (DEL 7) ---

const ACTIVE_STATUSES = ["in_progress", "in_review", "pending_review", "planned"];
const STOPPED_STATUSES = ["backlog", "blocked", "cancelled"];

async function shouldStopTask(ctx: TaskContext, phase: string, activeSandboxId?: string): Promise<boolean> {
  // First check in-memory cancellation
  if (await checkCancelled(ctx, activeSandboxId)) return true;

  // Then check actual DB status if we have a thefold task ID
  const taskId = ctx.thefoldTaskId || ctx.taskId;
  try {
    const taskResult = await tasks.getTaskInternal({ id: taskId });
    const status = taskResult.task.status;

    if (STOPPED_STATUSES.includes(status)) {
      const reason = status === "backlog" ? "Oppgaven ble sendt tilbake til backlog"
        : status === "blocked" ? "Oppgaven ble blokkert"
        : "Oppgaven ble avbrutt";

      await reportSteps(ctx, "Stopped", [
        { label: reason, status: "error" },
      ], { title: "Oppgave stoppet" });

      await audit({
        sessionId: ctx.conversationId,
        actionType: "task_externally_modified",
        details: {
          taskId,
          expectedStatus: "in_progress",
          actualStatus: status,
          agentPhase: phase,
        },
        success: false,
        errorMessage: reason,
        taskId: ctx.taskId,
        repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      });

      if (activeSandboxId) {
        await sandbox.destroy({ sandboxId: activeSandboxId }).catch(() => {});
      }
      return true;
    }

    // Also check "done" — if someone else already completed it
    if (status === "done") {
      await reportSteps(ctx, "Stopped", [
        { label: "Oppgaven er allerede fullført", status: "info" },
      ], { title: "Oppgave stoppet" });
      return true;
    }
  } catch {
    // Task might not exist in tasks-service (Linear-only) — continue
  }
  return false;
}

// --- Fixed phase titles for reportSteps (DEL 2) ---

const PHASE_TITLES: Record<string, string> = {
  Forbereder: "Forbereder",
  Analyserer: "Analyserer",
  Planlegger: "Planlegger",
  Bygger: "Bygger kode",
  Reviewer: "Reviewer kode",
  Utfører: "Jobber med oppgave",
  Venter: "Trenger avklaring",
  Ferdig: "Oppgave fullført",
  Feilet: "Feil oppstod",
  Stopped: "Oppgave stoppet",
};

// --- Auto-init for empty repos ---

export async function autoInitRepo(ctx: TaskContext): Promise<void> {
  const repoName = ctx.repoName;
  const repoOwner = ctx.repoOwner;

  // 1. Create a visible init task
  const initTask = await tasks.createTask({
    title: `Initialiser repo: ${repoName}`,
    description: [
      `Automatisk opprettet av agenten fordi repoet ${repoOwner}/${repoName} var tomt.`,
      "",
      "Oppretter grunnleggende prosjektstruktur:",
      "- README.md med reponavn og beskrivelse",
      "- .gitignore for Node/TypeScript",
      "- package.json med grunnleggende oppsett",
      "- tsconfig.json med fornuftige defaults",
    ].join("\n"),
    repo: repoName,
    source: "chat",
    labels: ["auto-init"],
    priority: 1,
  });

  // 2. Mark as in_progress
  await tasks.updateTaskStatus({ id: initTask.task.id, status: "in_progress" });

  // 3. Create the init files and push via createPR
  const initFiles = [
    {
      path: "README.md",
      content: `# ${repoName}\n\nProject initialized by TheFold.\n`,
      action: "create" as const,
    },
    {
      path: ".gitignore",
      content: [
        "node_modules/",
        "dist/",
        ".next/",
        "*.log",
        ".env",
        ".env.local",
        ".DS_Store",
        "coverage/",
        ".turbo/",
        "",
      ].join("\n"),
      action: "create" as const,
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: repoName.toLowerCase(),
          version: "0.1.0",
          private: true,
          scripts: {
            build: "tsc",
            dev: "tsc --watch",
            test: "echo \"No tests yet\"",
          },
          dependencies: {},
          devDependencies: {
            typescript: "^5.4.0",
          },
        },
        null,
        2,
      ) + "\n",
      action: "create" as const,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "dist",
            rootDir: ".",
            declaration: true,
          },
          include: ["**/*.ts"],
          exclude: ["node_modules", "dist"],
        },
        null,
        2,
      ) + "\n",
      action: "create" as const,
    },
  ];

  // Report init task to AgentStatus
  await reportSteps(ctx, "Forbereder", [
    { label: "Initialiserer tomt repo", status: "active" },
  ], {
    title: "Initialiserer repo",
    tasks: [{ id: initTask.task.id, title: `Initialiser repo: ${repoName}`, status: "in_progress" }],
  });

  try {
    const pr = await githubBreaker.call(() =>
      github.createPR({
        owner: repoOwner,
        repo: repoName,
        branch: "init/project-setup",
        title: `Initialiser repo: ${repoName}`,
        body: [
          "## Automatisk repo-initialisering",
          "",
          "Opprettet av TheFold fordi repoet var tomt.",
          "",
          "**Filer:**",
          "- `README.md` — Prosjektbeskrivelse",
          "- `.gitignore` — Node/TypeScript ignores",
          "- `package.json` — Grunnleggende prosjektoppsett",
          "- `tsconfig.json` — TypeScript-konfigurasjon",
        ].join("\n"),
        files: initFiles,
      }),
    );

    // 4. Mark init task as done
    await tasks.updateTaskStatus({
      id: initTask.task.id,
      status: "done",
      prUrl: pr.url,
    });

    await reportSteps(ctx, "Forbereder", [
      { label: "Repo initialisert", status: "done" },
    ], {
      title: "Repo initialisert",
      tasks: [{ id: initTask.task.id, title: `Initialiser repo: ${repoName}`, status: "done" }],
    });
  } catch (e) {
    // Mark init task as blocked if it fails
    const errorMsg = e instanceof Error ? e.message : String(e);
    await tasks.updateTaskStatus({
      id: initTask.task.id,
      status: "blocked",
      errorMessage: `Auto-init feilet: ${errorMsg}`,
    });
    console.warn("autoInitRepo failed:", errorMsg);
    // Don't throw — let the original task continue (it may still work)
  }
}

// --- The Agent Loop ---

export async function executeTask(ctx: TaskContext, options?: ExecuteTaskOptions): Promise<ExecuteTaskResult> {
  const taskStart = Date.now();
  const useCurated = !!options?.curatedContext;

  // Common variables populated by either path
  let treeString = "";
  let relevantFiles: Array<{ path: string; content: string }> = [];
  let memoryStrings: string[] = [];
  let docsStrings: string[] = [];
  let packageJson: Record<string, unknown> = {};
  let treeArray: string[] = [];
  let taskTitle = ctx.taskId;

  console.log("[DEBUG-AF] === executeTask STARTED ===");
  console.log("[DEBUG-AF] taskId:", ctx.taskId);
  console.log("[DEBUG-AF] thefoldTaskId:", ctx.thefoldTaskId);
  console.log("[DEBUG-AF] repoName:", ctx.repoName);
  console.log("[DEBUG-AF] useCurated:", !!options?.curatedContext);

  try {
    if (useCurated) {
      // === CURATED PATH: Context already gathered by orchestrator ===
      const curated = options!.curatedContext!;
      relevantFiles = curated.relevantFiles;
      memoryStrings = options?.projectConventions
        ? [options.projectConventions, ...curated.memoryContext]
        : curated.memoryContext;
      docsStrings = curated.docsContext;
      ctx.taskDescription = options?.taskDescription || ctx.taskDescription;
      taskTitle = ctx.taskDescription.split("\n")[0].substring(0, 80);

      // Fetch tree for planning (returns empty: true for empty repos)
      let projectTree = await github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName });

      // Auto-init empty repos before continuing
      if (projectTree.empty) {
        await report(ctx, "Tomt repo oppdaget — initialiserer...", "working");
        await autoInitRepo(ctx);
        projectTree = await github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName });
      }

      treeString = projectTree.treeString || "";
      treeArray = projectTree.tree;
      packageJson = projectTree.packageJson || {};

      // Fetch installed MCP tools for curated path too
      try {
        const mcpResult = await mcp.installed();
        if (mcpResult.servers.length > 0) {
          const toolList = mcpResult.servers
            .map((s) => `- **${s.name}**: ${s.description ?? "No description"} (${s.category})`)
            .join("\n");
          docsStrings.push(`[MCP Tools] Du har tilgang til disse verktøyene:\n${toolList}\n\nNOTE: MCP-kall routing er ikke implementert ennå. Bare vær klar over at disse verktøyene finnes.`);
        }
      } catch {
        // Non-critical
      }

      await report(ctx, `Starter oppgave: ${taskTitle}`, "working");
    } else {
      // === STANDARD PATH: Full context gathering (steps 1-3) ===

      // === STEP 1: Understand the task ===
      console.log("[DEBUG-AF] STEP 1: Reading task...");
      if (ctx.thefoldTaskId) {
        console.log("[DEBUG-AF] STEP 1: TheFold path, thefoldTaskId:", ctx.thefoldTaskId);
        // TheFold task engine path — read from tasks service
        await report(ctx, `Leser task fra TheFold...`, "working");

        const tfTask = await auditedStep(ctx, "task_read", { taskId: ctx.thefoldTaskId, source: "thefold" }, async () => {
          const result = await tasks.getTaskInternal({ id: ctx.thefoldTaskId! });
          ctx.taskDescription = result.task.title + (result.task.description ? "\n\n" + result.task.description : "");
          console.log("[DEBUG-AF] STEP 1: Found in tasks-service:", result.task.title, "status:", result.task.status);
          return result;
        });
        taskTitle = tfTask.task.title;
        await think(ctx, `Leser oppgaven... "${taskTitle}". La meg se.`);

        // Update task status to in_progress
        try {
          await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "in_progress" });
        } catch { /* non-critical */ }
      } else if (!options?.skipLinear) {
        console.log("[DEBUG-AF] STEP 1: Standard path (no thefoldTaskId), taskId:", ctx.taskId);
        await report(ctx, `Leser task ${ctx.taskId}...`, "working");

        // Try tasks-service first (chat-created tasks), fallback to Linear
        let taskFound = false;
        try {
          console.log("[DEBUG-AF] STEP 1: Trying tasks-service first...");
          const localTask = await tasks.getTaskInternal({ id: ctx.taskId });
          if (localTask?.task) {
            ctx.taskDescription = localTask.task.title + (localTask.task.description ? "\n\n" + localTask.task.description : "");
            ctx.repoName = localTask.task.repo || ctx.repoName;
            taskTitle = localTask.task.title;
            taskFound = true;
            console.log("[DEBUG-AF] STEP 1: Found in tasks-service:", taskTitle, "repo:", ctx.repoName);

            // Mark as thefoldTaskId so completion/failure paths update status
            ctx.thefoldTaskId = ctx.taskId;

            try {
              await tasks.updateTaskStatus({ id: ctx.taskId, status: "in_progress" });
            } catch { /* non-critical */ }

            await audit({
              sessionId: ctx.conversationId,
              actionType: "task_read",
              details: { taskId: ctx.taskId, source: "thefold_tasks" },
              success: true,
              taskId: ctx.taskId,
              repoName: `${ctx.repoOwner}/${ctx.repoName}`,
            });
          }
        } catch (e) {
          console.log("[DEBUG-AF] STEP 1: Not in tasks-service, trying Linear...", e instanceof Error ? e.message : "");
        }

        if (!taskFound) {
          console.log("[DEBUG-AF] STEP 1: Trying Linear for taskId:", ctx.taskId);
          const taskDetail = await auditedStep(ctx, "task_read", { taskId: ctx.taskId, source: "linear" }, async () => {
            const detail = await linear.getTask({ taskId: ctx.taskId });
            ctx.taskDescription = detail.task.title + "\n\n" + detail.task.description;
            console.log("[DEBUG-AF] STEP 1: Found in Linear:", detail.task.title);
            return detail;
          });
          taskTitle = taskDetail.task.title;
          await think(ctx, `Leser oppgaven... "${taskTitle}". La meg se.`);
        }
      } else if (options?.taskDescription) {
        ctx.taskDescription = options.taskDescription;
        taskTitle = ctx.taskDescription.split("\n")[0].substring(0, 80);
        await report(ctx, `Starter oppgave: ${taskTitle}`, "working");
        await think(ctx, `Leser oppgaven... "${taskTitle}". La meg se.`);
      }

      // === STEP 2: Read the project ===
      console.log("[DEBUG-AF] STEP 2: Reading project tree for", ctx.repoOwner + "/" + ctx.repoName);
      await report(ctx, "Leser prosjektstruktur fra GitHub...", "working");

      let projectTree = await auditedStep(ctx, "project_tree_read", {
        owner: ctx.repoOwner,
        repo: ctx.repoName,
      }, () => githubBreaker.call(() => github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName })));

      // Auto-init empty repos before continuing
      if (projectTree.empty) {
        await report(ctx, "Tomt repo oppdaget — initialiserer...", "working");
        await autoInitRepo(ctx);
        projectTree = await githubBreaker.call(() => github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName }));
      }

      treeString = projectTree.treeString || "";
      treeArray = projectTree.tree;
      packageJson = projectTree.packageJson || {};
      console.log("[DEBUG-AF] STEP 2: Tree loaded,", treeArray.length, "files");

      if (treeArray.length === 0) {
        await think(ctx, "Tomt repo — legger filene i roten.");
      } else {
        await think(ctx, `Fant ${treeArray.length} filer. Ser over strukturen.`);
      }

      const relevantPaths = await auditedStep(ctx, "relevant_files_identified", {
        taskDescription: ctx.taskDescription.substring(0, 200),
      }, () => github.findRelevantFiles({
        owner: ctx.repoOwner,
        repo: ctx.repoName,
        taskDescription: ctx.taskDescription,
        tree: projectTree.tree,
      }));

      relevantFiles = await auditedStep(ctx, "files_read", {
        paths: relevantPaths.paths,
        fileCount: relevantPaths.paths.length,
      }, async () => {
        const files: Array<{ path: string; content: string }> = [];
        let totalTokensSaved = 0;

        for (const path of relevantPaths.paths) {
          const meta = await github.getFileMetadata({
            owner: ctx.repoOwner,
            repo: ctx.repoName,
            path,
          });

          if (meta.totalLines <= SMALL_FILE_THRESHOLD) {
            const file = await github.getFile({ owner: ctx.repoOwner, repo: ctx.repoName, path });
            files.push({ path, content: file.content });
          } else if (meta.totalLines <= MEDIUM_FILE_THRESHOLD) {
            let content = "";
            let startLine = 1;
            let chunksRead = 0;

            while (chunksRead < MAX_CHUNKS_PER_FILE) {
              const chunk = await github.getFileChunk({
                owner: ctx.repoOwner,
                repo: ctx.repoName,
                path,
                startLine,
                maxLines: CHUNK_SIZE,
              });
              content += (content ? "\n" : "") + chunk.content;
              chunksRead++;

              if (!chunk.hasMore) break;
              startLine = chunk.nextStartLine!;
            }

            const fullTokenEstimate = Math.ceil(meta.totalLines * 30 / 4);
            const readTokenEstimate = Math.ceil(content.length / 4);
            totalTokensSaved += Math.max(0, fullTokenEstimate - readTokenEstimate);

            files.push({ path, content });
          } else {
            const firstChunk = await github.getFileChunk({
              owner: ctx.repoOwner,
              repo: ctx.repoName,
              path,
              startLine: 1,
              maxLines: CHUNK_SIZE,
            });

            const lastStart = Math.max(1, meta.totalLines - CHUNK_SIZE);
            const lastChunk = await github.getFileChunk({
              owner: ctx.repoOwner,
              repo: ctx.repoName,
              path,
              startLine: lastStart,
              maxLines: CHUNK_SIZE,
            });

            const content = firstChunk.content
              + `\n\n// ... [${meta.totalLines - (CHUNK_SIZE * 2)} lines omitted — file has ${meta.totalLines} lines total] ...\n\n`
              + lastChunk.content;

            const fullTokenEstimate = Math.ceil(meta.totalLines * 30 / 4);
            const readTokenEstimate = Math.ceil(content.length / 4);
            totalTokensSaved += Math.max(0, fullTokenEstimate - readTokenEstimate);

            files.push({ path, content });
          }
        }

        if (totalTokensSaved > 0) {
          await audit({
            sessionId: ctx.conversationId,
            actionType: "context_windowing_savings",
            details: {
              tokensSaved: totalTokensSaved,
              filesProcessed: files.length,
            },
            success: true,
            taskId: ctx.taskId,
            repoName: `${ctx.repoOwner}/${ctx.repoName}`,
          });
        }

        return files;
      });

      // === STEP 3: Gather context ===
      console.log("[DEBUG-AF] STEP 3: Gathering context (memory + docs)...");
      await reportSteps(ctx, "Analyserer", [
        { label: "Leser oppgave", status: "done" },
        { label: "Henter prosjektstruktur", status: "done" },
        { label: "Henter kontekst og dokumentasjon", status: "active" },
      ]);

      let memories = { results: [] as { content: string; accessCount: number; createdAt: string }[] };
      try {
        memories = await auditedStep(ctx, "memory_searched", {
          query: ctx.taskDescription.substring(0, 200),
        }, () => memory.search({ query: ctx.taskDescription, limit: 10 }));
      } catch (e) {
        console.warn("Memory search failed (rate limited?):", e);
        // Continue without memories — don't crash
      }

      const docsResults = await auditedStep(ctx, "docs_looked_up", {
        dependencyCount: Object.keys(packageJson.dependencies as Record<string, string> || {}).length,
      }, () => docs.lookupForTask({
        taskDescription: ctx.taskDescription,
        existingDependencies: packageJson.dependencies as Record<string, string> || {},
      }));

      memoryStrings = memories.results.map((r) => r.content);
      docsStrings = docsResults.docs.map((d) => `[${d.source}] ${d.content}`);
      console.log("[DEBUG-AF] STEP 3:", memories.results.length, "memories,", docsResults.docs.length, "docs");

      if (memories.results.length > 0) {
        await think(ctx, `Fant ${memories.results.length} relevante minner.`);
      }

      // === STEP 3.5: Fetch installed MCP tools ===
      try {
        const mcpResult = await mcp.installed();
        if (mcpResult.servers.length > 0) {
          const toolList = mcpResult.servers
            .map((s) => `- **${s.name}**: ${s.description ?? "No description"} (${s.category})`)
            .join("\n");
          docsStrings.push(`[MCP Tools] Du har tilgang til disse verktøyene:\n${toolList}\n\nNOTE: MCP-kall routing er ikke implementert ennå. Bare vær klar over at disse verktøyene finnes.`);
        }
      } catch {
        // Non-critical — MCP service may not be running
      }
    }

    // Report context gathered
    if (!useCurated) {
      await reportSteps(ctx, "Planlegger", [
        { label: "Leser oppgave", status: "done" },
        { label: "Henter prosjektstruktur", status: "done" },
        { label: "Henter kontekst", status: "done" },
        { label: "Vurderer oppgaven", status: "active" },
      ]);
    }

    // Cancel check after context gathering
    if (await checkCancelled(ctx)) {
      return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "cancelled" };
    }

    // === STEP 4: Assess Confidence (skip for curated or forceContinue) ===
    console.log("[DEBUG-AF] STEP 4: Assessing confidence...");
    if (!useCurated && !options?.forceContinue) {
      // Empty repo — no existing code to be uncertain about, skip AI assessment
      if (treeArray.length === 0) {
        await report(ctx, "Tomt repo — starter direkte uten klargjøring.", "working");
        await audit({
          sessionId: ctx.conversationId,
          actionType: "confidence_details",
          details: { overall: 90, reason: "empty_repo", recommended_action: "proceed" },
          success: true,
          confidenceScore: 90,
          taskId: ctx.taskId,
          repoName: `${ctx.repoOwner}/${ctx.repoName}`,
        });
      } else {
      await report(ctx, "Vurderer min evne til å løse oppgaven...", "working");

      const confidenceResult = await auditedStep(ctx, "confidence_assessed", {}, async () => {
        const result = await ai.assessConfidence({
          taskDescription: ctx.taskDescription,
          projectStructure: treeString,
          relevantFiles,
          memoryContext: memoryStrings,
          docsContext: docsStrings,
        });
        return result;
      });

      const { confidence } = confidenceResult;

      await audit({
        sessionId: ctx.conversationId,
        actionType: "confidence_details",
        details: {
          overall: confidence.overall,
          breakdown: confidence.breakdown,
          recommended_action: confidence.recommended_action,
          uncertainties: confidence.uncertainties,
        },
        success: true,
        confidenceScore: confidence.overall,
        taskId: ctx.taskId,
        repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      });

      if (confidence.overall < 90) {
        let msg = `Jeg er usikker (${confidence.overall}% sikker) og trenger avklaringer:\n\n`;
        msg += `**Usikkerheter:**\n`;
        confidence.uncertainties.forEach((u: string, i: number) => {
          msg += `${i + 1}. ${u}\n`;
        });
        if (confidence.clarifying_questions && confidence.clarifying_questions.length > 0) {
          msg += `\n**Spørsmål:**\n`;
          confidence.clarifying_questions.forEach((q: string, i: number) => {
            msg += `${i + 1}. ${q}\n`;
          });
        }
        msg += `\nVennligst gi mer informasjon før jeg starter.`;
        await audit({
          sessionId: ctx.conversationId,
          actionType: "task_paused_clarification",
          details: { confidence: confidence.overall, reason: "low_confidence" },
          success: true,
          confidenceScore: confidence.overall,
          taskId: ctx.taskId,
          repoName: `${ctx.repoOwner}/${ctx.repoName}`,
        });
        // Build questions list for frontend
        const clarificationQuestions = [
          ...(confidence.uncertainties || []),
          ...(confidence.clarifying_questions || []),
        ];

        // Send structured agent_status with questions for AgentClarification
        await reportSteps(ctx, "Venter", [
          { label: `Konfidenssjekk: ${confidence.overall}%`, status: "done" },
        ], {
          title: "Trenger avklaring",
          questions: clarificationQuestions.length > 0 ? clarificationQuestions : [msg],
        });

        // Also update task status to needs_input for chat routing
        if (ctx.thefoldTaskId) {
          try {
            await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "needs_input", errorMessage: "Trenger avklaring" });
          } catch { /* non-critical */ }
        }

        return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "low_confidence" };
      }

      if (confidence.overall < 75 || confidence.recommended_action === "break_down") {
        let msg = `Dette ser komplekst ut (${confidence.overall}% sikker). `;
        msg += `Jeg anbefaler å dele det opp:\n\n`;
        if (confidence.suggested_subtasks && confidence.suggested_subtasks.length > 0) {
          confidence.suggested_subtasks.forEach((t: string, i: number) => {
            msg += `${i + 1}. ${t}\n`;
          });
        }
        msg += `\nVil du at jeg skal fortsette likevel, eller dele det opp?`;
        await audit({
          sessionId: ctx.conversationId,
          actionType: "task_paused_breakdown",
          details: { confidence: confidence.overall, subtasks: confidence.suggested_subtasks },
          success: true,
          confidenceScore: confidence.overall,
          taskId: ctx.taskId,
          repoName: `${ctx.repoOwner}/${ctx.repoName}`,
        });
        await report(ctx, msg, "needs_input");
        return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "needs_breakdown" };
      }

      await report(
        ctx,
        `Jeg er ${confidence.overall}% sikker på å løse dette. Starter arbeid...`,
        "working"
      );
      } // end else (non-empty repo)
    }

    // === STEP 4.5: Assess complexity and select model ===
    let selectedModel: string;

    if (ctx.modelOverride) {
      selectedModel = ctx.modelOverride;
    } else if (ctx.modelMode === "manual") {
      await report(ctx, "Hvilken modell vil du bruke?", "needs_input");
      return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "needs_model_selection" };
    } else {
      const complexityResult = await auditedStep(ctx, "complexity_assessed", {
        modelMode: ctx.modelMode,
      }, () => ai.assessComplexity({
        taskDescription: ctx.taskDescription,
        projectStructure: treeString.substring(0, 2000),
        fileCount: treeArray.length,
      }));

      selectedModel = selectOptimalModel(complexityResult.complexity, "auto");

      await audit({
        sessionId: ctx.conversationId,
        actionType: "model_selected",
        details: {
          complexity: complexityResult.complexity,
          reasoning: complexityResult.reasoning,
          modelMode: ctx.modelMode,
          selectedModel,
          suggestedModel: complexityResult.suggestedModel,
        },
        success: true,
        taskId: ctx.taskId,
        repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      });

      await report(
        ctx,
        `Kompleksitet: ${complexityResult.complexity}/10 \u2192 Bruker ${selectedModel} (auto modus)`,
        "working"
      );
    }

    ctx.selectedModel = selectedModel;

    // Cancel check before planning
    if (await checkCancelled(ctx)) {
      return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "cancelled" };
    }

    // === STEP 5: Plan the work ===
    console.log("[DEBUG-AF] STEP 5: Planning task...");
    await reportSteps(ctx, "Planlegger", [
      { label: "Leser oppgave", status: "done" },
      { label: "Henter prosjektstruktur", status: "done" },
      { label: "Henter kontekst", status: "done" },
      { label: "Planlegger arbeidet", status: "active" },
    ]);

    let plan = await auditedStep(ctx, "plan_created", {
      taskDescription: ctx.taskDescription.substring(0, 200),
      model: ctx.selectedModel,
    }, () => aiBreaker.call(() => ai.planTask({
      task: `${ctx.taskDescription}\n\nUser context: ${ctx.userMessage}`,
      projectStructure: treeString,
      relevantFiles,
      memoryContext: memoryStrings,
      docsContext: docsStrings,
      model: ctx.selectedModel,
    })));

    // Track cost
    ctx.totalCostUsd += plan.costUsd;
    ctx.totalTokensUsed += plan.tokensUsed;

    // planSummary: used by retry-loop to show AI what was previously attempted
    let planSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");

    const planStepCount = plan.plan.length;
    console.log("[DEBUG-AF] STEP 5: Plan has", planStepCount, "steps");
    await think(ctx, `Plan klar — ${planStepCount} steg.`);
    await reportSteps(ctx, "Planlegger", [
      { label: "Leser oppgave", status: "done" },
      { label: "Henter prosjektstruktur", status: "done" },
      { label: "Henter kontekst", status: "done" },
      { label: `Plan klar: ${planStepCount} steg`, status: "done" },
    ], { title: `Utfører plan 0/${planStepCount}`, planProgress: { current: 0, total: planStepCount } });

    // === STEP 5.5: Fetch error patterns from memory ===
    try {
      const errorPatternResults = await memory.search({
        query: `error pattern: ${ctx.taskDescription.substring(0, 200)}`,
        limit: 5,
        memoryType: "error_pattern",
      });
      ctx.errorPatterns = errorPatternResults.results.map((r) => ({
        pattern: r.content,
        frequency: r.accessCount,
        lastSeen: r.createdAt,
        knownFix: undefined,
      }));
    } catch {
      ctx.errorPatterns = [];
    }

    // === STEP 5.6: Run sub-agents if enabled and complexity warrants it ===
    let subAgentContext = "";
    if (ctx.subAgentsEnabled) {
      // Derive complexity from plan size as proxy (already assessed in step 4.5)
      const estimatedComplexity = Math.min(10, Math.max(1, plan.plan.length * 2));

      if (estimatedComplexity >= 5) {
        await report(ctx, "Sub-agenter aktivert — kjører spesialiserte AI-agenter parallelt...", "working");

        const budgetMode: BudgetMode = ctx.modelMode === "manual" ? "quality_first" : "balanced";
        const subPlanSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
        const subPlan = planSubAgents(ctx.taskDescription, subPlanSummary, estimatedComplexity, budgetMode);

        if (subPlan.agents.length > 0) {
          await audit({
            sessionId: ctx.conversationId,
            actionType: "sub_agent_started",
            details: {
              agentCount: subPlan.agents.length,
              roles: subPlan.agents.map((a) => a.role),
              models: subPlan.agents.map((a) => a.model),
              complexity: estimatedComplexity,
              budgetMode,
            },
            success: true,
            taskId: ctx.taskId,
            repoName: `${ctx.repoOwner}/${ctx.repoName}`,
          });

          const subResults = await executeSubAgents(subPlan);
          const merged = await mergeResults(subResults, subPlan.mergeStrategy);

          ctx.subAgentResults = subResults;
          ctx.totalCostUsd += sumCosts(subResults);
          ctx.totalTokensUsed += sumTokens(subResults);
          subAgentContext = merged;

          const successCount = subResults.filter((r) => r.success).length;
          const failCount = subResults.filter((r) => !r.success).length;

          await audit({
            sessionId: ctx.conversationId,
            actionType: "sub_agent_completed",
            details: {
              results: subResults.map((r) => ({
                id: r.id,
                role: r.role,
                model: r.model,
                success: r.success,
                costUsd: r.costUsd,
                tokensUsed: r.tokensUsed,
                durationMs: r.durationMs,
                error: r.error,
              })),
              totalCostUsd: sumCosts(subResults),
              totalTokensUsed: sumTokens(subResults),
              successCount,
              failCount,
              mergeStrategy: subPlan.mergeStrategy,
            },
            success: true,
            taskId: ctx.taskId,
            repoName: `${ctx.repoOwner}/${ctx.repoName}`,
          });

          await report(
            ctx,
            `Sub-agenter ferdig: ${successCount}/${subResults.length} vellykket ($${sumCosts(subResults).toFixed(4)})`,
            "working"
          );
        }
      }
    }

    // Track plan progress — incremented after each major phase
    let completedPlanSteps = 0;

    // Report plan ready
    await reportSteps(ctx, "Bygger", [
      { label: "Leser oppgave", status: "done" },
      { label: "Henter prosjektstruktur", status: "done" },
      { label: "Henter kontekst", status: "done" },
      { label: `Plan klar: ${planStepCount} steg`, status: "done" },
      { label: "Oppretter sandbox", status: "active" },
    ], { title: `Utfører plan ${completedPlanSteps}/${planStepCount}`, planProgress: { current: completedPlanSteps, total: planStepCount } });

    // Cancel/stop check before builder (DEL 7)
    if (await shouldStopTask(ctx, "pre_sandbox")) {
      return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "stopped" };
    }

    // === STEP 6: Create sandbox (or reuse provided one) and execute plan via Builder ===
    const sandboxId = options?.sandboxId
      ? { id: options.sandboxId }
      : await auditedStep(ctx, "sandbox_created", {
          repoOwner: ctx.repoOwner,
          repoName: ctx.repoName,
        }, () => sandboxBreaker.call(() => sandbox.create({ repoOwner: ctx.repoOwner, repoName: ctx.repoName })));

    const allFiles: { path: string; content: string; action: string }[] = [];
    let lastError: string | null = null;
    const previousErrors: string[] = [];

    while (ctx.totalAttempts < ctx.maxAttempts) {
      // Cancel/stop check between retry attempts (DEL 7)
      if (await shouldStopTask(ctx, "pre_builder", sandboxId.id)) {
        return { success: false, filesChanged: [], costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "stopped" };
      }

      ctx.totalAttempts++;
      const attemptStart = Date.now();

      try {
        // Delegate to Builder service for file-by-file generation with dependency analysis
        console.log("[DEBUG-AF] STEP 6: Building in sandbox, attempt", ctx.totalAttempts, "/", ctx.maxAttempts);
        await reportSteps(ctx, "Bygger", [
          { label: "Plan klar", status: "done" },
          { label: "Builder kjører", status: "active" },
          { label: `Forsøk ${ctx.totalAttempts}/${ctx.maxAttempts}`, status: "info" },
        ]);

        const buildResult = await auditedStep(ctx, "builder_executed", {
          taskId: ctx.taskId,
          sandboxId: sandboxId.id,
          strategy: "auto",
          planSteps: plan.plan.length,
        }, () => {
          // Enrich description with sub-agent context if available
          const enrichedDescription = subAgentContext
            ? `${ctx.taskDescription}\n\n## Sub-agent Analysis\n${subAgentContext}`
            : ctx.taskDescription;

          return aiBreaker.call(() => builder.start({
            taskId: ctx.taskId,
            sandboxId: sandboxId.id,
            plan: {
              description: enrichedDescription,
              repo: `${ctx.repoOwner}/${ctx.repoName}`,
              repoOwner: ctx.repoOwner,
              repoName: ctx.repoName,
              model: ctx.selectedModel,
              steps: plan.plan,
            },
          }));
        });

        // Track cost from builder
        ctx.totalCostUsd += buildResult.result.totalCostUsd;
        ctx.totalTokensUsed += buildResult.result.totalTokensUsed;

        // Collect files from build result
        for (const file of buildResult.result.filesChanged) {
          allFiles.push(file);
        }

        // Update plan progress — builder completed all plan steps
        completedPlanSteps = planStepCount;
        for (const f of buildResult.result.filesChanged) {
          await think(ctx, `Skriver ${f.path}... OK`);
        }
        await reportSteps(ctx, "Bygger", [
          { label: "Plan klar", status: "done" },
          { label: `Builder ferdig (${allFiles.length} filer)`, status: "done" },
          { label: "Validerer kode", status: "active" },
        ], { title: `Utfører plan ${completedPlanSteps}/${planStepCount}`, planProgress: { current: completedPlanSteps, total: planStepCount } });

        // Record attempt
        ctx.attemptHistory.push({
          stepIndex: 0,
          action: "builder_complete",
          result: buildResult.result.success ? "success" : "failure",
          duration: Date.now() - attemptStart,
          tokensUsed: buildResult.result.totalTokensUsed,
        });

        // === STEP 7: Validate (already done by builder integrate phase) ===
        await reportSteps(ctx, "Reviewer", [
          { label: "Builder ferdig", status: "done" },
          { label: "Validerer kode (tsc + lint)", status: "active" },
        ]);

        const validation = await auditedStep(ctx, "validation_run", {
          attempt: ctx.totalAttempts,
          maxRetries: ctx.maxAttempts,
        }, () => sandboxBreaker.call(() => sandbox.validate({ sandboxId: sandboxId.id })));

        if (!validation.success) {
          lastError = validation.output;
          previousErrors.push(validation.output.substring(0, 500));
          await think(ctx, `Fant problemer, fikser... (forsok ${ctx.totalAttempts})`);

          await audit({
            sessionId: ctx.conversationId,
            actionType: "validation_failed",
            details: { attempt: ctx.totalAttempts, output: validation.output.substring(0, 1000) },
            success: false,
            errorMessage: validation.output.substring(0, 500),
            taskId: ctx.taskId,
            repoName: `${ctx.repoOwner}/${ctx.repoName}`,
          });

          if (ctx.totalAttempts < ctx.maxAttempts) {
            // === META-REASONING: Diagnose the failure ===
            await report(ctx, `Analyserer feil (forsøk ${ctx.totalAttempts}/${ctx.maxAttempts})...`, "working");

            const diagResult = await auditedStep(ctx, "failure_diagnosed", {
              attempt: ctx.totalAttempts,
              error: validation.output.substring(0, 500),
            }, () => ai.diagnoseFailure({
              task: ctx.taskDescription,
              plan: plan.plan,
              currentStep: plan.plan.length - 1,
              error: validation.output,
              previousErrors,
              codeContext: allFiles.map((f) => `--- ${f.path} ---\n${f.content.substring(0, 1000)}`).join("\n\n"),
              model: ctx.selectedModel,
            }));

            ctx.totalCostUsd += diagResult.costUsd;
            ctx.totalTokensUsed += diagResult.tokensUsed;
            const diagnosis = diagResult.diagnosis;

            await audit({
              sessionId: ctx.conversationId,
              actionType: "diagnosis_result",
              details: { diagnosis },
              success: true,
              taskId: ctx.taskId,
              repoName: `${ctx.repoOwner}/${ctx.repoName}`,
            });

            // Act on diagnosis
            if (diagnosis.rootCause === "bad_plan" && ctx.planRevisions < ctx.maxPlanRevisions) {
              // Revise the plan entirely
              await report(ctx, `Plan er feil — lager ny plan (revisjon ${ctx.planRevisions + 1})...`, "working");
              ctx.planRevisions++;

              plan = await auditedStep(ctx, "plan_revised", {
                revision: ctx.planRevisions,
                diagnosis: diagnosis.rootCause,
              }, () => ai.revisePlan({
                task: ctx.taskDescription,
                originalPlan: plan.plan,
                diagnosis,
                constraints: ["avoid_previous_approach", "simpler_solution"],
                model: ctx.selectedModel,
              }));

              ctx.totalCostUsd += plan.costUsd;
              ctx.totalTokensUsed += plan.tokensUsed;
              planSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
              allFiles.length = 0; // Reset files for new plan
              continue;

            } else if (diagnosis.rootCause === "implementation_error" || diagnosis.suggestedAction === "fix_code") {
              // Fix code with error context
              await report(ctx, `Implementeringsfeil — fikser kode...`, "working");

              plan = await auditedStep(ctx, "plan_retry", {
                attempt: ctx.totalAttempts,
                diagnosis: diagnosis.rootCause,
                model: ctx.selectedModel,
              }, () => ai.planTask({
                task: ctx.taskDescription,
                projectStructure: treeString,
                relevantFiles,
                memoryContext: memoryStrings,
                docsContext: docsStrings,
                previousAttempt: planSummary,
                errorMessage: validation.output,
                model: ctx.selectedModel,
              }));

              ctx.totalCostUsd += plan.costUsd;
              ctx.totalTokensUsed += plan.tokensUsed;
              planSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
              continue;

            } else if (diagnosis.rootCause === "missing_context") {
              // Fetch more context and retry
              await report(ctx, `Mangler kontekst — henter mer informasjon...`, "working");

              let moreMemories = { results: [] as { content: string }[] };
              try {
                moreMemories = await memory.search({
                  query: `${ctx.taskDescription} ${validation.output.substring(0, 200)}`,
                  limit: 10,
                });
              } catch (e) {
                console.warn("Memory search failed during missing_context retry:", e);
              }

              plan = await auditedStep(ctx, "plan_retry_with_context", {
                extraMemories: moreMemories.results.length,
              }, () => ai.planTask({
                task: ctx.taskDescription,
                projectStructure: treeString,
                relevantFiles,
                memoryContext: moreMemories.results.map((r) => r.content),
                docsContext: docsStrings,
                errorMessage: validation.output,
                model: ctx.selectedModel,
              }));

              ctx.totalCostUsd += plan.costUsd;
              ctx.totalTokensUsed += plan.tokensUsed;
              planSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
              continue;

            } else if (diagnosis.rootCause === "impossible_task") {
              // Escalate to human
              await report(ctx, `Denne oppgaven ser umulig ut: ${diagnosis.reason}`, "needs_input");
              await updateLinearIfExists(ctx, `TheFold klarer ikke denne oppgaven: ${diagnosis.reason}`, "blocked");

              // Update TheFold task status if applicable
              if (ctx.thefoldTaskId) {
                try {
                  await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "blocked", errorMessage: diagnosis.reason?.substring(0, 500) });
                } catch { /* non-critical */ }
              }
              return {
                success: false,
                filesChanged: [],
                costUsd: ctx.totalCostUsd,
                tokensUsed: ctx.totalTokensUsed,
                errorMessage: "impossible_task",
              };

            } else if (diagnosis.rootCause === "environment_error") {
              // Wait and retry
              await report(ctx, `Miljøfeil — venter 30 sekunder og prøver igjen...`, "working");
              await new Promise((resolve) => setTimeout(resolve, 30_000));
              continue;
            }

            // Default: standard retry
            plan = await auditedStep(ctx, "plan_retry", {
              attempt: ctx.totalAttempts,
              model: ctx.selectedModel,
            }, () => ai.planTask({
              task: ctx.taskDescription,
              projectStructure: treeString,
              relevantFiles,
              memoryContext: memoryStrings,
              docsContext: docsStrings,
              previousAttempt: planSummary,
              errorMessage: validation.output,
              model: ctx.selectedModel,
            }));

            ctx.totalCostUsd += plan.costUsd;
            ctx.totalTokensUsed += plan.tokensUsed;
            planSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
            continue;
          }

          throw new Error(`Validation failed after ${ctx.maxAttempts} attempts: ${validation.output}`);
        }

        // Validation passed!
        await think(ctx, "Ingen feil i koden!");
        break;
      } catch (error) {
        ctx.attemptHistory.push({
          stepIndex: -1,
          action: "validation",
          result: "failure",
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - attemptStart,
          tokensUsed: 0,
        });
        if (ctx.totalAttempts >= ctx.maxAttempts) throw error;
      }
    }

    // === collectOnly: return early with files — skip review/PR/cleanup ===
    if (options?.collectOnly) {
      await report(ctx, `Task fullført (${allFiles.length} filer) — samles for prosjekt-review`, "working");
      return {
        success: true,
        filesChanged: allFiles.map((f) => f.path),
        filesContent: allFiles,
        sandboxId: sandboxId.id,
        costUsd: ctx.totalCostUsd,
        tokensUsed: ctx.totalTokensUsed,
        status: 'completed',
      };
    }

    // Stop check before review (DEL 7)
    if (await shouldStopTask(ctx, "pre_review", sandboxId.id)) {
      return { success: false, filesChanged: allFiles.map(f => f.path), costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "stopped" };
    }

    // === STEP 8: Review own work ===
    await reportSteps(ctx, "Reviewer", [
      { label: "Alle filer skrevet", status: "done" },
      { label: "Kode validert", status: "done" },
      { label: "Reviewer kode og skriver dokumentasjon", status: "active" },
    ]);

    const validationOutput = await sandbox.validate({ sandboxId: sandboxId.id });
    const review = await auditedStep(ctx, "review_completed", {
      filesChanged: allFiles.length,
      model: ctx.selectedModel,
    }, () => ai.reviewCode({
      taskDescription: ctx.taskDescription,
      filesChanged: allFiles.map((f) => ({
        path: f.path,
        content: f.content,
        action: f.action as "create" | "modify" | "delete",
      })),
      validationOutput: validationOutput.output,
      memoryContext: memoryStrings,
      model: ctx.selectedModel,
    }));

    ctx.totalCostUsd += review.costUsd;
    ctx.totalTokensUsed += review.tokensUsed;
    await think(ctx, `Kvalitet: ${review.qualityScore}/10.`);

    // Verify task wasn't stopped during review (DEL 7B)
    if (await shouldStopTask(ctx, "pre_submit_review", sandboxId.id)) {
      return { success: false, filesChanged: allFiles.map(f => f.path), costUsd: ctx.totalCostUsd, tokensUsed: ctx.totalTokensUsed, errorMessage: "stopped" };
    }

    // === STEP 8.5: Submit for review ===
    const aiReviewData: AIReviewData = {
      documentation: review.documentation,
      qualityScore: review.qualityScore,
      concerns: review.concerns,
      memoriesExtracted: review.memoriesExtracted,
    };

    await think(ctx, "Sender til review — venter pa godkjenning.");

    const reviewResult = await submitReviewInternal({
      conversationId: ctx.conversationId,
      taskId: ctx.taskId,
      sandboxId: sandboxId.id,
      repoName: ctx.repoName,
      filesChanged: allFiles.map((f) => ({
        path: f.path,
        content: f.content,
        action: f.action as "create" | "modify" | "delete",
      })),
      aiReview: aiReviewData,
    });

    await audit({
      sessionId: ctx.conversationId,
      actionType: "review_submitted",
      details: {
        reviewId: reviewResult.reviewId,
        qualityScore: review.qualityScore,
        filesChanged: allFiles.map((f) => f.path),
      },
      success: true,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      durationMs: Date.now() - taskStart,
    });

    // Update TheFold task status to in_review if applicable
    if (ctx.thefoldTaskId) {
      try {
        await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "in_review", reviewId: reviewResult.reviewId });
      } catch { /* non-critical */ }
    }

    // Return — DO NOT create PR, DO NOT destroy sandbox (handled by review approval)
    return {
      success: true,
      reviewId: reviewResult.reviewId,
      status: 'pending_review',
      filesChanged: allFiles.map((f) => f.path),
      costUsd: ctx.totalCostUsd,
      tokensUsed: ctx.totalTokensUsed,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[DEBUG-AF] executeTask CRASHED:", errorMsg);

    await audit({
      sessionId: ctx.conversationId,
      actionType: "task_failed",
      details: {
        error: errorMsg,
        totalDurationMs: Date.now() - taskStart,
      },
      success: false,
      errorMessage: errorMsg,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      durationMs: Date.now() - taskStart,
    });

    await report(
      ctx,
      `**Feil under arbeid med ${ctx.taskId}:**\n\`\`\`\n${errorMsg}\n\`\`\`\n\nJeg klarte ikke a fullfare denne oppgaven automatisk. Kan du hjelpe meg med mer kontekst, eller skal jeg prove en annen tilnarming?`,
      "failed"
    );

    // Report failure to AgentStatus
    await reportSteps(ctx, "Feilet", [
      { label: errorMsg.substring(0, 80), status: "error" },
    ]);

    // Update TheFold task status to blocked
    if (ctx.thefoldTaskId || ctx.taskId) {
      try {
        await tasks.updateTaskStatus({
          id: ctx.thefoldTaskId || ctx.taskId,
          status: "blocked",
          errorMessage: errorMsg.substring(0, 500),
        });
        console.log("[DEBUG-AF] Task marked as blocked after crash");
      } catch (e) {
        console.warn("[DEBUG-AF] Failed to update task status after crash:", e);
      }
    }

    // Update Linear (skip for orchestrator tasks)
    if (!options?.skipLinear) {
      await updateLinearIfExists(ctx, `TheFold feilet på denne oppgaven: ${errorMsg}`);
    }

    // Update TheFold task status if applicable
    if (ctx.thefoldTaskId) {
      try {
        await tasks.updateTaskStatus({ id: ctx.thefoldTaskId, status: "blocked", errorMessage: errorMsg.substring(0, 500) });
      } catch { /* non-critical */ }
    }

    return {
      success: false,
      filesChanged: [],
      costUsd: ctx.totalCostUsd,
      tokensUsed: ctx.totalTokensUsed,
      errorMessage: errorMsg,
    };
  }
}

// --- Endpoints ---

// Start working on a task (called from chat or cron)
export const startTask = api(
  { method: "POST", path: "/agent/start", expose: false },
  async (req: StartTaskRequest): Promise<StartTaskResponse> => {
    console.log("[DEBUG-AF] === AGENT startTask CALLED ===");
    console.log("[DEBUG-AF] taskId:", req.taskId);
    console.log("[DEBUG-AF] conversationId:", req.conversationId);
    console.log("[DEBUG-AF] thefoldTaskId:", req.thefoldTaskId);
    console.log("[DEBUG-AF] repoName:", req.repoName);

    // Hent brukerens modellpreferanse
    let modelMode: ModelMode = "auto";
    let subAgentsEnabled = false;
    if (req.userId) {
      try {
        const userInfo = await users.getUser({ userId: req.userId });
        const prefs = userInfo.preferences as Record<string, unknown>;
        if (prefs.modelMode && ["auto", "manual"].includes(prefs.modelMode as string)) {
          modelMode = prefs.modelMode as ModelMode;
        }
        if (prefs.subAgentsEnabled === true) {
          subAgentsEnabled = true;
        }
      } catch {
        // Default til auto hvis oppslag feiler
      }
    }

    // Run the task asynchronously — don't block the caller
    // In production, this should use a job queue
    const ctx: TaskContext = {
      conversationId: req.conversationId,
      taskId: req.taskId,
      taskDescription: "", // filled in during execution
      userMessage: req.userMessage,
      repoOwner: req.repoOwner || REPO_OWNER,
      repoName: req.repoName || REPO_NAME,
      branch: "main",
      thefoldTaskId: req.thefoldTaskId || req.taskId,
      modelMode,
      modelOverride: req.modelOverride,
      selectedModel: "claude-sonnet-4-5-20250929", // default, oppdateres etter complexity assessment
      totalCostUsd: 0,
      totalTokensUsed: 0,
      // Meta-reasoning
      attemptHistory: [],
      errorPatterns: [],
      totalAttempts: 0,
      maxAttempts: MAX_RETRIES,
      planRevisions: 0,
      maxPlanRevisions: MAX_PLAN_REVISIONS,
      // Sub-agents
      subAgentsEnabled,
    };

    // Fire and forget — agent reports progress via pub/sub
    executeTask(ctx).catch((err) => {
      console.error("[DEBUG-AF] executeTask CRASHED:", err);
    });

    console.log("[DEBUG-AF] executeTask fired (async)");
    return { status: "started", taskId: req.taskId };
  }
);

// Manually trigger agent to pick up pending Linear tasks
export const checkPendingTasks = api(
  { method: "POST", path: "/agent/check", expose: true, auth: true },
  async (): Promise<{ tasksFound: number }> => {
    const tasks = await linear.getAssignedTasks({});
    let started = 0;

    for (const task of tasks.tasks) {
      // Only auto-start tasks with a specific label
      if (task.labels.includes("thefold")) {
        await startTask({
          conversationId: `auto-${task.id}`,
          taskId: task.id,
          userMessage: "Auto-triggered from Linear",
        });
        started++;
      }
    }

    return { tasksFound: started };
  }
);

// --- DEL 4: Respond to clarification ---

export const respondToClarification = api(
  { method: "POST", path: "/agent/respond", expose: true, auth: true },
  async (req: { taskId: string; response: string; conversationId: string }): Promise<{ success: boolean }> => {
    // 1. Set task status back to in_progress
    try {
      await tasks.updateTaskStatus({ id: req.taskId, status: "in_progress" });
    } catch { /* non-critical */ }

    // 2. Find the task to get context
    const taskResult = await tasks.getTaskInternal({ id: req.taskId });
    const task = taskResult.task;

    // 3. Re-execute with user clarification as extra context
    const convId = req.conversationId;

    const ctx: TaskContext = {
      conversationId: convId,
      taskId: req.taskId,
      taskDescription: `${task.title}\n\n${task.description || ""}\n\n**Brukerens avklaring:** ${req.response}`,
      userMessage: req.response,
      repoOwner: REPO_OWNER,
      repoName: task.repo || REPO_NAME,
      branch: "main",
      thefoldTaskId: req.taskId,
      modelMode: "auto",
      selectedModel: "claude-sonnet-4-5-20250929",
      totalCostUsd: 0,
      totalTokensUsed: 0,
      attemptHistory: [],
      errorPatterns: [],
      totalAttempts: 0,
      maxAttempts: MAX_RETRIES,
      planRevisions: 0,
      maxPlanRevisions: MAX_PLAN_REVISIONS,
      subAgentsEnabled: false,
    };

    // Fire and forget
    executeTask(ctx).catch((err) => {
      console.error("[respondToClarification] executeTask failed:", err);
    });

    return { success: true };
  }
);

// --- DEL 4: Force continue without clarification ---

export const forceContinue = api(
  { method: "POST", path: "/agent/force-continue", expose: true, auth: true },
  async (req: { taskId: string; conversationId: string }): Promise<{ success: boolean }> => {
    // 1. Set task status to in_progress
    try {
      await tasks.updateTaskStatus({ id: req.taskId, status: "in_progress" });
    } catch { /* non-critical */ }

    // 2. Find the task to get context
    const taskResult = await tasks.getTaskInternal({ id: req.taskId });
    const task = taskResult.task;

    // 3. Re-execute with forceContinue flag (standard path, skips assessConfidence)
    const convId = req.conversationId;

    const ctx: TaskContext = {
      conversationId: convId,
      taskId: req.taskId,
      taskDescription: task.title + (task.description ? "\n\n" + task.description : ""),
      userMessage: "Force continue — brukeren har valgt å fortsette uten avklaring",
      repoOwner: REPO_OWNER,
      repoName: task.repo || REPO_NAME,
      branch: "main",
      thefoldTaskId: req.taskId,
      modelMode: "auto",
      selectedModel: "claude-sonnet-4-5-20250929",
      totalCostUsd: 0,
      totalTokensUsed: 0,
      attemptHistory: [],
      errorPatterns: [],
      totalAttempts: 0,
      maxAttempts: MAX_RETRIES,
      planRevisions: 0,
      maxPlanRevisions: MAX_PLAN_REVISIONS,
      subAgentsEnabled: false,
    };

    // Use standard path but skip confidence check
    executeTask(ctx, {
      forceContinue: true,
      taskDescription: ctx.taskDescription,
    }).catch((err) => {
      console.error("[forceContinue] executeTask failed:", err);
    });

    return { success: true };
  }
);

// --- Audit Log Query Endpoints ---

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  actionType: string;
  details: Record<string, unknown>;
  success: boolean | null;
  errorMessage: string | null;
  confidenceScore: number | null;
  taskId: string | null;
  repoName: string | null;
  durationMs: number | null;
}

interface AuditLogRow {
  id: string;
  session_id: string;
  timestamp: Date;
  action_type: string;
  details: Record<string, unknown>;
  success: boolean | null;
  error_message: string | null;
  confidence_score: number | null;
  task_id: string | null;
  repo_name: string | null;
  duration_ms: number | null;
}

function rowToAuditEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp.toISOString(),
    actionType: row.action_type,
    details: row.details,
    success: row.success,
    errorMessage: row.error_message,
    confidenceScore: row.confidence_score,
    taskId: row.task_id,
    repoName: row.repo_name,
    durationMs: row.duration_ms,
  };
}

// List audit log entries with optional filters
interface ListAuditLogRequest {
  actionType?: string;
  taskId?: string;
  sessionId?: string;
  repoName?: string;
  successOnly?: boolean;
  failedOnly?: boolean;
  limit?: number;
  offset?: number;
}

interface ListAuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
}

export const listAuditLog = api(
  { method: "POST", path: "/agent/audit/list", expose: true, auth: true },
  async (req: ListAuditLogRequest): Promise<ListAuditLogResponse> => {
    const limit = Math.min(req.limit || 50, 200);
    const offset = req.offset || 0;

    const entries: AuditLogEntry[] = [];

    // Build query based on filters
    if (req.actionType) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE action_type = ${req.actionType}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) {
        entries.push(rowToAuditEntry(row));
      }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE action_type = ${req.actionType}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.taskId) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE task_id = ${req.taskId}
        ORDER BY timestamp ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) {
        entries.push(rowToAuditEntry(row));
      }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE task_id = ${req.taskId}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.sessionId) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE session_id = ${req.sessionId}
        ORDER BY timestamp ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) {
        entries.push(rowToAuditEntry(row));
      }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE session_id = ${req.sessionId}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.repoName) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE repo_name = ${req.repoName}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) {
        entries.push(rowToAuditEntry(row));
      }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE repo_name = ${req.repoName}
      `;
      return { entries, total: countRow?.count || 0 };
    }

    if (req.failedOnly) {
      const rows = db.query<AuditLogRow>`
        SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
        FROM agent_audit_log
        WHERE success = FALSE
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) {
        entries.push(rowToAuditEntry(row));
      }
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM agent_audit_log WHERE success = FALSE
      `;
      return { entries, total: countRow?.count || 0 };
    }

    // Default: return latest entries
    const rows = db.query<AuditLogRow>`
      SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
      FROM agent_audit_log
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    for await (const row of rows) {
      entries.push(rowToAuditEntry(row));
    }
    const countRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM agent_audit_log
    `;
    return { entries, total: countRow?.count || 0 };
  }
);

// Get all audit entries for a specific task session (trace a full execution)
interface GetTaskTraceRequest {
  taskId: string;
}

interface GetTaskTraceResponse {
  taskId: string;
  entries: AuditLogEntry[];
  summary: {
    totalSteps: number;
    totalDurationMs: number;
    successCount: number;
    failureCount: number;
    confidenceScore: number | null;
    outcome: "completed" | "failed" | "paused" | "in_progress";
  };
}

export const getTaskTrace = api(
  { method: "POST", path: "/agent/audit/trace", expose: true, auth: true },
  async (req: GetTaskTraceRequest): Promise<GetTaskTraceResponse> => {
    const entries: AuditLogEntry[] = [];

    const rows = db.query<AuditLogRow>`
      SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
      FROM agent_audit_log
      WHERE task_id = ${req.taskId}
      ORDER BY timestamp ASC
    `;
    for await (const row of rows) {
      entries.push(rowToAuditEntry(row));
    }

    const successCount = entries.filter((e) => e.success === true).length;
    const failureCount = entries.filter((e) => e.success === false).length;

    // Get confidence score from the confidence_details entry
    const confidenceEntry = entries.find((e) => e.actionType === "confidence_details");
    const confidenceScore = confidenceEntry?.confidenceScore ?? null;

    // Determine outcome
    let outcome: "completed" | "failed" | "paused" | "in_progress" = "in_progress";
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
      if (lastEntry.actionType === "task_completed") outcome = "completed";
      else if (lastEntry.actionType === "task_failed") outcome = "failed";
      else if (lastEntry.actionType === "task_paused_clarification" || lastEntry.actionType === "task_paused_breakdown") outcome = "paused";
    }

    // Calculate total duration from first to last entry
    let totalDurationMs = 0;
    if (entries.length >= 2) {
      const first = new Date(entries[0].timestamp).getTime();
      const last = new Date(entries[entries.length - 1].timestamp).getTime();
      totalDurationMs = last - first;
    }

    return {
      taskId: req.taskId,
      entries,
      summary: {
        totalSteps: entries.length,
        totalDurationMs,
        successCount,
        failureCount,
        confidenceScore,
        outcome,
      },
    };
  }
);

// Get audit log statistics
interface AuditStatsResponse {
  totalEntries: number;
  totalTasks: number;
  successRate: number;
  averageDurationMs: number;
  actionTypeCounts: Record<string, number>;
  recentFailures: AuditLogEntry[];
}

export const getAuditStats = api(
  { method: "POST", path: "/agent/audit/stats", expose: true, auth: true },
  async (): Promise<AuditStatsResponse> => {
    const totalRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM agent_audit_log
    `;

    const taskCountRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(DISTINCT task_id)::int AS count FROM agent_audit_log WHERE task_id IS NOT NULL
    `;

    const successRow = await db.queryRow<{ total: number; successes: number }>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success = TRUE)::int AS successes
      FROM agent_audit_log
      WHERE success IS NOT NULL
    `;

    const avgDurationRow = await db.queryRow<{ avg_ms: number }>`
      SELECT COALESCE(AVG(duration_ms), 0)::int AS avg_ms
      FROM agent_audit_log
      WHERE duration_ms IS NOT NULL
    `;

    // Action type counts
    const actionTypeCounts: Record<string, number> = {};
    const actionRows = db.query<{ action_type: string; count: number }>`
      SELECT action_type, COUNT(*)::int AS count
      FROM agent_audit_log
      GROUP BY action_type
      ORDER BY count DESC
    `;
    for await (const row of actionRows) {
      actionTypeCounts[row.action_type] = row.count;
    }

    // Recent failures
    const recentFailures: AuditLogEntry[] = [];
    const failRows = db.query<AuditLogRow>`
      SELECT id, session_id, timestamp, action_type, details, success, error_message, confidence_score, task_id, repo_name, duration_ms
      FROM agent_audit_log
      WHERE success = FALSE
      ORDER BY timestamp DESC
      LIMIT 10
    `;
    for await (const row of failRows) {
      recentFailures.push(rowToAuditEntry(row));
    }

    const total = successRow?.total || 0;
    const successes = successRow?.successes || 0;

    return {
      totalEntries: totalRow?.count || 0,
      totalTasks: taskCountRow?.count || 0,
      successRate: total > 0 ? Math.round((successes / total) * 100) : 0,
      averageDurationMs: avgDurationRow?.avg_ms || 0,
      actionTypeCounts,
      recentFailures,
    };
  }
);

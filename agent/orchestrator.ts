import { api, APIError } from "encore.dev/api";
import { github, memory, docs, ai, tasks } from "~encore/clients";
import log from "encore.dev/log";
import { agentReports } from "../chat/chat";
import { executeTask } from "./agent";
import { db } from "./db";
import type {
  ProjectTask,
  CuratedContext,
  AgentExecutionContext,
} from "./types";
import { mapProjectStatus } from "./types";
import type { ExecuteTaskOptions, ExecuteTaskResult } from "./agent";

// --- Constants ---

const REPO_OWNER = "Twofold-AS";
const REPO_NAME = "thefold";
const MAX_CONTEXT_TOKENS = 30000;

// --- Helper: Report to chat via pub/sub ---

async function reportProject(conversationId: string, content: string) {
  await agentReports.publish({
    conversationId,
    taskId: "project-orchestrator",
    content,
    status: "working",
  });
}

// --- DEL 1: Context Curator ---

export async function curateContext(
  task: ProjectTask,
  project: { conventions: string },
  allTasks: ProjectTask[],
  repoOwner: string,
  repoName: string
): Promise<CuratedContext> {
  const relevantFiles: Array<{ path: string; content: string }> = [];
  const dependencyOutputs: Array<{ taskTitle: string; files: string[]; types: string[] }> = [];
  const memoryContext: string[] = [];
  const docsContext: string[] = [];
  let tokenEstimate = 0;

  // 1. Dependency outputs — read output_files from completed dependencies
  for (const depId of task.dependsOn) {
    const depTask = allTasks.find((t) => t.id === depId);
    if (!depTask || depTask.status !== "completed") continue;

    dependencyOutputs.push({
      taskTitle: depTask.title,
      files: depTask.outputFiles,
      types: depTask.outputTypes,
    });

    // Read type definitions and interfaces first (priority)
    const typeFiles = depTask.outputFiles.filter(
      (f) => f.includes("types") || f.includes("interface") || f.endsWith(".d.ts")
    );
    const otherFiles = depTask.outputFiles.filter(
      (f) => !typeFiles.includes(f)
    );

    for (const filePath of [...typeFiles, ...otherFiles].slice(0, 5)) {
      try {
        const file = await github.getFile({ owner: repoOwner, repo: repoName, path: filePath });
        relevantFiles.push({ path: filePath, content: file.content });
        tokenEstimate += Math.ceil(file.content.length / 4);
      } catch {
        // File might not exist yet (not merged) — skip
      }
    }
  }

  // 2. Context hints → Memory search
  if (task.contextHints.length > 0) {
    const searchQuery = task.contextHints.join(" ");
    try {
      const memResults = await memory.search({
        query: searchQuery,
        limit: 5,
        sourceRepo: `${repoOwner}/${repoName}`,
      });
      for (const r of memResults.results) {
        memoryContext.push(r.content);
        tokenEstimate += Math.ceil(r.content.length / 4);
      }
    } catch {
      // Memory search failed — continue without
    }
  }

  // 3. Context hints → GitHub files
  if (task.contextHints.length > 0) {
    try {
      let tree = { tree: [] as Array<{ path: string; type: string; size?: number }>, treeString: "" };
      try {
        tree = await github.getTree({ owner: repoOwner, repo: repoName });
      } catch (e) {
        console.warn("getTree failed in curateContext (empty repo?):", e);
      }
      if (tree.tree.length === 0) throw new Error("empty tree — skip file search");
      const found = await github.findRelevantFiles({
        owner: repoOwner,
        repo: repoName,
        taskDescription: `${task.title}\n${task.description}\n${task.contextHints.join(" ")}`,
        tree: tree.tree,
      });

      for (const filePath of found.paths.slice(0, 5)) {
        // Skip if already in relevantFiles
        if (relevantFiles.some((f) => f.path === filePath)) continue;

        try {
          const meta = await github.getFileMetadata({ owner: repoOwner, repo: repoName, path: filePath });
          if (meta.totalLines <= 200) {
            const file = await github.getFile({ owner: repoOwner, repo: repoName, path: filePath });
            relevantFiles.push({ path: filePath, content: file.content });
            tokenEstimate += Math.ceil(file.content.length / 4);
          } else {
            // Large file — use chunk reading
            const chunk = await github.getFileChunk({
              owner: repoOwner,
              repo: repoName,
              path: filePath,
              startLine: 1,
              maxLines: 150,
            });
            relevantFiles.push({ path: filePath, content: chunk.content });
            tokenEstimate += Math.ceil(chunk.content.length / 4);
          }
        } catch {
          // File read failed — skip
        }
      }
    } catch {
      // Tree/find failed — continue
    }
  }

  // 4. Conventions — always included
  const conventions = project.conventions || "";
  tokenEstimate += Math.ceil(conventions.length / 4);

  // 5. Docs lookup
  try {
    const docsResults = await docs.lookupForTask({
      taskDescription: `${task.title}\n${task.description}`,
      existingDependencies: {},
    });
    for (const d of docsResults.docs.slice(0, 5)) {
      const docStr = `[${d.source}] ${d.content}`;
      docsContext.push(docStr);
      tokenEstimate += Math.ceil(docStr.length / 4);
    }
  } catch {
    // Docs lookup failed — continue
  }

  // 6. Token trimming — prioritize: conventions → dependency outputs → context hints → memory → docs
  if (tokenEstimate > MAX_CONTEXT_TOKENS) {
    const budget = MAX_CONTEXT_TOKENS;
    let used = Math.ceil(conventions.length / 4); // conventions always kept

    // Trim files (keep as many as fit)
    const trimmedFiles: Array<{ path: string; content: string }> = [];
    for (const f of relevantFiles) {
      const fileTokens = Math.ceil(f.content.length / 4);
      if (used + fileTokens <= budget) {
        trimmedFiles.push(f);
        used += fileTokens;
      }
    }
    relevantFiles.length = 0;
    relevantFiles.push(...trimmedFiles);

    // Trim memory
    const trimmedMemory: string[] = [];
    for (const m of memoryContext) {
      const memTokens = Math.ceil(m.length / 4);
      if (used + memTokens <= budget) {
        trimmedMemory.push(m);
        used += memTokens;
      }
    }
    memoryContext.length = 0;
    memoryContext.push(...trimmedMemory);

    // Trim docs
    const trimmedDocs: string[] = [];
    for (const d of docsContext) {
      const docTokens = Math.ceil(d.length / 4);
      if (used + docTokens <= budget) {
        trimmedDocs.push(d);
        used += docTokens;
      }
    }
    docsContext.length = 0;
    docsContext.push(...trimmedDocs);

    tokenEstimate = used;
  }

  return {
    relevantFiles,
    dependencyOutputs,
    memoryContext,
    docsContext,
    conventions,
    tokenEstimate,
  };
}

// --- DEL 2: Project Orchestrator Loop ---

export async function executeProject(
  projectId: string,
  conversationId: string,
  repoOwner: string,
  repoName: string
): Promise<void> {
  const projectStart = Date.now();

  // 1. Load project plan from database
  const planRow = await db.queryRow<{
    id: string;
    conversation_id: string;
    user_request: string;
    status: string;
    current_phase: number;
    conventions: string;
    total_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    total_cost_usd: number;
  }>`
    SELECT id, conversation_id, user_request, status, current_phase,
           COALESCE(conventions, '') as conventions,
           total_tasks, completed_tasks, failed_tasks,
           COALESCE(total_cost_usd, 0)::numeric as total_cost_usd
    FROM project_plans WHERE id = ${projectId}
  `;

  if (!planRow) throw new Error(`Project ${projectId} not found`);
  if (planRow.status === "completed") return;
  if (planRow.status === "failed") return;

  // Set status to executing
  await db.exec`
    UPDATE project_plans SET status = 'executing', updated_at = NOW()
    WHERE id = ${projectId}
  `;

  // Load all tasks
  const allTasks: ProjectTask[] = [];
  const taskRows = db.query<{
    id: string;
    project_id: string;
    phase: number;
    task_order: number;
    title: string;
    description: string;
    status: string;
    depends_on: string[] | null;
    output_files: string[] | null;
    output_types: string[] | null;
    context_hints: string[] | null;
    linear_task_id: string | null;
    pr_url: string | null;
    cost_usd: number | null;
    error_message: string | null;
    attempt_count: number;
    started_at: Date | null;
    completed_at: Date | null;
  }>`
    SELECT * FROM project_tasks
    WHERE project_id = ${projectId}
    ORDER BY phase, task_order
  `;

  for await (const row of taskRows) {
    allTasks.push({
      id: row.id,
      projectId: row.project_id,
      phase: row.phase,
      taskOrder: row.task_order,
      title: row.title,
      description: row.description,
      status: row.status as ProjectTask["status"],
      dependsOn: row.depends_on || [],
      outputFiles: row.output_files || [],
      outputTypes: row.output_types || [],
      contextHints: row.context_hints || [],
      linearTaskId: row.linear_task_id ?? undefined,
      prUrl: row.pr_url ?? undefined,
      costUsd: Number(row.cost_usd) || 0,
      errorMessage: row.error_message ?? undefined,
      attemptCount: row.attempt_count,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    });
  }

  // Build title→thefoldTaskId map for status sync
  const thefoldTaskMap = new Map<string, string>();
  try {
    const tasksList = await tasks.listTasks({ repo: repoName, source: "orchestrator", limit: 200 });
    for (const t of tasksList.tasks) {
      thefoldTaskMap.set(t.title, t.id);
    }
  } catch {
    // Non-critical — status sync will be skipped
  }

  // Determine phases
  const phases = [...new Set(allTasks.map((t) => t.phase))].sort((a, b) => a - b);
  let completedTasks = planRow.completed_tasks;
  let failedTasks = planRow.failed_tasks;
  let totalCostUsd = Number(planRow.total_cost_usd);

  // 2. Iterate through phases (starting from current_phase for resumability)
  for (const phaseNum of phases) {
    if (phaseNum < planRow.current_phase) continue; // Skip completed phases

    // Check if paused
    const currentStatus = await db.queryRow<{ status: string }>`
      SELECT status FROM project_plans WHERE id = ${projectId}
    `;
    if (currentStatus?.status === "paused") {
      await reportProject(conversationId, `⏸️ Prosjekt pauset i fase ${phaseNum}.`);
      return;
    }

    const phaseTasks = allTasks
      .filter((t) => t.phase === phaseNum)
      .sort((a, b) => a.taskOrder - b.taskOrder);

    await reportProject(conversationId, `📦 Starter fase ${phaseNum + 1}: ${phaseTasks.length} oppgaver`);

    // Execute each task in the phase
    for (const task of phaseTasks) {
      // Skip already completed/skipped/pending_review tasks (resumability)
      if (task.status === "completed") continue;
      if (task.status === "skipped") continue;
      if (task.status === "pending_review") continue;

      // Check dependencies
      const unmetDeps = task.dependsOn.filter((depId) => {
        const dep = allTasks.find((t) => t.id === depId);
        return !dep || dep.status !== "completed";
      });

      if (unmetDeps.length > 0) {
        // Check if any dependency failed
        const failedDeps = unmetDeps.filter((depId) => {
          const dep = allTasks.find((t) => t.id === depId);
          return dep && (dep.status === "failed" || dep.status === "skipped");
        });

        if (failedDeps.length > 0) {
          // Mark as skipped — dependency failed
          await db.exec`
            UPDATE project_tasks
            SET status = 'skipped', error_message = 'Avhengighet feilet', completed_at = NOW()
            WHERE id = ${task.id}
          `;
          task.status = "skipped";

          // Sync to tasks-service
          const skipTaskId = thefoldTaskMap.get(task.title);
          if (skipTaskId) {
            try {
              await tasks.updateTaskStatus({ id: skipTaskId, status: "blocked", errorMessage: "Avhengighet feilet" });
            } catch { /* non-critical */ }
          }

          await reportProject(
            conversationId,
            `⏭️ Hopper over "${task.title}" — avhengighet feilet`
          );
          continue;
        }

        // Dependencies not yet completed and not failed — skip for now
        await reportProject(
          conversationId,
          `⏳ Venter på avhengigheter for "${task.title}"`
        );
        continue;
      }

      // Mark as running
      await db.exec`
        UPDATE project_tasks
        SET status = 'running', started_at = NOW(), attempt_count = attempt_count + 1
        WHERE id = ${task.id}
      `;
      task.status = "running";

      // Sync to tasks-service
      if (thefoldTaskId) {
        try {
          await tasks.updateTaskStatus({ id: thefoldTaskId, status: mapProjectStatus("running") as any });
        } catch { /* non-critical */ }
      }

      // Curate context for this task
      let curated: CuratedContext;
      try {
        curated = await curateContext(
          task,
          { conventions: planRow.conventions },
          allTasks,
          repoOwner,
          repoName
        );
      } catch (err) {
        // Context curation failed — use minimal context
        curated = {
          relevantFiles: [],
          dependencyOutputs: [],
          memoryContext: [],
          docsContext: [],
          conventions: planRow.conventions,
          tokenEstimate: 0,
        };
      }

      // Build TaskContext for executeTask
      const thefoldTaskId = thefoldTaskMap.get(task.title);
      const taskCtx: AgentExecutionContext = {
        conversationId,
        taskId: task.id,
        thefoldTaskId,
        taskDescription: task.description,
        userMessage: task.description,
        repoOwner,
        repoName,
        branch: "main",
        modelMode: "auto",
        selectedModel: "claude-sonnet-4-5-20250929",
        totalCostUsd: 0,
        totalTokensUsed: 0,
        attemptHistory: [],
        errorPatterns: [],
        totalAttempts: 0,
        maxAttempts: 5,
        planRevisions: 0,
        maxPlanRevisions: 2,
        subAgentsEnabled: false,
      };

      const taskOptions: ExecuteTaskOptions = {
        curatedContext: curated,
        projectConventions: planRow.conventions,
        skipLinear: true,
        taskDescription: task.description,
      };

      // Execute the task
      let result: ExecuteTaskResult;
      try {
        result = await executeTask(taskCtx, taskOptions);
      } catch (err) {
        result = {
          success: false,
          filesChanged: [],
          costUsd: 0,
          tokensUsed: 0,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }

      // Update task status
      if (result.status === 'pending_review') {
        // Task is waiting for user review
        await db.exec`
          UPDATE project_tasks
          SET status = 'pending_review',
              output_files = ${result.filesChanged}::text[],
              cost_usd = ${result.costUsd}
          WHERE id = ${task.id}
        `;
        task.status = "pending_review";
        totalCostUsd += result.costUsd;

        // Pause project — user must approve review before continuing
        await db.exec`
          UPDATE project_plans
          SET status = 'paused',
              total_cost_usd = ${totalCostUsd},
              updated_at = NOW()
          WHERE id = ${projectId}
        `;

        await reportProject(
          conversationId,
          `Task "${task.title}" venter pa review. Prosjektet er pauset.\n` +
          `Godkjenn reviewen for a fortsette, eller be om endringer.` +
          (result.reviewId ? `\nSe review: /review/${result.reviewId}` : "")
        );
        return; // Stop orchestrator — resumes after review approval
      } else if (result.success) {
        await db.exec`
          UPDATE project_tasks
          SET status = 'completed',
              completed_at = NOW(),
              output_files = ${result.filesChanged}::text[],
              pr_url = ${result.prUrl ?? null},
              cost_usd = ${result.costUsd}
          WHERE id = ${task.id}
        `;
        task.status = "completed";
        task.outputFiles = result.filesChanged;
        task.prUrl = result.prUrl;
        completedTasks++;
        totalCostUsd += result.costUsd;

        await db.exec`
          UPDATE project_plans
          SET completed_tasks = ${completedTasks},
              total_cost_usd = ${totalCostUsd},
              updated_at = NOW()
          WHERE id = ${projectId}
        `;

        await reportProject(
          conversationId,
          `✅ Task ${completedTasks}/${planRow.total_tasks} fullført: ${task.title} (fase ${phaseNum + 1})`
        );
      } else {
        await db.exec`
          UPDATE project_tasks
          SET status = 'failed',
              error_message = ${result.errorMessage ?? "Unknown error"},
              completed_at = NOW(),
              cost_usd = ${result.costUsd}
          WHERE id = ${task.id}
        `;
        task.status = "failed";
        failedTasks++;
        totalCostUsd += result.costUsd;

        await db.exec`
          UPDATE project_plans
          SET failed_tasks = ${failedTasks},
              total_cost_usd = ${totalCostUsd},
              updated_at = NOW()
          WHERE id = ${projectId}
        `;

        // Mark downstream tasks as skipped
        for (const otherTask of allTasks) {
          if (otherTask.dependsOn.includes(task.id) && otherTask.status === "pending") {
            await db.exec`
              UPDATE project_tasks
              SET status = 'skipped', error_message = 'Blokkert av feilet avhengighet'
              WHERE id = ${otherTask.id}
            `;
            otherTask.status = "skipped";

            // Sync to tasks-service
            const downstreamTaskId = thefoldTaskMap.get(otherTask.title);
            if (downstreamTaskId) {
              try {
                await tasks.updateTaskStatus({ id: downstreamTaskId, status: "blocked", errorMessage: "Blokkert av feilet avhengighet" });
              } catch { /* non-critical */ }
            }
          }
        }

        await reportProject(
          conversationId,
          `❌ Task feilet: ${task.title}\n${result.errorMessage ?? ""}`
        );
      }
    }

    // After phase: update current_phase
    await db.exec`
      UPDATE project_plans
      SET current_phase = ${phaseNum + 1}, updated_at = NOW()
      WHERE id = ${projectId}
    `;

    // After phase: AI-driven revision for next phase
    const nextPhase = phases.find((p) => p > phaseNum);
    if (nextPhase !== undefined) {
      const completedInPhase = phaseTasks.filter((t) => t.status === "completed");
      const failedInPhase = phaseTasks.filter((t) => t.status === "failed");
      const nextPhaseTasks = allTasks.filter((t) => t.phase === nextPhase);

      await reportProject(
        conversationId,
        `\uD83D\uDCCA Fase ${phaseNum + 1} ferdig: ${completedInPhase.length} fullf\u00F8rt, ${failedInPhase.length} feilet`
      );

      if (nextPhaseTasks.length > 0) {
        try {
          await reportProject(conversationId, `\uD83D\uDD04 Justerer plan for neste fase basert p\u00E5 hva som ble bygget`);

          // Get current project structure for context
          let projectStructure = "";
          try {
            const tree = await github.getTree({ owner: repoOwner, repo: repoName });
            projectStructure = tree.treeString;
          } catch {
            projectStructure = "(kunne ikke hente prosjektstruktur)";
          }

          const revision = await ai.reviseProjectPhase({
            projectConventions: planRow.conventions,
            completedPhase: {
              name: `Fase ${phaseNum + 1}`,
              tasks: phaseTasks.map((t) => ({
                title: t.title,
                status: t.status,
                outputFiles: t.outputFiles,
                outputTypes: t.outputTypes,
                errorMessage: t.errorMessage,
              })),
            },
            nextPhase: {
              name: `Fase ${nextPhase + 1}`,
              tasks: nextPhaseTasks.map((t) => ({
                title: t.title,
                description: t.description,
                contextHints: t.contextHints,
              })),
            },
            projectStructure,
          });

          // Apply revisions to tasks in database
          for (const rev of revision.revisedTasks) {
            const task = nextPhaseTasks.find((t) => t.title === rev.originalTitle);
            if (!task) continue;

            if (rev.shouldSkip) {
              await db.exec`
                UPDATE project_tasks
                SET status = 'skipped', error_message = ${rev.reason}
                WHERE id = ${task.id}
              `;
              task.status = "skipped";
            } else {
              const newDesc = rev.revisedDescription || task.description;
              const newHints = rev.newContextHints || task.contextHints;
              await db.exec`
                UPDATE project_tasks
                SET description = ${newDesc}, context_hints = ${newHints}::text[]
                WHERE id = ${task.id}
              `;
              task.description = newDesc;
              task.contextHints = newHints;
            }
          }

          // Insert new tasks
          for (const newTask of revision.newTasksToAdd) {
            // Find insertion point
            let insertOrder = nextPhaseTasks.length;
            if (newTask.insertAfterTitle) {
              const afterTask = nextPhaseTasks.find((t) => t.title === newTask.insertAfterTitle);
              if (afterTask) insertOrder = afterTask.taskOrder + 1;
            }

            const inserted = await db.queryRow<{ id: string }>`
              INSERT INTO project_tasks (
                project_id, phase, task_order, title, description, context_hints
              ) VALUES (
                ${projectId}, ${nextPhase}, ${insertOrder},
                ${newTask.title}, ${newTask.description}, ${newTask.contextHints}::text[]
              )
              RETURNING id
            `;

            if (inserted) {
              allTasks.push({
                id: inserted.id,
                projectId,
                phase: nextPhase,
                taskOrder: insertOrder,
                title: newTask.title,
                description: newTask.description,
                status: "pending",
                dependsOn: [],
                outputFiles: [],
                outputTypes: [],
                contextHints: newTask.contextHints,
                costUsd: 0,
                attemptCount: 0,
              });

              // Update total_tasks count
              await db.exec`
                UPDATE project_plans SET total_tasks = total_tasks + 1 WHERE id = ${projectId}
              `;
            }
          }

          if (revision.revisedTasks.length > 0 || revision.newTasksToAdd.length > 0) {
            log.info("phase revision applied", {
              phase: phaseNum,
              revised: revision.revisedTasks.length,
              added: revision.newTasksToAdd.length,
              reasoning: revision.reasoning,
            });
          }
        } catch (err) {
          // Revision failed — continue with existing plan
          log.warn("phase revision failed, continuing with original plan", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // 4. Completion
  const finalStatus = failedTasks > 0 && completedTasks === 0 ? "failed" : "completed";
  await db.exec`
    UPDATE project_plans
    SET status = ${finalStatus}, updated_at = NOW()
    WHERE id = ${projectId}
  `;

  const elapsed = Math.round((Date.now() - projectStart) / 1000);
  const skippedTasks = allTasks.filter((t) => t.status === "skipped").length;
  const prUrls = allTasks
    .filter((t) => t.prUrl)
    .map((t) => `- ${t.title}: ${t.prUrl}`)
    .join("\n");

  await agentReports.publish({
    conversationId,
    taskId: "project-orchestrator",
    content: `🏁 **Prosjekt ${finalStatus === "completed" ? "fullført" : "avsluttet"}**\n\n` +
      `📊 **Resultater:**\n` +
      `- Totalt: ${planRow.total_tasks} oppgaver\n` +
      `- Fullført: ${completedTasks}\n` +
      `- Feilet: ${failedTasks}\n` +
      `- Hoppet over: ${skippedTasks}\n` +
      `- Tid: ${elapsed}s\n` +
      `- Kostnad: $${totalCostUsd.toFixed(4)}\n` +
      (prUrls ? `\n📎 **PRs:**\n${prUrls}` : ""),
    status: finalStatus === "completed" ? "completed" : "failed",
  });
}

// --- DEL 5: Project Endpoints ---

// Start a project execution
interface StartProjectRequest {
  conversationId: string;
  projectId: string;
}

interface StartProjectResponse {
  status: "started";
  projectId: string;
}

export const startProject = api(
  { method: "POST", path: "/agent/project/start", expose: true, auth: true },
  async (req: StartProjectRequest): Promise<StartProjectResponse> => {
    // Verify project exists
    const plan = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM project_plans WHERE id = ${req.projectId}
    `;
    if (!plan) throw APIError.notFound("prosjekt ikke funnet");
    if (plan.status === "executing") {
      throw APIError.failedPrecondition("prosjektet kjører allerede");
    }

    // Fire and forget
    executeProject(req.projectId, req.conversationId, REPO_OWNER, REPO_NAME).catch((err) => {
      console.error(`Project ${req.projectId} failed:`, err);
    });

    return { status: "started", projectId: req.projectId };
  }
);

// Get project status
interface ProjectStatusRequest {
  projectId: string;
}

interface ProjectStatusResponse {
  plan: {
    id: string;
    status: string;
    currentPhase: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalCostUsd: number;
  };
  tasks: Array<{
    id: string;
    phase: number;
    title: string;
    status: string;
    prUrl: string | null;
    costUsd: number;
    errorMessage: string | null;
  }>;
}

export const projectStatus = api(
  { method: "POST", path: "/agent/project/status", expose: true, auth: true },
  async (req: ProjectStatusRequest): Promise<ProjectStatusResponse> => {
    const plan = await db.queryRow<{
      id: string;
      status: string;
      current_phase: number;
      total_tasks: number;
      completed_tasks: number;
      failed_tasks: number;
      total_cost_usd: number;
    }>`
      SELECT id, status, current_phase, total_tasks, completed_tasks, failed_tasks,
             COALESCE(total_cost_usd, 0)::numeric as total_cost_usd
      FROM project_plans WHERE id = ${req.projectId}
    `;

    if (!plan) throw APIError.notFound("prosjekt ikke funnet");

    const tasks: ProjectStatusResponse["tasks"] = [];
    const taskRows = db.query<{
      id: string;
      phase: number;
      title: string;
      status: string;
      pr_url: string | null;
      cost_usd: number | null;
      error_message: string | null;
    }>`
      SELECT id, phase, title, status, pr_url, COALESCE(cost_usd, 0)::numeric as cost_usd, error_message
      FROM project_tasks WHERE project_id = ${req.projectId}
      ORDER BY phase, task_order
    `;

    for await (const row of taskRows) {
      tasks.push({
        id: row.id,
        phase: row.phase,
        title: row.title,
        status: row.status,
        prUrl: row.pr_url,
        costUsd: Number(row.cost_usd),
        errorMessage: row.error_message,
      });
    }

    return {
      plan: {
        id: plan.id,
        status: plan.status,
        currentPhase: plan.current_phase,
        totalTasks: plan.total_tasks,
        completedTasks: plan.completed_tasks,
        failedTasks: plan.failed_tasks,
        totalCostUsd: Number(plan.total_cost_usd),
      },
      tasks,
    };
  }
);

// Pause a project
interface PauseProjectRequest {
  projectId: string;
}

interface PauseProjectResponse {
  status: "paused";
  projectId: string;
}

export const pauseProject = api(
  { method: "POST", path: "/agent/project/pause", expose: true, auth: true },
  async (req: PauseProjectRequest): Promise<PauseProjectResponse> => {
    const plan = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM project_plans WHERE id = ${req.projectId}
    `;
    if (!plan) throw APIError.notFound("prosjekt ikke funnet");

    await db.exec`
      UPDATE project_plans SET status = 'paused', updated_at = NOW()
      WHERE id = ${req.projectId}
    `;

    return { status: "paused", projectId: req.projectId };
  }
);

// Resume a paused project
interface ResumeProjectRequest {
  conversationId: string;
  projectId: string;
}

interface ResumeProjectResponse {
  status: "resumed";
  projectId: string;
}

export const resumeProject = api(
  { method: "POST", path: "/agent/project/resume", expose: true, auth: true },
  async (req: ResumeProjectRequest): Promise<ResumeProjectResponse> => {
    const plan = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM project_plans WHERE id = ${req.projectId}
    `;
    if (!plan) throw APIError.notFound("prosjekt ikke funnet");
    if (plan.status !== "paused") {
      throw APIError.failedPrecondition("prosjektet er ikke pauset");
    }

    await db.exec`
      UPDATE project_plans SET status = 'executing', updated_at = NOW()
      WHERE id = ${req.projectId}
    `;

    // Resume execution
    executeProject(req.projectId, req.conversationId, REPO_OWNER, REPO_NAME).catch((err) => {
      console.error(`Project ${req.projectId} resume failed:`, err);
    });

    return { status: "resumed", projectId: req.projectId };
  }
);

// Store a decomposed project plan (called from chat service)
interface StoreProjectPlanRequest {
  conversationId: string;
  userRequest: string;
  decomposition: {
    phases: Array<{
      name: string;
      description: string;
      tasks: Array<{
        title: string;
        description: string;
        dependsOnIndices: number[];
        contextHints: string[];
      }>;
    }>;
    conventions: string;
    estimatedTotalTasks: number;
  };
}

interface StoreProjectPlanResponse {
  projectId: string;
  totalTasks: number;
}

export const storeProjectPlan = api(
  { method: "POST", path: "/agent/project/store", expose: false },
  async (req: StoreProjectPlanRequest): Promise<StoreProjectPlanResponse> => {
    // Insert project plan
    const planRow = await db.queryRow<{ id: string }>`
      INSERT INTO project_plans (
        conversation_id, user_request, status, conventions, total_tasks,
        plan_data
      ) VALUES (
        ${req.conversationId},
        ${req.userRequest},
        'planning',
        ${req.decomposition.conventions},
        ${req.decomposition.estimatedTotalTasks},
        ${JSON.stringify({ phases: req.decomposition.phases })}::jsonb
      )
      RETURNING id
    `;

    if (!planRow) throw APIError.internal("failed to create project plan");

    // Insert tasks with dependency resolution
    // Build a global task index → UUID mapping
    const taskIds: string[] = [];
    let globalIdx = 0;

    for (let phaseIdx = 0; phaseIdx < req.decomposition.phases.length; phaseIdx++) {
      const phase = req.decomposition.phases[phaseIdx];
      for (let taskIdx = 0; taskIdx < phase.tasks.length; taskIdx++) {
        const task = phase.tasks[taskIdx];

        const taskRow = await db.queryRow<{ id: string }>`
          INSERT INTO project_tasks (
            project_id, phase, task_order, title, description,
            context_hints
          ) VALUES (
            ${planRow.id}, ${phaseIdx}, ${taskIdx},
            ${task.title}, ${task.description},
            ${task.contextHints}::text[]
          )
          RETURNING id
        `;

        taskIds.push(taskRow!.id);

        // Also create in tasks-service (master task table)
        try {
          await tasks.createTask({
            title: task.title,
            description: task.description,
            repo: REPO_NAME,
            source: "orchestrator",
            priority: 3,
            phase: `phase-${phaseIdx}`,
          });
        } catch (e) {
          log.warn("Failed to create task in tasks-service", {
            projectTask: taskRow!.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        globalIdx++;
      }
    }

    // Update depends_on with resolved UUIDs
    globalIdx = 0;
    for (const phase of req.decomposition.phases) {
      for (const task of phase.tasks) {
        if (task.dependsOnIndices.length > 0) {
          const depUuids = task.dependsOnIndices
            .filter((i) => i >= 0 && i < taskIds.length)
            .map((i) => taskIds[i]);

          if (depUuids.length > 0) {
            await db.exec`
              UPDATE project_tasks SET depends_on = ${depUuids}::uuid[]
              WHERE id = ${taskIds[globalIdx]}
            `;
          }
        }
        globalIdx++;
      }
    }

    return {
      projectId: planRow.id,
      totalTasks: taskIds.length,
    };
  }
);

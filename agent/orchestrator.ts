import { api, APIError } from "encore.dev/api";
import { github, memory, docs, ai, tasks, sandbox } from "~encore/clients";
import log from "encore.dev/log";
import { agentReports } from "../chat/chat";
import { executeTask, autoInitRepo } from "./agent";
import { submitReviewInternal } from "./review";
import { db } from "./db";
import type {
  ProjectTask,
  CuratedContext,
  AgentExecutionContext,
  AIReviewData,
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
      const tree = await github.getTree({ owner: repoOwner, repo: repoName });
      if (tree.empty || tree.tree.length === 0) throw new Error("empty tree — skip file search");
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

  // Accumulated files from all tasks (for single project review + PR)
  const accumulatedFiles: Array<{ path: string; content: string; action: string }> = [];

  // 2. Auto-init for empty repos BEFORE sandbox creation
  const tree = await github.getTree({ owner: repoOwner, repo: repoName });
  if (tree.empty) {
    await reportProject(conversationId, "Tomt repo oppdaget — initialiserer...");
    const initCtx: AgentExecutionContext = {
      conversationId,
      taskId: "project-init",
      taskDescription: "Initialiser repo",
      userMessage: "Initialiser repo",
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
    await autoInitRepo(initCtx);
  }

  // 3. Create ONE shared sandbox for the entire project
  let projectSandboxId: string;
  try {
    const sbx = await sandbox.create({ repoOwner, repoName });
    projectSandboxId = sbx.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.exec`UPDATE project_plans SET status = 'failed', updated_at = NOW() WHERE id = ${projectId}`;
    await reportProject(conversationId, `Sandbox-opprettelse feilet: ${msg}`);
    return;
  }

  try {
    // 4. Iterate through phases (starting from current_phase for resumability)
    for (const phaseNum of phases) {
      if (phaseNum < planRow.current_phase) continue;

      // Check if paused
      const currentStatus = await db.queryRow<{ status: string }>`
        SELECT status FROM project_plans WHERE id = ${projectId}
      `;
      if (currentStatus?.status === "paused") {
        await reportProject(conversationId, `Prosjekt pauset i fase ${phaseNum}.`);
        return; // Don't destroy sandbox — project may resume
      }

      const phaseTasks = allTasks
        .filter((t) => t.phase === phaseNum)
        .sort((a, b) => a.taskOrder - b.taskOrder);

      await reportProject(conversationId, `Starter fase ${phaseNum + 1}: ${phaseTasks.length} oppgaver`);

      // Execute each task in the phase
      for (const task of phaseTasks) {
        if (task.status === "completed" || task.status === "skipped") continue;

        // Check dependencies
        const unmetDeps = task.dependsOn.filter((depId) => {
          const dep = allTasks.find((t) => t.id === depId);
          return !dep || dep.status !== "completed";
        });

        if (unmetDeps.length > 0) {
          const failedDeps = unmetDeps.filter((depId) => {
            const dep = allTasks.find((t) => t.id === depId);
            return dep && (dep.status === "failed" || dep.status === "skipped");
          });

          if (failedDeps.length > 0) {
            await db.exec`
              UPDATE project_tasks
              SET status = 'skipped', error_message = 'Avhengighet feilet', completed_at = NOW()
              WHERE id = ${task.id}
            `;
            task.status = "skipped";

            const skipTaskId = thefoldTaskMap.get(task.title);
            if (skipTaskId) {
              try { await tasks.updateTaskStatus({ id: skipTaskId, status: "blocked", errorMessage: "Avhengighet feilet" }); } catch { /* */ }
            }
            await reportProject(conversationId, `Hopper over "${task.title}" — avhengighet feilet`);
            continue;
          }

          await reportProject(conversationId, `Venter pa avhengigheter for "${task.title}"`);
          continue;
        }

        // Mark as running
        await db.exec`
          UPDATE project_tasks
          SET status = 'running', started_at = NOW(), attempt_count = attempt_count + 1
          WHERE id = ${task.id}
        `;
        task.status = "running";

        const thefoldTaskId = thefoldTaskMap.get(task.title);
        if (thefoldTaskId) {
          try { await tasks.updateTaskStatus({ id: thefoldTaskId, status: mapProjectStatus("running") as any }); } catch { /* */ }
        }

        // Curate context
        let curated: CuratedContext;
        try {
          curated = await curateContext(task, { conventions: planRow.conventions }, allTasks, repoOwner, repoName);
        } catch {
          curated = { relevantFiles: [], dependencyOutputs: [], memoryContext: [], docsContext: [], conventions: planRow.conventions, tokenEstimate: 0 };
        }

        // Build context and execute task with collectOnly
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
          collectOnly: true,
          sandboxId: projectSandboxId,
        };

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

        if (result.success) {
          // Accumulate files from this task
          if (result.filesContent) {
            for (const f of result.filesContent) {
              // Deduplicate: later writes to same path replace earlier ones
              const existingIdx = accumulatedFiles.findIndex((af) => af.path === f.path);
              if (existingIdx >= 0) {
                accumulatedFiles[existingIdx] = f;
              } else {
                accumulatedFiles.push(f);
              }
            }
          }

          await db.exec`
            UPDATE project_tasks
            SET status = 'completed', completed_at = NOW(),
                output_files = ${result.filesChanged}::text[],
                cost_usd = ${result.costUsd}
            WHERE id = ${task.id}
          `;
          task.status = "completed";
          task.outputFiles = result.filesChanged;
          completedTasks++;
          totalCostUsd += result.costUsd;

          await db.exec`
            UPDATE project_plans
            SET completed_tasks = ${completedTasks}, total_cost_usd = ${totalCostUsd}, updated_at = NOW()
            WHERE id = ${projectId}
          `;

          if (thefoldTaskId) {
            try { await tasks.updateTaskStatus({ id: thefoldTaskId, status: "done" }); } catch { /* */ }
          }

          await reportProject(conversationId, `Task ${completedTasks}/${planRow.total_tasks} fullfort: ${task.title}`);
        } else {
          await db.exec`
            UPDATE project_tasks
            SET status = 'failed', error_message = ${result.errorMessage ?? "Unknown error"},
                completed_at = NOW(), cost_usd = ${result.costUsd}
            WHERE id = ${task.id}
          `;
          task.status = "failed";
          failedTasks++;
          totalCostUsd += result.costUsd;

          await db.exec`
            UPDATE project_plans
            SET failed_tasks = ${failedTasks}, total_cost_usd = ${totalCostUsd}, updated_at = NOW()
            WHERE id = ${projectId}
          `;

          // Skip downstream tasks
          for (const otherTask of allTasks) {
            if (otherTask.dependsOn.includes(task.id) && otherTask.status === "pending") {
              await db.exec`
                UPDATE project_tasks SET status = 'skipped', error_message = 'Blokkert av feilet avhengighet' WHERE id = ${otherTask.id}
              `;
              otherTask.status = "skipped";
              const downId = thefoldTaskMap.get(otherTask.title);
              if (downId) { try { await tasks.updateTaskStatus({ id: downId, status: "blocked", errorMessage: "Blokkert av feilet avhengighet" }); } catch { /* */ } }
            }
          }

          await reportProject(conversationId, `Task feilet: ${task.title}\n${result.errorMessage ?? ""}`);
        }
      }

      // After phase: update current_phase
      await db.exec`
        UPDATE project_plans SET current_phase = ${phaseNum + 1}, updated_at = NOW() WHERE id = ${projectId}
      `;

      // After phase: AI-driven revision for next phase
      const nextPhase = phases.find((p) => p > phaseNum);
      if (nextPhase !== undefined) {
        const completedInPhase = phaseTasks.filter((t) => t.status === "completed");
        const failedInPhase = phaseTasks.filter((t) => t.status === "failed");
        const nextPhaseTasks = allTasks.filter((t) => t.phase === nextPhase);

        await reportProject(conversationId, `Fase ${phaseNum + 1} ferdig: ${completedInPhase.length} fullfort, ${failedInPhase.length} feilet`);

        if (nextPhaseTasks.length > 0) {
          try {
            await reportProject(conversationId, `Justerer plan for neste fase basert pa hva som ble bygget`);

            const currentTree = await github.getTree({ owner: repoOwner, repo: repoName });
            const projectStructure = currentTree.empty ? "(Tomt repo)" : currentTree.treeString;

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

            for (const rev of revision.revisedTasks) {
              const revTask = nextPhaseTasks.find((t) => t.title === rev.originalTitle);
              if (!revTask) continue;
              if (rev.shouldSkip) {
                await db.exec`UPDATE project_tasks SET status = 'skipped', error_message = ${rev.reason} WHERE id = ${revTask.id}`;
                revTask.status = "skipped";
              } else {
                const newDesc = rev.revisedDescription || revTask.description;
                const newHints = rev.newContextHints || revTask.contextHints;
                await db.exec`UPDATE project_tasks SET description = ${newDesc}, context_hints = ${newHints}::text[] WHERE id = ${revTask.id}`;
                revTask.description = newDesc;
                revTask.contextHints = newHints;
              }
            }

            for (const newTask of revision.newTasksToAdd) {
              let insertOrder = nextPhaseTasks.length;
              if (newTask.insertAfterTitle) {
                const afterTask = nextPhaseTasks.find((t) => t.title === newTask.insertAfterTitle);
                if (afterTask) insertOrder = afterTask.taskOrder + 1;
              }
              const inserted = await db.queryRow<{ id: string }>`
                INSERT INTO project_tasks (project_id, phase, task_order, title, description, context_hints)
                VALUES (${projectId}, ${nextPhase}, ${insertOrder}, ${newTask.title}, ${newTask.description}, ${newTask.contextHints}::text[])
                RETURNING id
              `;
              if (inserted) {
                allTasks.push({
                  id: inserted.id, projectId, phase: nextPhase, taskOrder: insertOrder,
                  title: newTask.title, description: newTask.description, status: "pending",
                  dependsOn: [], outputFiles: [], outputTypes: [], contextHints: newTask.contextHints,
                  costUsd: 0, attemptCount: 0,
                });
                await db.exec`UPDATE project_plans SET total_tasks = total_tasks + 1 WHERE id = ${projectId}`;
              }
            }

            if (revision.revisedTasks.length > 0 || revision.newTasksToAdd.length > 0) {
              log.info("phase revision applied", { phase: phaseNum, revised: revision.revisedTasks.length, added: revision.newTasksToAdd.length });
            }
          } catch (err) {
            log.warn("phase revision failed, continuing", { error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }

    // 5. ALL tasks done — submit ONE aggregated project review
    if (accumulatedFiles.length > 0 && completedTasks > 0) {
      await reportProject(conversationId, `Alle oppgaver fullfort — genererer samlet prosjekt-review...`);

      // Build phase summary for review
      const phaseSummary = phases.map((phaseNum) => ({
        name: `Fase ${phaseNum + 1}`,
        tasks: allTasks
          .filter((t) => t.phase === phaseNum)
          .map((t) => ({
            title: t.title,
            status: t.status,
            filesChanged: t.outputFiles,
          })),
      }));

      // Call ai.reviewProject for whole-project review
      try {
        const projectReview = await ai.reviewProject({
          projectDescription: planRow.user_request,
          phases: phaseSummary,
          allFiles: accumulatedFiles,
          totalCostUsd,
          totalTokensUsed: allTasks.reduce((sum, t) => sum + (t.costUsd || 0), 0) * 1000, // rough estimate
        });

        totalCostUsd += projectReview.costUsd;

        // Submit as a single code review
        const aiReviewData: AIReviewData = {
          documentation: projectReview.documentation,
          qualityScore: projectReview.qualityScore,
          concerns: projectReview.concerns,
          memoriesExtracted: projectReview.memoriesExtracted,
        };

        const reviewResult = await submitReviewInternal({
          conversationId,
          taskId: projectId,
          sandboxId: projectSandboxId,
          repoName,
          filesChanged: accumulatedFiles.map((f) => ({
            path: f.path,
            content: f.content,
            action: f.action as "create" | "modify" | "delete",
          })),
          aiReview: aiReviewData,
        });

        // Set project to pending_review
        await db.exec`
          UPDATE project_plans
          SET status = 'pending_review', total_cost_usd = ${totalCostUsd}, updated_at = NOW()
          WHERE id = ${projectId}
        `;

        await reportProject(conversationId,
          `Prosjekt-review klar! ${accumulatedFiles.length} filer, ${completedTasks} oppgaver fullfort.\n` +
          `Se review: /review/${reviewResult.reviewId}`
        );

        // Don't destroy sandbox yet — wait for review approval/rejection
        return;
      } catch (err) {
        log.warn("project review failed", { error: err instanceof Error ? err.message : String(err) });
        // Fall through to completion without review
      }
    }

    // 6. Completion (no files to review, or review submission failed)
    const finalStatus = failedTasks > 0 && completedTasks === 0 ? "failed" : "completed";
    await db.exec`
      UPDATE project_plans SET status = ${finalStatus}, updated_at = NOW() WHERE id = ${projectId}
    `;

    const elapsed = Math.round((Date.now() - projectStart) / 1000);
    const skippedTasks = allTasks.filter((t) => t.status === "skipped").length;

    await agentReports.publish({
      conversationId,
      taskId: "project-orchestrator",
      content: `**Prosjekt ${finalStatus === "completed" ? "fullfort" : "avsluttet"}**\n\n` +
        `**Resultater:**\n` +
        `- Totalt: ${planRow.total_tasks} oppgaver\n` +
        `- Fullfort: ${completedTasks}\n` +
        `- Feilet: ${failedTasks}\n` +
        `- Hoppet over: ${skippedTasks}\n` +
        `- Tid: ${elapsed}s\n` +
        `- Kostnad: $${totalCostUsd.toFixed(4)}`,
      status: finalStatus === "completed" ? "completed" : "failed",
    });

    // Destroy sandbox on completion (no pending review)
    try { await sandbox.destroy({ sandboxId: projectSandboxId }); } catch { /* */ }
  } catch (err) {
    // Unexpected error — destroy sandbox and mark project as failed
    try { await sandbox.destroy({ sandboxId: projectSandboxId }); } catch { /* */ }
    const msg = err instanceof Error ? err.message : String(err);
    await db.exec`UPDATE project_plans SET status = 'failed', updated_at = NOW() WHERE id = ${projectId}`;
    await reportProject(conversationId, `Prosjekt feilet: ${msg}`);
    throw err;
  }
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

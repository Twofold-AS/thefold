import { api, APIError } from "encore.dev/api";
import { github, memory, docs, ai, tasks, sandbox } from "~encore/clients";
import log from "encore.dev/log";
import { agentReports } from "../chat/events";
import { executeTask } from "./agent";
import { autoInitRepo } from "./helpers";
import { submitReviewInternal } from "./review";
import { db, acquireRepoLock, releaseRepoLock } from "./db";
import { summarizeFile, DEFAULT_STRATEGY } from "./context-builder";
import { getOrCreateManifest, formatManifestForContext } from "./manifest";
import type {
  ProjectTask,
  CuratedContext,
  AgentExecutionContext,
  AIReviewData,
} from "./types";
import { mapProjectStatus } from "./types";
import type { ExecuteTaskOptions, ExecuteTaskResult } from "./agent";

// --- Constants ---

// REPO_OWNER and REPO_NAME removed — passed as parameters from callers
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

  // 5.5: Project manifest injection (D20)
  try {
    // Fetch tree for manifest generation if needed
    let treeStringForManifest: string | undefined;
    try {
      const tree = await github.getTree({ owner: repoOwner, repo: repoName });
      treeStringForManifest = tree.treeString || undefined;
    } catch {
      // Tree fetch failed — manifest may still load from cache
    }
    const manifest = await getOrCreateManifest(repoOwner, repoName, treeStringForManifest);
    if (manifest) {
      const manifestSection = formatManifestForContext(manifest);
      // Prepend manifest as highest-priority context section (~500-800 tokens)
      docsContext.unshift(manifestSection);
      tokenEstimate += Math.ceil(manifestSection.length / 4);
      log.info("curateContext: manifest injected", { repoOwner, repoName, version: manifest.version });
    }
  } catch (err) {
    log.warn("curateContext: manifest injection failed (non-critical)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 6. Context compression — uses declarative strategy from DEFAULT_STRATEGY (D17)
  const rawTokenEstimate = tokenEstimate;
  if (rawTokenEstimate > MAX_CONTEXT_TOKENS) {
    log.info("curateContext: compressing context", { rawTokens: rawTokenEstimate, budget: MAX_CONTEXT_TOKENS });

    // Apply file compression: signatures_only (mirrors DEFAULT_STRATEGY)
    if (DEFAULT_STRATEGY.compress.files === "signatures_only") {
      const compressed = relevantFiles.map(f => ({ ...f, content: summarizeFile(f.content) }));
      relevantFiles.length = 0;
      relevantFiles.push(...compressed);
    }

    // Apply memory compression: recent_5
    if (DEFAULT_STRATEGY.compress.memory === "recent_5") {
      const recentMemory = memoryContext.slice(0, 5);
      memoryContext.length = 0;
      memoryContext.push(...recentMemory);
    }

    // Apply docs compression: relevant (keep first 3)
    if (DEFAULT_STRATEGY.compress.docs === "relevant") {
      const relevantDocs = docsContext.slice(0, 3);
      docsContext.length = 0;
      docsContext.push(...relevantDocs);
    }

    // Recalculate token estimate after compression
    tokenEstimate = Math.ceil(conventions.length / 4)
      + relevantFiles.reduce((s, f) => s + Math.ceil(f.content.length / 4), 0)
      + memoryContext.reduce((s, m) => s + Math.ceil(m.length / 4), 0)
      + docsContext.reduce((s, d) => s + Math.ceil(d.length / 4), 0);
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
    input_contracts: string | null;
    output_contracts: string | null;
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
      inputContracts: row.input_contracts
        ? (typeof row.input_contracts === "string" ? JSON.parse(row.input_contracts) : row.input_contracts)
        : undefined,
      outputContracts: row.output_contracts
        ? (typeof row.output_contracts === "string" ? JSON.parse(row.output_contracts) : row.output_contracts)
        : undefined,
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
              try { await tasks.updateTaskStatus({ id: skipTaskId, status: "blocked", errorMessage: "Avhengighet feilet" }); } catch (err) { log.warn("Failed to mark skipped task as blocked", { taskId: skipTaskId, error: err instanceof Error ? err.message : String(err) }); }
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
          try { await tasks.updateTaskStatus({ id: thefoldTaskId, status: mapProjectStatus("running") as any }); } catch (err) { log.warn("Failed to update task status to running", { taskId: thefoldTaskId, error: err instanceof Error ? err.message : String(err) }); }
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
            try { await tasks.updateTaskStatus({ id: thefoldTaskId, status: "done" }); } catch (err) { log.warn("Failed to mark task as done", { taskId: thefoldTaskId, error: err instanceof Error ? err.message : String(err) }); }
          }

          // D23: Log contract observability — non-blocking
          if (task.outputContracts && task.outputContracts.length > 0) {
            log.info("task completed with output contracts", {
              taskId: task.id,
              taskTitle: task.title,
              outputContracts: task.outputContracts,
              filesChanged: result.filesChanged,
            });
            await db.exec`
              UPDATE project_tasks
              SET contracts_verified = true,
                  verification_notes = ${"Task completed — output contracts logged for observability"}
              WHERE id = ${task.id}
            `;
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
              if (downId) { try { await tasks.updateTaskStatus({ id: downId, status: "blocked", errorMessage: "Blokkert av feilet avhengighet" }); } catch (err) { log.warn("Failed to block downstream task", { taskId: downId, error: err instanceof Error ? err.message : String(err) }); } }
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

        await agentReports.publish({
          conversationId,
          taskId: "project-orchestrator",
          content: JSON.stringify({
            type: "project_review_ready",
            reviewId: reviewResult.reviewId,
            summary: `${completedTasks} oppgaver fullfort, ${accumulatedFiles.length} filer endret. Kvalitetsscore: ${projectReview.qualityScore}/10.`,
            message: `Prosjektet er klart for gjennomgang. Godkjenn for å opprette PR, be om endringer, eller avvis.`,
            filesChanged: accumulatedFiles.length,
            tasksCompleted: completedTasks,
            qualityScore: projectReview.qualityScore,
          }),
          status: "needs_input",
        });

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
    try { await sandbox.destroy({ sandboxId: projectSandboxId }); } catch (e) { log.warn("Sandbox destroy failed (completion)", { sandboxId: projectSandboxId, error: e instanceof Error ? e.message : String(e) }); }
  } catch (err) {
    // Unexpected error — destroy sandbox and mark project as failed
    try { await sandbox.destroy({ sandboxId: projectSandboxId }); } catch (e) { log.warn("Sandbox destroy failed (error path)", { sandboxId: projectSandboxId, error: e instanceof Error ? e.message : String(e) }); }
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
  repoOwner: string;
  repoName: string;
}

interface StartProjectResponse {
  status: "started";
  projectId: string;
}

export const startProject = api(
  { method: "POST", path: "/agent/project/start", expose: true, auth: true },
  async (req: StartProjectRequest): Promise<StartProjectResponse> => {
    if (!req.repoOwner || !req.repoName) {
      throw APIError.invalidArgument("repoOwner and repoName are required");
    }

    // Verify project exists
    const plan = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM project_plans WHERE id = ${req.projectId}
    `;
    if (!plan) throw APIError.notFound("prosjekt ikke funnet");
    if (plan.status === "executing") {
      throw APIError.failedPrecondition("prosjektet kjører allerede");
    }

    // Acquire advisory lock — prevent concurrent execution on same repo
    const locked = await acquireRepoLock(req.repoOwner, req.repoName);
    if (!locked) {
      throw APIError.failedPrecondition(`Repo ${req.repoOwner}/${req.repoName} er allerede låst av en annen oppgave`);
    }

    // Fire and forget
    executeProject(req.projectId, req.conversationId, req.repoOwner, req.repoName)
      .catch((err) => {
        console.error(`Project ${req.projectId} failed:`, err);
      })
      .finally(() => releaseRepoLock(req.repoOwner, req.repoName));

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
  repoOwner: string;
  repoName: string;
}

interface ResumeProjectResponse {
  status: "resumed";
  projectId: string;
}

export const resumeProject = api(
  { method: "POST", path: "/agent/project/resume", expose: true, auth: true },
  async (req: ResumeProjectRequest): Promise<ResumeProjectResponse> => {
    if (!req.repoOwner || !req.repoName) {
      throw APIError.invalidArgument("repoOwner and repoName are required");
    }

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
    executeProject(req.projectId, req.conversationId, req.repoOwner, req.repoName).catch((err) => {
      console.error(`Project ${req.projectId} resume failed:`, err);
    });

    return { status: "resumed", projectId: req.projectId };
  }
);

// Store a decomposed project plan (called from chat service)
interface StoreProjectPlanRequest {
  conversationId: string;
  userRequest: string;
  repoOwner?: string;
  repoName?: string;
  supersededPlanId?: string;
  decomposition: {
    phases: Array<{
      name: string;
      description: string;
      tasks: Array<{
        title: string;
        description: string;
        dependsOnIndices: number[];
        contextHints: string[];
        inputContracts?: string[];
        outputContracts?: string[];
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

    // Supersede any active plans for this conversation (auto-detect or explicit)
    try {
      const planToSupersede = req.supersededPlanId;
      if (planToSupersede) {
        // Explicit supersede: mark the specified plan
        await db.exec`
          UPDATE project_plans
          SET superseded_by_project_id = ${planRow.id}
          WHERE id = ${planToSupersede}
            AND superseded_by_project_id IS NULL
        `;
      } else {
        // Auto-detect: supersede all active plans for this conversation
        await db.exec`
          UPDATE project_plans
          SET superseded_by_project_id = ${planRow.id}
          WHERE conversation_id = ${req.conversationId}
            AND id != ${planRow.id}
            AND superseded_by_project_id IS NULL
            AND status NOT IN ('executing', 'completed')
        `;
      }
    } catch (e) {
      log.warn("Failed to supersede old project plans", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Create a master task in tasks-service to represent the full job
    let masterTaskId: string | undefined;
    try {
      const masterResult = await tasks.createTask({
        title: req.userRequest.slice(0, 200) || "Orchestrator job",
        description: `Automatisk dekomponert jobb med ${req.decomposition.estimatedTotalTasks} deloppgaver.`,
        repo: req.repoName || undefined,
        source: "orchestrator",
        priority: 3,
      });
      masterTaskId = masterResult.task.id;
      // Persist master_task_id to plan row
      await db.exec`
        UPDATE project_plans SET master_task_id = ${masterTaskId} WHERE id = ${planRow.id}
      `;
    } catch (e) {
      log.warn("Failed to create master task in tasks-service", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Insert tasks with dependency resolution
    // Build a global task index → UUID mapping
    const taskIds: string[] = [];
    let globalIdx = 0;

    for (let phaseIdx = 0; phaseIdx < req.decomposition.phases.length; phaseIdx++) {
      const phase = req.decomposition.phases[phaseIdx];
      for (let taskIdx = 0; taskIdx < phase.tasks.length; taskIdx++) {
        const task = phase.tasks[taskIdx];

        const inputContracts = task.inputContracts ?? [];
        const outputContracts = task.outputContracts ?? [];

        const taskRow = await db.queryRow<{ id: string }>`
          INSERT INTO project_tasks (
            project_id, phase, task_order, title, description,
            context_hints, input_contracts, output_contracts
          ) VALUES (
            ${planRow.id}, ${phaseIdx}, ${taskIdx},
            ${task.title}, ${task.description},
            ${task.contextHints}::text[],
            ${JSON.stringify(inputContracts)}::jsonb,
            ${JSON.stringify(outputContracts)}::jsonb
          )
          RETURNING id
        `;

        taskIds.push(taskRow!.id);

        // Create sub-task in tasks-service linked to master task
        try {
          await tasks.createTask({
            title: task.title,
            description: task.description,
            repo: req.repoName || undefined,
            source: "orchestrator",
            priority: 3,
            phase: `phase-${phaseIdx}`,
            parentId: masterTaskId,
          });
        } catch (e) {
          log.warn("Failed to create sub-task in tasks-service", {
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

// Get a project plan's phases and metadata (used by revise_project_plan tool)
interface GetProjectPlanRequest {
  projectId: string;
}

interface GetProjectPlanResponse {
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
  totalTasks: number;
  status: string;
  supersededByProjectId: string | null;
}

export const getProjectPlan = api(
  { method: "POST", path: "/agent/project/get-plan", expose: false },
  async (req: GetProjectPlanRequest): Promise<GetProjectPlanResponse> => {
    const row = await db.queryRow<{
      plan_data: string | object;
      conventions: string;
      total_tasks: number;
      status: string;
      superseded_by_project_id: string | null;
    }>`
      SELECT plan_data, conventions, total_tasks, status, superseded_by_project_id
      FROM project_plans WHERE id = ${req.projectId}
    `;
    if (!row) throw APIError.notFound(`Project plan ${req.projectId} not found`);

    const planData = typeof row.plan_data === "string" ? JSON.parse(row.plan_data) : row.plan_data;
    const phases = (planData?.phases || []).map((p: any) => ({
      name: p.name || "",
      description: p.description || "",
      tasks: (p.tasks || []).map((t: any) => ({
        title: t.title || "",
        description: t.description || "",
        dependsOnIndices: t.dependsOnIndices || [],
        contextHints: t.contextHints || [],
      })),
    }));

    return {
      phases,
      conventions: row.conventions || "",
      totalTasks: row.total_tasks,
      status: row.status,
      supersededByProjectId: row.superseded_by_project_id,
    };
  }
);

// --- Active-plan lookup for chat routing (§3.3) ---

interface GetActivePlanByConversationRequest {
  conversationId: string;
}

interface ActivePlanMeta {
  id: string;
  status: string;
  currentPhase: number;
  totalTasks: number;
  completedTasks: number;
  lastCompletedTaskTitle: string | null;
  remainingTasks: number;
  totalPhases: number;
}

interface GetActivePlanByConversationResponse {
  plan: ActivePlanMeta | null;
}

/**
 * Look up the latest ACTIVE project plan for a conversation.
 * "Active" = status in (planning, executing, paused). Returns null if none.
 *
 * Excludes pending_review — during review the user is choosing approve/reject,
 * so chat is free to create new work (§3.3 edge case).
 *
 * Used by chat.send to decide whether to filter create_task/start_task from
 * CHAT_TOOLS and inject a plan-context system block.
 */
export const getActivePlanByConversation = api(
  { method: "POST", path: "/agent/project/active-by-conversation", expose: false },
  async (req: GetActivePlanByConversationRequest): Promise<GetActivePlanByConversationResponse> => {
    const row = await db.queryRow<{
      id: string;
      status: string;
      current_phase: number;
      total_tasks: number;
      completed_tasks: number;
      plan_data: string | object | null;
    }>`
      SELECT id, status, current_phase, total_tasks, completed_tasks, plan_data
      FROM project_plans
      WHERE conversation_id = ${req.conversationId}
        AND status IN ('planning', 'executing', 'paused')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!row) return { plan: null };

    let totalPhases = 0;
    try {
      const planData = typeof row.plan_data === "string"
        ? JSON.parse(row.plan_data)
        : row.plan_data;
      totalPhases = Array.isArray(planData?.phases) ? planData.phases.length : 0;
    } catch {
      totalPhases = 0;
    }

    const lastDone = await db.queryRow<{ title: string }>`
      SELECT title FROM project_tasks
      WHERE project_id = ${row.id} AND status = 'completed'
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    const remaining = Math.max(0, (row.total_tasks ?? 0) - (row.completed_tasks ?? 0));

    return {
      plan: {
        id: row.id,
        status: row.status,
        currentPhase: row.current_phase,
        totalTasks: row.total_tasks,
        completedTasks: row.completed_tasks,
        lastCompletedTaskTitle: lastDone?.title ?? null,
        remainingTasks: remaining,
        totalPhases,
      },
    };
  }
);

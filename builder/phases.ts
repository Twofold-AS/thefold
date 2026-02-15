// Builder phases: init, scaffold, dependencies, implement, integrate, finalize
// Each phase is an exported function operating on a BuilderJob

import { sandbox, ai } from "~encore/clients";
import log from "encore.dev/log";
import { analyzeDependencies, topologicalSort, getRelevantContext } from "./graph";
import type {
  BuilderJob, BuildPlanStep, BuildStrategy, BuildPhase,
  FileStatus, BuildResult, BuildProgressEvent,
} from "./types";
import { db, buildProgress, recordStep, updateJobCost } from "./db";

const MAX_FILE_FIX_RETRIES = 3;
const MAX_INTEGRATE_ITERATIONS = 3;

async function emitProgress(job: BuilderJob, phase: BuildPhase, step: number, totalSteps: number, currentFile: string | null, status: "started" | "completed" | "failed", message: string) {
  try {
    await buildProgress.publish({
      jobId: job.id,
      taskId: job.taskId,
      phase,
      step,
      totalSteps,
      currentFile,
      status,
      message,
    });
  } catch {
    // Don't fail build on pub/sub error
  }
}

// --- Phase 1: INIT ---

export async function initPhase(job: BuilderJob): Promise<void> {
  await emitProgress(job, "init", 0, 1, null, "started", "Analyserer plan og bygger dependency graph...");

  // Analyze dependencies
  const graph = analyzeDependencies(job.plan.steps);
  job.dependencyGraph = graph;

  // Count total file steps
  const fileSteps = job.plan.steps.filter(
    s => s.action === "create_file" || s.action === "modify_file"
  );
  job.totalSteps = fileSteps.length;

  // Choose build strategy
  job.buildStrategy = selectStrategy(job.plan.steps, graph);

  // Persist dependency graph and strategy
  await db.exec`
    UPDATE builder_jobs
    SET dependency_graph = ${JSON.stringify(graph)}::jsonb,
        build_strategy = ${job.buildStrategy},
        total_steps = ${job.totalSteps}
    WHERE id = ${job.id}::uuid
  `;

  await emitProgress(job, "init", 1, 1, null, "completed", `Strategy: ${job.buildStrategy}, ${job.totalSteps} filer å bygge`);
}

export function selectStrategy(steps: BuildPlanStep[], graph: Record<string, string[]>): BuildStrategy {
  const fileSteps = steps.filter(s => s.action === "create_file" || s.action === "modify_file");

  // Check for scaffold indicators (new project)
  const hasInit = steps.some(s => s.action === "run_command" && s.command?.includes("init"));
  const hasPackageJson = fileSteps.some(s => s.filePath === "package.json");
  if (hasInit || (hasPackageJson && fileSteps.length > 5)) {
    return "scaffold_first";
  }

  // Check for complex dependency graphs
  const hasDeps = Object.values(graph).some(deps => deps.length > 0);
  if (hasDeps && fileSteps.length > 3) {
    return "dependency_order";
  }

  return "sequential";
}

// --- Phase 2: SCAFFOLD (new projects only) ---

export async function scaffoldPhase(job: BuilderJob): Promise<void> {
  await emitProgress(job, "scaffold", 0, 1, null, "started", "Initialiserer prosjekt...");

  // Run init commands from the plan
  const initCommands = job.plan.steps.filter(
    s => s.action === "run_command" && s.command
  );

  let stepNum = 0;
  for (const cmd of initCommands) {
    stepNum++;
    try {
      const result = await sandbox.runCommand({
        sandboxId: job.sandboxId!,
        command: cmd.command!,
        timeout: 120,
      });

      await recordStep(job.id, stepNum, "scaffold", "run_command", null, {
        status: result.exitCode === 0 ? "success" : "failed",
        output: result.stdout.substring(0, 5000),
        error: result.exitCode !== 0 ? result.stderr.substring(0, 2000) : null,
      });

      if (result.exitCode !== 0) {
        log.warn("scaffold command failed", { command: cmd.command, stderr: result.stderr.substring(0, 500) });
      }
    } catch (err) {
      log.error(err, "scaffold command error");
    }
  }

  await emitProgress(job, "scaffold", 1, 1, null, "completed", `Scaffold ferdig (${initCommands.length} kommandoer)`);
}

// --- Phase 3: DEPENDENCIES ---

export async function dependenciesPhase(job: BuilderJob): Promise<void> {
  await emitProgress(job, "dependencies", 0, 1, null, "started", "Installerer avhengigheter...");

  // Extract dependency install commands from plan
  const depCommands = job.plan.steps.filter(
    s => s.action === "run_command" && s.command?.startsWith("npm install")
  );

  // Also scan file content for imports that need new packages
  const packages = new Set<string>();
  for (const step of job.plan.steps) {
    if (!step.content) continue;
    // Match imports from non-relative paths (likely npm packages)
    const matches = step.content.matchAll(/import\s+.*?\s+from\s+["']([^."'][^"']*)["']/g);
    for (const m of matches) {
      const pkg = m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0];
      // Exclude known built-ins and encore
      if (!["fs", "path", "crypto", "http", "https", "url", "os", "util", "stream", "events", "child_process", "node", "encore.dev", "~encore"].some(b => pkg.startsWith(b))) {
        packages.add(pkg);
      }
    }
  }

  // Run explicit dep commands first
  for (const cmd of depCommands) {
    try {
      await sandbox.runCommand({
        sandboxId: job.sandboxId!,
        command: cmd.command!,
        timeout: 120,
      });
    } catch {
      log.warn("dependency install command failed", { command: cmd.command });
    }
  }

  // If we found additional packages, try to install them
  if (packages.size > 0 && depCommands.length === 0) {
    const pkgList = [...packages].join(" ");
    try {
      await sandbox.runCommand({
        sandboxId: job.sandboxId!,
        command: `npm install ${pkgList}`,
        timeout: 120,
      });
    } catch {
      log.warn("auto-detected package install failed", { packages: pkgList });
    }
  }

  await emitProgress(job, "dependencies", 1, 1, null, "completed", `Dependencies installert`);
}

// --- Phase 4: IMPLEMENT (core — file-by-file) ---

export async function implementPhase(job: BuilderJob): Promise<void> {
  await emitProgress(job, "implement", 0, job.totalSteps, null, "started", "Starter fil-for-fil generering...");

  // Get file steps
  const fileSteps = job.plan.steps.filter(
    s => s.action === "create_file" || s.action === "modify_file"
  );

  // Sort by dependency order if strategy requires it
  let orderedSteps: BuildPlanStep[];
  if (job.buildStrategy === "dependency_order" || job.buildStrategy === "scaffold_first") {
    try {
      const sortedPaths = topologicalSort(job.dependencyGraph);
      // Order steps by their position in topological sort
      const pathOrder = new Map(sortedPaths.map((p, i) => [p, i]));
      orderedSteps = [...fileSteps].sort((a, b) => {
        const orderA = pathOrder.get(a.filePath!) ?? 999;
        const orderB = pathOrder.get(b.filePath!) ?? 999;
        return orderA - orderB;
      });
    } catch {
      // Cycle detected — fall back to sequential
      log.warn("cycle in dependency graph, falling back to sequential order");
      orderedSteps = fileSteps;
    }
  } else {
    orderedSteps = fileSteps;
  }

  // Handle delete steps first
  const deleteSteps = job.plan.steps.filter(s => s.action === "delete_file");
  for (const del of deleteSteps) {
    if (del.filePath) {
      try {
        await sandbox.deleteFile({ sandboxId: job.sandboxId!, path: del.filePath });
      } catch { /* ignore delete errors */ }
    }
  }

  const contextWindow: Record<string, string> = { ...job.contextWindow };
  let stepCount = 0;

  for (const step of orderedSteps) {
    stepCount++;
    const filePath = step.filePath!;

    await emitProgress(job, "implement", stepCount, job.totalSteps, filePath, "started", `Genererer ${filePath}...`);

    // Get relevant context from dependencies
    const relevantContext = getRelevantContext(filePath, contextWindow, job.dependencyGraph);

    // If plan already has content (from ai.planTask), use it directly
    let fileContent: string;
    let tokensUsed = 0;
    let costUsd = 0;

    if (step.content && step.content.length > 0) {
      // Content already provided by plan — use directly
      fileContent = step.content;
    } else {
      // Generate file via AI
      try {
        const generated = await ai.generateFile({
          task: job.plan.description,
          fileSpec: {
            filePath,
            description: step.description || `Implement ${filePath}`,
            action: step.action === "create_file" ? "create" : "modify",
            existingContent: step.action === "modify_file" ? contextWindow[filePath] : undefined,
          },
          existingFiles: relevantContext,
          projectStructure: Object.keys(contextWindow),
          skillFragments: [],
          patterns: [],
          model: job.plan.model,
        });

        fileContent = generated.content;
        tokensUsed = generated.tokensUsed;
        costUsd = generated.costUsd;
      } catch (err) {
        log.error(err, "AI file generation failed", { filePath });
        job.filesWritten.push({ path: filePath, status: "failed", attempts: 1, errors: [String(err)] });
        await recordStep(job.id, stepCount, "implement", "create_file", filePath, {
          status: "failed",
          error: String(err),
        });
        continue;
      }
    }

    // Write to sandbox
    await sandbox.writeFile({ sandboxId: job.sandboxId!, path: filePath, content: fileContent });

    // Incremental validation for TypeScript files
    let valid = true;
    let validationErrors: string[] = [];

    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      const incVal = await sandbox.validateIncremental({ sandboxId: job.sandboxId!, filePath });

      if (!incVal.success) {
        valid = false;
        validationErrors = incVal.errors;

        // Fix loop
        for (let attempt = 0; attempt < MAX_FILE_FIX_RETRIES; attempt++) {
          try {
            const fixed = await ai.fixFile({
              task: job.plan.description,
              filePath,
              currentContent: fileContent,
              errors: validationErrors.slice(0, 5),
              existingFiles: relevantContext,
              model: job.plan.model,
            });

            fileContent = fixed.content;
            tokensUsed += fixed.tokensUsed;
            costUsd += fixed.costUsd;

            await sandbox.writeFile({ sandboxId: job.sandboxId!, path: filePath, content: fileContent });

            const reVal = await sandbox.validateIncremental({ sandboxId: job.sandboxId!, filePath });
            if (reVal.success) {
              valid = true;
              validationErrors = [];
              break;
            }
            validationErrors = reVal.errors;
          } catch (err) {
            log.warn("fix attempt failed", { filePath, attempt, error: String(err) });
          }
        }
      }
    }

    // Update cost tracking
    job.totalTokensUsed += tokensUsed;
    job.totalCostUsd += costUsd;
    await updateJobCost(job.id, job.totalTokensUsed, job.totalCostUsd);

    // Record file status
    const fileStatus: FileStatus = {
      path: filePath,
      status: valid ? "success" : "failed",
      attempts: valid ? 1 : MAX_FILE_FIX_RETRIES + 1,
      errors: validationErrors,
    };
    job.filesWritten.push(fileStatus);

    // Add to context window for next files
    contextWindow[filePath] = fileContent;

    // Record step
    await recordStep(job.id, stepCount, "implement", step.action, filePath, {
      status: valid ? "success" : "failed",
      content: fileContent,
      tokensUsed,
      error: validationErrors.length > 0 ? validationErrors.join("\n") : null,
      validationResult: valid ? null : { errors: validationErrors },
    });

    // Update job progress
    job.currentStep = stepCount;
    await db.exec`
      UPDATE builder_jobs
      SET current_step = ${stepCount},
          files_written = ${JSON.stringify(job.filesWritten)}::jsonb,
          context_window = ${JSON.stringify(contextWindow)}::jsonb
      WHERE id = ${job.id}::uuid
    `;

    await emitProgress(job, "implement", stepCount, job.totalSteps, filePath, valid ? "completed" : "failed",
      valid ? `${filePath} ✓` : `${filePath} ✗ (${validationErrors.length} feil)`);
  }

  // Update context window on job
  job.contextWindow = contextWindow;
}

// --- Phase 5: INTEGRATE ---

export async function integratePhase(job: BuilderJob): Promise<{ success: boolean; output: string; errors: string[] }> {
  await emitProgress(job, "integrate", 0, 1, null, "started", "Kjører full validering...");

  let lastOutput = "";
  let lastErrors: string[] = [];

  for (let iteration = 0; iteration < MAX_INTEGRATE_ITERATIONS; iteration++) {
    const validation = await sandbox.validate({ sandboxId: job.sandboxId! });
    lastOutput = validation.output;
    lastErrors = validation.errors;

    if (validation.success) {
      await emitProgress(job, "integrate", 1, 1, null, "completed", "Full validering bestått ✓");
      return { success: true, output: validation.output, errors: [] };
    }

    // Try to identify and fix failing files
    const failingFiles = identifyFailingFiles(validation.errors, Object.keys(job.contextWindow));
    if (failingFiles.length === 0) break;

    log.info("integration fix attempt", { iteration, failingFiles });

    for (const filePath of failingFiles) {
      if (!job.contextWindow[filePath]) continue;

      try {
        const relevantContext = getRelevantContext(filePath, job.contextWindow, job.dependencyGraph);
        const fixed = await ai.fixFile({
          task: job.plan.description,
          filePath,
          currentContent: job.contextWindow[filePath],
          errors: validation.errors.filter(e => e.includes(filePath)).slice(0, 5),
          existingFiles: relevantContext,
          model: job.plan.model,
        });

        await sandbox.writeFile({ sandboxId: job.sandboxId!, path: filePath, content: fixed.content });
        job.contextWindow[filePath] = fixed.content;
        job.totalTokensUsed += fixed.tokensUsed;
        job.totalCostUsd += fixed.costUsd;
      } catch (err) {
        log.warn("integration fix failed", { filePath, error: String(err) });
      }
    }

    job.buildIterations++;
  }

  await emitProgress(job, "integrate", 1, 1, null, "failed", `Validering feilet: ${lastErrors.length} feil`);
  return { success: false, output: lastOutput, errors: lastErrors };
}

function identifyFailingFiles(errors: string[], knownFiles: string[]): string[] {
  const failing = new Set<string>();
  for (const error of errors) {
    for (const file of knownFiles) {
      if (error.includes(file)) {
        failing.add(file);
      }
    }
  }
  return [...failing];
}

// --- Phase 6: FINALIZE ---

export async function finalizePhase(job: BuilderJob, validationOutput: string): Promise<BuildResult> {
  await emitProgress(job, "finalize", 0, 1, null, "started", "Ferdigstiller byggjobb...");

  // Build result files from context window
  const filesChanged: BuildResult["filesChanged"] = [];

  for (const step of job.plan.steps) {
    if (step.action === "create_file" || step.action === "modify_file") {
      const content = job.contextWindow[step.filePath!] || step.content || "";
      filesChanged.push({
        path: step.filePath!,
        content,
        action: step.action === "create_file" ? "create" : "modify",
      });
    } else if (step.action === "delete_file") {
      filesChanged.push({
        path: step.filePath!,
        content: "",
        action: "delete",
      });
    }
  }

  const result: BuildResult = {
    jobId: job.id,
    success: true,
    filesChanged,
    totalTokensUsed: job.totalTokensUsed,
    totalCostUsd: job.totalCostUsd,
    validationOutput,
    errors: [],
  };

  await emitProgress(job, "finalize", 1, 1, null, "completed", `Byggjobb ferdig: ${filesChanged.length} filer`);

  return result;
}

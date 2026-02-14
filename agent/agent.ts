import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { ai } from "~encore/clients";
import { github } from "~encore/clients";
import { linear } from "~encore/clients";
import { memory } from "~encore/clients";
import { docs } from "~encore/clients";
import { sandbox } from "~encore/clients";
import { users } from "~encore/clients";
import { agentReports } from "../chat/chat";
import {
  selectOptimalModel,
  calculateSavings,
  type ModelMode,
} from "../ai/router";
import type { AgentExecutionContext, AttemptRecord, ErrorPattern } from "./types";

// --- Database (audit log) ---

const db = new SQLDatabase("agent", { migrations: "./migrations" });

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
}

export interface StartTaskResponse {
  status: "started";
  taskId: string;
}

// TaskContext is now AgentExecutionContext from ./types
type TaskContext = AgentExecutionContext;

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

// --- The Agent Loop ---

async function executeTask(ctx: TaskContext): Promise<void> {
  const taskStart = Date.now();

  try {
    // === STEP 1: Understand the task ===
    await report(ctx, `📋 Leser task ${ctx.taskId}...`, "working");

    const taskDetail = await auditedStep(ctx, "task_read", { taskId: ctx.taskId }, async () => {
      const detail = await linear.getTask({ taskId: ctx.taskId });
      ctx.taskDescription = detail.task.title + "\n\n" + detail.task.description;
      return detail;
    });

    // === STEP 2: Read the project ===
    await report(ctx, "📂 Leser prosjektstruktur fra GitHub...", "working");

    const projectTree = await auditedStep(ctx, "project_tree_read", {
      owner: ctx.repoOwner,
      repo: ctx.repoName,
    }, () => github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName }));

    const relevantPaths = await auditedStep(ctx, "relevant_files_identified", {
      taskDescription: ctx.taskDescription.substring(0, 200),
    }, () => github.findRelevantFiles({
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      taskDescription: ctx.taskDescription,
      tree: projectTree.tree,
    }));

    const relevantFiles = await auditedStep(ctx, "files_read", {
      paths: relevantPaths.paths,
      fileCount: relevantPaths.paths.length,
    }, async () => {
      const files: Array<{ path: string; content: string }> = [];
      let totalTokensSaved = 0;

      for (const path of relevantPaths.paths) {
        // Get metadata first to decide reading strategy
        const meta = await github.getFileMetadata({
          owner: ctx.repoOwner,
          repo: ctx.repoName,
          path,
        });

        if (meta.totalLines <= SMALL_FILE_THRESHOLD) {
          // Small file: read full
          const file = await github.getFile({ owner: ctx.repoOwner, repo: ctx.repoName, path });
          files.push({ path, content: file.content });
        } else if (meta.totalLines <= MEDIUM_FILE_THRESHOLD) {
          // Medium file: read in chunks (up to MAX_CHUNKS_PER_FILE)
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

          // Estimate tokens saved
          const fullTokenEstimate = Math.ceil(meta.totalLines * 30 / 4); // ~30 chars/line, ~4 chars/token
          const readTokenEstimate = Math.ceil(content.length / 4);
          totalTokensSaved += Math.max(0, fullTokenEstimate - readTokenEstimate);

          files.push({ path, content });
        } else {
          // Large file (>500 lines): read only first and last chunks to give AI context
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

          // Estimate tokens saved
          const fullTokenEstimate = Math.ceil(meta.totalLines * 30 / 4);
          const readTokenEstimate = Math.ceil(content.length / 4);
          totalTokensSaved += Math.max(0, fullTokenEstimate - readTokenEstimate);

          files.push({ path, content });
        }
      }

      // Log tokens saved in audit
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
    await report(ctx, "🧠 Henter relevant kontekst og dokumentasjon...", "working");

    const memories = await auditedStep(ctx, "memory_searched", {
      query: ctx.taskDescription.substring(0, 200),
    }, () => memory.search({ query: ctx.taskDescription, limit: 10 }));

    const docsResults = await auditedStep(ctx, "docs_looked_up", {
      dependencyCount: Object.keys(projectTree.packageJson?.dependencies || {}).length,
    }, () => docs.lookupForTask({
      taskDescription: ctx.taskDescription,
      existingDependencies: projectTree.packageJson?.dependencies || {},
    }));

    // === STEP 4: Assess Confidence ===
    await report(ctx, "Vurderer min evne til å løse oppgaven...", "working");

    const confidenceResult = await auditedStep(ctx, "confidence_assessed", {}, async () => {
      const result = await ai.assessConfidence({
        taskDescription: ctx.taskDescription,
        projectStructure: projectTree.treeString,
        relevantFiles,
        memoryContext: memories.results.map((r) => r.content),
        docsContext: docsResults.docs.map((d) => `[${d.source}] ${d.content}`),
      });
      return result;
    });

    const { confidence } = confidenceResult;

    // Log confidence details separately for easy querying
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

    // Decision logic based on confidence
    if (confidence.overall < 60 || confidence.recommended_action === "clarify") {
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
      await report(ctx, msg, "needs_input");
      return;
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
      return;
    }

    await report(
      ctx,
      `Jeg er ${confidence.overall}% sikker på å løse dette. Starter arbeid...`,
      "working"
    );

    // === STEP 4.5: Assess complexity and select model ===
    let selectedModel: string;

    if (ctx.modelOverride) {
      // Bruker valgte manuelt modell for denne oppgaven
      selectedModel = ctx.modelOverride;
    } else if (ctx.modelMode === "manual") {
      // Manuell modus men ingen override — be bruker velge
      await report(ctx, "Hvilken modell vil du bruke?", "needs_input");
      return;
    } else {
      // Auto modus — vurder kompleksitet og velg
      const complexityResult = await auditedStep(ctx, "complexity_assessed", {
        modelMode: ctx.modelMode,
      }, () => ai.assessComplexity({
        taskDescription: ctx.taskDescription,
        projectStructure: projectTree.treeString.substring(0, 2000),
        fileCount: projectTree.tree.length,
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

    // === STEP 5: Plan the work ===
    await report(ctx, "Planlegger arbeidet...", "working");

    let plan = await auditedStep(ctx, "plan_created", {
      taskDescription: ctx.taskDescription.substring(0, 200),
      model: ctx.selectedModel,
    }, () => ai.planTask({
      task: `${ctx.taskDescription}\n\nUser context: ${ctx.userMessage}`,
      projectStructure: projectTree.treeString,
      relevantFiles,
      memoryContext: memories.results.map((r) => r.content),
      docsContext: docsResults.docs.map((d) => `[${d.source}] ${d.content}`),
      model: ctx.selectedModel,
    }));

    // Track cost
    ctx.totalCostUsd += plan.costUsd;
    ctx.totalTokensUsed += plan.tokensUsed;

    const planSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
    await report(
      ctx,
      `📝 Plan:\n${planSummary}\n\nBegrunnelse: ${plan.reasoning}`,
      "working"
    );

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

    // === STEP 6: Create sandbox and execute plan ===
    const sandboxId = await auditedStep(ctx, "sandbox_created", {
      repoOwner: ctx.repoOwner,
      repoName: ctx.repoName,
    }, () => sandbox.create({ repoOwner: ctx.repoOwner, repoName: ctx.repoName }));

    const allFiles: { path: string; content: string; action: string }[] = [];
    let lastError: string | null = null;
    const previousErrors: string[] = [];

    while (ctx.totalAttempts < ctx.maxAttempts) {
      ctx.totalAttempts++;
      const attemptStart = Date.now();

      try {
        // Execute each step in the plan with incremental validation
        for (let stepIdx = 0; stepIdx < plan.plan.length; stepIdx++) {
          const step = plan.plan[stepIdx];

          if (step.action === "create_file" || step.action === "modify_file") {
            let fileContent = step.content!;

            for (let fileAttempt = 0; fileAttempt <= MAX_FILE_FIX_RETRIES; fileAttempt++) {
              await auditedStep(ctx, "file_written", {
                path: step.filePath,
                action: step.action,
                contentLength: fileContent.length,
                fixAttempt: fileAttempt,
              }, () => sandbox.writeFile({
                sandboxId: sandboxId.id,
                path: step.filePath!,
                content: fileContent,
              }));

              if (step.filePath!.endsWith(".ts") || step.filePath!.endsWith(".tsx")) {
                const incVal = await auditedStep(ctx, "validation_incremental", {
                  filePath: step.filePath,
                  attempt: fileAttempt,
                }, () => sandbox.validateIncremental({
                  sandboxId: sandboxId.id,
                  filePath: step.filePath!,
                }));

                if (incVal.success) break;

                await audit({
                  sessionId: ctx.conversationId,
                  actionType: "validation_incremental_failed",
                  details: { filePath: step.filePath, errors: incVal.errors, attempt: fileAttempt },
                  success: false,
                  errorMessage: incVal.output.substring(0, 500),
                  taskId: ctx.taskId,
                  repoName: `${ctx.repoOwner}/${ctx.repoName}`,
                });

                if (fileAttempt < MAX_FILE_FIX_RETRIES) {
                  await report(ctx, `Feil i ${step.filePath} — fikser (forsøk ${fileAttempt + 1})...`, "working");

                  const fixResult = await auditedStep(ctx, "file_fix_requested", {
                    filePath: step.filePath,
                    errors: incVal.errors.slice(0, 5),
                    model: ctx.selectedModel,
                  }, () => ai.planTask({
                    task: `Fix TypeScript errors in ${step.filePath}:\n\n${incVal.output}\n\nOriginal task: ${ctx.taskDescription}`,
                    projectStructure: projectTree.treeString,
                    relevantFiles: [{ path: step.filePath!, content: fileContent }],
                    memoryContext: [],
                    docsContext: [],
                    errorMessage: incVal.output,
                    model: ctx.selectedModel,
                  }));

                  ctx.totalCostUsd += fixResult.costUsd;
                  ctx.totalTokensUsed += fixResult.tokensUsed;

                  const fixStep = fixResult.plan.find(
                    (s) => (s.action === "create_file" || s.action === "modify_file") && s.filePath === step.filePath
                  );
                  if (fixStep?.content) {
                    fileContent = fixStep.content;
                  } else {
                    break;
                  }
                }
              } else {
                break;
              }
            }

            allFiles.push({
              path: step.filePath!,
              content: fileContent,
              action: step.action === "create_file" ? "create" : "modify",
            });

          } else if (step.action === "delete_file") {
            await auditedStep(ctx, "file_deleted", { path: step.filePath }, () =>
              sandbox.deleteFile({ sandboxId: sandboxId.id, path: step.filePath! })
            );
            allFiles.push({ path: step.filePath!, content: "", action: "delete" });
          } else if (step.action === "run_command") {
            await auditedStep(ctx, "command_executed", { command: step.command }, () =>
              sandbox.runCommand({ sandboxId: sandboxId.id, command: step.command!, timeout: 60 })
            );
          }

          // Record attempt
          ctx.attemptHistory.push({
            stepIndex: stepIdx,
            action: step.action,
            result: "success",
            duration: Date.now() - attemptStart,
            tokensUsed: 0,
          });
        }

        // === STEP 7: Validate ===
        await report(ctx, "Validerer kode (typesjekk, lint, tester)...", "working");

        const validation = await auditedStep(ctx, "validation_run", {
          attempt: ctx.totalAttempts,
          maxRetries: ctx.maxAttempts,
        }, () => sandbox.validate({ sandboxId: sandboxId.id }));

        if (!validation.success) {
          lastError = validation.output;
          previousErrors.push(validation.output.substring(0, 500));

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
                projectStructure: projectTree.treeString,
                relevantFiles,
                memoryContext: memories.results.map((r) => r.content),
                docsContext: docsResults.docs.map((d) => `[${d.source}] ${d.content}`),
                previousAttempt: planSummary,
                errorMessage: validation.output,
                model: ctx.selectedModel,
              }));

              ctx.totalCostUsd += plan.costUsd;
              ctx.totalTokensUsed += plan.tokensUsed;
              continue;

            } else if (diagnosis.rootCause === "missing_context") {
              // Fetch more context and retry
              await report(ctx, `Mangler kontekst — henter mer informasjon...`, "working");

              const moreMemories = await memory.search({
                query: `${ctx.taskDescription} ${validation.output.substring(0, 200)}`,
                limit: 10,
              });

              plan = await auditedStep(ctx, "plan_retry_with_context", {
                extraMemories: moreMemories.results.length,
              }, () => ai.planTask({
                task: ctx.taskDescription,
                projectStructure: projectTree.treeString,
                relevantFiles,
                memoryContext: moreMemories.results.map((r) => r.content),
                docsContext: docsResults.docs.map((d) => `[${d.source}] ${d.content}`),
                errorMessage: validation.output,
                model: ctx.selectedModel,
              }));

              ctx.totalCostUsd += plan.costUsd;
              ctx.totalTokensUsed += plan.tokensUsed;
              continue;

            } else if (diagnosis.rootCause === "impossible_task") {
              // Escalate to human
              await report(ctx, `Denne oppgaven ser umulig ut: ${diagnosis.reason}`, "needs_input");
              await linear.updateTask({
                taskId: ctx.taskId,
                state: "blocked",
                comment: `TheFold klarer ikke denne oppgaven: ${diagnosis.reason}`,
              });
              return;

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
              projectStructure: projectTree.treeString,
              relevantFiles,
              memoryContext: memories.results.map((r) => r.content),
              docsContext: docsResults.docs.map((d) => `[${d.source}] ${d.content}`),
              previousAttempt: planSummary,
              errorMessage: validation.output,
              model: ctx.selectedModel,
            }));

            ctx.totalCostUsd += plan.costUsd;
            ctx.totalTokensUsed += plan.tokensUsed;
            continue;
          }

          throw new Error(`Validation failed after ${ctx.maxAttempts} attempts: ${validation.output}`);
        }

        // Validation passed!
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

    // === STEP 8: Review own work ===
    await report(ctx, "📖 Reviewer koden og skriver dokumentasjon...", "working");

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
      memoryContext: memories.results.map((r) => r.content),
      model: ctx.selectedModel,
    }));

    ctx.totalCostUsd += review.costUsd;
    ctx.totalTokensUsed += review.tokensUsed;

    // === STEP 9: Commit and create PR ===
    await report(ctx, "🚀 Oppretter branch og pull request...", "working");

    const branchName = `thefold/${ctx.taskId.toLowerCase().replace(/\s+/g, "-")}`;

    const pr = await auditedStep(ctx, "pr_created", {
      branch: branchName,
      filesChanged: allFiles.map((f) => f.path),
    }, () => github.createPR({
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      branch: branchName,
      title: `[TheFold] ${taskDetail.task.title}`,
      body: review.documentation,
      files: allFiles.map((f) => ({
        path: f.path,
        content: f.content,
        action: f.action as "create" | "modify" | "delete",
      })),
    }));

    // === STEP 10: Update Linear ===
    await auditedStep(ctx, "linear_updated", {
      taskId: ctx.taskId,
      newState: "in_review",
    }, () => linear.updateTask({
      taskId: ctx.taskId,
      state: "in_review",
      comment: `## TheFold har fullført denne oppgaven\n\n${review.documentation}\n\n**PR:** ${pr.url}\n**Kvalitetsvurdering:** ${review.qualityScore}/10\n\n${review.concerns.length > 0 ? "**Bekymringer:**\n" + review.concerns.map((c) => `- ${c}`).join("\n") : "Ingen bekymringer."}`,
    }));

    // === STEP 11: Store memories + error patterns ===
    for (const mem of review.memoriesExtracted) {
      await auditedStep(ctx, "memory_stored", {
        content: mem.substring(0, 200),
        category: "decision",
      }, () => memory.store({
        content: mem,
        category: "decision",
        linearTaskId: ctx.taskId,
        memoryType: "decision",
        sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
        sourceTaskId: ctx.taskId,
      }));
    }

    // Store error patterns for future learning
    if (previousErrors.length > 0) {
      const errorSummary = previousErrors.join("\n---\n").substring(0, 3000);
      await memory.store({
        content: `Error patterns from task ${ctx.taskId}:\n${errorSummary}\n\nResolution: Task completed after ${ctx.totalAttempts} attempts with ${ctx.planRevisions} plan revisions.`,
        category: "error_pattern",
        memoryType: "error_pattern",
        sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
        sourceTaskId: ctx.taskId,
        tags: ["error_pattern", "auto_resolved"],
        ttlDays: 180,
      });
    }

    // === STEP 12: Clean up sandbox ===
    await auditedStep(ctx, "sandbox_destroyed", {
      sandboxId: sandboxId.id,
    }, () => sandbox.destroy({ sandboxId: sandboxId.id }));

    // === STEP 13: Report completion ===
    const changedPaths = allFiles.map((f) => f.path);

    const savings = calculateSavings(ctx.totalTokensUsed, 0, ctx.selectedModel);

    await audit({
      sessionId: ctx.conversationId,
      actionType: "task_completed",
      details: {
        filesChanged: changedPaths,
        qualityScore: review.qualityScore,
        concerns: review.concerns,
        totalDurationMs: Date.now() - taskStart,
        attempts: ctx.totalAttempts,
        prUrl: pr.url,
        costTracking: {
          totalCostUsd: ctx.totalCostUsd,
          totalTokensUsed: ctx.totalTokensUsed,
          modelUsed: ctx.selectedModel,
          modelMode: ctx.modelMode,
          savedVsOpusUsd: savings.savedUsd,
          savedVsOpusPercent: savings.savedPercent,
        },
      },
      success: true,
      taskId: ctx.taskId,
      repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      durationMs: Date.now() - taskStart,
    });

    const costLine = `💰 **Kostnad:** $${ctx.totalCostUsd.toFixed(4)} (${ctx.totalTokensUsed} tokens med ${ctx.selectedModel})`;
    const savingsLine = savings.savedPercent > 0
      ? `\n📉 **Spart:** $${savings.savedUsd.toFixed(4)} (${savings.savedPercent.toFixed(0)}% vs Opus)`
      : "";

    await report(
      ctx,
      `✅ **Ferdig med ${ctx.taskId}**\n\n${review.documentation}\n\n📎 **PR:** ${pr.url}\n⭐ **Kvalitet:** ${review.qualityScore}/10\n${costLine}${savingsLine}${review.concerns.length > 0 ? "\n\n⚠️ **Ting å se på:**\n" + review.concerns.map((c) => `- ${c}`).join("\n") : ""}`,
      "completed",
      { prUrl: pr.url, filesChanged: changedPaths }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

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
      `❌ **Feil under arbeid med ${ctx.taskId}:**\n\`\`\`\n${errorMsg}\n\`\`\`\n\nJeg klarte ikke å fullføre denne oppgaven automatisk. Kan du hjelpe meg med mer kontekst, eller skal jeg prøve en annen tilnærming?`,
      "failed"
    );

    // Update Linear
    await linear.updateTask({
      taskId: ctx.taskId,
      comment: `TheFold feilet på denne oppgaven: ${errorMsg}`,
    });
  }
}

// --- Endpoints ---

// Start working on a task (called from chat or cron)
export const startTask = api(
  { method: "POST", path: "/agent/start", expose: false },
  async (req: StartTaskRequest): Promise<StartTaskResponse> => {
    // Hent brukerens modellpreferanse
    let modelMode: ModelMode = "auto";
    if (req.userId) {
      try {
        const userInfo = await users.getUser({ userId: req.userId });
        const prefs = userInfo.preferences as Record<string, unknown>;
        if (prefs.modelMode && ["auto", "manual"].includes(prefs.modelMode as string)) {
          modelMode = prefs.modelMode as ModelMode;
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
      repoOwner: REPO_OWNER,
      repoName: REPO_NAME,
      branch: "main",
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
    };

    // Fire and forget — agent reports progress via pub/sub
    executeTask(ctx).catch((err) => {
      console.error(`Agent task ${req.taskId} failed:`, err);
    });

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

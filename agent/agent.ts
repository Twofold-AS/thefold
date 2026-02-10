import { api, APIError } from "encore.dev/api";
import { ai } from "~encore/clients";
import { github } from "~encore/clients";
import { linear } from "~encore/clients";
import { memory } from "~encore/clients";
import { docs } from "~encore/clients";
import { sandbox } from "~encore/clients";
import { agentReports } from "../chat/chat";

// --- Types ---

export interface StartTaskRequest {
  conversationId: string;
  taskId: string;
  userMessage: string;
}

export interface StartTaskResponse {
  status: "started";
  taskId: string;
}

interface TaskContext {
  conversationId: string;
  taskId: string;
  taskDescription: string;
  userMessage: string;
  repoOwner: string;
  repoName: string;
  branch: string;
}

const MAX_RETRIES = 3;

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

// --- The Agent Loop ---

async function executeTask(ctx: TaskContext): Promise<void> {
  try {
    // === STEP 1: Understand the task ===
    await report(ctx, `📋 Leser task ${ctx.taskId}...`, "working");

    const taskDetail = await linear.getTask({ taskId: ctx.taskId });
    ctx.taskDescription = taskDetail.task.title + "\n\n" + taskDetail.task.description;

    // === STEP 2: Read the project ===
    await report(ctx, "📂 Leser prosjektstruktur fra GitHub...", "working");

    const projectTree = await github.getTree({
      owner: ctx.repoOwner,
      repo: ctx.repoName,
    });

    // Determine which files are relevant based on task description
    const relevantPaths = await github.findRelevantFiles({
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      taskDescription: ctx.taskDescription,
      tree: projectTree.tree,
    });

    const relevantFiles = await Promise.all(
      relevantPaths.paths.map(async (path) => {
        const file = await github.getFile({
          owner: ctx.repoOwner,
          repo: ctx.repoName,
          path,
        });
        return { path, content: file.content };
      })
    );

    // === STEP 3: Gather context ===
    await report(ctx, "🧠 Henter relevant kontekst og dokumentasjon...", "working");

    const memories = await memory.search({
      query: ctx.taskDescription,
      limit: 10,
    });

    // Extract library names from task to look up docs
    const docsResults = await docs.lookupForTask({
      taskDescription: ctx.taskDescription,
      existingDependencies: projectTree.packageJson?.dependencies || {},
    });

    // === STEP 4: Plan the work ===
    await report(ctx, "🔧 Planlegger arbeidet...", "working");

    let plan = await ai.planTask({
      task: `${ctx.taskDescription}\n\nUser context: ${ctx.userMessage}`,
      projectStructure: projectTree.treeString,
      relevantFiles,
      memoryContext: memories.results.map((r) => r.content),
      docsContext: docsResults.docs.map((d) => `[${d.source}] ${d.content}`),
    });

    const planSummary = plan.plan.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
    await report(
      ctx,
      `📝 Plan:\n${planSummary}\n\nBegrunnelse: ${plan.reasoning}`,
      "working"
    );

    // === STEP 5: Create sandbox and execute plan ===
    const sandboxId = await sandbox.create({
      repoOwner: ctx.repoOwner,
      repoName: ctx.repoName,
    });

    const allFiles: { path: string; content: string; action: string }[] = [];
    let attempt = 0;
    let lastError: string | null = null;

    while (attempt < MAX_RETRIES) {
      attempt++;

      try {
        // Execute each step in the plan
        for (const step of plan.plan) {
          if (step.action === "create_file" || step.action === "modify_file") {
            await sandbox.writeFile({
              sandboxId: sandboxId.id,
              path: step.filePath!,
              content: step.content!,
            });
            allFiles.push({
              path: step.filePath!,
              content: step.content!,
              action: step.action === "create_file" ? "create" : "modify",
            });
          } else if (step.action === "delete_file") {
            await sandbox.deleteFile({
              sandboxId: sandboxId.id,
              path: step.filePath!,
            });
            allFiles.push({ path: step.filePath!, content: "", action: "delete" });
          } else if (step.action === "run_command") {
            await sandbox.runCommand({
              sandboxId: sandboxId.id,
              command: step.command!,
              timeout: 60,
            });
          }
        }

        // === STEP 6: Validate ===
        await report(ctx, "✅ Validerer kode (typesjekk, lint)...", "working");

        const validation = await sandbox.validate({ sandboxId: sandboxId.id });

        if (!validation.success) {
          lastError = validation.output;

          if (attempt < MAX_RETRIES) {
            await report(
              ctx,
              `⚠️ Validering feilet (forsøk ${attempt}/${MAX_RETRIES}):\n\`\`\`\n${validation.output.substring(0, 500)}\n\`\`\`\nPrøver å fikse...`,
              "working"
            );

            // Re-plan with error context
            plan = await ai.planTask({
              task: ctx.taskDescription,
              projectStructure: projectTree.treeString,
              relevantFiles,
              memoryContext: memories.results.map((r) => r.content),
              docsContext: docsResults.docs.map((d) => `[${d.source}] ${d.content}`),
              previousAttempt: planSummary,
              errorMessage: validation.output,
            });

            continue; // retry
          }

          throw new Error(`Validation failed after ${MAX_RETRIES} attempts: ${validation.output}`);
        }

        // Validation passed! Break out of retry loop.
        break;
      } catch (error) {
        if (attempt >= MAX_RETRIES) throw error;
      }
    }

    // === STEP 7: Review own work ===
    await report(ctx, "📖 Reviewer koden og skriver dokumentasjon...", "working");

    const validationOutput = await sandbox.validate({ sandboxId: sandboxId.id });
    const review = await ai.reviewCode({
      taskDescription: ctx.taskDescription,
      filesChanged: allFiles.map((f) => ({
        path: f.path,
        content: f.content,
        action: f.action as "create" | "modify" | "delete",
      })),
      validationOutput: validationOutput.output,
      memoryContext: memories.results.map((r) => r.content),
    });

    // === STEP 8: Commit and create PR ===
    await report(ctx, "🚀 Oppretter branch og pull request...", "working");

    const branchName = `thefold/${ctx.taskId.toLowerCase().replace(/\s+/g, "-")}`;

    const pr = await github.createPR({
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
    });

    // === STEP 9: Update Linear ===
    await linear.updateTask({
      taskId: ctx.taskId,
      state: "in_review",
      comment: `## TheFold har fullført denne oppgaven\n\n${review.documentation}\n\n**PR:** ${pr.url}\n**Kvalitetsvurdering:** ${review.qualityScore}/10\n\n${review.concerns.length > 0 ? "**Bekymringer:**\n" + review.concerns.map((c) => `- ${c}`).join("\n") : "Ingen bekymringer."}`,
    });

    // === STEP 10: Store memories ===
    for (const mem of review.memoriesExtracted) {
      await memory.store({
        content: mem,
        category: "decision",
        linearTaskId: ctx.taskId,
      });
    }

    // === STEP 11: Clean up sandbox ===
    await sandbox.destroy({ sandboxId: sandboxId.id });

    // === STEP 12: Report completion ===
    const changedPaths = allFiles.map((f) => f.path);

    await report(
      ctx,
      `✅ **Ferdig med ${ctx.taskId}**\n\n${review.documentation}\n\n📎 **PR:** ${pr.url}\n⭐ **Kvalitet:** ${review.qualityScore}/10${review.concerns.length > 0 ? "\n\n⚠️ **Ting å se på:**\n" + review.concerns.map((c) => `- ${c}`).join("\n") : ""}`,
      "completed",
      { prUrl: pr.url, filesChanged: changedPaths }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

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
    // Run the task asynchronously — don't block the caller
    // In production, this should use a job queue
    const ctx: TaskContext = {
      conversationId: req.conversationId,
      taskId: req.taskId,
      taskDescription: "", // filled in during execution
      userMessage: req.userMessage,
      repoOwner: "your-org",  // from config/memory
      repoName: "your-project",
      branch: "main",
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

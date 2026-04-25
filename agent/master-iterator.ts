// agent/master-iterator.ts
// Runde 2c — Master-task flow iteration.
//
// When the AI has decomposed a master task into phased sub-tasks (via the
// `create_subtask` tool), `start_task` routes here instead of running one
// monolithic `executeTask`. We iterate sub-tasks sequentially, sorted by
// phase (ascending string compare — "0-read" < "1-scaffold" < ...), then
// by creation order, and execute each one with a reduced retry budget and
// `skipReview: true` so we don't gate each phase.
//
// Failure modes (sub-task returns `failed` OR throws):
//   - Master → `needs_input` with errorMessage describing the failing phase.
//   - An `agent.sleeping` SSE event is emitted (Runde 2d).
//   - Remaining sub-tasks STAY in their pending state — resume picks up
//     the first non-done sub-task.
//
// All sub-tasks complete: master → `done`. A final review/PR can still
// happen at master level if a Runde-2-extension decides to.

import log from "encore.dev/log";
import type { AgentExecutionContext } from "./types";
// LAZY: importing executeTask from "./agent" at module level creates a
// circular static import (agent.ts → dynamic master-iterator.ts → static
// agent.ts). Encore-parser follows dynamic imports too, so the cycle ends
// up in the bundle and freezes module init at boot — only gateway/agent/
// ai's db.ts IIFEs fired before everything else stalled. Resolved inside
// `executeMasterTask` via dynamic import.
import type { ExecuteTaskOptions, ExecuteTaskResult } from "./agent";
import { agentEventBus } from "./event-bus";
import { createAgentEvent } from "./events";
import { consumeInterrupt } from "./plan-coordinator";
// LAZY: same reason — keep the module-load graph free of cross-service
// client wiring at boot. Resolved inside the handler.

interface SubTaskLike {
  id: string;
  title: string;
  description: string | null;
  status: string;
  phase: string | null;
  dependsOn: string[] | null;
  labels: string[] | null;
}

/** Stable sort: phase ascending (null = last), then createdAt order. */
function sortByPhase<T extends SubTaskLike>(subs: T[]): T[] {
  return [...subs].sort((a, b) => {
    const ap = a.phase ?? "~"; // tilde sorts after digits so unphased go last
    const bp = b.phase ?? "~";
    if (ap !== bp) return ap < bp ? -1 : 1;
    return 0; // preserve original (createdAt) order within same phase
  });
}

/** A sub-task is "ready" if all of its `dependsOn` ids are already done. */
function readyFilter(sub: SubTaskLike, doneIds: Set<string>): boolean {
  if (!sub.dependsOn || sub.dependsOn.length === 0) return true;
  return sub.dependsOn.every((id) => doneIds.has(id));
}

export interface ExecuteMasterResult {
  /** Total sub-tasks found. */
  total: number;
  /** Sub-tasks that ran this invocation (successfully completed). */
  completed: number;
  /** True when all sub-tasks are now `done`. */
  allDone: boolean;
  /** Set when a sub-task failed — master goes to needs_input. */
  sleepingSubTaskId?: string;
  sleepingReason?: string;
}

/**
 * Iterate sub-tasks of `masterCtx.thefoldTaskId`. Returns early (without
 * aborting master) when a sub-task fails — caller marks master
 * needs_input + emits sleeping event (Runde 2d wires that).
 */
export async function executeMasterTask(
  masterCtx: AgentExecutionContext,
  options?: ExecuteTaskOptions,
): Promise<ExecuteMasterResult> {
  const masterId = masterCtx.thefoldTaskId;
  if (!masterId) {
    return { total: 0, completed: 0, allDone: false };
  }

  // Lazy resolves — see header comment for why these aren't top-level.
  const { executeTask } = await import("./agent");
  const { tasks: tasksClient } = await import("~encore/clients");

  const subRes = await tasksClient.listSubTasks({ parentId: masterId });
  const subs = subRes.tasks as unknown as SubTaskLike[];
  if (subs.length === 0) {
    return { total: 0, completed: 0, allDone: false };
  }

  const sorted = sortByPhase(subs);
  const doneIds = new Set<string>(sorted.filter((s) => s.status === "done").map((s) => s.id));
  let completed = 0;
  const streamKey = masterCtx.conversationId;

  log.info("master-iterator: starting", {
    masterId,
    subCount: subs.length,
    alreadyDone: doneIds.size,
  });

  for (const sub of sorted) {
    if (sub.status === "done") continue;

    // Sprint A — Touch task_transient memories knyttet til denne masteren
    // før sub-tasken starter. Gir 24h-buffer for at cleanup-cron ikke
    // sletter mid-task selv om master-task er ikke-done.
    try {
      const { memory: memoryClient } = await import("~encore/clients");
      await memoryClient.touchByTags({ tags: [`task:${masterId}`] });
    } catch (err) {
      // Non-critical — cleanup-watchdog er fortsatt 7-dager-backstop.
      log.warn("master-iterator: touchByTags failed (continuing)", {
        masterId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Runde 3-B — Soft-pause check between sub-tasks. If user has called
    // /agent/interrupt-master, stop here, mark master `needs_input`, and
    // emit agent.interrupted with the user message so the agent can
    // respond in chat.
    const interruptMsg = consumeInterrupt(masterId);
    if (interruptMsg !== undefined) {
      log.info("master-iterator: interrupted by user", {
        masterId,
        nextSubId: sub.id,
        userMsgLen: interruptMsg.length,
      });
      agentEventBus.emit(
        streamKey,
        createAgentEvent("agent.interrupted", {
          masterTaskId: masterId,
          pausedSubTaskId: sub.id,
          userMessage: interruptMsg,
        }),
      );
      return {
        total: subs.length,
        completed,
        allDone: false,
        sleepingSubTaskId: sub.id,
        sleepingReason: `Avbrutt av bruker: ${interruptMsg}`,
      };
    }

    if (sub.status === "blocked") {
      // Stuck sub-task — master was already in needs_input. Skip until resume.
      log.info("master-iterator: skipping blocked sub-task", { subId: sub.id, title: sub.title });
      return {
        total: subs.length,
        completed,
        allDone: false,
        sleepingSubTaskId: sub.id,
        sleepingReason: "Tidligere fase feilet. Trenger bruker-input for å fortsette.",
      };
    }
    if (!readyFilter(sub, doneIds)) {
      // Dependency not done yet — since we're sequential, this means a
      // dependency failed. Stop.
      log.info("master-iterator: dependency missing", { subId: sub.id, dependsOn: sub.dependsOn });
      return {
        total: subs.length,
        completed,
        allDone: false,
        sleepingSubTaskId: sub.id,
        sleepingReason: `Avhengig av et tidligere steg som ikke fullførte.`,
      };
    }

    // Build sub-context inheriting repo/conv/model from master.
    // Sprint A — masterTaskId-tag binder denne sub-tasken til masteren
    // for task_transient-arv på tvers av Phase 0/N+.
    const subCtx: AgentExecutionContext = {
      ...masterCtx,
      taskId: sub.id,
      thefoldTaskId: sub.id,
      masterTaskId: masterCtx.thefoldTaskId ?? masterCtx.taskId,
      taskDescription: [sub.title, sub.description ?? ""].filter(Boolean).join("\n\n"),
      // Reduced retry budget per sub-task — each phase should be focused
      // enough that 2 tries is plenty; master aggregates.
      totalAttempts: 0,
      attemptHistory: [],
      errorPatterns: [],
      maxAttempts: 2,
      planRevisions: 0,
      maxPlanRevisions: 1,
    };

    agentEventBus.emit(
      streamKey,
      createAgentEvent("agent.status", {
        status: "working",
        phase: "subtask",
        message: `Sub-task: ${sub.title}${sub.phase ? ` (${sub.phase})` : ""}`,
      }),
    );

    await tasksClient.updateTaskStatus({ id: sub.id, status: "in_progress" });

    let result: ExecuteTaskResult;
    try {
      result = await executeTask(subCtx, {
        ...options,
        skipReview: true, // no per-phase review gate
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("master-iterator: sub-task threw", { subId: sub.id, error: msg });
      await tasksClient.updateTaskStatus({
        id: sub.id,
        status: "blocked",
        errorMessage: msg.substring(0, 500),
      });
      return {
        total: subs.length,
        completed,
        allDone: false,
        sleepingSubTaskId: sub.id,
        sleepingReason: msg,
      };
    }

    // Success signals — ExecuteTaskResult has multiple shapes depending on
    // the path taken (planOnly/pending_review/collectOnly/failed).
    const resAny = result as unknown as {
      status?: string;
      success?: boolean;
      phase?: string;
      error?: string;
    };
    const isSuccess =
      resAny.success === true ||
      resAny.status === "completed" ||
      resAny.status === "pending_review" ||
      resAny.status === "planOnly_done";

    if (!isSuccess) {
      const reason =
        resAny.error ||
        (resAny.status ? `Sub-task endte i status "${resAny.status}"` : "Sub-task feilet");
      log.info("master-iterator: sub-task failed", { subId: sub.id, status: resAny.status });
      await tasksClient.updateTaskStatus({
        id: sub.id,
        status: "blocked",
        errorMessage: String(reason).substring(0, 500),
      });
      return {
        total: subs.length,
        completed,
        allDone: false,
        sleepingSubTaskId: sub.id,
        sleepingReason: String(reason),
      };
    }

    // Sprint A — Persister sub-task-output som task_transient memories så
    // neste sub-task kan gjenbruke filer/scrapes uten re-fetch (Phase 0 →
    // Phase N+ inheritance). Fire-and-forget — feiler ikke sub-task hvis
    // memory.store har en bug.
    try {
      await persistSubTaskOutput(masterCtx, sub, result);
    } catch (err) {
      log.warn("master-iterator: persistSubTaskOutput failed (continuing)", {
        subId: sub.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await tasksClient.updateTaskStatus({ id: sub.id, status: "done" });
    doneIds.add(sub.id);
    completed += 1;
    log.info("master-iterator: sub-task done", {
      subId: sub.id,
      phase: sub.phase,
      title: sub.title,
      ranSoFar: completed,
    });
  }

  return {
    total: subs.length,
    completed,
    allDone: true,
  };
}

// Sprint A — Skriv sub-task's filesContent + web_scrape-resultater til
// memories med permanence='task_transient'. Tags inkluderer task-id +
// per-fil/scrape-tag for senere lookup. Skip embedding (per memory.store-
// regel for task_transient). Cleanup-cron sletter etter master done > 24h.
async function persistSubTaskOutput(
  masterCtx: AgentExecutionContext,
  sub: SubTaskLike,
  result: ExecuteTaskResult,
): Promise<void> {
  const { memory: memoryClient } = await import("~encore/clients");
  const masterId = masterCtx.thefoldTaskId ?? masterCtx.taskId;
  if (!masterId) return;

  // 1. Filer skrevet/lest av sub-tasken
  const filesContent = (result as unknown as {
    filesContent?: Array<{ path: string; content: string; action?: string }>;
  }).filesContent;

  if (Array.isArray(filesContent)) {
    for (const file of filesContent) {
      if (!file.path || !file.content) continue;
      // Cap content til 50k chars per memory (samme som maxChars i repo_read_file)
      // for å unngå at en kjempefil blokkerer DB-en.
      const trimmed = file.content.length > 50_000
        ? file.content.slice(0, 50_000) + "\n[truncated to 50k chars]"
        : file.content;
      try {
        await memoryClient.store({
          content: trimmed,
          category: "task_file",
          memoryType: "session",
          conversationId: masterCtx.conversationId,
          sourceRepo: masterCtx.repoName,
          tags: [
            `task:${masterId}`,
            `file:${file.path}`,
            `phase:${sub.phase ?? "unknown"}`,
            `action:${file.action ?? "unknown"}`,
          ],
          permanence: "task_transient",
          projectId: masterCtx.projectId,
          ttlDays: 1, // backstop hvis cleanup-cron av en eller annen grunn ikke kjører
          trustLevel: "agent",
        });
      } catch (err) {
        log.warn("persistSubTaskOutput: store-file failed", {
          path: file.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    log.info("persistSubTaskOutput: persisted files", {
      subId: sub.id,
      fileCount: filesContent.length,
    });
  }

  // 2. Web-scrape-resultater fra denne sub-tasken (ekstrahert fra
  //    iteration-history hvis tool-loop eksponerer det).
  // ExecuteTaskResult inkluderer ikke per-tool-history i nåværende
  // signatur — dette er foreløpig en no-op her. AI-en vil typisk kalle
  // save_project_fact for stable scrape-derived fakta uansett, og 24h-
  // scrape-cache i chat-service forhindrer re-fetching av samme URL
  // innen samme tidsvindu.
  // (Fremtidig hook: utvide ExecuteTaskResult med toolUsageHistory og
  // ekstraktere web_scrape her. Holder den enkel for første pass.)
}

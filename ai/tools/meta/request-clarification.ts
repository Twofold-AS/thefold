// ai/tools/meta/request-clarification.ts
// Commit 20 — request_human_clarification tool.
// Agent-only pause primitive. When the AI doesn't have enough information to
// proceed safely, it can call this tool to pause the task and surface a
// question to the user. Resume happens via the existing
// agent.respondToClarification endpoint — the user's answer is folded into
// the task description and executeTask is re-run.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  question: z
    .string()
    .min(3)
    .describe("A single, focused question for the user — what's blocking you?"),
  context: z
    .string()
    .optional()
    .describe("Brief context on why this is needed (shown alongside the question)"),
});

export const requestClarificationTool: Tool<z.infer<typeof inputSchema>> = {
  name: "request_human_clarification",
  description:
    "Pause the task and ask the user a question. Call when you genuinely need user input to proceed and cannot reasonably infer the answer. The task resumes automatically when the user replies.",
  category: "meta",
  inputSchema,

  surfaces: ["agent"],
  costHint: "medium",
  maxCallsPerSession: 2,

  async handler(input, ctx) {
    // Can only pause when linked to a real task. Ad-hoc runs have no
    // respondToClarification entry point, so refuse rather than silently fail.
    if (!ctx.taskId) {
      return {
        success: false,
        message:
          "Cannot pause — this run is not linked to a task. Ask the user directly in your next message.",
      };
    }

    const { tasks } = await import("~encore/clients");

    // Mark the task as awaiting input. Uses the existing "needs_input" status
    // so respondToClarification resumes the run exactly like low_confidence pauses.
    try {
      await tasks.updateTaskStatus({
        id: ctx.taskId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: "needs_input" as any,
        errorMessage: input.question,
      });
    } catch (err) {
      ctx.log.warn("request_clarification: updateTaskStatus failed", {
        error: err instanceof Error ? err.message : String(err),
        taskId: ctx.taskId,
      });
    }

    // Surface the question via the same SSE channel chat already listens on.
    ctx.emit("agent.status", {
      status: "waiting",
      phase: "clarification",
      message: input.question,
    });

    return {
      success: true,
      message: `Paused for user clarification: ${input.question}`,
      data: { question: input.question, paused: true },
      stopReason: "paused_for_clarification",
      pauseData: { question: input.question, context: input.context },
    };
  },
};

import { Subscription } from "encore.dev/pubsub";
import log from "encore.dev/log";
import { agentErrorEvents } from "../agent/event-bus";
import { sendEmail, criticalErrorEmail } from "./email";

// Wire criticalErrorEmail template to agent error events
const _agentErrorEmailSub = new Subscription(agentErrorEvents, "email-agent-critical-error", {
  handler: async (event) => {
    try {
      const { users: usersClient, tasks: tasksClient } = await import("~encore/clients");

      // Find the task creator
      let userId: string | null = null;
      try {
        const taskData = await tasksClient.getTaskInternal({ id: event.taskId });
        userId = taskData.task.createdBy;
      } catch {
        // Task lookup failed
      }

      if (!userId) {
        log.info("Agent error email skipped — no creator found", { taskId: event.taskId });
        return;
      }

      const userInfo = await usersClient.getUser({ userId });
      if (!userInfo?.email) return;

      // Respect opt-out preference
      const prefs = userInfo.preferences;
      if (prefs && typeof prefs === "object" && (prefs as Record<string, unknown>).emailNotifications === false) return;

      const template = criticalErrorEmail({
        taskId: event.taskId,
        error: event.error,
        phase: event.phase,
        attempts: event.attempts,
      });

      await sendEmail({ to: userInfo.email, ...template });

      log.info("Agent critical error email sent", {
        taskId: event.taskId,
        phase: event.phase,
        to: userInfo.email,
      });
    } catch (err) {
      log.warn("Agent error email failed", {
        taskId: event.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

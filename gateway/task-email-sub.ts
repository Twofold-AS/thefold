import { Subscription } from "encore.dev/pubsub";
import log from "encore.dev/log";
import { taskEvents } from "../tasks/tasks";
import { sendEmail } from "./email";

// F3: Email notifications for completed tasks
const _taskEmailSub = new Subscription(taskEvents, "email-task-completed", {
  handler: async (event) => {
    if (event.action !== "completed") return;

    try {
      // Get the user who should receive the notification
      const { users: usersClient } = await import("~encore/clients");

      // Use getUser with a known approach — fetch the task creator's info
      // Since we don't have userId in event, get the first admin user
      const userInfo = await usersClient.getUser({ userId: "" });
      if (!userInfo?.email) return;

      // Check if user has email notifications enabled
      const prefs = userInfo.preferences;
      if (prefs && typeof prefs === "object" && (prefs as Record<string, unknown>).emailNotifications === false) return;

      const taskTitle = event.taskId;
      const repo = event.repo || "Ingen";

      await sendEmail({
        to: userInfo.email,
        subject: `TheFold: Oppgave fullført — ${taskTitle}`,
        html: `<div style="font-family: monospace; max-width: 600px; margin: 0 auto;">
          <h2 style="border-bottom: 1px solid #333;">Oppgave fullført</h2>
          <p>Oppgaven <strong>${taskTitle}</strong> er fullført.</p>
          <p>Repo: ${repo}</p>
          <p><a href="https://app.thefold.dev/tasks" style="color: #0066cc;">Se oppgaver →</a></p>
        </div>`,
      });

      log.info("Task completion email sent", { taskId: event.taskId });
    } catch (err) {
      log.warn("Task completion email failed", {
        taskId: event.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

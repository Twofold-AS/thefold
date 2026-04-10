import { Subscription } from "encore.dev/pubsub";
import log from "encore.dev/log";
import { taskEvents } from "../tasks/tasks";
import { sendEmail, jobCompletionEmail } from "./email";

// Wire jobCompletionEmail template to task completion events
const _taskEmailSub = new Subscription(taskEvents, "email-task-completed", {
  handler: async (event) => {
    if (event.action !== "completed") return;

    try {
      const { users: usersClient, tasks: tasksClient } = await import("~encore/clients");

      // Look up the task to find who created it and review metadata
      let userId: string | null = null;
      let taskTitle = event.taskId;
      let prUrl = "https://app.thefold.dev/tasks";
      let filesChanged = 0;
      let costUsd = 0;
      let qualityScore: number | undefined;

      try {
        const taskData = await tasksClient.getTaskInternal({ id: event.taskId });
        userId = taskData.task.createdBy;
        taskTitle = taskData.task.title;
        prUrl = taskData.task.prUrl || prUrl;
      } catch {
        // Task lookup failed — fall back to taskId as title
      }

      if (!userId) {
        log.info("Task completion email skipped — no creator", { taskId: event.taskId });
        return;
      }

      const userInfo = await usersClient.getUser({ userId });
      if (!userInfo?.email) return;

      // Respect opt-out preference
      const prefs = userInfo.preferences;
      if (prefs && typeof prefs === "object" && (prefs as Record<string, unknown>).emailNotifications === false) return;

      // Fetch review data for quality score and file count if available
      try {
        const { agent: agentClient } = await import("~encore/clients");
        const reviews = await agentClient.listReviews({ taskId: event.taskId, limit: 1 });
        const review = reviews.reviews?.[0];
        if (review) {
          filesChanged = review.fileCount ?? 0;
          qualityScore = review.qualityScore ?? undefined;
          prUrl = review.prUrl || prUrl;
        }
      } catch {
        // Review lookup is optional
      }

      const template = jobCompletionEmail({
        taskTitle,
        prUrl,
        filesChanged,
        costUsd,
        qualityScore,
      });

      await sendEmail({ to: userInfo.email, ...template });

      log.info("Task completion email sent", { taskId: event.taskId, to: userInfo.email });
    } catch (err) {
      log.warn("Task completion email failed", {
        taskId: event.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

import { Subscription } from "encore.dev/pubsub";
import log from "encore.dev/log";
import { healingEvents } from "../registry/registry";
import { sendEmail, healingReportEmail } from "./email";

// Wire healingReportEmail template to registry healing events
const _healingEmailSub = new Subscription(healingEvents, "email-healing-report", {
  handler: async (event) => {
    try {
      const { users: usersClient } = await import("~encore/clients");

      // Send healing report to all users with admin role (or first admin found)
      let adminEmail: string | null = null;
      try {
        const adminUsers = await usersClient.listAdmins({});
        adminEmail = adminUsers.users?.[0]?.email ?? null;
      } catch {
        // listAdmins may not exist — fall back gracefully
      }

      if (!adminEmail) {
        log.info("Healing report email skipped — no admin email found", {
          componentId: event.componentId,
        });
        return;
      }

      const template = healingReportEmail({
        componentsScanned: 1,
        componentsHealed: event.tasksCreated > 0 ? 1 : 0,
        issues: event.tasksCreated > 0
          ? [{
              component: event.componentName,
              score: 0,
              action: `${event.tasksCreated} healing task${event.tasksCreated !== 1 ? "s" : ""} created (severity: ${event.severity})`,
            }]
          : [],
      });

      await sendEmail({ to: adminEmail, ...template });

      log.info("Healing report email sent", {
        componentId: event.componentId,
        componentName: event.componentName,
        to: adminEmail,
      });
    } catch (err) {
      log.warn("Healing report email failed", {
        componentId: event.componentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

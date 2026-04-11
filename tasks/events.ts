// Isolated Pub/Sub Topic — safe for cross-service import without pulling in tasks service internals.

import { Topic } from "encore.dev/pubsub";
import type { TaskSource } from "./types";

export interface TaskEvent {
  taskId: string;
  action: "created" | "updated" | "started" | "completed" | "blocked" | "synced";
  repo: string | null;
  source: TaskSource;
  timestamp: string;
}

export const taskEvents = new Topic<TaskEvent>("task-events", {
  deliveryGuarantee: "at-least-once",
});

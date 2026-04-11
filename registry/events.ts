// Isolated Pub/Sub Topic — safe for cross-service import without pulling in registry service internals.

import { Topic } from "encore.dev/pubsub";
import type { HealingNotification } from "./types";

export { type HealingNotification } from "./types";

export const healingEvents = new Topic<HealingNotification>("healing-events", {
  deliveryGuarantee: "at-least-once",
});

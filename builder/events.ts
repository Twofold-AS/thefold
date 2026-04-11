// Isolated Pub/Sub Topic — safe for cross-service import without pulling in builder service internals.

import { Topic } from "encore.dev/pubsub";
import type { BuildProgressEvent } from "./types";

export { type BuildProgressEvent } from "./types";

export const buildProgress = new Topic<BuildProgressEvent>("build-progress", {
  deliveryGuarantee: "at-least-once",
});

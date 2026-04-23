import { Service } from "encore.dev/service";
import { rateLimitMiddleware } from "../gateway/rate-limit-middleware";

// Fase J.6 — Rate-limit + CSRF-validering for agent-startup endpoints.
export default new Service("agent", {
  middlewares: [rateLimitMiddleware],
});

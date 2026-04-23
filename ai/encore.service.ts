import { Service } from "encore.dev/service";
import { rateLimitMiddleware } from "../gateway/rate-limit-middleware";

// Fase J.6 — Rate-limit + CSRF-validering for alle auth'ede AI-endpoints.
export default new Service("ai", {
  middlewares: [rateLimitMiddleware],
});

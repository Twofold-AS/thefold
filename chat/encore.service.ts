import { Service } from "encore.dev/service";
import { rateLimitMiddleware } from "../gateway/rate-limit-middleware";

// Fase J.6 — rateLimitMiddleware sjekker global + per-endpoint kvoter
// og returnerer X-RateLimit-* headers. Fase J.1 validerer CSRF-token
// på state-changing methods for auth'ede endpoints.
export default new Service("chat", {
  middlewares: [rateLimitMiddleware],
});

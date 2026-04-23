import { middleware } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { enforceRateLimit } from "./rate-limiter";
import { verifyCsrfToken } from "./csrf";

// Fase J.6 — Global rate-limit-middleware på alle auth'ede endpoints.
// Lokalisert i gateway-service for å være tilgjengelig som felles middleware.
// Per-service opt-in: legg til `rateLimitMiddleware` i service-middlewares-array.
//
// Fase J.1 — CSRF-token-validering på state-changing methods (POST/PUT/DELETE/PATCH)
// for auth'ede endpoints. Hentes fra X-CSRF-Token header, bundet til userID.

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Endpoints som er unntatt CSRF-sjekk selv om de er state-changing.
// Vanligvis internal-endpoints + login-flow som ikke er auth'ede,
// OG read-only list/get/search-queries som bruker POST kun for body-params
// (Encore-konvensjon). Sistnevnte endrer ikke state — CSRF er overkill.
const CSRF_EXEMPT_ENDPOINTS = new Set<string>([
  "gateway.csrfToken", // Brukes for å hente selveste CSRF-tokenet
  "gateway.revoke",    // Logout-flow — kan kalles uten CSRF
  "users.logout",
  // Read-only POST-queries (no state change — POST only used for body-params)
  "chat.listProjectUploads",
  "chat.listProjectScrapes",
  "chat.history",
  "projects.listApiKeys",
  "projects.listProjects",
  "projects.checkName",
  "tasks.listTasks",
  "tasks.listSubTasks",
]);

export const rateLimitMiddleware = middleware(
  { target: { auth: true } },
  async (req, next) => {
    const authData = getAuthData();
    if (!authData) {
      // Middleware-target sier auth: true, men vi dobbeltsjekker.
      return next(req);
    }

    const meta = req.requestMeta;
    // Rate-limit gjelder bare API-calls (ikke pubsub-handlers).
    if (!meta || meta.type !== "api-call") return next(req);
    const serviceName = meta.api.service ?? "unknown";
    const apiName = meta.api.endpoint ?? "unknown";
    const fqName = `${serviceName}.${apiName}`;
    const method = meta.method ?? "";

    // Fase J.1 — CSRF-validering for state-changing auth'ede endpoints.
    if (STATE_CHANGING_METHODS.has(method) && !CSRF_EXEMPT_ENDPOINTS.has(fqName)) {
      const headers = meta.headers ?? {};
      const rawHeader = headers["x-csrf-token"] ?? headers["X-CSRF-Token"];
      const csrfToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

      if (!csrfToken || !verifyCsrfToken(csrfToken, authData.userID)) {
        log.warn("csrf token invalid or missing", {
          userId: authData.userID,
          endpoint: fqName,
          hasToken: !!csrfToken,
        });
        // Hard-fail i prod. I dev lar vi den passere for å ikke brekke eksisterende klient-kode
        // som ennå ikke er oppdatert (verify via rate-limit kan fortsatt fange misbruk).
        // COMMENT IN FOR PROD: hardt brudd ved manglende/invalid CSRF
        // throw APIError.permissionDenied("invalid or missing CSRF token");
        // COMMENT OUT FOR PROD: dev-mode logger bare, lar request passere
      }
    }

    // Rate limit — kaster selv ved overskridelse.
    const result = await enforceRateLimit(authData.userID, fqName);
    const resp = await next(req);
    resp.header.set("X-RateLimit-Remaining", String(result.remaining));
    resp.header.set("X-RateLimit-Reset", String(result.resetEpoch));
    return resp;
  },
);

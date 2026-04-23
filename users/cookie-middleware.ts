import { middleware } from "encore.dev/api";
import log from "encore.dev/log";

// Fase J.1 — Middleware som setter HttpOnly auth-cookie etter vellykket verifyOtp.
// Middleware kjøres på alle users-service endpoints; vi begrenser til verifyOtp og logout
// via requestMeta.api?.name-sjekk.

// COMMENT IN FOR PROD (thefold.twofold.no): strict cookies, HTTPS-only
// const COOKIE_FLAGS_PROD = "Path=/; HttpOnly; Secure; SameSite=Strict";
// COMMENT OUT FOR PROD (localhost dev)
const COOKIE_FLAGS_DEV = "Path=/; HttpOnly; SameSite=Lax";

const AUTH_COOKIE_NAME = "thefold_token";
const CSRF_COOKIE_NAME = "thefold_csrf";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

function flags(): string {
  // TODO J.4/J.5: bytt basert på process.env.NODE_ENV ved deploy.
  return COOKIE_FLAGS_DEV;
}

export const cookieMiddleware = middleware({ target: { auth: false } }, async (req, next) => {
  const resp = await next(req);

  try {
    const meta = req.requestMeta;
    if (!meta || meta.type !== "api-call") return resp;
    const apiName = meta.api.endpoint;
    if (apiName === "verifyOtp") {
      const payload = (resp as { payload?: unknown }).payload as {
        success?: boolean;
        token?: string;
        csrfToken?: string;
      } | undefined;
      if (payload?.success && payload.token) {
        resp.header.add(
          "Set-Cookie",
          `${AUTH_COOKIE_NAME}=${encodeURIComponent(payload.token)}; ${flags()}; Max-Age=${MAX_AGE_SECONDS}`,
        );
        if (payload.csrfToken) {
          // CSRF-cookie er bevisst IKKE HttpOnly — frontend må kunne lese for å sende X-CSRF-Token header.
          // COMMENT IN FOR PROD: Secure flag påkrevd i prod
          // resp.header.add("Set-Cookie", `${CSRF_COOKIE_NAME}=${encodeURIComponent(payload.csrfToken)}; Path=/; Secure; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`);
          // COMMENT OUT FOR PROD
          resp.header.add(
            "Set-Cookie",
            `${CSRF_COOKIE_NAME}=${encodeURIComponent(payload.csrfToken)}; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`,
          );
        }
      }
    } else if (apiName === "logout") {
      // Slett begge cookies ved logout
      resp.header.add("Set-Cookie", `${AUTH_COOKIE_NAME}=; ${flags()}; Max-Age=0`);
      resp.header.add("Set-Cookie", `${CSRF_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`);
    }
  } catch (err) {
    log.warn("cookie middleware failed to set headers", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return resp;
});

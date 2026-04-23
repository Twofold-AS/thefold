// Fase J.5 — CORS allow-list dokumentasjon + prod-toggle referanse.
// encore.app er ren JSON og støtter ikke kommentarer. Dette er en
// lesbar kilde-av-sannhet for CORS-konfigurasjonen med prod/dev-markører.
// Ved deploy til prod må encore.app oppdateres manuelt iht. disse listene.

// COMMENT IN FOR PROD (thefold.twofold.no) — kun produksjonsdomener
export const ALLOWED_ORIGINS_PROD: readonly string[] = [
  "https://thefold.twofold.no",
];

// COMMENT OUT FOR PROD (localhost dev) — inkluderer localhost + prod-domene
export const ALLOWED_ORIGINS_DEV: readonly string[] = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000",
  "https://thefold.twofold.no",
];

/** Tillatte request-headers. Stabile på tvers av miljøer. */
export const ALLOWED_HEADERS: readonly string[] = [
  "Authorization",
  "Content-Type",
  "X-CSRF-Token",
  "X-Request-Id",
];

/** Headere frontend trenger å lese fra response (f.eks. Retry-After for rate-limit). */
export const EXPOSE_HEADERS: readonly string[] = [
  "X-Request-Id",
  "Retry-After",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
];

/** Kjør denne for å få JSON-delen som skal inn i encore.app ved deploy. */
export function renderCorsConfig(env: "prod" | "dev") {
  const origins = env === "prod" ? ALLOWED_ORIGINS_PROD : ALLOWED_ORIGINS_DEV;
  return {
    global_cors: {
      allow_origins_with_credentials: origins,
      allow_headers: ALLOWED_HEADERS,
      expose_headers: EXPOSE_HEADERS,
    },
  };
}

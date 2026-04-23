// Fase J.1 — Cookie-basert auth. Token lagres som HttpOnly cookie av backend
// (set via middleware i users-service ved verifyOtp-respons). Frontend kan ikke
// lese auth-token direkte; isAuthenticated() baserer seg på tilstede av brukerobjekt
// eller at /me lykkes.
//
// CSRF-token lagres i en IKKE-HttpOnly cookie (`thefold_csrf`) som frontend leser
// for å sende X-CSRF-Token-header ved state-changing requests.
//
// localStorage beholdes som legacy-fallback (dev/test) — kan fjernes helt etter rollout.

const TOKEN_KEY = "thefold_token"; // legacy localStorage key, fallback
const CSRF_COOKIE = "thefold_csrf";

/** Les en cookie ved navn. Returnerer null hvis ikke satt. */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";");
  for (const p of parts) {
    const t = p.trim();
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    if (t.slice(0, eq) === name) {
      return decodeURIComponent(t.slice(eq + 1));
    }
  }
  return null;
}

/**
 * Legacy: Hent token fra localStorage.
 * Foretrekk cookie-basert auth (fetch med credentials: "include").
 * Returnerer null dersom HttpOnly-cookie-flyten er i bruk.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Les CSRF-token fra cookie. Skal inkluderes som X-CSRF-Token header på
 * POST/PUT/DELETE/PATCH requests.
 */
export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE);
}

/**
 * Legacy fallback: sett token i localStorage.
 * Med HttpOnly-cookie-flyten settes token av backend; frontend bør IKKE
 * kalle denne i ny kode — beholdes for gradvis migrasjon.
 */
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/** Fjerner legacy localStorage-token. Backend-cookie slettes av logout-endpoint. */
export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  // Signal auth-endring til andre tabs / komponenter
  window.dispatchEvent(new Event("thefold-auth-change"));
}

/**
 * Autentisert hvis vi har enten CSRF-cookie (ny flyt) eller legacy token.
 * Sannhetskilden er uansett backend — bruk /users/me for ekte verifisering.
 */
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  if (getCsrfToken()) return true;
  return !!getToken();
}

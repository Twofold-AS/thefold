import { secret } from "encore.dev/config";
import * as crypto from "crypto";

// Fase J.1 — CSRF-token-paradigme for state-changing endpoints.
// Stateless HMAC-bundet CSRF-token: HMAC(authSecret, userID + nonce + exp).
// Format: <nonce-hex>.<exp-int>.<hmac-hex>.
// Klient fetcher token via /gateway/csrf-token og sender X-CSRF-Token på
// alle POST/PUT/DELETE/PATCH-requester. Server validerer med timingSafeEqual.

const authSecret = secret("AuthSecret");

const CSRF_TTL_SECONDS = 60 * 60 * 2; // 2 timer

function hmac(payload: string): Buffer {
  return crypto.createHmac("sha256", authSecret()).update(payload).digest();
}

export function generateCsrfToken(userID: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + CSRF_TTL_SECONDS;
  const payload = `${userID}:${nonce}:${exp}`;
  const sig = hmac(payload).toString("hex");
  return `${nonce}.${exp}.${sig}`;
}

export function verifyCsrfToken(token: string, userID: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [nonce, expStr, providedSigHex] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expected = hmac(`${userID}:${nonce}:${exp}`);
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSigHex, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

/** Parse a Cookie header value and extract a specific cookie by name. */
export function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    if (k === name) {
      return decodeURIComponent(trimmed.slice(eq + 1).trim());
    }
  }
  return null;
}

import { api, APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import * as crypto from "crypto";
import { db } from "./db";
import { parseCookie, generateCsrfToken } from "./csrf";

const authSecret = secret("AuthSecret");

// --- Types ---

interface AuthParams {
  authorization?: Header<"Authorization">;
  // Fase J.1 — HttpOnly-cookie som primær auth-transport.
  // Autorisasjons-headeren beholdes for bakoverkompatibilitet + API-klienter.
  cookie?: Header<"Cookie">;
}

export interface AuthData {
  userID: string;
  email: string;
  role: "user" | "admin" | "superadmin";
}

/** Cookie-name for auth-token. Synkronisert med frontend/src/lib/auth.ts. */
export const AUTH_COOKIE_NAME = "thefold_token";

// Token format: base64(JSON payload).hmac-sha256
// Payload includes exp claim for 7-day expiry

/** SHA-256 hash of the raw token string — used as key in revoked_tokens table */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Extract expiry timestamp from a valid token payload (seconds since epoch) */
function extractExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[0];
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    return decoded.exp ?? null;
  } catch {
    return null;
  }
}

function verifyToken(token: string): AuthData | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", authSecret())
    .update(payload)
    .digest("hex");

  // Fase J.2 — timing-safe sammenligning av HMAC-signatur.
  // Rå `!==` lekker informasjon om hvor mye av signaturen som matcher.
  let providedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    providedBuf = Buffer.from(signature, "hex");
    expectedBuf = Buffer.from(expectedSig, "hex");
  } catch {
    return null;
  }
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());

    // Check expiry
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userID: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

export function generateToken(userId: string, email: string, role: "user" | "admin" | "superadmin"): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      email,
      role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    })
  ).toString("base64");

  const signature = crypto
    .createHmac("sha256", authSecret())
    .update(payload)
    .digest("hex");

  return `${payload}.${signature}`;
}

// --- Internal endpoint: used by users service to generate tokens after OTP verification ---

interface CreateTokenRequest {
  userId: string;
  email: string;
  role: "user" | "admin" | "superadmin";
}

interface CreateTokenResponse {
  token: string;
  csrfToken: string;
}

export const createToken = api(
  { method: "POST", path: "/gateway/create-token", expose: false },
  async (req: CreateTokenRequest): Promise<CreateTokenResponse> => {
    const token = generateToken(req.userId, req.email, req.role);
    const csrfToken = generateCsrfToken(req.userId);
    return { token, csrfToken };
  }
);

// --- CSRF: get a fresh token for the authenticated user ---

export const csrfToken = api(
  { method: "GET", path: "/gateway/csrf-token", expose: true, auth: true },
  async (): Promise<{ csrfToken: string }> => {
    const { getAuthData } = await import("~encore/auth");
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("not authed");
    return { csrfToken: generateCsrfToken(authData.userID) };
  }
);

// --- Token Revocation (OWASP A07) ---

interface RevokeResponse {
  revoked: boolean;
}

/** Revoke the current Bearer token. Call this on logout. */
export const revoke = api(
  { method: "POST", path: "/gateway/revoke", expose: true, auth: true },
  async (params: {
    authorization?: Header<"Authorization">;
    cookie?: Header<"Cookie">;
  }): Promise<RevokeResponse> => {
    const token = extractTokenFromParams(params);
    if (!token) throw APIError.invalidArgument("missing token");

    const tokenHash = hashToken(token);
    const exp = extractExpiry(token);

    if (!exp) {
      throw APIError.invalidArgument("invalid token");
    }

    const expiresAt = new Date(exp * 1000).toISOString();

    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${tokenHash}, ${expiresAt}::timestamptz)
      ON CONFLICT (token_hash) DO NOTHING
    `;

    return { revoked: true };
  }
);

/** Internal: revoke a specific token (called by services) */
export const revokeToken = api(
  { method: "POST", path: "/gateway/revoke-token", expose: false },
  async (req: { token: string }): Promise<RevokeResponse> => {
    const tokenHash = hashToken(req.token);
    const exp = extractExpiry(req.token);

    if (!exp) {
      throw APIError.invalidArgument("invalid token");
    }

    const expiresAt = new Date(exp * 1000).toISOString();

    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${tokenHash}, ${expiresAt}::timestamptz)
      ON CONFLICT (token_hash) DO NOTHING
    `;

    return { revoked: true };
  }
);

// --- Cleanup expired revoked tokens (cron) ---

interface CleanupResponse {
  deleted: number;
}

export const cleanupRevokedTokens = api(
  { method: "POST", path: "/gateway/cleanup-revoked", expose: false },
  async (): Promise<CleanupResponse> => {
    const result = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM revoked_tokens WHERE expires_at < NOW()
        RETURNING token_hash
      )
      SELECT COUNT(*)::int as count FROM deleted
    `;
    return { deleted: result?.count ?? 0 };
  }
);

const _cleanupCron = new CronJob("cleanup-revoked-tokens", {
  title: "Clean up expired revoked tokens",
  schedule: "0 2 * * *",
  endpoint: cleanupRevokedTokens,
});

// --- Helpers for cookie/header token extraction ---

function extractTokenFromParams(p: {
  authorization?: string;
  cookie?: string;
}): string | null {
  // 1. Prefer HttpOnly cookie (Fase J.1)
  const cookieToken = parseCookie(p.cookie, AUTH_COOKIE_NAME);
  if (cookieToken) return cookieToken;
  // 2. Fall back to Authorization header (legacy + service-to-service + CLI-klienter)
  const header = p.authorization;
  if (header) {
    return header.replace(/^Bearer\s+/i, "").trim();
  }
  return null;
}

// --- Auth Handler ---

export const auth = authHandler(async (params: AuthParams): Promise<AuthData> => {
  const token = extractTokenFromParams(params);
  if (!token) {
    throw APIError.unauthenticated("missing authentication");
  }

  const data = verifyToken(token);
  if (!data) {
    throw APIError.unauthenticated("invalid or expired token");
  }

  // Check if token has been revoked (OWASP A07)
  const tokenHash = hashToken(token);
  const revoked = await db.queryRow<{ token_hash: string }>`
    SELECT token_hash FROM revoked_tokens WHERE token_hash = ${tokenHash}
  `;

  if (revoked) {
    throw APIError.unauthenticated("token revoked");
  }

  return data;
});

// --- Gateway ---

export const gw = new Gateway({
  authHandler: auth,
});

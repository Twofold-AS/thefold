import { api, APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import * as crypto from "crypto";
import { db } from "./db";

const authSecret = secret("AuthSecret");

// --- Types ---

interface AuthParams {
  authorization: Header<"Authorization">;
}

export interface AuthData {
  userID: string;
  email: string;
  role: "admin" | "viewer";
}

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

  if (signature !== expectedSig) return null;

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

export function generateToken(userId: string, email: string, role: "admin" | "viewer"): string {
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
  role: "admin" | "viewer";
}

interface CreateTokenResponse {
  token: string;
}

export const createToken = api(
  { method: "POST", path: "/gateway/create-token", expose: false },
  async (req: CreateTokenRequest): Promise<CreateTokenResponse> => {
    const token = generateToken(req.userId, req.email, req.role);
    return { token };
  }
);

// --- Token Revocation (OWASP A07) ---

interface RevokeResponse {
  revoked: boolean;
}

/** Revoke the current Bearer token. Call this on logout. */
export const revoke = api(
  { method: "POST", path: "/gateway/revoke", expose: true, auth: true },
  async (params: { authorization: Header<"Authorization"> }): Promise<RevokeResponse> => {
    const header = params.authorization;
    if (!header) {
      throw APIError.invalidArgument("missing authorization header");
    }

    const token = header.replace("Bearer ", "");
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

// --- Auth Handler ---

export const auth = authHandler(async (params: AuthParams): Promise<AuthData> => {
  const header = params.authorization;
  if (!header) {
    throw APIError.unauthenticated("missing authorization header");
  }

  const token = header.replace("Bearer ", "");
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

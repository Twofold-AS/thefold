import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";
import { getAuthData } from "~encore/auth";
import { gateway } from "~encore/clients";
import * as crypto from "crypto";

// --- Database ---

export const db = new SQLDatabase("users", {
  migrations: "./migrations",
});

// --- Secrets ---

const resendApiKey = secret("ResendAPIKey");

// --- Types ---

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  lastLoginAt: string | null;
}

interface MeResponse {
  user: User;
}

interface GetUserRequest {
  userId: string;
}

interface GetUserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  preferences: Record<string, unknown>;
}

interface RequestOTPRequest {
  email: string;
}

interface RequestOTPResponse {
  success: boolean;
  message: string;
}

interface VerifyOTPRequest {
  email: string;
  code: string;
}

interface VerifyOTPResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  error?: string;
}

interface LogoutResponse {
  success: boolean;
}

// --- Helpers ---

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function logAudit(
  email: string,
  success: boolean,
  userId?: string
): Promise<void> {
  await db.exec`
    INSERT INTO login_audit (email, success, user_id)
    VALUES (${email}, ${success}, ${userId ?? null})
  `;
}

async function sendOTPEmail(email: string, code: string): Promise<void> {
  // OTP code intentionally NOT logged — see OWASP A02:2025 Cryptographic Failures

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey()}`,
    },
    body: JSON.stringify({
      from: "TheFold <noreply@noreply.twofold.no>",
      to: [email],
      subject: "Din innloggingskode",
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; margin-bottom: 8px;">TheFold</h1>
          <p style="color: #666; margin-bottom: 32px;">Din innloggingskode:</p>
          <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</span>
          </div>
          <p style="color: #999; font-size: 14px;">Koden utl&oslash;per om 5 minutter.</p>
          <p style="color: #999; font-size: 14px;">Hvis du ikke ba om denne koden, kan du ignorere denne e-posten.</p>
        </div>
      `,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error("[OTP] Resend API error:", res.status, body);
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }
  // Email sent — no verbose logging in production
}

// --- Exponential Backoff (OWASP A07) ---

interface LockoutResult {
  locked: boolean;
  retryAfterSeconds?: number;
}

async function checkLockout(email: string): Promise<LockoutResult> {
  // 3+ failures in 5 min → 60s lockout
  const recent5 = await db.queryRow<{ count: number }>`
    SELECT COUNT(*)::int AS count FROM login_audit
    WHERE email = ${email} AND success = false
      AND created_at > NOW() - INTERVAL '5 minutes'
  `;
  if (recent5 && recent5.count >= 3) {
    // Check if the most recent failure is within lockout window
    const lastFail = await db.queryRow<{ created_at: Date }>`
      SELECT created_at FROM login_audit
      WHERE email = ${email} AND success = false
      ORDER BY created_at DESC LIMIT 1
    `;
    if (lastFail) {
      const elapsed = (Date.now() - new Date(lastFail.created_at).getTime()) / 1000;
      let lockoutSeconds = 60;

      // 10+ failures in 2 hours → 30 min lockout
      const recent2h = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM login_audit
        WHERE email = ${email} AND success = false
          AND created_at > NOW() - INTERVAL '2 hours'
      `;
      if (recent2h && recent2h.count >= 10) {
        lockoutSeconds = 1800;
      }
      // 5+ failures in 30 min → 5 min lockout
      else {
        const recent30 = await db.queryRow<{ count: number }>`
          SELECT COUNT(*)::int AS count FROM login_audit
          WHERE email = ${email} AND success = false
            AND created_at > NOW() - INTERVAL '30 minutes'
        `;
        if (recent30 && recent30.count >= 5) {
          lockoutSeconds = 300;
        }
      }

      const remaining = lockoutSeconds - elapsed;
      if (remaining > 0) {
        return { locked: true, retryAfterSeconds: Math.ceil(remaining) };
      }
    }
  }
  return { locked: false };
}

// --- Endpoints ---

// POST /auth/request-otp — generate and send OTP code
export const requestOtp = api(
  { method: "POST", path: "/auth/request-otp", expose: true, auth: false },
  async (req: RequestOTPRequest): Promise<RequestOTPResponse> => {
    const email = req.email.toLowerCase().trim();
    // Find user (may not exist — we still return success to prevent enumeration)
    const user = await db.queryRow<{ id: string }>`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (!user) {
      await logAudit(email, false);
      return { success: true, message: "Hvis e-posten finnes, vil du motta en kode." };
    }

    // Rate limiting: max 5 codes per email per hour
    const recentCount = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count
      FROM otp_codes
      WHERE user_id = ${user.id}
        AND created_at > NOW() - INTERVAL '1 hour'
    `;

    if (recentCount && recentCount.count >= 5) {
      await logAudit(email, false, user.id);
      return { success: true, message: "Hvis e-posten finnes, vil du motta en kode." };
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = hashCode(code);

    // Store OTP with 5 min expiry
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${user.id}, ${codeHash}, NOW() + INTERVAL '5 minutes')
    `;

    // Send email
    await sendOTPEmail(email, code);

    // Audit log
    await logAudit(email, true, user.id);

    return { success: true, message: "Hvis e-posten finnes, vil du motta en kode." };
  }
);

// POST /auth/verify-otp — verify OTP code and return token
export const verifyOtp = api(
  { method: "POST", path: "/auth/verify-otp", expose: true, auth: false },
  async (req: VerifyOTPRequest): Promise<VerifyOTPResponse> => {
    const email = req.email.toLowerCase().trim();

    // Exponential backoff check (OWASP A07)
    const lockout = await checkLockout(email);
    if (lockout.locked) {
      return {
        success: false,
        error: `For mange mislykkede forsøk. Prøv igjen om ${lockout.retryAfterSeconds} sekunder.`,
      };
    }

    // Find user
    const user = await db.queryRow<{
      id: string;
      email: string;
      name: string;
      role: string;
    }>`
      SELECT id, email, name, role FROM users WHERE email = ${email}
    `;

    if (!user) {
      await logAudit(email, false);
      return { success: false, error: "Ugyldig e-post eller kode" };
    }

    // Find most recent unused, non-expired OTP for this user
    const otp = await db.queryRow<{
      id: string;
      code_hash: string;
      attempts: number;
    }>`
      SELECT id, code_hash, attempts
      FROM otp_codes
      WHERE user_id = ${user.id}
        AND used = false
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!otp) {
      await logAudit(email, false, user.id);
      return { success: false, error: "Ingen gyldig kode funnet. Be om en ny kode." };
    }

    // Check attempts (max 3)
    if (otp.attempts >= 3) {
      await logAudit(email, false, user.id);
      return { success: false, error: "For mange forsøk. Be om en ny kode." };
    }

    // Increment attempts regardless of result
    await db.exec`
      UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ${otp.id}
    `;

    // Verify code
    const inputHash = hashCode(req.code.trim());
    if (inputHash !== otp.code_hash) {
      await logAudit(email, false, user.id);
      return { success: false, error: "Ugyldig kode" };
    }

    // Mark OTP as used
    await db.exec`
      UPDATE otp_codes SET used = true WHERE id = ${otp.id}
    `;

    // Update last login
    await db.exec`
      UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}
    `;

    // Generate token via gateway service
    const role = user.role as "admin" | "viewer";
    const { token } = await gateway.createToken({
      userId: user.id,
      email: user.email,
      role,
    });

    // Audit log
    await logAudit(email, true, user.id);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
);

// POST /auth/logout — client-side token removal
export const logout = api(
  { method: "POST", path: "/auth/logout", expose: true, auth: true },
  async (): Promise<LogoutResponse> => {
    const authData = getAuthData()!;
    await logAudit(authData.email, true, authData.userID);
    return { success: true };
  }
);

// GET /users/me — current user profile
export const me = api(
  { method: "GET", path: "/users/me", expose: true, auth: true },
  async (): Promise<MeResponse> => {
    const authData = getAuthData()!;

    const row = await db.queryRow<{
      id: string;
      email: string;
      name: string;
      role: string;
      avatar_url: string | null;
      preferences: string;
      created_at: string;
      last_login_at: string | null;
    }>`
      SELECT id, email, name, role, avatar_url, preferences,
             created_at, last_login_at
      FROM users
      WHERE id::text = ${authData.userID}
    `;

    if (!row) {
      throw APIError.notFound("user not found");
    }

    return {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        avatarUrl: row.avatar_url,
        preferences:
          typeof row.preferences === "string"
            ? JSON.parse(row.preferences)
            : (row.preferences as unknown as Record<string, unknown>),
        createdAt: String(row.created_at),
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      },
    };
  }
);

// Internal: Get user by ID (for service-to-service calls)
export const getUser = api(
  { method: "POST", path: "/users/get", expose: false },
  async (req: GetUserRequest): Promise<GetUserResponse> => {
    const row = await db.queryRow<{
      id: string;
      email: string;
      name: string;
      role: string;
      preferences: string;
    }>`
      SELECT id, email, name, role, preferences
      FROM users
      WHERE id::text = ${req.userId}
    `;

    if (!row) {
      throw APIError.notFound("user not found");
    }

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      preferences:
        typeof row.preferences === "string"
          ? JSON.parse(row.preferences)
          : (row.preferences as unknown as Record<string, unknown>),
    };
  }
);

// Safe preferences merge: read → merge in JS → write back
// Avoids JSONB || operator bug where Encore parameter binding creates arrays
async function mergePreferences(userId: string, updates: Record<string, unknown>): Promise<void> {
  const row = await db.queryRow<{ preferences: unknown }>`
    SELECT preferences FROM users WHERE id::text = ${userId}
  `;

  let current: Record<string, unknown> = {};
  if (row?.preferences) {
    if (typeof row.preferences === "string") {
      try { current = JSON.parse(row.preferences); } catch { current = {}; }
    } else if (typeof row.preferences === "object" && !Array.isArray(row.preferences)) {
      current = row.preferences as Record<string, unknown>;
    }
    // If corrupted to array, reset
    if (Array.isArray(current)) current = {};
  }

  const merged = { ...current, ...updates };
  await db.exec`
    UPDATE users SET preferences = ${JSON.stringify(merged)}
    WHERE id::text = ${userId}
  `;
}

// Update user preferences (uses auth data for user ID)
interface UpdatePreferencesRequest {
  preferences: Record<string, unknown>;
}

export const updatePreferences = api(
  { method: "POST", path: "/users/preferences", expose: true, auth: true },
  async (req: UpdatePreferencesRequest): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    await mergePreferences(authData.userID, req.preferences);
    return { success: true };
  }
);

// Update user profile (name, avatarColor)
interface UpdateProfileRequest {
  name?: string;
  avatarColor?: string;
}

export const updateProfile = api(
  { method: "POST", path: "/users/update-profile", expose: true, auth: true },
  async (req: UpdateProfileRequest): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;

    if (req.name !== undefined) {
      const trimmed = req.name.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        throw APIError.invalidArgument("Navn må være mellom 1 og 100 tegn");
      }
      await db.exec`
        UPDATE users SET name = ${trimmed} WHERE id::text = ${authData.userID}
      `;
    }

    if (req.avatarColor !== undefined) {
      await mergePreferences(authData.userID, { avatarColor: req.avatarColor });
    }

    return { success: true };
  }
);

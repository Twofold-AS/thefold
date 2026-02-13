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
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey()}`,
    },
    body: JSON.stringify({
      from: "TheFold <onboarding@resend.dev>",
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

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend API error:", res.status, body);
  }
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
      // Log the attempt but don't reveal that the email doesn't exist
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
      // Still return success to prevent enumeration
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
    await logAudit(authData.email, true, authData.userId);
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
      WHERE id::text = ${authData.userId}
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

// Internal: Update user preferences (for service-to-service calls)
interface UpdatePreferencesRequest {
  userId: string;
  preferences: Record<string, unknown>;
}

export const updatePreferences = api(
  { method: "POST", path: "/users/preferences", expose: true, auth: true },
  async (req: UpdatePreferencesRequest): Promise<{ success: boolean }> => {
    await db.exec`
      UPDATE users
      SET preferences = preferences || ${JSON.stringify(req.preferences)}::jsonb
      WHERE id::text = ${req.userId}
    `;
    return { success: true };
  }
);

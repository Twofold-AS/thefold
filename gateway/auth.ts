import { api, APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { secret } from "encore.dev/config";
import * as crypto from "crypto";

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

  return data;
});

// --- Gateway ---

export const gw = new Gateway({
  authHandler: auth,
});

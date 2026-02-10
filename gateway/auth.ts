import { APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { secret } from "encore.dev/config";
import * as crypto from "crypto";

const authSecret = secret("AuthSecret");

// --- Types ---

interface AuthParams {
  authorization: Header<"Authorization">;
}

export interface AuthData {
  userId: string;
  username: string;
  role: "admin" | "viewer";
}

// Simple token format: base64(userId:username:role):hmac
// In production, replace with proper JWT via Clerk/Auth.js

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
    return {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

export function generateToken(userId: string, username: string, role: "admin" | "viewer"): string {
  const payload = Buffer.from(JSON.stringify({ userId, username, role })).toString("base64");
  const signature = crypto
    .createHmac("sha256", authSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

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

import { apiFetch } from "./client";

// --- Types ---

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SecretStatus {
  name: string;
  configured: boolean;
}

// --- Auth API ---

export async function requestOtp(email: string) {
  return apiFetch<{
    success: boolean;
    message: string;
  }>("/auth/request-otp", {
    method: "POST",
    body: { email },
  });
}

export async function verifyOtp(email: string, code: string) {
  return apiFetch<{
    success: boolean;
    token?: string;
    user?: { id: string; email: string; name: string; role: string };
    error?: string;
  }>("/auth/verify-otp", {
    method: "POST",
    body: { email, code },
  });
}

export async function logout() {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}

// --- User Profile ---

export async function getMe() {
  return apiFetch<{ user: UserProfile }>("/users/me", { method: "GET" });
}

export async function updateProfile(data: { name?: string; avatarColor?: string }) {
  return apiFetch<{ success: boolean }>("/users/update-profile", { method: "POST", body: data });
}

/** @deprecated Use getMe() instead */
export async function getUserPreferences() {
  return getMe();
}

export async function updateModelMode(modelMode: string) {
  return apiFetch<{ success: boolean }>("/users/preferences", {
    method: "POST",
    body: { preferences: { modelMode } },
  });
}

export async function updatePreferences(prefs: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>("/users/preferences", {
    method: "POST",
    body: { preferences: prefs },
  });
}

// --- Secrets Status ---

export async function getSecretsStatus() {
  return apiFetch<{ secrets: SecretStatus[] }>("/gateway/secrets-status", { method: "GET" });
}

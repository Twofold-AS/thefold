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
    /** Fase J.1 — CSRF-token. Lagres som ikke-HttpOnly cookie av backend. */
    csrfToken?: string;
    user?: { id: string; email: string; name: string; role: string };
    error?: string;
  }>("/auth/verify-otp", {
    method: "POST",
    body: { email, code },
  });
}

// Fase J.1 — Hent ny CSRF-token for nåværende sesjon (roterer lokalt lagret token).
export async function getCsrfToken() {
  return apiFetch<{ csrfToken: string }>("/gateway/csrf-token", { method: "GET" });
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

// --- User role management (Fase E, Commit 29) ---

export type UserRole = "user" | "admin" | "superadmin";

export interface UserRoleRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function listUsersWithRoles() {
  return apiFetch<{ users: UserRoleRow[] }>("/users/list-with-roles", { method: "GET" });
}

export async function setUserRole(email: string, role: UserRole) {
  return apiFetch<{ email: string; role: UserRole }>("/users/set-role", {
    method: "POST",
    body: { email, role },
  });
}

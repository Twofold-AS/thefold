"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { setToken } from "@/lib/auth";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }

    setLoading(true);

    try {
      const result = await login(username.trim(), password);
      setToken(result.token);
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-4">
      {/* Main content — centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[360px]">
          <div className="mb-10 text-center">
            <h1 className="font-brand text-[100px] font-medium leading-none" style={{ color: "var(--text-primary)" }}>
              Sign in
            </h1>
            <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
              An AI that actually commits.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="input-field"
                autoFocus
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="input-field"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && (
              <div
                className="text-sm px-3 py-2 rounded-lg"
                style={{
                  color: "var(--error)",
                  background: "rgba(239, 68, 68, 0.1)",
                  borderLeft: "3px solid var(--error)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: "rgba(0,0,0,0.2)", borderTopColor: "#000" }}
                  />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer — logo + company */}
      <div className="py-6 flex flex-col items-center gap-2">
        <Image src="/logo.svg" alt="TheFold" width={24} height={24} />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Twofold AS &middot; &copy; 2025
        </p>
      </div>
    </div>
  );
}

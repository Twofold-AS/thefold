"use client";

import { Sidebar } from "@/components/sidebar";
import { initTheme } from "@/lib/theme";
import { RepoProvider } from "@/lib/repo-context";
import { PreferencesProvider } from "@/contexts/UserPreferencesContext";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useEffect } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isChecking } = useRequireAuth();

  useEffect(() => {
    initTheme();
  }, []);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--text-secondary)" }}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Verifiserer innlogging...
          </p>
        </div>
      </div>
    );
  }

  return (
    <PreferencesProvider>
      <RepoProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 sm:ml-60 overflow-auto">
            {children}
          </main>
        </div>
      </RepoProvider>
    </PreferencesProvider>
  );
}

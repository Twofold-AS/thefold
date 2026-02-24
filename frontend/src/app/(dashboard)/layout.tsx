"use client";

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
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
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--tf-bg-base)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="spinner-sm" style={{ width: 24, height: 24 }} />
          <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
            Verifiserer...
          </p>
        </div>
      </div>
    );
  }

  return (
    <PreferencesProvider>
      <RepoProvider>
        <div className="flex min-h-screen" style={{ background: "var(--tf-bg-base)" }}>
          <Sidebar />
          <div className="flex-1 min-w-0 flex flex-col">
            <Topbar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </RepoProvider>
    </PreferencesProvider>
  );
}

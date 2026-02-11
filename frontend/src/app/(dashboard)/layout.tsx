"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { getToken } from "@/lib/auth";
import { initTheme } from "@/lib/theme";
import { RepoProvider } from "@/lib/repo-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    initTheme();
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--sidebar-text-active)" }} />
      </div>
    );
  }

  return (
    <RepoProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 sm:ml-60">
          <div className="p-8 pt-16 sm:pt-8">
            {children}
          </div>
        </main>
      </div>
    </RepoProvider>
  );
}

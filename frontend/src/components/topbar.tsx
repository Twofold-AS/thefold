"use client";

import { useRepoContext } from "@/lib/repo-context";
import { useUser } from "@/contexts/UserPreferencesContext";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { clearToken } from "@/lib/auth";
import { logout } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const { repos, selectedRepo, selectRepo } = useRepoContext();
  const { user, initial, avatarColor } = useUser();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
    } catch {}
    clearToken();
    router.push("/login");
  }

  return (
    <header
      className="h-topbar flex items-center justify-between px-6 border-b flex-shrink-0"
      style={{
        backgroundColor: "var(--tf-bg-base)",
        borderColor: "var(--tf-border-faint)",
      }}
    >
      {/* Left: Repo selector */}
      <div className="flex items-center gap-3">
        {/* Spacer for mobile hamburger */}
        <div className="w-8 sm:hidden" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--tf-surface-raised)]"
              style={{ color: "var(--tf-text-primary)" }}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-medium text-white"
                style={{ background: selectedRepo ? "var(--tf-heat)" : "var(--tf-border-muted)" }}
              >
                {selectedRepo?.name?.[0]?.toUpperCase() || "T"}
              </div>
              <span className="font-medium hidden sm:inline">{selectedRepo?.fullName || "Select repo"}</span>
              <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--tf-text-muted)" }} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem
              onClick={() => selectRepo("")}
              className="flex items-center gap-2"
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-medium text-white"
                style={{ background: !selectedRepo ? "var(--tf-heat)" : "var(--tf-border-muted)" }}
              >
                T
              </div>
              <span className="flex-1 truncate">No repo (general)</span>
              {!selectedRepo && (
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--tf-heat)" }} />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {repos.map((repo) => (
              <DropdownMenuItem
                key={repo.fullName}
                onClick={() => selectRepo(repo.fullName)}
                className="flex items-center gap-2"
              >
                <div
                  className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-medium text-white"
                  style={{ background: repo.fullName === selectedRepo?.fullName ? "var(--tf-heat)" : "var(--tf-border-muted)" }}
                >
                  {repo.name[0]?.toUpperCase()}
                </div>
                <span className="flex-1 truncate">{repo.fullName}</span>
                {repo.fullName === selectedRepo?.fullName && (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--tf-heat)" }} />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right: User avatar with dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--tf-surface-raised)]">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium text-white"
              style={{ background: avatarColor }}
            >
              {initial}
            </div>
            {user?.email && (
              <span className="text-xs hidden lg:block" style={{ color: "var(--tf-text-muted)" }}>
                {user.email}
              </span>
            )}
            <ChevronDown className="w-3 h-3" style={{ color: "var(--tf-text-faint)" }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => router.push("/settings")} className="flex items-center gap-2">
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")} className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 text-red-400">
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

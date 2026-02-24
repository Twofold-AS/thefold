"use client";

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
      {/* Left: spacer for mobile hamburger */}
      <div className="flex items-center gap-3">
        <div className="w-8 sm:hidden" />
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

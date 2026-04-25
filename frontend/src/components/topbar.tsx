"use client";

import { T, Layout } from "@/lib/tokens";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageCircleMore,
  FlaskConical,
  Moon,
  Brain,
  CreditCard,
  Bell,
  Shield,
  Cog,
} from "lucide-react";

interface TopBarProps {
  notifCount?: number;
  onNotifClick?: () => void;
  onNewChat?: () => void;
}

export default function TopBar({ notifCount = 0, onNotifClick, onNewChat }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div
      style={{
        height: Layout.topbarHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Left: logo + TheFold + BETA */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
          onClick={() => router.push("/")}
        >
          <img src="/logo/logo.svg" alt="TheFold" style={{ height: 27, width: "auto", display: "block" }} />
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: T.text,
              fontFamily: T.brandFont,
              letterSpacing: "-0.01em",
            }}
          >
            TheFold
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: T.text,
            border: `1px solid rgba(255,255,255,0.35)`,
            borderRadius: 20,
            padding: "2px 8px",
            lineHeight: "16px",
            fontFamily: T.sans,
          }}
        >
          BETA
        </span>
      </div>

      {/* Right: nav + utility icons — lucide-react, 18 px, muted tone. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: T.sidebar,
          borderRadius: 16,
          padding: "2px 6px",
          height: 40,
        }}
      >
        <IconBtn
          title="Ny samtale"
          onClick={() => {
            if (onNewChat) { onNewChat(); return; }
            // Defensive fallback: honour the current tab if no handler provided.
            const basePath = pathname.startsWith("/cowork")
              ? "/cowork"
              : pathname.startsWith("/designer") ? "/designer" : "/";
            router.push(basePath);
          }}
        >
          <MessageCircleMore size={18} strokeWidth={1.75} />
        </IconBtn>
        <IconBtn title="Oppgaver" active={pathname === "/tasks"} onClick={() => router.push("/tasks")}>
          <FlaskConical size={18} strokeWidth={1.75} />
        </IconBtn>
        <IconBtn title="Drømmer" active={pathname === "/dreams"} onClick={() => router.push("/dreams")}>
          <Moon size={18} strokeWidth={1.75} />
        </IconBtn>
        <IconBtn title="Hukommelse" active={pathname === "/memory"} onClick={() => router.push("/memory")}>
          <Brain size={18} strokeWidth={1.75} />
        </IconBtn>
        <IconBtn title="Kostnadsoversikt" onClick={() => router.push("/cost")}>
          <CreditCard size={18} strokeWidth={1.75} />
        </IconBtn>
        <div style={{ position: "relative" }}>
          <IconBtn title="Varsler" onClick={onNotifClick}>
            <Bell size={18} strokeWidth={1.75} />
          </IconBtn>
          {notifCount > 0 && (
            <div style={{
              position: "absolute", top: 4, right: 4,
              minWidth: 16, height: 16, borderRadius: 8,
              background: T.error,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700, color: "#fff",
              padding: "0 3px", pointerEvents: "none",
            }}>
              {notifCount > 9 ? "9+" : notifCount}
            </div>
          )}
        </div>
        <IconBtn title="Audit logg" onClick={() => router.push("/audit")}>
          <Shield size={18} strokeWidth={1.75} />
        </IconBtn>
        <IconBtn title="Innstillinger" active={pathname.startsWith("/innstillinger")} onClick={() => router.push("/innstillinger")}>
          <Cog size={18} strokeWidth={1.75} />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, active }: {
  children: React.ReactNode; onClick?: () => void; title?: string; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? T.tabActive : "transparent",
        border: "none", cursor: "pointer",
        color: active ? T.text : T.textMuted,
        padding: 7, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = T.subtle; e.currentTarget.style.color = T.text; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMuted; } }}
    >
      {children}
    </button>
  );
}

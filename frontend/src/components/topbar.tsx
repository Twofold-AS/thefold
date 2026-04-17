"use client";

import { T, Layout } from "@/lib/tokens";
import { useRouter, usePathname } from "next/navigation";
import "material-symbols/outlined.css";

/** Google Material Symbol — renders via CSS font */
function MIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span
      className="material-symbols-outlined"
      style={{ fontSize: size, lineHeight: 1 }}
    >
      {name}
    </span>
  );
}

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
          onClick={() => router.push("/cowork")}
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

      {/* Right: nav + utility icons */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <IconBtn title="Ny samtale" onClick={() => onNewChat ? onNewChat() : router.push("/cowork")}>
          <MIcon name="add" />
        </IconBtn>
        <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
        <IconBtn title="Oppgaver" active={pathname === "/tasks"} onClick={() => router.push("/tasks")}>
          <MIcon name="task_alt" />
        </IconBtn>
        <IconBtn title="Drømmer" active={pathname === "/dreams"} onClick={() => router.push("/dreams")}>
          <MIcon name="bedtime" />
        </IconBtn>
        <IconBtn title="Hukommelse" active={pathname === "/memory"} onClick={() => router.push("/memory")}>
          <MIcon name="psychology" />
        </IconBtn>

        <div style={{ width: 1, height: 20, background: T.border, margin: "0 8px" }} />

        <IconBtn title="Kostnadsoversikt" onClick={() => router.push("/cost")}>
          <MIcon name="payments" />
        </IconBtn>
        <div style={{ position: "relative" }}>
          <IconBtn title="Varsler" onClick={onNotifClick}>
            <MIcon name="notifications" />
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
          <MIcon name="shield" />
        </IconBtn>
        <IconBtn title="Innstillinger" active={pathname.startsWith("/innstillinger")} onClick={() => router.push("/innstillinger")}>
          <MIcon name="settings" />
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
        padding: 10, borderRadius: 20,
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

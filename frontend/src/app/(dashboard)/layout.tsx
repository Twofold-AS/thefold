"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { T, Layout } from "@/lib/tokens";
import Btn from "@/components/Btn";
import NotifBell from "@/components/NotifBell";
import SectionLabel from "@/components/SectionLabel";
import PixelCorners from "@/components/PixelCorners";
import {
  LayoutDashboard, MessageSquare, CheckSquare, Box,
  Wand2, Brain, Plug, Server, Database, Activity, Terminal,
  Settings, FileText,
  type LucideIcon,
} from "lucide-react";
import { useUser } from "@/contexts/UserPreferencesContext";

const { sidebarWidth: SW, sidebarCollapsed: SWC, contentWidth: CW, innerWidth: IW, headerHeight: HH, sidePadding: SP } = Layout;

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: string;
}

interface NavGroup {
  cat?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { icon: LayoutDashboard, label: "Overview", href: "/" },
    ],
  },
  {
    cat: "WORKSPACE",
    items: [
      { icon: MessageSquare, label: "Chat", href: "/chat", badge: "3" },
      { icon: CheckSquare, label: "Tasks", href: "/tasks" },
      { icon: Box, label: "Komponenter", href: "/komponenter" },
      { icon: Wand2, label: "Skills", href: "/skills" },
    ],
  },
  {
    cat: "SYSTEM",
    items: [
      { icon: Brain, label: "AI", href: "/ai" },
      { icon: Plug, label: "Integrasjoner", href: "/integrasjoner" },
      { icon: Server, label: "MCP", href: "/mcp" },
      { icon: Database, label: "Memory", href: "/memory" },
      { icon: Activity, label: "Monitor", href: "/monitor" },
      { icon: FileText, label: "Docs", href: "/docs" },
      { icon: Terminal, label: "Sandbox", href: "/sandbox" },
    ],
  },
];

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, initial, avatarColor } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const sw = collapsed ? SWC : SW;
  const useFullWidth = pathname === "/chat" || pathname.startsWith("/chat/");
  const isSettings = pathname === "/innstillinger" || pathname.startsWith("/innstillinger/");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        fontFamily: T.sans,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: SW + CW,
          minHeight: "100vh",
          position: "relative",
        }}
      >
        {/* HEADER */}
        <div style={{ display: "flex", height: HH, position: "sticky", top: 0, zIndex: 10, background: T.bg }}>
          {/* Header — sidebar area */}
          <div
            style={{
              width: sw,
              height: HH,
              borderBottom: `1px solid ${T.border}`,
              borderRight: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              gap: collapsed ? 0 : 10,
              padding: collapsed ? "0" : "0 20px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: T.bg,
              zIndex: 3,
              transition: "all 0.25s ease",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* TF Logo */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: T.r,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: `linear-gradient(135deg, ${T.accent}, ${T.brand})`,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: T.bg,
                  fontFamily: T.brandFont,
                }}
              >
                TF
              </span>
            </div>
            {!collapsed && (
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: T.text,
                  letterSpacing: "-0.02em",
                  fontFamily: T.brandFont,
                  whiteSpace: "nowrap",
                }}
              >
                TheFold
              </span>
            )}
          </div>

          {/* Header — right area */}
          <div
            style={{
              flex: 1,
              height: HH,
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0 24px",
              gap: 10,
              background: T.bg,
              zIndex: 2,
            }}
          >
            <Btn sm>Docs</Btn>
            <NotifBell onGoTask={() => router.push("/tasks")} />
            <Link
              href="/innstillinger"
              style={{
                cursor: "pointer",
                color: isSettings ? T.accent : T.textMuted,
                display: "flex",
                alignItems: "center",
                padding: 6,
                transition: "color 0.15s",
                textDecoration: "none",
              }}
            >
              <Settings size={16} strokeWidth={1.3} />
            </Link>
          </div>
        </div>

        {/* BODY */}
        <div style={{ display: "flex", position: "relative" }}>
          {/* SIDEBAR */}
          <div
            style={{
              width: sw,
              height: `calc(100vh - ${HH}px)`,
              position: "sticky",
              top: HH,
              overflowY: "auto",
              overflowX: "hidden",
              flexShrink: 0,
              transition: "width 0.25s ease",
              borderRight: `1px solid ${T.border}`,
              display: "flex",
              flexDirection: "column",
              background: T.bg,
              zIndex: 3,
            }}
          >
            {/* Nav items */}
            <div
              style={{
                flex: 1,
                padding: collapsed ? "16px 4px" : "16px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {navGroups.map((g, gi) => (
                <div key={gi}>
                  {/* Category label */}
                  {g.cat && !collapsed && (
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: T.textFaint,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        padding: "12px 14px 4px",
                        fontFamily: T.mono,
                      }}
                    >
                      {g.cat}
                    </div>
                  )}
                  {/* Category separator when collapsed */}
                  {g.cat && collapsed && (
                    <div style={{ height: 1, background: T.border, margin: "8px 8px" }} />
                  )}

                  {/* Nav items */}
                  {g.items.map((it) => {
                    const active = isActiveRoute(pathname, it.href);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        title={collapsed ? it.label : undefined}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: collapsed ? "9px 0" : "9px 14px",
                          justifyContent: collapsed ? "center" : "flex-start",
                          background: active ? T.subtle : "transparent",
                          cursor: "pointer",
                          transition: "background 0.12s",
                          position: "relative",
                          minHeight: 36,
                          textDecoration: "none",
                        }}
                      >
                        {/* Active indicator removed (G2) */}
                        {/* Icon */}
                        <it.icon size={16} strokeWidth={1.5} style={{ color: active ? T.text : T.textMuted, flexShrink: 0 }} />
                        {/* Label */}
                        {!collapsed && (
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: active ? 500 : 400,
                              color: active ? T.text : T.textSec,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {it.label}
                          </span>
                        )}
                        {/* Badge */}
                        {!collapsed && it.badge && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 10,
                              fontFamily: T.mono,
                              fontWeight: 600,
                              background: T.accentDim,
                              color: T.accent,
                              padding: "1px 6px",
                            }}
                          >
                            {it.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* User section */}
            <div
              style={{
                borderTop: `1px solid ${T.border}`,
                padding: collapsed ? "12px 8px" : "12px 16px",
                position: "relative",
              }}
            >
              <PixelCorners />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
              >
                <div
                  style={{
                    width: collapsed ? 8 : 24,
                    height: collapsed ? 8 : 24,
                    borderRadius: "50%",
                    background: avatarColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.25s ease",
                  }}
                >
                  {!collapsed && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{initial}</span>
                  )}
                </div>
                {!collapsed && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>
                      {user?.name || "\u2014"}
                    </div>
                    <div style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>{user?.role || "\u2014"}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Collapse button */}
            <div
              style={{
                borderTop: `1px solid ${T.border}`,
                padding: collapsed ? "12px 8px" : "12px 16px",
                position: "relative",
              }}
            >
              <PixelCorners />
              <div
                onClick={() => setCollapsed((c) => !c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  justifyContent: collapsed ? "center" : "flex-start",
                  color: T.textMuted,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.25s",
                  }}
                >
                  <path d="M11 2L5 8l6 6" />
                </svg>
                {!collapsed && (
                  <span style={{ fontSize: 12, color: T.textFaint }}>Kollaps</span>
                )}
              </div>
            </div>
          </div>

          {/* CONTENT */}
          <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
            {useFullWidth ? (
              <div style={{ height: `calc(100vh - ${HH}px)`, overflow: "hidden" }}>
                {children}
              </div>
            ) : (
              <div style={{ padding: `0 ${SP}px` }}>
                <div style={{ maxWidth: IW, margin: "0 auto" }}>{children}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

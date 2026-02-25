"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { T, Layout } from "@/lib/tokens";
import Btn from "@/components/Btn";
import NotifBell from "@/components/NotifBell";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import PixelCorners from "@/components/PixelCorners";

const { sidebarWidth: SW, sidebarCollapsed: SWC, contentWidth: CW, innerWidth: IW, headerHeight: HH, sidePadding: SP } = Layout;

interface NavItem {
  icon: string;
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
      { icon: "\u25C9", label: "Overview", href: "/" },
    ],
  },
  {
    cat: "WORKSPACE",
    items: [
      { icon: "\u25C8", label: "Chat", href: "/chat", badge: "3" },
      { icon: "\u25A4", label: "Tasks", href: "/tasks" },
      { icon: "\u2B21", label: "Komponenter", href: "/komponenter" },
      { icon: "\u26A1", label: "Skills", href: "/skills" },
    ],
  },
  {
    cat: "SYSTEM",
    items: [
      { icon: "\u25CE", label: "AI", href: "/ai" },
      { icon: "\u2B14", label: "Integrasjoner", href: "/integrasjoner" },
      { icon: "\u229E", label: "MCP", href: "/mcp" },
      { icon: "\u25D0", label: "Memory", href: "/memory" },
      { icon: "\u25EB", label: "Monitor", href: "/monitor" },
      { icon: "\u25A5", label: "Sandbox", href: "/sandbox" },
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
          maxWidth: sw + CW,
          minHeight: "100vh",
          position: "relative",
          transition: "max-width 0.25s ease",
        }}
      >
        {/* HEADER */}
        <div style={{ display: "flex", height: HH, position: "relative", zIndex: 2 }}>
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6.86 1.57a1.14 1.14 0 012.28 0c.05.64.75 1 1.28.64a1.14 1.14 0 011.61 1.61c-.36.53-.01 1.23.64 1.28a1.14 1.14 0 010 2.28c-.65.05-1 .75-.64 1.28a1.14 1.14 0 01-1.61 1.61c-.53-.36-1.23-.01-1.28.64a1.14 1.14 0 01-2.28 0c-.05-.65-.75-1-1.28-.64a1.14 1.14 0 01-1.61-1.61c.36-.53.01-1.23-.64-1.28a1.14 1.14 0 010-2.28c.65-.05 1-.75.64-1.28a1.14 1.14 0 011.61-1.61c.53.36 1.23.01 1.28-.64z" />
                <circle cx="8" cy="8" r="2.5" />
              </svg>
            </Link>
          </div>
        </div>

        {/* BODY */}
        <div style={{ display: "flex", minHeight: `calc(100vh - ${HH}px)`, position: "relative" }}>
          {/* SIDEBAR */}
          <div
            style={{
              width: sw,
              borderRight: `1px solid ${T.border}`,
              display: "flex",
              flexDirection: "column",
              background: T.bg,
              position: "relative",
              zIndex: 3,
              transition: "width 0.25s ease",
              overflow: "hidden",
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
                        {/* Active indicator bar */}
                        {active && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: "50%",
                              transform: "translateY(-50%)",
                              width: 3,
                              height: 16,
                              background: T.accent,
                            }}
                          />
                        )}
                        {/* Icon */}
                        <span
                          style={{
                            fontSize: 14,
                            color: active ? T.text : T.textMuted,
                            flexShrink: 0,
                          }}
                        >
                          {it.icon}
                        </span>
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

            {/* Quick actions */}
            <div style={{ borderTop: `1px solid ${T.border}`, padding: collapsed ? 12 : 16, position: "relative" }}>
              <PixelCorners />
              {!collapsed && (
                <>
                  <SectionLabel>Quick actions</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Btn sm>&#8984;K S&#xF8;k</Btn>
                    <Btn sm>&#8984;N Ny chat</Btn>
                  </div>
                </>
              )}
              {collapsed && (
                <div style={{ display: "flex", justifyContent: "center", color: T.textMuted, fontSize: 14 }}>
                  &#8984;
                </div>
              )}
            </div>

            {/* Repo health */}
            <div style={{ borderTop: `1px solid ${T.border}`, padding: collapsed ? 12 : 16, position: "relative" }}>
              <PixelCorners />
              {!collapsed && (
                <>
                  <SectionLabel>Repo-helse</SectionLabel>
                  {["thefold-api", "thefold-frontend"].map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 0",
                      }}
                    >
                      <span style={{ fontSize: 11, color: T.textSec, fontFamily: T.mono }}>{r}</span>
                      <Tag variant="success">OK</Tag>
                    </div>
                  ))}
                </>
              )}
              {collapsed && (
                <div style={{ display: "flex", justifyContent: "center", color: T.textMuted, fontSize: 14 }}>
                  &#x25C6;
                </div>
              )}
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
                {!collapsed && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>
                      J&#xF8;rgen Andr&#xE9;
                    </div>
                    <div style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>admin</div>
                  </div>
                )}
                {collapsed && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.success }} />
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
          <div style={{ flex: 1, maxWidth: CW, position: "relative", zIndex: 1 }}>
            {useFullWidth ? (
              <div style={{ padding: "0 20px" }}>{children}</div>
            ) : (
              <div style={{ padding: `0 ${SP}px`, position: "relative" }}>
                <div style={{ maxWidth: IW, margin: "0 auto" }}>{children}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

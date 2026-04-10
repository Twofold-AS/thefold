"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { T, Layout } from "@/lib/tokens";
import Btn from "@/components/Btn";
import NotifBell from "@/components/NotifBell";
import {
  Eye, BotMessageSquare, CheckSquare, Box,
  Wand2, Brain, Plug, Server, Database, Activity, Terminal,
  Cog, ChevronDown, FolderOpen, BookOpen, Menu, X,
  type LucideIcon,
} from "lucide-react";
import { RepoProvider, useRepoContext } from "@/lib/repo-context";

const { sidebarWidth: SW, sidebarCollapsed: SWC, contentWidth: CW, innerWidth: IW, headerHeight: HH } = Layout;

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
      { icon: Eye, label: "Overview", href: "/" },
    ],
  },
  {
    cat: "WORKSPACE",
    items: [
      { icon: BotMessageSquare, label: "Chat", href: "/chat" },
      { icon: CheckSquare, label: "Tasks", href: "/tasks" },
      { icon: FolderOpen, label: "Projects", href: "/projects" },
      { icon: Box, label: "Komponenter", href: "/komponenter" },
      { icon: Wand2, label: "Skills", href: "/skills" },
      { icon: BookOpen, label: "Knowledge", href: "/knowledge" },
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
      { icon: Terminal, label: "Sandbox", href: "/sandbox" },
    ],
  },
];

const ROUTE_LABELS: Record<string, string> = {
  "/": "Overview",
  "/chat": "Chat",
  "/tasks": "Tasks",
  "/projects": "Projects",
  "/komponenter": "Komponenter",
  "/skills": "Skills",
  "/knowledge": "Knowledge",
  "/ai": "AI",
  "/integrasjoner": "Integrasjoner",
  "/mcp": "MCP",
  "/memory": "Memory",
  "/monitor": "Monitor",
  "/sandbox": "Sandbox",
  "/innstillinger": "Innstillinger",
  "/docs": "Docs",
};

function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Overview", href: "/" }];
  const crumbs: { label: string; href: string }[] = [];
  let path = "";
  for (const seg of segments) {
    path += `/${seg}`;
    const label = ROUTE_LABELS[path] || seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, href: path });
  }
  return crumbs;
}

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { repos, selectedRepo, selectRepo, clearRepo } = useRepoContext();
  const [collapsed, setCollapsed] = useState(false);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const breadcrumbs = getBreadcrumbs(pathname);
  const sw = collapsed ? SWC : SW;
  const useFullWidth = pathname === "/chat" || pathname.startsWith("/chat/");
  const isSettings = pathname === "/innstillinger" || pathname.startsWith("/innstillinger/");

  return (
    <>
    <style>{`@media (max-width: 640px) { .mobile-nav-toggle { display: flex !important; } }`}</style>
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
              display: "flex",
              alignItems: "center",
              gap: collapsed ? 0 : 4,
              padding: collapsed ? "0" : "0 20px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: T.bg,
              zIndex: 3,
              transition: "all 0.25s ease",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* Mobile hamburger */}
            <div
              className="mobile-nav-toggle"
              onClick={() => setMobileNavOpen(p => !p)}
              style={{ display: "none", cursor: "pointer", color: T.textMuted, padding: 4, flexShrink: 0 }}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </div>
            {/* Logo */}
            <img
              src="/logo/logo.svg"
              alt="TheFold"
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
              }}
            />
            {!collapsed && (
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 400,
                  color: T.text,
                  letterSpacing: "0",
                  fontFamily: T.brandFont,
                  whiteSpace: "nowrap",
                  visibility: "hidden"
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
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0 24px",
              gap: 10,
              background: T.bg,
              zIndex: 2,
            }}
          >
            {/* Repo Selector */}
            <div style={{ position: "relative" }}>
              <div
                onClick={() => setRepoDropdownOpen((p) => !p)}
                style={{
                  padding: "6px 14px",
                  border: `1px solid ${T.border}`,
                  borderRadius: 999,
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: T.textMuted,
                  cursor: "pointer",
                  background: "transparent",
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {selectedRepo ? selectedRepo.name : "Global"}
                  <ChevronDown size={12} strokeWidth={2} />
                </span>
              </div>

              {repoDropdownOpen && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 98 }}
                    onClick={() => setRepoDropdownOpen(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      background: T.surface,
                      border: `1px solid ${T.border}`,
                      borderRadius: 12,
                      minWidth: 200,
                      maxHeight: 300,
                      overflowY: "auto",
                      zIndex: 99,
                      overflow: "hidden",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    }}
                  >
                    {/* Global option */}
                    <div
                      onClick={() => {
                        clearRepo();
                        setRepoDropdownOpen(false);
                      }}
                      onMouseEnter={(e) => { if (selectedRepo) e.currentTarget.style.background = T.subtle; }}
                      onMouseLeave={(e) => { if (selectedRepo) e.currentTarget.style.background = "transparent"; }}
                      style={{
                        padding: "10px 16px",
                        fontSize: 12,
                        fontFamily: T.mono,
                        color: !selectedRepo ? T.text : T.textMuted,
                        background: !selectedRepo ? T.subtle : "transparent",
                        cursor: "pointer",
                        borderBottom: `1px solid ${T.border}`,
                        transition: "background 0.1s",
                      }}
                    >
                      Global
                    </div>

                    {/* Repo list */}
                    {repos.map((repo) => (
                      <div
                        key={repo.fullName}
                        onClick={() => {
                          selectRepo(repo.fullName);
                          setRepoDropdownOpen(false);
                        }}
                        onMouseEnter={(e) => { if (selectedRepo?.fullName !== repo.fullName) e.currentTarget.style.background = T.subtle; }}
                        onMouseLeave={(e) => { if (selectedRepo?.fullName !== repo.fullName) e.currentTarget.style.background = "transparent"; }}
                        style={{
                          padding: "10px 16px",
                          fontSize: 12,
                          fontFamily: T.mono,
                          color: selectedRepo?.fullName === repo.fullName ? T.text : T.textMuted,
                          background: selectedRepo?.fullName === repo.fullName ? T.subtle : "transparent",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                      >
                        {repo.name}
                      </div>
                    ))}

                    {repos.length === 0 && (
                      <div style={{ padding: "12px", fontSize: 11, color: T.textFaint, textAlign: "center" }}>
                        Ingen repos funnet
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <Link
              href="/docs"
              style={{
                padding: "6px 14px",
                border: `1px solid ${T.border}`,
                borderRadius: 999,
                fontSize: 12,
                fontFamily: T.mono,
                color: T.textMuted,
                cursor: "pointer",
                background: "transparent",
                textDecoration: "none",
              }}
            >
              Docs
            </Link>
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
              <Cog size={16} strokeWidth={1.3} />
            </Link>
          </div>
        </div>

        {/* Mobile nav overlay */}
        {mobileNavOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }}
              onClick={() => setMobileNavOpen(false)}
            />
            <div style={{
              position: "fixed", top: HH, left: 0, bottom: 0, width: SW, zIndex: 50,
              background: T.bg, overflowY: "auto", padding: "16px 8px",
              display: "flex", flexDirection: "column", gap: 2,
            }}>
              {navGroups.map((g, gi) => (
                <div key={gi}>
                  {g.cat && (
                    <div style={{ fontSize: 9, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", padding: "12px 14px 4px", fontFamily: T.mono }}>
                      {g.cat}
                    </div>
                  )}
                  {g.items.map((it) => {
                    const active = isActiveRoute(pathname, it.href);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={() => setMobileNavOpen(false)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", textDecoration: "none", minHeight: 36 }}
                      >
                        <it.icon size={16} strokeWidth={1.5} style={{ color: active ? T.text : T.textMuted, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: active ? 500 : 400, color: active ? T.text : T.textSec }}>
                          {it.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}

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
                          background: "transparent",
                          cursor: "pointer",
                          transition: "background 0.12s",
                          position: "relative",
                          minHeight: 36,
                          textDecoration: "none",
                        }}
                      >
                        {/* Active indicator removed (G2) */}
                        {/* Icon */}
                        <it.icon
                          size={16}
                          strokeWidth={1.5}
                          className={active ? "brand-shimmer-icon" : ""}
                          style={{ color: active ? T.text : T.textMuted, flexShrink: 0 }}
                        />
                        {/* Label */}
                        {!collapsed && (
                          <span
                            className={active ? "brand-shimmer" : ""}
                            style={{
                              fontSize: 13,
                              fontWeight: active ? 500 : 400,
                              color: active ? undefined : T.textSec,
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

            {/* Collapse button */}
            <div
              style={{
                padding: collapsed ? "12px 8px" : "12px 16px",
                position: "relative",
              }}
            >
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

          {/* CONTENT — visnings-boks */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                flex: 1,
                background: T.surface,
                borderRadius: "30px 0 0 0",
                overflow: useFullWidth ? "hidden" : "auto",
                height: useFullWidth ? `calc(100vh - ${HH}px)` : undefined,
              }}
            >
              <div
                style={{
                  maxWidth: useFullWidth ? "100%" : IW,
                  margin: useFullWidth ? 0 : "0 auto",
                  padding: useFullWidth ? 0 : "0 48px",
                  width: "100%",
                }}
              >
                {!useFullWidth && breadcrumbs.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 20, paddingBottom: 0 }}>
                    {breadcrumbs.map((crumb, i) => (
                      <span key={crumb.href} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {i > 0 && <span style={{ fontSize: 11, color: T.textFaint }}>/</span>}
                        <Link
                          href={crumb.href}
                          style={{
                            fontSize: 11,
                            fontFamily: T.mono,
                            color: i === breadcrumbs.length - 1 ? T.textMuted : T.textFaint,
                            textDecoration: "none",
                            fontWeight: i === breadcrumbs.length - 1 ? 500 : 400,
                          }}
                        >
                          {crumb.label}
                        </Link>
                      </span>
                    ))}
                  </div>
                )}
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RepoProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </RepoProvider>
  );
}

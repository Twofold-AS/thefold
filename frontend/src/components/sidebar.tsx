"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useRepoContext, type Repo } from "@/lib/repo-context";
import { useUser } from "@/contexts/UserPreferencesContext";

/* ============================================
   Navigation definitions
   ============================================ */

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

function icon(d: string) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const TOP_NAV: NavItem[] = [
  {
    label: "Home",
    href: "/home",
    icon: icon("M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"),
  },
  {
    label: "Chat",
    href: "/chat",
    icon: icon("M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076c1.14 0 2.274-.042 3.4-.124 1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"),
  },
  {
    label: "Environments",
    href: "/environments",
    icon: icon("M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"),
  },
  {
    label: "Marketplace",
    href: "/marketplace",
    icon: icon("M13.5 21v-7.5a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75V21m-6 0V9.75M1.5 21h21M1.5 10.5l10.5-9 10.5 9M7.5 21v-7.5a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75V21"),
  },
];

function getRepoNav(repoName: string): NavItem[] {
  const base = `/repo/${repoName}`;
  return [
    { label: "Oversikt", href: `${base}/overview`, icon: icon("M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z") },
    { label: "Chat", href: `${base}/chat`, icon: icon("M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076c1.14 0 2.274-.042 3.4-.124 1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z") },
    { label: "Oppgaver", href: `${base}/tasks`, icon: icon("M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z") },
    { label: "Reviews", href: `${base}/reviews`, icon: icon("M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z") },
    { label: "Aktivitet", href: `${base}/activity`, icon: icon("M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z") },
  ];
}

/* ============================================
   Sidebar Component
   ============================================ */

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { repos, selectedRepo, selectRepo } = useRepoContext();
  const { initial, avatarColor } = useUser();
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const repoNav = selectedRepo ? getRepoNav(selectedRepo.name) : [];

  function isActive(href: string) {
    if (href === "/home") return pathname === "/home";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function handleRepoSelect(repo: Repo) {
    selectRepo(repo.fullName);
    setRepoDropdownOpen(false);
    router.push(`/repo/${repo.name}/overview`);
  }

  const sidebar = (
    <aside
      className="fixed top-0 left-0 z-50 h-screen w-60 flex flex-col"
      style={{ background: "var(--bg-sidebar)", borderRight: "1px solid var(--sidebar-border)" }}
    >
      {/* Logo + brand + profile */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="TheFold" width={24} height={24} className="flex-shrink-0" />
          <span className="font-brand text-lg font-medium brand-shimmer" style={{ color: "var(--sidebar-text-active)" }}>
            TheFold
          </span>
        </div>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
          style={{ background: avatarColor, color: "#fff" }}
        >
          {initial}
        </div>
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 overflow-y-auto flex flex-col">
        {/* Top-level navigation */}
        <div className="space-y-0.5 px-2 pt-1">
          {TOP_NAV.map((item) => (
            <SidebarNavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={() => setMobileOpen(false)} />
          ))}
        </div>

        {/* Repo section */}
        {selectedRepo && (
          <div className="px-2 mt-3">
            {/* Repo selector — plain text + chevron, no border */}
            <div className="relative px-1 mb-1">
              <button
                onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                className="w-full flex items-center gap-2 py-1.5 text-left"
                style={{
                  background: "transparent",
                  color: "var(--sidebar-text-active)",
                  border: "none",
                  fontSize: "14px",
                }}
              >
                <span className="flex-1 truncate font-medium">{selectedRepo.name}</span>
                <svg
                  className="w-3 h-3 flex-shrink-0 transition-transform"
                  style={{ transform: repoDropdownOpen ? "rotate(180deg)" : "rotate(0deg)", color: "var(--sidebar-text)" }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {repoDropdownOpen && (
                <div
                  className="absolute left-0 right-0 mt-1 py-1 z-50"
                  style={{ background: "#222", border: "1px solid var(--sidebar-border)" }}
                >
                  {repos.map((r) => (
                    <button
                      key={r.fullName}
                      onClick={() => handleRepoSelect(r)}
                      className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
                      style={{ color: "var(--sidebar-text-active)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-sidebar-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span>{r.name}</span>
                      <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>{r.owner}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Repo-scoped pages */}
            <div className="space-y-0.5 pl-2">
              {repoNav.map((item) => (
                <SidebarNavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={() => setMobileOpen(false)} />
              ))}
            </div>
          </div>
        )}

        {/* Spacer pushes Skills/Tools/Settings to bottom */}
        <div className="flex-1" />

        {/* Skills + Tools + Settings pinned to bottom */}
        <div className="space-y-0.5 px-2 pb-3">
          <SidebarNavLink
            item={{
              label: "Skills",
              href: "/skills",
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
              ),
            }}
            active={isActive("/skills")}
            onNavigate={() => setMobileOpen(false)}
          />
          <SidebarNavLink
            item={{
              label: "Tools",
              href: "/tools",
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.193-.14 1.743" />
                </svg>
              ),
            }}
            active={isActive("/tools")}
            onNavigate={() => setMobileOpen(false)}
          />
          <SidebarNavLink
            item={{
              label: "Settings",
              href: "/settings",
              icon: icon("M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"),
            }}
            active={isActive("/settings")}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </nav>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-[60] sm:hidden p-2"
        style={{ background: "var(--bg-sidebar)", border: "1px solid var(--sidebar-border)" }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--sidebar-text-active)" }}>
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          )}
        </svg>
      </button>

      {/* Desktop + tablet sidebar */}
      <div className="hidden sm:block">{sidebar}</div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 sm:hidden" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setMobileOpen(false)} />
          <div className="sm:hidden">{sidebar}</div>
        </>
      )}
    </>
  );
}

/* ============================================
   NavLink sub-component
   ============================================ */

function SidebarNavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors duration-75"
      style={{
        background: active ? "var(--bg-sidebar-active)" : "transparent",
        color: "var(--sidebar-text-active)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-sidebar-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

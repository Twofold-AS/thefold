"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useRepoContext, type Repo } from "@/lib/repo-context";

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
    label: "Environments",
    href: "/environments",
    icon: icon("M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"),
  },
  {
    label: "Secrets",
    href: "/secrets",
    icon: icon("M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"),
  },
  {
    label: "Skills",
    href: "/skills",
    icon: icon("M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: icon("M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"),
  },
  {
    label: "Chat",
    href: "/chat",
    icon: icon("M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"),
  },
];

function getRepoNav(repoName: string): NavItem[] {
  const base = `/repo/${repoName}`;
  return [
    { label: "Overview", href: `${base}/overview`, icon: icon("M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z") },
    { label: "Deploys", href: `${base}/deploys`, icon: icon("M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5") },
    { label: "Infra", href: `${base}/infra`, icon: icon("M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z") },
    { label: "Code", href: `${base}/code`, icon: icon("M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5") },
    { label: "Flow", href: `${base}/flow`, icon: icon("M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5") },
    { label: "Configuration", href: `${base}/configuration`, icon: icon("M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75") },
    { label: "Chat", href: `${base}/chat`, icon: icon("M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076c1.14 0 2.274-.042 3.4-.124 1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z") },
  ];
}

function getObservabilityNav(repoName: string): NavItem[] {
  const base = `/repo/${repoName}`;
  return [
    { label: "Metrics", href: `${base}/metrics`, icon: icon("M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605") },
    { label: "Cost", href: `${base}/cost`, icon: icon("M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z") },
    { label: "Memory", href: `${base}/memory`, icon: icon("M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125") },
    { label: "Tasks", href: `${base}/tasks`, icon: icon("M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z") },
  ];
}

/* ============================================
   Sidebar Component
   ============================================ */

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { repos, selectedRepo, selectRepo } = useRepoContext();
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const repoNav = selectedRepo ? getRepoNav(selectedRepo.name) : [];
  const observabilityNav = selectedRepo ? getObservabilityNav(selectedRepo.name) : [];

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
          <span className="font-brand text-lg font-medium" style={{ color: "var(--sidebar-text-active)" }}>
            TheFold
          </span>
        </div>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
          style={{ background: "#2a2a2a", color: "#888" }}
        >
          KJ
        </div>
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 overflow-y-auto py-3">
        {/* Top-level navigation */}
        <div className="space-y-0.5 px-2">
          {TOP_NAV.map((item) => (
            <SidebarNavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={() => setMobileOpen(false)} />
          ))}
        </div>

        {/* Repo section block */}
        {selectedRepo && (
          <div className="mx-2 mt-5 rounded-lg p-2" style={{ background: "var(--bg-sidebar-section)" }}>
            {/* Repo selector */}
            <div className="px-1 mb-2">
              <div className="relative">
                <button
                  onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left rounded-lg"
                  style={{
                    background: "transparent",
                    color: "var(--sidebar-text-active)",
                    border: "1px solid var(--sidebar-border)",
                  }}
                >
                  <span
                    className="status-dot"
                    style={{ background: selectedRepo.status === "error" ? "var(--error)" : "var(--success)" }}
                  />
                  <span className="flex-1 truncate font-mono text-xs">{selectedRepo.name}</span>
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
                    className="absolute left-0 right-0 mt-1 py-1 z-50 rounded-lg"
                    style={{ background: "#222", border: "1px solid var(--sidebar-border)" }}
                  >
                    {repos.map((r) => (
                      <button
                        key={r.fullName}
                        onClick={() => handleRepoSelect(r)}
                        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                        style={{ color: "var(--sidebar-text-active)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-sidebar-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span className="status-dot" style={{ background: r.status === "error" ? "var(--error)" : "var(--success)" }} />
                        <span className="font-mono">{r.name}</span>
                        <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>{r.owner}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Repo-scoped pages */}
            <div className="space-y-0.5">
              {repoNav.map((item) => (
                <SidebarNavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={() => setMobileOpen(false)} />
              ))}
            </div>
          </div>
        )}

        {/* Observability section block */}
        {selectedRepo && (
          <div className="mx-2 mt-2 rounded-lg p-2" style={{ background: "var(--bg-sidebar-section)" }}>
            <div className="px-3 mb-2">
              <span className="section-label">Observability</span>
            </div>
            <div className="space-y-0.5">
              {observabilityNav.map((item) => (
                <SidebarNavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={() => setMobileOpen(false)} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer: system status */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="status-dot" style={{ background: "var(--success)" }} />
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>System online</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-[60] sm:hidden p-2 rounded-lg"
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
      className="flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors duration-75 rounded-lg"
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

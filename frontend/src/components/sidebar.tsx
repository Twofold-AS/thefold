"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutGrid,
  MessageSquare,
  GitBranch,
  Boxes,
  Cpu,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
  X,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: { category?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: "Overview", href: "/home", icon: LayoutGrid },
    ],
  },
  {
    category: "WORKSPACE",
    items: [
      { label: "Chat", href: "/chat", icon: MessageSquare },
      { label: "Tasks", href: "/tasks", icon: Activity },
      { label: "Repos", href: "/repos", icon: GitBranch },
      { label: "Components", href: "/components", icon: Boxes },
      { label: "Skills", href: "/skills", icon: Sparkles },
    ],
  },
  {
    category: "ACCOUNT",
    items: [
      { label: "AI", href: "/ai", icon: Cpu },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home" || pathname === "/";
    return pathname.startsWith(href);
  };

  function navigateTo(href: string) {
    router.push(href);
    setMobileOpen(false);
  }

  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* Logo */}
      <div
        className="flex items-center h-topbar px-4 border-b"
        style={{ borderColor: "var(--tf-border-faint)" }}
      >
        {!collapsed || isMobile ? (
          <button onClick={() => navigateTo("/home")} className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-md flex items-center justify-center relative" style={{ background: "var(--tf-heat)" }}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-logotype text-[18px] tracking-tight" style={{ color: "var(--tf-text-primary)" }}>
              TheFold
            </span>
          </button>
        ) : (
          <button onClick={() => navigateTo("/home")} className="mx-auto">
            <div className="w-7 h-7 rounded-md flex items-center justify-center relative" style={{ background: "var(--tf-heat)" }}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          </button>
        )}

        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1 rounded-lg"
            style={{ color: "var(--tf-text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV_ITEMS.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-6")}>
            {group.category && (!collapsed || isMobile) && (
              <p className="text-label px-2 mb-2">{group.category}</p>
            )}
            {group.category && collapsed && !isMobile && (
              <div className="h-px mx-2 mb-3" style={{ background: "var(--tf-border-faint)" }} />
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <button
                    key={item.href}
                    onClick={() => navigateTo(item.href)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-[10px] transition-colors text-sm group/nav",
                      collapsed && !isMobile ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                      active && "nav-item-active"
                    )}
                    style={{
                      color: active ? "var(--tf-heat)" : "var(--tf-text-secondary)",
                      background: active ? "rgba(53, 88, 114, 0.06)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = "var(--tf-text-primary)";
                        e.currentTarget.style.background = "var(--tf-surface-raised)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = "var(--tf-text-secondary)";
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                    {(!collapsed || isMobile) && (
                      <span className="flex-1 text-left">{item.label}</span>
                    )}
                    {(!collapsed || isMobile) && item.badge && (
                      <span className="badge-new">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-3 py-3 space-y-2" style={{ borderColor: "var(--tf-border-faint)" }}>
        {(!collapsed || isMobile) && (
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[10px] font-mono" style={{ color: "var(--tf-text-faint)" }}>
              v0.1.0
            </span>
          </div>
        )}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm transition-colors"
            style={{ color: "var(--tf-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--tf-text-primary)";
              e.currentTarget.style.background = "var(--tf-surface-raised)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--tf-text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {collapsed ? (
              <ChevronRight className="w-[18px] h-[18px] mx-auto" />
            ) : (
              <>
                <ChevronLeft className="w-[18px] h-[18px]" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="sm:hidden fixed top-3 left-3 z-50 p-2 rounded-lg"
        style={{ color: "var(--tf-text-secondary)", background: "var(--tf-bg-base)" }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      <div
        className={cn("sidebar-overlay sm:hidden", mobileOpen && "active")}
        onClick={() => setMobileOpen(false)}
      />

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r w-sidebar transition-transform duration-200 sm:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          backgroundColor: "var(--tf-bg-base)",
          borderColor: "var(--tf-border-faint)",
        }}
      >
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-40 flex-col border-r transition-all duration-200 hidden sm:flex",
          collapsed ? "w-[60px]" : "w-sidebar"
        )}
        style={{
          backgroundColor: "var(--tf-bg-base)",
          borderColor: "var(--tf-border-faint)",
        }}
      >
        {sidebarContent(false)}
      </aside>

      {/* Spacer for desktop */}
      <div className={cn("flex-shrink-0 hidden sm:block transition-all duration-200", collapsed ? "w-[60px]" : "w-sidebar")} />
    </>
  );
}

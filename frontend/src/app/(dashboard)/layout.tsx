"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { T, S, Layout } from "@/lib/tokens";
import TopBar from "@/components/TopBar";
import NotifBell from "@/components/NotifBell";
import { Search, ChevronRight, Menu, X } from "lucide-react";
import { RepoProvider } from "@/lib/repo-context";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { getConversations, listTheFoldTasks, getNotifications } from "@/lib/api";

interface Conversation {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  activeTask?: boolean;
}

function extractRepoFromConvId(id: string): string | null {
  if (id.startsWith("repo-")) {
    const parts = id.replace("repo-", "").split("-");
    return parts[0] || null;
  }
  return null;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<"cowork" | "auto">("cowork");
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [showAllConvs, setShowAllConvs] = useState(false);
  const [backlogTasks, setBacklogTasks] = useState<any[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Detect mode from path
  useEffect(() => {
    if (pathname.startsWith("/auto")) setActiveMode("auto");
    else setActiveMode("cowork");
  }, [pathname]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      setConversations(data.conversations ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    const iv = setInterval(fetchConversations, 15000);
    return () => clearInterval(iv);
  }, [fetchConversations]);

  // Fetch backlog tasks for Auto mode
  useEffect(() => {
    if (activeMode !== "auto") return;
    listTheFoldTasks({ status: "backlog", limit: 20 })
      .then((data) => setBacklogTasks(data.tasks ?? []))
      .catch(() => {});
  }, [activeMode]);

  // Fetch notif count
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const data = await getNotifications();
        const lastSeen = localStorage.getItem("tf_notif_last_seen") || "";
        const count = lastSeen
          ? (data.notifications ?? []).filter((n: any) => new Date(n.createdAt) > new Date(lastSeen)).length
          : (data.notifications ?? []).length;
        setNotifCount(count);
      } catch {}
    };
    fetchCount();
    const iv = setInterval(fetchCount, 30000);
    return () => clearInterval(iv);
  }, []);

  // Filter conversations
  const filtered = conversations
    .filter((c) => !c.id.startsWith("inkognito-"))
    .filter((c) => {
      if (!searchQuery) return true;
      const title = c.title || c.id;
      return title.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      const da = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const db = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return da - db;
    })
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  const isFullHeight = pathname === "/cowork" || pathname.startsWith("/cowork/") || pathname === "/auto" || pathname.startsWith("/auto/");

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .mobile-toggle { display: flex !important; }
          .main-area { margin-left: 0 !important; }
        }
        .conv-item { transition: background 0.1s; }
        .conv-item:hover { background: ${T.subtle} !important; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: T.sans, color: T.text }}>
        {/* TOPBAR */}
        <TopBar notifCount={notifCount} onNotifClick={() => setNotifOpen((p) => !p)} />

        {/* Notification popup (rendered at topbar level) */}
        {notifOpen && (
          <div style={{ position: "fixed", top: Layout.topbarHeight, right: 24, zIndex: 200 }}>
            <NotifBell
              onGoTask={(id) => { setNotifOpen(false); router.push("/tasks"); }}
              forceOpen
              onClose={() => setNotifOpen(false)}
            />
          </div>
        )}

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* SIDEBAR */}
          <aside
            className="sidebar-desktop"
            style={{
              width: Layout.sidebarWidth,
              background: T.sidebar,
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              padding: "12px 0",
              margin: "0 24px 24px 24px",
              gap: 12,
              overflow: "hidden",
              borderRadius: 16,
              border: "none",
              height: "calc(100vh - 56px - 24px)",
            }}
          >
            {/* CoWork / Auto tabs */}
            <div
              style={{
                display: "flex",
                background: T.tabWrapper,
                borderRadius: 12,
                padding: 4,
                gap: 4,
                margin: "0 12px",
              }}
            >
              <button
                onClick={() => { setActiveMode("cowork"); router.push("/cowork"); }}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: T.sans,
                  color: activeMode === "cowork" ? T.text : T.textMuted,
                  background: activeMode === "cowork" ? T.tabActive : "transparent",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                CoWork
              </button>
              <button
                onClick={() => { setActiveMode("auto"); router.push("/auto"); }}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: T.sans,
                  color: activeMode === "auto" ? T.text : T.textMuted,
                  background: activeMode === "auto" ? T.tabActive : "transparent",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                Auto
              </button>
            </div>

            {/* Search / task selection wrapper */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: T.search,
                borderRadius: 20,
                padding: "8px 12px",
                margin: "0 12px",
              }}
            >
              <Search size={14} color={T.textMuted} />
              {activeMode === "cowork" ? (
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Søk etter samtale..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: T.text,
                  fontSize: 13,
                  fontFamily: T.sans,
                }}
              />
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13, color: T.textMuted }}>
                    Velg oppgaver
                  </span>
                  {selectedTaskIds.size > 0 && (
                    <button
                      onClick={() => router.push(`/auto?start=${Array.from(selectedTaskIds).join(",")}`)}
                      style={{
                        fontSize: 11, fontWeight: 600, color: T.accent,
                        background: T.accentDim, border: `1px solid ${T.accent}40`,
                        borderRadius: 12, padding: "4px 12px", cursor: "pointer",
                        fontFamily: T.sans, whiteSpace: "nowrap",
                      }}
                    >
                      Start ({selectedTaskIds.size})
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Sidebar content — switches between CoWork (conversations) and Auto (backlog tasks) */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
              {activeMode === "cowork" ? (
                <>
                  {filtered.length === 0 ? (
                    <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
                      {searchQuery ? "Ingen resultater" : "Ingen samtaler ennå"}
                    </div>
                  ) : (
                    (showAllConvs ? filtered : filtered.slice(0, 15)).map((conv) => {
                      const repo = extractRepoFromConvId(conv.id);
                      const title = conv.title || (repo ? `${repo} samtale` : "Ny samtale");
                      return (
                        <Link
                          key={conv.id}
                          href={`/cowork?conv=${encodeURIComponent(conv.id)}`}
                          className="conv-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 12px",
                            borderRadius: 10,
                            textDecoration: "none",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 400, color: T.text,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {title}
                            </div>
                            {repo && (
                              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{repo}</div>
                            )}
                          </div>
                          <ChevronRight size={14} color={T.textFaint} style={{ flexShrink: 0 }} />
                        </Link>
                      );
                    })
                  )}
                  {!showAllConvs && filtered.length > 15 && (
                    <button
                      onClick={() => setShowAllConvs(true)}
                      style={{
                        padding: "10px 12px", fontSize: 12, color: T.accent,
                        background: "transparent", border: "none", cursor: "pointer",
                        fontFamily: T.sans, textAlign: "center",
                      }}
                    >
                      Last inn alle samtaler ({filtered.length - 15} til)
                    </button>
                  )}
                </>
              ) : (
                /* Auto mode — checkboxes for task selection */
                <>
                  {backlogTasks.length === 0 ? (
                    <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
                      Ingen oppgaver i backlog
                    </div>
                  ) : (
                    backlogTasks.map((task: any) => {
                      const isSelected = selectedTaskIds.has(task.id);
                      return (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTaskIds(prev => {
                            const next = new Set(prev);
                            if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                            return next;
                          })}
                          className="conv-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 10,
                            cursor: "pointer",
                          }}
                        >
                          {/* Round checkbox */}
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%",
                            border: `2px solid ${isSelected ? T.accent : T.border}`,
                            background: isSelected ? T.accent : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0, transition: "all 0.15s",
                          }}>
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="#202124" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 400, color: T.text,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {task.title}
                            </div>
                            {task.repo && (
                              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{task.repo}</div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </aside>

          {/* MOBILE HEADER */}
          <header
            className="mobile-toggle"
            style={{
              display: "none",
              height: 48,
              alignItems: "center",
              padding: "0 16px",
              position: "sticky",
              top: 0,
              zIndex: 50,
              background: T.bg,
              justifyContent: "space-between",
            }}
          >
            <div
              onClick={() => setMobileOpen((p) => !p)}
              style={{ cursor: "pointer", color: T.textMuted, padding: 4 }}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </div>
          </header>

          {/* MAIN CONTENT */}
          <main
            className="main-area"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: isFullHeight ? "hidden" : "auto",
            }}
          >
            <ErrorBoundary>
              <div
                style={{
                  ...(isFullHeight
                    ? { flex: 1, display: "flex", flexDirection: "column" as const, minHeight: 0, overflow: "hidden" }
                    : { flex: 1, maxWidth: 1280, width: "100%", margin: "0 auto", padding: `${S.xl}px ${S.xxl}px` }),
                }}
              >
                {children}
              </div>
            </ErrorBoundary>
          </main>
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

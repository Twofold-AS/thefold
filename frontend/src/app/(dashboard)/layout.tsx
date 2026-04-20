"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { T, S, Layout } from "@/lib/tokens";
import TopBar from "@/components/TopBar";
import NotifBell from "@/components/NotifBell";
import GlobalBackground from "@/components/GlobalBackground";
import { Search, Menu, X } from "lucide-react";
import { RepoProvider, useRepoContext } from "@/lib/repo-context";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import BrainActivityStripe from "@/components/BrainActivityStripe";
import { getConversations, listTheFoldTasks, listSubTasks, getNotifications, archiveConversation } from "@/lib/api";

interface Conversation {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  activeTask?: boolean;
}

// Conv-id format: `repo-${repoName}-${uuid}`. repoName may itself contain hyphens
// (e.g. "Mikael-er-kul"), so a naive split("-") drops everything after the first chunk.
// Anchor on the trailing UUID instead.
const REPO_ID_REGEX = /^repo-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractRepoFromConvId(id: string): string | null {
  const m = id.match(REPO_ID_REGEX);
  return m ? m[1] : null;
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
  const [sidebarTasks, setSidebarTasks] = useState<any[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [expandedSidebarTaskId, setExpandedSidebarTaskId] = useState<string | null>(null);
  const [sidebarSubTasks, setSidebarSubTasks] = useState<Record<string, any[]>>({});
  const [sidebarSubLoading, setSidebarSubLoading] = useState<Record<string, boolean>>({});
  const [repoView, setRepoView] = useState<string | null>(null);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const convParam = searchParams.get("conv");
  const { repos, selectedRepo, selectRepo } = useRepoContext();

  useEffect(() => {
    if (pathname.startsWith("/auto")) setActiveMode("auto");
    else setActiveMode("cowork");
  }, [pathname]);

  const convCacheRef = useRef<{ data: Conversation[]; time: number } | null>(null);

  const fetchConversations = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const cached = convCacheRef.current;

    // If we have fresh cache and not forced, skip
    if (!forceRefresh && cached && now - cached.time < 30_000) return;

    try {
      const data = await getConversations();
      const convs = (data.conversations ?? []) as Conversation[];
      convCacheRef.current = { data: convs, time: now };
      setConversations(convs);
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    // No polling interval — conversations refresh on demand via refreshConvs() after sends.
  }, [fetchConversations]);

  useEffect(() => {
    if (activeMode !== "auto") return;
    listTheFoldTasks({ rootOnly: true, limit: 20 })
      .then((data) => setSidebarTasks(data.tasks ?? []))
      .catch(() => {});
  }, [activeMode]);

  // Fetch notification count once on mount for the badge (no polling loop).
  // NotifBell handles fresh data via its own 60s interval when the popup is open.
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const data = await getNotifications();
        const actionable = (data.notifications ?? []).filter((n: any) => {
          if (["agent_status", "agent_report"].includes(n.type)) return false;
          try { const p = JSON.parse(n.content); if (p?.type === "status" || p?.type === "thought") return false; } catch {}
          return true;
        });
        const lastSeen = localStorage.getItem("tf_notif_last_seen") || "";
        const count = lastSeen
          ? actionable.filter((n: any) => new Date(n.createdAt) > new Date(lastSeen)).length
          : actionable.length;
        setNotifCount(count);
      } catch {}
    };
    fetchCount();
  }, []);

  // When a repo is selected, show only that project's convos; otherwise show all
  const filtered = conversations
    .filter((c) => !c.id.startsWith("inkognito-"))
    .filter((c) => {
      if (selectedRepo) {
        const repoName = extractRepoFromConvId(c.id)?.toLowerCase();
        if (!repoName) return false;
        const shortName = (selectedRepo.fullName?.split("/")[1] ?? selectedRepo.name).toLowerCase();
        const fallbackName = selectedRepo.name.toLowerCase();
        return repoName === shortName || repoName === fallbackName;
      }
      return true;
    })
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

  const isIncognito = activeMode === "cowork" && !selectedRepo;

  const [showAllRepos, setShowAllRepos] = useState(false);

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
        .repo-item { transition: background 0.2s ease, opacity 0.15s ease; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: T.sans, color: T.text, position: "relative" }}>
        <GlobalBackground />
        <TopBar notifCount={notifCount} onNotifClick={() => setNotifOpen((p) => !p)} onNewChat={() => router.push("/cowork")} />

        {notifOpen && (
          <div style={{ position: "fixed", top: Layout.topbarHeight, right: 24, zIndex: 200 }}>
            <NotifBell
              onGoTask={() => { setNotifOpen(false); router.push("/tasks"); }}
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
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
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
              position: "relative",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <BrainActivityStripe />
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
                  flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 500,
                  fontFamily: T.sans,
                  color: activeMode === "cowork" ? T.text : T.textMuted,
                  background: activeMode === "cowork" ? T.tabActive : "transparent",
                  border: "none", borderRadius: 10, cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                CoWork
              </button>
              <button
                onClick={() => { setActiveMode("auto"); router.push("/auto"); }}
                style={{
                  flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 500,
                  fontFamily: T.sans,
                  color: activeMode === "auto" ? T.text : T.textMuted,
                  background: activeMode === "auto" ? T.tabActive : "transparent",
                  border: "none", borderRadius: 10, cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                Auto
              </button>
            </div>

            {/* Search / task selection */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: T.search, borderRadius: 20,
                padding: "8px 12px", margin: "0 12px",
              }}
            >
              <Search size={14} color={T.textMuted} />
              {activeMode === "cowork" ? (
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Søk etter samtale..."
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    outline: "none", color: T.text, fontSize: 13, fontFamily: T.sans,
                  }}
                />
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13, color: T.textMuted }}>Velg oppgaver</span>
                  {selectedTaskIds.size > 0 && (
                    <button
                      onClick={() => router.push(`/auto?start=${Array.from(selectedTaskIds).join(",")}`)}
                      style={{
                        fontSize: 11, fontWeight: 600, color: T.text,
                        background: T.tabActive, border: `1px solid ${T.border}`,
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

            {/* Sidebar content — no overflow on the outer wrapper, only historikk scrolls */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 8px", minHeight: 0, overflow: "hidden" }}>
              {activeMode === "cowork" ? (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginTop: 4 }}>

                  {/* "Se alle prosjekter"-visning */}
                  {showAllRepos ? (
                    <>
                      <button
                        onClick={() => setShowAllRepos(false)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "6px 4px", marginBottom: 4,
                          fontSize: 12, fontWeight: 500, color: T.textMuted,
                          background: "transparent", border: "none",
                          cursor: "pointer", fontFamily: T.sans, flexShrink: 0,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                        Tilbake
                      </button>
                      <div style={{ padding: "2px 4px 6px", fontSize: 10, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                        Alle prosjekter
                      </div>
                      {/* Scrollable repo list */}
                      <div style={{ flex: 1, overflowY: "scroll", scrollbarWidth: "none" as any }}>
                        {repos.map((repo) => (
                          <div
                            key={repo.fullName}
                            onClick={() => { selectRepo(repo.fullName); setShowAllRepos(false); router.push("/cowork"); }}
                            className="conv-item repo-item"
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 4px", borderRadius: 10, cursor: "pointer" }}
                          >
                            <img src="https://github.com/favicon.ico" width={14} height={14} alt="" style={{ flexShrink: 0, borderRadius: 2, opacity: 0.8 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 400, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {repo.name}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Prosjekter — maks 5 */}
                      {repos.length > 0 && (
                        <>
                          <div style={{ padding: "2px 4px 2px", fontSize: 10, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                            Prosjekter
                          </div>
                          {repos.slice(0, 5).map((repo) => (
                            <div
                              key={repo.fullName}
                              onClick={() => { selectRepo(repo.fullName); router.push("/cowork"); }}
                              className="conv-item repo-item"
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 4px", borderRadius: 10, cursor: "pointer", flexShrink: 0 }}
                            >
                              <img src="https://github.com/favicon.ico" width={14} height={14} alt="" style={{ flexShrink: 0, borderRadius: 2, opacity: 0.8 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 400, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {repo.name}
                                </div>
                              </div>
                            </div>
                          ))}
                          {repos.length > 5 && (
                            <button
                              onClick={() => setShowAllRepos(true)}
                              style={{
                                padding: "7px 4px", fontSize: 12, color: T.textMuted,
                                background: "transparent", border: "none", cursor: "pointer",
                                fontFamily: T.sans, textAlign: "left", width: "100%", flexShrink: 0,
                                display: "flex", alignItems: "center", gap: 4,
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>subdirectory_arrow_right</span>
                              Se alle prosjekter ({repos.length})
                            </button>
                          )}
                        </>
                      )}

                      {/* Spacer — push historikk to the bottom */}
                      <div style={{ flex: 1, minHeight: 12 }} />

                      {/* Historikk — fixed height at bottom of sidebar */}
                      <div style={{
                        background: T.tabActive,
                        borderRadius: 12,
                        padding: "10px 10px 12px",
                        marginTop: 0,
                        margin: "0 4px",
                        flex: "0 0 46%",
                        height: "46%",
                        minHeight: 80,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}>
                        <div style={{ marginBottom: 6, paddingLeft: 4, flexShrink: 0 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: T.textFaint,
                            textTransform: "uppercase", letterSpacing: "0.06em",
                            background: T.tabWrapper,
                            borderRadius: 6,
                            padding: "2px 8px",
                            display: "inline-block",
                          }}>
                            Historikk
                          </span>
                        </div>
                        {/* Inkognito-indikator når ingen repo er valgt */}
                        {isIncognito && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "5px 6px", marginBottom: 4,
                            background: `${T.tabActive}`, borderRadius: 8,
                            flexShrink: 0,
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: T.textMuted }}>visibility_off</span>
                            <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Inkognito — ikke lagret</span>
                          </div>
                        )}
                        {/* Scrollable list */}
                        <div style={{ flex: 1, overflowY: "scroll", scrollbarWidth: "none" as any, minHeight: 0 }}>
                          {filtered.length === 0 ? (
                            <div style={{ padding: "12px 4px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
                              {isIncognito ? "Inkognito — ingen historikk" : searchQuery ? "Ingen resultater" : "Ingen samtaler ennå"}
                            </div>
                          ) : (
                            filtered.map((conv) => {
                              const repoName = extractRepoFromConvId(conv.id);
                              return (
                                <div
                                  key={conv.id}
                                  className="conv-item"
                                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px", borderRadius: 8, position: "relative" }}
                                  onMouseEnter={() => setHoveredConvId(conv.id)}
                                  onMouseLeave={() => setHoveredConvId(null)}
                                >
                                  <Link href={`/cowork?conv=${encodeURIComponent(conv.id)}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
                                    <div style={{ fontSize: 13, fontWeight: 400, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {conv.title || "Ny samtale"}
                                    </div>
                                    {repoName && !selectedRepo && (
                                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {repoName}
                                      </div>
                                    )}
                                  </Link>
                                  {hoveredConvId === conv.id && (
                                    <button
                                      onClick={async (e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        try { await archiveConversation(conv.id); fetchConversations(true); } catch {}
                                      }}
                                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: T.textMuted, display: "flex", alignItems: "center" }}
                                      title="Arkiver samtale"
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory_2</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Auto mode */
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginTop: 12 }}>
                  {/* Oppgaver section title */}
                  <div style={{ padding: "2px 4px 2px", fontSize: 10, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                    Oppgaver
                  </div>
                  {sidebarTasks.length === 0 ? (
                    <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
                      Ingen oppgaver
                    </div>
                  ) : (
                    sidebarTasks.map((task: any) => {
                      const isExpanded = expandedSidebarTaskId === task.id;
                      const subTasks = sidebarSubTasks[task.id] ?? [];
                      const subLoading = sidebarSubLoading[task.id] ?? false;
                      const dotColor = task.status === "in_progress" ? T.accent
                        : task.status === "done" || task.status === "completed" ? (T.success ?? "#22c55e")
                        : task.status === "blocked" ? (T.error ?? "#f87171")
                        : T.textFaint;
                      return (
                        <div key={task.id}>
                          <div
                            onClick={async () => {
                              if (isExpanded) {
                                setExpandedSidebarTaskId(null);
                              } else {
                                setExpandedSidebarTaskId(task.id);
                                if (!sidebarSubTasks[task.id]) {
                                  setSidebarSubLoading(prev => ({ ...prev, [task.id]: true }));
                                  try {
                                    const r = await listSubTasks(task.id);
                                    setSidebarSubTasks(prev => ({ ...prev, [task.id]: r.tasks }));
                                  } catch {
                                    setSidebarSubTasks(prev => ({ ...prev, [task.id]: [] }));
                                  } finally {
                                    setSidebarSubLoading(prev => ({ ...prev, [task.id]: false }));
                                  }
                                }
                              }
                            }}
                            className="conv-item"
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, cursor: "pointer" }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 400, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {task.title}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 11, padding: "1px 6px", borderRadius: 4,
                              background: dotColor + "20", color: dotColor, fontFamily: T.mono, whiteSpace: "nowrap", flexShrink: 0,
                            }}>
                              {task.status === "in_progress" ? "aktiv" : task.status === "done" ? "done" : task.status}
                            </span>
                          </div>
                          {isExpanded && (
                            <div style={{ marginLeft: 20, paddingBottom: 4 }}>
                              {subLoading ? (
                                <div style={{ fontSize: 11, color: T.textFaint, padding: "4px 8px" }}>Laster...</div>
                              ) : subTasks.length === 0 ? (
                                <div style={{ display: "flex", alignItems: "flex-start" }}>
                                  <div style={{ width: 16, minWidth: 16, alignSelf: "stretch", position: "relative", marginRight: 6 }}>
                                    <div style={{ position: "absolute", top: 0, bottom: "50%", left: 6, borderLeft: `1px solid ${T.border}` }} />
                                    <div style={{ position: "absolute", top: "50%", left: 6, width: 10, borderBottom: `1px solid ${T.border}` }} />
                                  </div>
                                  <div style={{ fontSize: 11, color: T.textFaint, padding: "4px 0" }}>Ingen deloppgaver</div>
                                </div>
                              ) : (
                                subTasks.map((sub: any, i: number) => (
                                  <div key={sub.id} style={{ display: "flex", alignItems: "flex-start" }}>
                                    <div style={{ width: 16, minWidth: 16, alignSelf: "stretch", position: "relative", marginRight: 6 }}>
                                      <div style={{ position: "absolute", top: 0, bottom: i === subTasks.length - 1 ? "50%" : 0, left: 6, borderLeft: `1px solid ${T.border}` }} />
                                      <div style={{ position: "absolute", top: "50%", left: 6, width: 10, borderBottom: `1px solid ${T.border}` }} />
                                    </div>
                                    <div
                                      onClick={(e) => { e.stopPropagation(); router.push(`/tasks?start=${sub.id}`); }}
                                      className="conv-item"
                                      style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 6, cursor: "pointer" }}
                                    >
                                      <span style={{ fontSize: 11, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.title}</span>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); router.push(`/auto?start=${sub.id}`); }}
                                        style={{
                                          background: T.tabActive, border: "none", borderRadius: 4,
                                          width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                                          cursor: "pointer", flexShrink: 0,
                                        }}
                                        title="Start oppgave"
                                      >
                                        <svg width="8" height="8" viewBox="0 0 8 8" fill={T.textMuted}>
                                          <polygon points="1,0.5 7.5,4 1,7.5" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* MOBILE HEADER */}
          <header
            className="mobile-toggle"
            style={{
              display: "none", height: 48, alignItems: "center",
              padding: "0 16px", position: "sticky", top: 0, zIndex: 50,
              background: T.bg, justifyContent: "space-between",
            }}
          >
            <div onClick={() => setMobileOpen((p) => !p)} style={{ cursor: "pointer", color: T.textMuted, padding: 4 }}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </div>
          </header>

          {/* MAIN CONTENT */}
          <main
            className="main-area"
            style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: isFullHeight ? "hidden" : "auto" }}
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
      <Suspense fallback={null}>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </Suspense>
    </RepoProvider>
  );
}

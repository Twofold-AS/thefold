"use client";

import React, { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { T, S, Layout } from "@/lib/tokens";
import TopBar from "@/components/topbar";
import NotifBell from "@/components/NotifBell";
import GlobalBackground from "@/components/GlobalBackground";
import { Menu, X, ArrowLeft, Circle, Projector, Ghost, Paintbrush, AppWindowMac } from "lucide-react";
import { RepoProvider, useRepoContext } from "@/lib/repo-context";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import BrainActivityStripe from "@/components/BrainActivityStripe";
import DreamStatusWidget from "@/components/DreamStatusWidget";
import { getConversations, getNotifications, archiveConversation, listTFProjects, type TFProject } from "@/lib/api";
import { buildUrl } from "@/lib/url-utils";
import PlatformIcon from "@/components/icons/PlatformIcon";
import SquigglyDivider from "@/components/SquigglyDivider";
import AgentAvatar from "@/components/AgentAvatar";
import ProjectSettingsModal from "@/components/ProjectSettingsModal";
import CodeProjectModal from "@/components/CodeProjectModal";
import DesignProjectModal from "@/components/DesignProjectModal";
import ProjectSyncModal from "@/components/ProjectSyncModal";
import { Settings as SettingsIcon, RefreshCw } from "lucide-react";

interface Conversation {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  activeTask?: boolean;
  scope?: "incognito" | "cowork" | "designer";
  projectId?: string | null;
}

// Conv-id format: `repo-${repoName}-${uuid}`. repoName may itself contain hyphens
// (e.g. "Mikael-er-kul"), so a naive split("-") drops everything after the first chunk.
// Anchor on the trailing UUID instead.
const REPO_ID_REGEX = /^repo-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared sidebar header style — applied to "Prosjekter" (flat-view),
// project title (drill-in), and "Samtalehistorikk" label so they all
// have the same size/weight/position.
const sidebarHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 6px",
  fontSize: 14,
  fontWeight: 600,
  color: T.text,
  fontFamily: T.sans,
  flexShrink: 0,
};

function extractRepoFromConvId(id: string): string | null {
  const m = id.match(REPO_ID_REGEX);
  return m ? m[1] : null;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Tre modi: Incognito (default, tom sidebar, privat-samtale-plassholder),
  // CoWork (kode-prosjekter), Designer (design-prosjekter).
  const [activeMode, setActiveMode] = useState<"incognito" | "cowork" | "designer">("incognito");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  // Cached per scope: null = not yet loaded (show loader), [] or [...] = loaded.
  const [tfProjectsByScope, setTfProjectsByScope] = useState<{
    cowork: TFProject[] | null;
    designer: TFProject[] | null;
  }>({ cowork: null, designer: null });
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [settingsProject, setSettingsProject] = useState<TFProject | null>(null);
  const [newProjectScope, setNewProjectScope] = useState<"cowork" | "designer" | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  // Drill-in state: driven entirely by URL `?project=<uuid>`. No local useState —
  // keeps sidebar + chat-page in sync without cross-component state drift.
  const searchParams = useSearchParams();
  const selectedSidebarProjectId = searchParams.get("project");
  const { selectedRepo } = useRepoContext();

  useEffect(() => {
    if (pathname.startsWith("/cowork")) setActiveMode("cowork");
    else if (pathname.startsWith("/designer")) setActiveMode("designer");
    else if (pathname === "/") setActiveMode("incognito");
    else if (pathname.startsWith("/auto")) {
      // Legacy /auto-rute: redirect til /cowork?mode=auto
      router.replace("/cowork?mode=auto");
    }
    // Andre ruter (/tasks, /dreams, osv.) lar activeMode stå — den speiler
    // bare sist aktive chat-fane uansett hvor bruker er.
  }, [pathname, router]);

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

  // Fase I.0.d — Hent TFProjects filtrert pr. aktiv mode (cowork vs designer).
  // Caches per scope so tab-switch after first load shows instantly — no loader
  // flash. `force=true` re-fetches (used after mutations like link-repo/delete).
  // Incognito har ingen prosjekter — fetchen hoppes over for den fanen.
  const fetchTFProjects = useCallback(async (force = false) => {
    if (activeMode === "incognito") return;
    const scope = activeMode === "designer" ? "designer" : "cowork";
    // Skip fetch if we already have data for this scope and no force-refresh
    // is requested. Prevents loader flash on tab-switch.
    const current = tfProjectsByScope[scope];
    if (!force && current !== null) return;
    try {
      const res = await listTFProjects(scope);
      // eslint-disable-next-line no-console
      console.log("[sidebar] listTFProjects", scope, "→", res.projects?.length ?? 0,
        (res.projects ?? []).map((p) => ({ id: p.id, name: p.name, type: p.projectType })));
      setTfProjectsByScope((prev) => ({ ...prev, [scope]: res.projects ?? [] }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[sidebar] listTFProjects failed", err);
      setTfProjectsByScope((prev) => ({ ...prev, [scope]: [] }));
    }
  }, [activeMode, tfProjectsByScope]);

  // Current-scope projects list (null until first load completes).
  // Incognito: alltid tom liste, ingen loader.
  const tfProjects = activeMode === "incognito"
    ? []
    : tfProjectsByScope[activeMode] ?? [];
  const loadingProjects = activeMode === "incognito"
    ? false
    : tfProjectsByScope[activeMode as "cowork" | "designer"] === null;

  useEffect(() => {
    fetchTFProjects();
  }, [fetchTFProjects]);

  // Fase I.0.f — Custom event "tf:new-project" fra ComposerPopup bunn-knappen.
  // Lytteren her åpner CodeProjectModal/DesignProjectModal (I.3).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { scope?: "cowork" | "designer" } | undefined;
      setNewProjectScope(detail?.scope ?? "cowork");
    };
    window.addEventListener("tf:new-project", handler);
    return () => window.removeEventListener("tf:new-project", handler);
  }, []);

  // "tf:conv-list-changed" — fired by chat pages after send / SSE
  // chat.message_update / agent.done. The sidebar's conversation cache is
  // 30s-long so a new conv would otherwise not appear until the next
  // natural fetch. forceRefresh=true bypasses the cache.
  useEffect(() => {
    const handler = () => {
      console.log("[layout] tf:conv-list-changed received, force-refresh convs");
      fetchConversations(true);
    };
    window.addEventListener("tf:conv-list-changed", handler);
    return () => window.removeEventListener("tf:conv-list-changed", handler);
  }, [fetchConversations]);

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

  // Scope-gate + project-gate: when drilled into a project, match conversations.project_id
  // OR fall back to repo-name-prefix for legacy conversations (created before link-repo backfill).
  const drilledProjectForFilter = selectedSidebarProjectId
    ? tfProjects.find((p) => p.id === selectedSidebarProjectId) ?? null
    : null;
  const drilledRepoName = drilledProjectForFilter?.githubRepo?.split("/")[1]?.toLowerCase() ?? null;

  // Incognito-fanen viser INGEN samtaler i sidebaren (privat-modus, plassholder).
  // TODO: wire up content when decided — for nå returneres en tom liste.
  const filtered = activeMode === "incognito"
    ? []
    : conversations
    .filter((c) => !c.id.startsWith("inkognito-"))
    .filter((c) => {
      const convScope = c.scope ?? "cowork";
      return convScope === activeMode;
    })
    .filter((c) => {
      if (selectedSidebarProjectId) {
        // Primary: direct project_id match (populated on new chats + backfilled on link-repo).
        if (c.projectId === selectedSidebarProjectId) return true;
        // Fallback: legacy conversation with no project_id but matching repo-name in id-prefix.
        if (!c.projectId && drilledRepoName) {
          const convRepo = extractRepoFromConvId(c.id)?.toLowerCase();
          if (convRepo === drilledRepoName) return true;
        }
        return false;
      }
      // No drill-in — legacy behaviour (repo filter / all)
      if (selectedRepo) {
        const repoName = extractRepoFromConvId(c.id)?.toLowerCase();
        if (!repoName) return false;
        const shortName = (selectedRepo.fullName?.split("/")[1] ?? selectedRepo.name).toLowerCase();
        const fallbackName = selectedRepo.name.toLowerCase();
        return repoName === shortName || repoName === fallbackName;
      }
      return true;
    })
    .sort((a, b) => {
      const da = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const db = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return da - db;
    })
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  // Resolve the drilled-in project object from id.
  const drilledProject = selectedSidebarProjectId
    ? tfProjects.find((p) => p.id === selectedSidebarProjectId) ?? null
    : null;

  // Active conversation id — used to render the filled bullet.
  const activeConvId = typeof window !== "undefined"
    ? new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("conv")
    : null;

  const isFullHeight = pathname === "/" || pathname === "/cowork" || pathname.startsWith("/cowork/") || pathname === "/designer" || pathname.startsWith("/designer/");

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
        <TopBar
          notifCount={notifCount}
          onNotifClick={() => setNotifOpen((p) => !p)}
          onNewChat={() => {
            // Respect the current tab — Incognito (=/)/Designer/CoWork.
            const basePath = activeMode === "incognito"
              ? "/"
              : activeMode === "designer" ? "/designer" : "/cowork";
            router.push(buildUrl(basePath, { conv: null }));
          }}
        />

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
            {/* Incognito / CoWork / Designer tabs. Incognito er default landing. */}
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
              {/* Ikon vises KUN på aktiv fane; inaktive har kun tekst.
                  Aktiv-styling (farge + background) beholdes uendret. */}
              <button
                onClick={() => {
                  setActiveMode("incognito");
                  router.push(buildUrl("/", { project: null, conv: null }));
                }}
                title="Incognito"
                style={{
                  flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 500,
                  fontFamily: T.sans,
                  color: activeMode === "incognito" ? T.text : T.textMuted,
                  background: activeMode === "incognito" ? T.tabActive : "transparent",
                  border: "none", borderRadius: 10, cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {activeMode === "incognito" && <Ghost size={14} strokeWidth={1.75} />}
                <span>Incognito</span>
              </button>
              <button
                onClick={() => {
                  setActiveMode("cowork");
                  // Scope-switch: drop project + conv (belongs to other mode) via buildUrl
                  router.push(buildUrl("/cowork", { project: null, conv: null }));
                }}
                style={{
                  flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 500,
                  fontFamily: T.sans,
                  color: activeMode === "cowork" ? T.text : T.textMuted,
                  background: activeMode === "cowork" ? T.tabActive : "transparent",
                  border: "none", borderRadius: 10, cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {activeMode === "cowork" && <AppWindowMac size={14} strokeWidth={1.75} />}
                <span>CoWork</span>
              </button>
              <button
                onClick={() => {
                  setActiveMode("designer");
                  router.push(buildUrl("/designer", { project: null, conv: null }));
                }}
                style={{
                  flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 500,
                  fontFamily: T.sans,
                  color: activeMode === "designer" ? T.text : T.textMuted,
                  background: activeMode === "designer" ? T.tabActive : "transparent",
                  border: "none", borderRadius: 10, cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {activeMode === "designer" && <Paintbrush size={14} strokeWidth={1.75} />}
                <span>Designer</span>
              </button>
            </div>

            {/* Sidebar content — drill-in pattern (2026-04-22 refactor).
                Default: flat project list. After clicking a project: project header
                + back button + scoped conversation list (no Historikk-wrapper).
                Incognito-fane: tom plassholder (ingen convs, ingen prosjekter — privat-modus). */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 8px", minHeight: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginTop: 4 }}>
                {activeMode === "incognito" ? (
                  /* ── INCOGNITO STATE ── tom plassholder, ingen logging. */
                  /* TODO: wire up content when decided */
                  <>
                    <div style={{ ...sidebarHeaderStyle }}>
                      <Ghost size={16} color={T.text} />
                      <span>Incognito</span>
                    </div>
                    <div style={{ padding: "12px 6px", flexShrink: 0 }}>
                      <SquigglyDivider height={16} mode="static" />
                    </div>
                    <div style={{
                      padding: "24px 6px",
                      textAlign: "center",
                      fontSize: 12,
                      color: T.textMuted,
                      lineHeight: 1.6,
                      fontFamily: T.sans,
                    }}>
                      Privat samtale.<br/>Ingenting lagres.
                    </div>
                  </>
                ) : drilledProject ? (
                  /* ── PROJECT-DRILLED STATE ── */
                  <>
                    {/* Project title — sidebarHeaderStyle, ikon + navn + innstillinger */}
                    <div style={{ ...sidebarHeaderStyle }}>
                      <PlatformIcon type={drilledProject.projectType} size={16} />
                      <div style={{
                        flex: 1, minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {drilledProject.name}
                      </div>
                      <button
                        onClick={() => setSettingsProject(drilledProject)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: T.textMuted, display: "flex", alignItems: "center" }}
                        title="Prosjekt-innstillinger"
                      >
                        <SettingsIcon size={14} />
                      </button>
                    </div>

                    {/* Separator between project title and conv list */}
                    <div style={{ padding: "12px 6px", flexShrink: 0 }}>
                      <SquigglyDivider height={16} mode="static" />
                    </div>

                    {/* Conversations list — no background, bullet icons, large hit-target. */}
                    <div style={{ flex: 1, overflowY: "scroll", scrollbarWidth: "none" as any, minHeight: 0 }}>
                      {filtered.length === 0 ? (
                        <div style={{ padding: "12px 4px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
                          Ingen samtaler ennå
                        </div>
                      ) : (
                        filtered.map((conv) => {
                          const isActive = activeConvId === conv.id;
                          return (
                            <div
                              key={conv.id}
                              className="conv-item"
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "8px 6px", borderRadius: 8, position: "relative",
                                background: "transparent",
                              }}
                              onMouseEnter={() => setHoveredConvId(conv.id)}
                              onMouseLeave={() => setHoveredConvId(null)}
                            >
                              {/* Active conversation: solid filled circle.
                                  Inactive: outline ring only (no dot).
                                  Lucide's `Circle` paints fill=currentColor when
                                  we set it explicitly; default is transparent
                                  which gives us the outline-only variant. */}
                              {isActive
                                ? <Circle size={11} color={T.text} fill={T.text} style={{ flexShrink: 0 }} />
                                : <Circle size={11} color={T.text} style={{ flexShrink: 0 }} />}
                              <Link
                                href={buildUrl(
                                  activeMode === "designer" ? "/designer" : "/cowork",
                                  { conv: conv.id },
                                )}
                                style={{ flex: 1, minWidth: 0, textDecoration: "none" }}
                              >
                                <div style={{
                                  fontSize: 13,
                                  fontWeight: isActive ? 500 : 400,
                                  color: isActive ? T.text : T.textMuted,
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {conv.title || "Ny samtale"}
                                </div>
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
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  /* ── DEFAULT PROJECT-LIST STATE ── */
                  <>
                    <div style={{ ...sidebarHeaderStyle }}>
                      <Projector size={16} color={T.text} />
                      <span>Prosjekter</span>
                    </div>
                    <div style={{ padding: "12px 6px", flexShrink: 0 }}>
                      <SquigglyDivider height={16} mode="static" />
                    </div>
                    {loadingProjects ? (
                      <div style={{ padding: "32px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                        <AgentAvatar size={32} state="working" />
                        <span style={{
                          fontSize: 11,
                          color: "transparent",
                          backgroundImage:
                            "linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.3) 100%)",
                          backgroundSize: "200% 100%",
                          backgroundClip: "text",
                          WebkitBackgroundClip: "text",
                          animation: "tf-shimmer 2.5s linear infinite",
                          fontFamily: T.sans,
                        }}>
                          Laster prosjekter...
                        </span>
                      </div>
                    ) : tfProjects.length === 0 ? (
                      <div style={{ padding: "18px 6px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
                        Ingen prosjekter ennå
                      </div>
                    ) : (
                      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" as any }}>
                        {tfProjects.map((proj) => (
                          <div
                            key={proj.id}
                            onMouseEnter={() => setHoveredProjectId(proj.id)}
                            onMouseLeave={() => setHoveredProjectId(null)}
                            onClick={() => {
                              const basePath = activeMode === "designer" ? "/designer" : "/cowork";
                              // Drill-in: set project, preserve conv if user is mid-chat
                              router.replace(buildUrl(basePath, { project: proj.id }));
                            }}
                            className="conv-item repo-item"
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 6px", borderRadius: 10, cursor: "pointer", position: "relative" }}
                          >
                            <PlatformIcon type={proj.projectType} size={14} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 400, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {proj.name}
                              </div>
                            </div>
                            {hoveredProjectId === proj.id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setSettingsProject(proj); }}
                                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, color: T.textMuted, display: "flex", alignItems: "center", flexShrink: 0 }}
                                title="Prosjekt-innstillinger"
                              >
                                <SettingsIcon size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bunn-row: Synkroniser alltid venstre, Tilbake til høyre i drill-in. */}
            <div style={{
              display: "flex",
              justifyContent: "flex-start",
              gap: 8,
              padding: "0 12px",
              marginTop: "auto",
              marginBottom: 12,
            }}>
              <button
                type="button"
                onClick={() => setSyncModalOpen(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "#3c4043", borderRadius: 20, border: "none",
                  padding: "8px 16px",
                  width: "fit-content",
                  color: "#FFFFFF", cursor: "pointer", userSelect: "none",
                  fontFamily: T.sans, fontSize: 13,
                }}
              >
                <RefreshCw size={14} color="#FFFFFF" />
                <span>Synkroniser</span>
              </button>
              {drilledProject && (
                <button
                  type="button"
                  onClick={() => {
                    const basePath = activeMode === "designer" ? "/designer" : "/cowork";
                    router.replace(buildUrl(basePath, { project: null }));
                  }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "#3c4043", borderRadius: 20, border: "none",
                    padding: "8px 16px",
                    width: "fit-content",
                    color: "#FFFFFF",
                    cursor: "pointer", userSelect: "none", fontFamily: T.sans,
                    fontSize: 13,
                  }}
                >
                  <ArrowLeft size={14} color="#FFFFFF" />
                  <span>Tilbake</span>
                </button>
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

      {/* Fase I.0.d — Per-prosjekt innstillinger, mountet på layout-nivå */}
      <ProjectSettingsModal
        project={settingsProject}
        open={settingsProject !== null}
        onClose={() => setSettingsProject(null)}
        onSaved={(p) => {
          const scope = p.projectType === "code" ? "cowork" : "designer";
          setTfProjectsByScope((prev) => ({
            ...prev,
            [scope]: (prev[scope] ?? []).map((x) => (x.id === p.id ? p : x)),
          }));
          setSettingsProject(null);
        }}
        onArchived={(id) => {
          setTfProjectsByScope((prev) => ({
            cowork: prev.cowork === null ? null : prev.cowork.filter((x) => x.id !== id),
            designer: prev.designer === null ? null : prev.designer.filter((x) => x.id !== id),
          }));
          setSettingsProject(null);
        }}
      />

      {/* Fase I.3 — Split: CodeProjectModal (CoWork) + DesignProjectModal (Designer).
         Åpnes via "tf:new-project"-event dispatchet fra ComposerPopup bunn-knappen. */}
      <CodeProjectModal
        open={newProjectScope === "cowork"}
        onClose={() => setNewProjectScope(null)}
        onCreated={(p) => {
          setTfProjectsByScope((prev) => ({
            ...prev,
            cowork: [p, ...(prev.cowork ?? [])],
          }));
          setNewProjectScope(null);
        }}
      />
      <DesignProjectModal
        open={newProjectScope === "designer"}
        onClose={() => setNewProjectScope(null)}
        onCreated={(p) => {
          setTfProjectsByScope((prev) => ({
            ...prev,
            designer: [p, ...(prev.designer ?? [])],
          }));
          setNewProjectScope(null);
        }}
      />
      <ProjectSyncModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onChange={() => fetchTFProjects(true)}
      />
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RepoProvider>
      <Suspense fallback={null}>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </Suspense>
      {/* Fase G — Dream-widget, bottom-right, auth-only via dashboard layout */}
      <DreamStatusWidget />
    </RepoProvider>
  );
}

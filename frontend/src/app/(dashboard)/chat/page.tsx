"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import ChatComposer from "@/components/ChatComposer";
import ChatInput from "@/components/ChatInput";
import RobotIcon from "@/components/icons/RobotIcon";
import Btn from "@/components/Btn";
import AgentStream from "@/components/AgentStream";

import { useApiData } from "@/lib/hooks";
import {
  getConversations,
  getChatHistory,
  sendMessage,
  cancelChatGeneration,
  deleteConversation,
  inkognitoConversationId,
  repoConversationId,
  listSkills,
  listRepos,
  listProviders,
  approveReview,
  rejectReview,
  type ConversationSummary,
  type Message,
} from "@/lib/api";
import { Trash2 } from "lucide-react";

function timeAgo(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "na";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mnd`;
}

function GhostIcon({ color }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1C5 1 3.5 2.5 3 4c-.7 0-1.5.3-1.5 1.5C1.5 7 3 8 3 8s-.5 2 1 3.5c1 1 2 1.5 3 1.5s2-.5 3-1.5c1.5-1.5 1-3.5 1-3.5s1.5-1 1.5-2.5C12.5 4.3 11.7 4 11 4c-.5-1.5-2-3-4-3z"
        stroke={color || T.textFaint}
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  );
}

function extractRepoFromId(id: string): string | null {
  if (!id.startsWith("repo-")) return null;
  const rest = id.substring(5);
  const parts = rest.split("-");
  if (parts.length >= 6) {
    return parts.slice(0, parts.length - 5).join("-");
  }
  return rest;
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const autoMsg = searchParams.get("msg");

  const [ac, setAc] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(true);
  const [tab, setTab] = useState<"Repo" | "Privat">("Repo");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);
  const [thinkSeconds, setThinkSeconds] = useState(0);
  const autoMsgSent = useRef(false);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: convData, loading: convsLoading, refresh: refreshConvs } = useApiData(
    () => getConversations(),
    [],
  );
  const conversations: ConversationSummary[] = convData?.conversations ?? [];

  const { data: msgData, loading: msgsLoading, refresh: refreshMsgs, setData: setMsgData } = useApiData(
    () => (ac ? getChatHistory(ac, 50) : Promise.resolve({ messages: [], hasMore: false })),
    [ac],
  );
  const msgs: Message[] = msgData?.messages ?? [];

  // Skills data
  const { data: skillsData } = useApiData(() => listSkills(), []);
  const availableSkills = skillsData?.skills ?? [];

  // Dynamic repos — no hardcoded org, backend resolves from PAT
  const { data: repoData } = useApiData(() => listRepos(), []);
  const dynamicRepos = repoData?.repos?.map(r => r.name) ?? [];

  // Models
  const { data: providerData } = useApiData(() => listProviders(), []);
  const allModels = (providerData?.providers ?? []).flatMap(p =>
    p.models.filter(m => m.enabled).map(m => ({ id: m.id, displayName: m.displayName, provider: p.name }))
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Filter conversations by tab — Repo tab shows repo-* and chat-* conversations
  const filtered = conversations.filter((c) =>
    tab === "Privat" ? c.id.startsWith("inkognito-") : !c.id.startsWith("inkognito-"),
  );

  // Think seconds timer
  useEffect(() => {
    if (!sending) { setThinkSeconds(0); return; }
    const start = Date.now();
    const iv = setInterval(() => setThinkSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [sending]);

  // Poll for replies while sending
  useEffect(() => {
    if (!sending || !ac) return;

    const poll = async () => {
      try {
        const data = await getChatHistory(ac, 50);
        if (!data?.messages?.length) return;

        // Alltid oppdater meldinger — bruk content-hash for å unngå unødvendige re-renders
        const newHash = data.messages
          .map((m: any) => `${m.id}:${(m.content || "").length}:${m.messageType}`)
          .join("|");
        const oldHash = (msgs || [])
          .map((m: any) => `${m.id}:${(m.content || "").length}:${m.messageType}`)
          .join("|");

        if (newHash !== oldHash) {
          setMsgData({ ...data }); // Ny referanse → re-render
        }

        // Stopp polling KUN når vi har et EKTE svar (ikke tom placeholder)
        const hasRealReply = data.messages.some(
          (m: any) =>
            m.role === "assistant" &&
            m.content &&
            m.content.trim().length > 0 &&
            !m.content.startsWith("{") && // Ikke JSON (agent-melding)
            m.messageType === "chat"
        );

        // Eller agent er ferdig/feilet
        const agentDone = data.messages.some((m: any) => {
          if (m.role !== "assistant") return false;
          if (m.messageType !== "agent_status" && m.messageType !== "agent_progress") return false;
          try {
            const p = JSON.parse(m.content);
            return p.status === "done" || p.status === "failed" ||
                   p.status === "completed" || p.phase === "Ferdig" || p.phase === "Feilet";
          } catch { return false; }
        });

        // Sjekk om agent fortsatt jobber (da stopper vi IKKE)
        const agentWorking = data.messages.some((m: any) => {
          if (m.role !== "assistant") return false;
          if (m.messageType !== "agent_status" && m.messageType !== "agent_progress") return false;
          try {
            const p = JSON.parse(m.content);
            return p.status === "working" || p.phase === "Bygger" ||
                   p.phase === "Planlegger" || p.phase === "Forbereder";
          } catch { return false; }
        });

        if (agentDone || (hasRealReply && !agentWorking)) {
          setSending(false);
        }
      } catch {
        // Nettverksfeil — ikke stopp polling, prøv igjen
      }
    };

    // Rask polling først, deretter langsommere
    const first = setTimeout(poll, 800);
    const fast = setInterval(poll, 1200);

    // Etter 8 sekunder, bytt til langsommere polling
    const slowdownTimer = setTimeout(() => {
      clearInterval(fast);
    }, 8000);

    // Fortsett med tregere polling etter 8s
    const slow = setTimeout(() => {
      slowIntervalRef.current = setInterval(poll, 3000);
    }, 8000);

    // Absolutt maks: 2 minutter (agent kan ta lang tid)
    const max = setTimeout(() => setSending(false), 120000);

    return () => {
      clearTimeout(first);
      clearInterval(fast);
      clearTimeout(slowdownTimer);
      clearTimeout(slow);
      clearTimeout(max);
      if (slowIntervalRef.current) {
        clearInterval(slowIntervalRef.current);
        slowIntervalRef.current = null;
      }
    };
  }, [sending, ac]);

  // Auto-send msg from search params (overview redirect)
  useEffect(() => {
    if (autoMsg && !autoMsgSent.current) {
      autoMsgSent.current = true;
      setNewChat(false);

      const repoParam = searchParams.get("repo");
      const ghostParam = searchParams.get("ghost") === "1";
      const skillsParam = searchParams.get("skills");
      const subagentsParam = searchParams.get("subagents") === "1";

      if (skillsParam) setSelectedSkillIds(skillsParam.split(",").filter(Boolean));
      if (subagentsParam) setSubAgentsEnabled(true);

      // Sett riktig tab basert på ghost
      if (ghostParam) {
        setTab("Privat");
      }

      const convId = ghostParam
        ? inkognitoConversationId()
        : repoParam
          ? repoConversationId(repoParam)
          : dynamicRepos[0]
            ? repoConversationId(dynamicRepos[0])
            : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setAc(convId);

      // Optimistic user message
      const optimisticMsg: Message = {
        id: crypto.randomUUID(),
        conversationId: convId,
        role: "user" as const,
        content: autoMsg,
        messageType: "chat",
        metadata: null,
        createdAt: new Date().toISOString(),
      };
      setMsgData(prev => ({
        messages: [...(prev?.messages ?? []), optimisticMsg],
        hasMore: prev?.hasMore ?? false,
      }));

      setSending(true);
      sendMessage(convId, autoMsg, {
        repoName: repoParam || undefined,
        skillIds: skillsParam ? skillsParam.split(",").filter(Boolean) : undefined,
      })
        .then((result) => {
          refreshConvs();
        })
        .catch((e: unknown) => {
          setSending(false);
          const msg = e instanceof Error ? e.message : "Noe gikk galt";
          if (msg.includes("rate limit") || msg.includes("quota")) setChatError("Du har brukt opp token-kvoten. Vent litt eller oppgrader.");
          else if (msg.includes("insufficient")) setChatError("Ikke nok credits. Sjekk API-nøklene.");
          else setChatError(msg);
        });
    }
  }, [autoMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages or content changes
  const msgsHash = msgs.map(m => `${m.id}:${(m.content || "").length}`).join(",");
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgsHash]);

  const cur = ac ? conversations.find((c) => c.id === ac) : null;
  const isGhost = ac ? ac.startsWith("inkognito-") : false;
  const curRepo = ac ? extractRepoFromId(ac) : null;

  const startNewChat = (msg: string, repo: string | null, ghost: boolean) => {
    // Tab state is the primary authority for conversation routing
    // Ghost toggle syncs with tab (see onGhostChange below)
    const usePrivate = tab === "Privat";
    const effectiveRepo = repo || dynamicRepos[0] || null;
    const convId = usePrivate
      ? inkognitoConversationId()
      : effectiveRepo
        ? repoConversationId(effectiveRepo)
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAc(convId);
    setNewChat(false);

    // Optimistic user message
    const optimisticMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "user" as const,
      content: msg,
      messageType: "chat",
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    setMsgData(prev => ({
      messages: [...(prev?.messages ?? []), optimisticMsg],
      hasMore: prev?.hasMore ?? false,
    }));

    setSending(true);
    sendMessage(convId, msg, {
      ...(repo ? { repoName: repo } : {}),
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
    })
      .then((result) => {
        refreshConvs();
        refreshMsgs();
      })
      .catch((e: unknown) => {
        setSending(false);
        const msg = e instanceof Error ? e.message : "Noe gikk galt";
        if (msg.includes("rate limit") || msg.includes("quota")) setChatError("Du har brukt opp token-kvoten. Vent litt eller oppgrader.");
        else if (msg.includes("insufficient")) setChatError("Ikke nok credits. Sjekk API-nøklene.");
        else setChatError(msg);
      });
  };

  const handleSend = (value: string, repo?: string | null) => {
    if (!ac || !value) return;
    setChatError(null);

    // Optimistic user message
    const optimisticMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: ac,
      role: "user" as const,
      content: value,
      messageType: "chat",
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    setMsgData(prev => ({
      messages: [...(prev?.messages ?? []), optimisticMsg],
      hasMore: prev?.hasMore ?? false,
    }));

    setSending(true);
    sendMessage(ac, value, {
      repoName: repo || curRepo || undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
    })
      .then((result) => {
        refreshMsgs();
        refreshConvs();
      })
      .catch((e: unknown) => {
        setSending(false);
        const msg = e instanceof Error ? e.message : "Noe gikk galt";
        if (msg.includes("rate limit") || msg.includes("quota")) setChatError("Du har brukt opp token-kvoten. Vent litt eller oppgrader.");
        else if (msg.includes("insufficient")) setChatError("Ikke nok credits. Sjekk API-nøklene.");
        else setChatError(msg);
      });
  };

  const isAgentMessage = (m: Message) =>
    m.messageType === "agent_status" ||
    m.messageType === "agent_thought" ||
    m.messageType === "agent_progress" ||
    m.messageType === "agent_report" ||
    (m.role === "assistant" && m.content.startsWith("{") && m.content.includes("\"type\":"));

  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <Btn
            primary
            sm
            style={{ width: "100%" }}
            onClick={() => {
              setNewChat(true);
              setAc(null);
            }}
          >
            + Ny samtale
          </Btn>
        </div>
        <div
          style={{
            padding: "8px",
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          {(["Repo", "Privat"] as const).map((f) => (
            <div
              key={f}
              onClick={() => {
                setTab(f);
                // Find first conversation in new tab, or show new-chat view
                const tabConvs = conversations.filter((c) =>
                  f === "Privat" ? c.id.startsWith("inkognito-") : c.id.startsWith("repo-"),
                );
                if (tabConvs.length > 0) {
                  setAc(tabConvs[0].id);
                  setNewChat(false);
                } else {
                  setAc(null);
                  setNewChat(true);
                }
              }}
              style={{
                fontSize: 11,
                fontFamily: T.mono,
                padding: "4px 8px",
                background: tab === f ? T.subtle : "transparent",
                color: tab === f ? T.text : T.textMuted,
                cursor: "pointer",
                border: `1px solid ${tab === f ? T.border : "transparent"}`,
                borderRadius: 6,
              }}
            >
              {f}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {convsLoading ? (
            <div style={{ padding: "20px 16px", textAlign: "center" }}>
              <span style={{ fontSize: 12, color: T.textMuted }}>Laster...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center" }}>
              <span style={{ fontSize: 12, color: T.textFaint }}>Ingen samtaler enda</span>
            </div>
          ) : (
            filtered.map((c) => {
              const isPrivate = c.id.startsWith("inkognito-");
              const repo = extractRepoFromId(c.id);
              return (
                <div
                  key={c.id}
                  className="conv-row"
                  onClick={() => {
                    setAc(c.id);
                    setNewChat(false);
                  }}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: ac === c.id && !newChat ? T.subtle : "transparent",
                    borderBottom: `1px solid ${T.border}`,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    {isPrivate && <GhostIcon />}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: c.activeTask ? 600 : 400,
                        color: c.activeTask ? T.text : T.textSec,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.title || "Ny samtale"}
                    </span>
                    <span
                      className="conv-delete"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await deleteConversation(c.id);
                          if (ac === c.id) {
                            const remaining = filtered.filter(x => x.id !== c.id);
                            if (remaining.length > 0) {
                              setAc(remaining[0].id);
                            } else {
                              setAc(null);
                              setNewChat(true);
                            }
                          }
                          refreshConvs();
                        } catch {}
                      }}
                      style={{
                        opacity: 0,
                        transition: "opacity 0.15s",
                        cursor: "pointer",
                        color: T.textFaint,
                        display: "flex",
                        alignItems: "center",
                        padding: 2,
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={14} />
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {repo && (
                      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                        {repo}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>
                      {timeAgo(c.lastActivity)}
                    </span>
                  </div>
                  <style>{`.conv-row:hover .conv-delete { opacity: 1 !important; }`}</style>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main content */}
      {newChat ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <ChatComposer
            onSubmit={startNewChat}
            defaultGhost={tab === "Privat"}
            onGhostChange={(g) => setTab(g ? "Privat" : "Repo")}
            skills={availableSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))}
            selectedSkillIds={selectedSkillIds}
            onSkillsChange={setSelectedSkillIds}
            subAgentsEnabled={subAgentsEnabled}
            onSubAgentsToggle={() => setSubAgentsEnabled(p => !p)}
            repos={dynamicRepos}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          {/* Header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                {cur ? cur.title || "Ny samtale" : "\u2014"}
              </div>
              {curRepo && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: T.mono,
                    color: T.textFaint,
                    marginTop: 2,
                  }}
                >
                  {curRepo}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={selectedModel || "auto"}
                onChange={e => setSelectedModel(e.target.value === "auto" ? null : e.target.value)}
                style={{
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: T.r, padding: "4px 8px", fontSize: 11,
                  color: T.text, fontFamily: T.mono, outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="auto">Auto (anbefalt)</option>
                {allModels.map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}
              </select>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              minHeight: 0,
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {msgsLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Laster meldinger...</span>
              </div>
            ) : msgs.length === 0 && ac ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <span style={{ fontSize: 13, color: T.textFaint }}>
                  Ingen meldinger enda. Skriv noe nedenfor.
                </span>
              </div>
            ) : (
              (() => {
                // Deduplicate: keep only the last agent message
                let lastAgentIdx = -1;
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (isAgentMessage(msgs[i])) { lastAgentIdx = i; break; }
                }
                const dedupedMsgs = msgs.filter((m, i) => {
                  if (!isAgentMessage(m)) return true;
                  return i === lastAgentIdx;
                });

                // Find last agent message and the chat message to merge it under
                const lastAgentMsg = dedupedMsgs.find(m => isAgentMessage(m));
                const mergedChatId = lastAgentMsg
                  ? (() => {
                      // Find the last assistant chat message that comes before the agent message
                      let found: string | null = null;
                      for (const m of dedupedMsgs) {
                        if (m.role === "assistant" && !isAgentMessage(m) && m.content?.trim()) {
                          found = m.id;
                        }
                        if (m === lastAgentMsg) break;
                      }
                      return found;
                    })()
                  : null;

                return dedupedMsgs.map((m) => {
                  const time = new Date(m.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
                  const isAgent = isAgentMessage(m);

                  // Hide empty placeholder messages while waiting
                  if (sending && m.role === "assistant" && (!m.content || m.content.trim() === "")) {
                    return null;
                  }

                  return (
                    <div key={m.id}>
                      {/* USER */}
                      {m.role === "user" && (
                        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 0" }}>
                          <div>
                            <div style={{
                              background: T.subtle,
                              border: `1px solid ${T.border}`,
                              borderRadius: T.r,
                              padding: "10px 16px",
                              fontSize: 13, lineHeight: 1.6, color: T.text,
                            }}>
                              {m.content}
                            </div>
                            <div style={{ fontSize: 10, color: T.textFaint, textAlign: "right", marginTop: 2 }}>{time}</div>
                          </div>
                        </div>
                      )}

                      {/* ASSISTANT — agent message: skip if merged under chat message */}
                      {m.role === "assistant" && isAgent && !(m.id === lastAgentMsg?.id && mergedChatId) && (
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
                            background: T.surface, border: `1px solid ${T.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <RobotIcon size={16} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <AgentStream
                              content={m.content}
                              onCancel={() => { if (ac) cancelChatGeneration(ac).catch(() => {}); setSending(false); }}
                              onApprove={async (reviewId) => {
                                try {
                                  await approveReview(reviewId);
                                  refreshMsgs();
                                } catch (e) {
                                  setChatError(e instanceof Error ? e.message : "Godkjenning feilet");
                                }
                              }}
                              onReject={async (reviewId) => {
                                try {
                                  await rejectReview(reviewId);
                                  refreshMsgs();
                                } catch (e) {
                                  setChatError(e instanceof Error ? e.message : "Avvisning feilet");
                                }
                              }}
                            />
                            <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{time}</div>
                          </div>
                        </div>
                      )}

                      {/* ASSISTANT — chat message, with optional merged agent-status below */}
                      {m.role === "assistant" && !isAgent && (
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
                            background: T.surface, border: `1px solid ${T.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <RobotIcon size={16} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {m.content && m.content.trim() !== "" ? (
                              <div style={{ fontSize: 13, lineHeight: 1.65, color: T.text, fontFamily: T.sans, paddingTop: 4 }}>
                                {m.content}
                              </div>
                            ) : null}

                            {/* Merged agent-status under this chat message */}
                            {m.id === mergedChatId && lastAgentMsg && (
                              <div style={{ marginTop: 8 }}>
                                <AgentStream
                                  content={lastAgentMsg.content}
                                  onCancel={() => { if (ac) cancelChatGeneration(ac).catch(() => {}); setSending(false); }}
                                  onApprove={async (reviewId) => {
                                    try {
                                      await approveReview(reviewId);
                                      refreshMsgs();
                                    } catch (e) {
                                      setChatError(e instanceof Error ? e.message : "Godkjenning feilet");
                                    }
                                  }}
                                  onReject={async (reviewId) => {
                                    try {
                                      await rejectReview(reviewId);
                                      refreshMsgs();
                                    } catch (e) {
                                      setChatError(e instanceof Error ? e.message : "Avvisning feilet");
                                    }
                                  }}
                                />
                              </div>
                            )}

                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                              <span style={{ fontSize: 10, color: T.textFaint }}>{time}</span>
                              {m.metadata && (() => {
                                try {
                                  const meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : m.metadata;
                                  return meta?.model ? (
                                    <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>{meta.model}</span>
                                  ) : null;
                                } catch { return null; }
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            )}
            {sending && !msgs.some(m => isAgentMessage(m)) && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
                  background: T.surface, border: `1px solid ${T.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <RobotIcon size={16} />
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 500, fontFamily: T.mono,
                  position: "relative", overflow: "hidden",
                  color: T.textMuted, padding: "2px 4px",
                }}>
                  TheFold tenker
                  <span style={{
                    position: "absolute",
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.15) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmerMove 2s linear infinite",
                    pointerEvents: "none",
                  }} />
                </span>
                <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>
                  {thinkSeconds}s
                </span>
              </div>
            )}
            {chatError && (
              <div style={{
                padding: "10px 16px",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: T.r, fontSize: 12, color: T.error,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>{chatError}</span>
                <span onClick={() => setChatError(null)} style={{ cursor: "pointer", marginLeft: "auto", fontSize: 14 }}>&times;</span>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            <ChatInput
              compact
              repo={curRepo || undefined}
              ghost={isGhost}
              onSubmit={handleSend}
              onRepoChange={(r) => {
                if (r) {
                  const newConvId = repoConversationId(r);
                  setAc(newConvId);
                }
              }}
              isPrivate={tab === "Privat"}
              skills={availableSkills}
              selectedSkillIds={selectedSkillIds}
              onSkillsChange={setSelectedSkillIds}
              subAgentsEnabled={subAgentsEnabled}
              onSubAgentsToggle={() => setSubAgentsEnabled((p) => !p)}
              repos={dynamicRepos}
              isLoading={sending}
              onCancel={() => {
                if (ac) cancelChatGeneration(ac).catch(() => {});
                setSending(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: T.textMuted }}>Laster...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}

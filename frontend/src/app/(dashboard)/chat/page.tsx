"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import ChatComposer from "@/components/ChatComposer";
import ChatInput from "@/components/ChatInput";
import RobotIcon from "@/components/icons/RobotIcon";
import Btn from "@/components/Btn";

import { useApiData } from "@/lib/hooks";
import {
  getConversations,
  getChatHistory,
  sendMessage,
  cancelChatGeneration,
  deleteConversation,
  listSkills,
  listProviders,
  type ConversationSummary,
  type Message,
} from "@/lib/api";
import { parseAndSetChatError } from "@/lib/chat-errors";
import { createConversationId } from "@/lib/conversation-ids";
import { useProcessedMessages, isAgentMessage } from "@/hooks/useProcessedMessages";
import MessageWithAgent from "@/components/chat/MessageWithAgent";
import { Trash2 } from "lucide-react";
import { useRepoContext } from "@/lib/repo-context";

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

  const { selectedRepo } = useRepoContext();
  const [ac, setAc] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);
  const [thinkSeconds, setThinkSeconds] = useState(0);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const autoMsgSent = useRef(false);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStoppedRef = useRef(false);

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

  // Models
  const { data: providerData } = useApiData(() => listProviders(), []);
  const allModels = (providerData?.providers ?? []).flatMap(p =>
    p.models.filter(m => m.enabled).map(m => ({ id: m.id, displayName: m.displayName, provider: p.name }))
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Filter conversations by selected repo
  const filtered = conversations.filter((c) => {
    // Aldri vis inkognito-samtaler (fjernet som konsept)
    if (c.id.startsWith("inkognito-")) return false;
    if (selectedRepo) {
      // Vis samtaler for valgt repo
      return c.id.startsWith(`repo-${selectedRepo.name}-`);
    }
    // Global: vis chat-* samtaler (ikke repo-bundne)
    return c.id.startsWith("chat-");
  });

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
    pollStoppedRef.current = false;

    const poll = async () => {
      if (pollStoppedRef.current) return;
      try {
        const data = await getChatHistory(ac, 50);
        if (!data?.messages?.length) return;

        // Alltid oppdater meldinger — bruk content-hash for å unngå unødvendige re-renders
        const newHash = data.messages
          .map((m: any) => `${m.id}:${(m.content || "").substring(0, 80)}:${m.messageType}`)
          .join("|");
        const oldHash = (msgs || [])
          .map((m: any) => `${m.id}:${(m.content || "").substring(0, 80)}:${m.messageType}`)
          .join("|");

        if (newHash !== oldHash) {
          setMsgData({ ...data }); // Ny referanse → re-render
        }

        // Finn tidspunkt for siste brukermelding
        const lastUserTime = (() => {
          for (let i = data.messages.length - 1; i >= 0; i--) {
            if (data.messages[i].role === "user") return new Date(data.messages[i].createdAt).getTime();
          }
          return 0;
        })();

        // Sjekk om det finnes et EKTE chat-svar ETTER siste brukermelding
        const hasRealReply = data.messages.some(
          (m: any) =>
            m.role === "assistant" &&
            m.content &&
            m.content.trim().length > 0 &&
            !m.content.startsWith("{") &&
            m.messageType === "chat" &&
            new Date(m.createdAt).getTime() > lastUserTime
        );

        // Finn SISTE agent-melding (ikke .some() over alle — gamle "working" meldinger forsvinner aldri)
        const agentMessages = data.messages.filter((m: any) =>
          m.role === "assistant" &&
          (m.messageType === "agent_status" || m.messageType === "agent_progress")
        );
        const lastAgent = agentMessages.length > 0 ? agentMessages[agentMessages.length - 1] : null;

        let agentDone = false;
        let agentWaiting = false;
        if (lastAgent) {
          try {
            const p = JSON.parse(lastAgent.content);
            // Ferdig: status=done/completed/failed ELLER phase=completed/Ferdig/Feilet
            agentDone = p.status === "done" || p.status === "completed" || p.status === "failed"
              || p.phase === "completed" || p.phase === "Ferdig" || p.phase === "Feilet";
            // Venter på review: status=waiting/needs_input
            agentWaiting = p.status === "waiting" || p.status === "needs_input";
          } catch { /* ignore */ }
        }

        if (agentDone || agentWaiting || (hasRealReply && !lastAgent)) {
          pollStoppedRef.current = true;
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
      const skillsParam = searchParams.get("skills");
      const subagentsParam = searchParams.get("subagents") === "1";

      if (skillsParam) setSelectedSkillIds(skillsParam.split(",").filter(Boolean));
      if (subagentsParam) setSubAgentsEnabled(true);

      const repoName = repoParam || selectedRepo?.name || null;
      const convId = createConversationId(repoName);

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
        repoName: repoName || undefined,
        repoOwner: selectedRepo?.owner || undefined,
        skillIds: skillsParam ? skillsParam.split(",").filter(Boolean) : undefined,
      })
        .then((result) => {
          refreshConvs();
        })
        .catch((e: unknown) => {
          setSending(false);
          parseAndSetChatError(e, setChatError);
        });
    }
  }, [autoMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages or content changes
  const msgsHash = msgs.map(m => `${m.id}:${(m.content || "").substring(0, 40)}`).join(",");
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgsHash]);

  const cur = ac ? conversations.find((c) => c.id === ac) : null;
  const curRepo = ac ? extractRepoFromId(ac) : null;

  const startNewChat = (msg: string) => {
    const repoName = selectedRepo?.name || null;
    const convId = createConversationId(repoName);
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
      ...(repoName ? { repoName, repoOwner: selectedRepo?.owner } : {}),
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
    })
      .then((result) => {
        refreshConvs();
        // IKKE refreshMsgs() — polling håndterer dette
      })
      .catch((e: unknown) => {
        setSending(false);
        parseAndSetChatError(e, setChatError);
      });
  };

  const handleSend = async (value: string) => {
    if (!ac || !value) return;
    setChatError(null);

    // Intercept: if pending review, send as feedback instead of chat message
    if (pendingReviewId) {
      try {
        await requestReviewChanges(pendingReviewId, value);
        setPendingReviewId(null);
        refreshMsgs();
      } catch (e) {
        setChatError(e instanceof Error ? e.message : "Endring feilet");
        setPendingReviewId(null);
      }
      return;
    }

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
      repoName: selectedRepo?.name || curRepo || undefined,
      repoOwner: selectedRepo?.owner || undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
    })
      .then((result) => {
        refreshConvs();
        // IKKE refreshMsgs() — polling håndterer dette
      })
      .catch((e: unknown) => {
        setSending(false);
        parseAndSetChatError(e, setChatError);
      });
  };

  const { messages: dedupedMsgs, lastAgentMsg, mergeUnderChatId: mergedChatId } = useProcessedMessages(msgs);

  return (
    <div
      style={{
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
          minHeight: 0,
          alignSelf: "stretch",
        }}
      >
        <div
          style={{
            padding: "16px 16px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, fontFamily: T.mono }}>Samtaler</span>
          <div
            onClick={() => {
              setNewChat(true);
              setAc(null);
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: "transparent",
              flexShrink: 0,
            }}
            title="Ny samtale"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
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
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
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
                    <span style={{
                      fontSize: 10,
                      color: T.textFaint,
                      fontFamily: T.mono,
                      flexShrink: 0,
                    }}>
                      {timeAgo(c.lastActivity)}
                    </span>
                  </div>
                  {repo && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                        {repo}
                      </span>
                    </div>
                  )}
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
            onSubmit={(msg) => startNewChat(msg)}
            skills={availableSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))}
            selectedSkillIds={selectedSkillIds}
            onSkillsChange={setSelectedSkillIds}
            subAgentsEnabled={subAgentsEnabled}
            onSubAgentsToggle={() => setSubAgentsEnabled(p => !p)}
            models={allModels}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
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
              dedupedMsgs.map((m) => {
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
                            <MessageWithAgent
                              content={m.content}
                              conversationId={ac}
                              onCancelSending={() => { if (ac) cancelChatGeneration(ac).catch(() => {}); setSending(false); }}
                              onError={(msg) => setChatError(msg)}
                              onRefresh={refreshMsgs}
                              onPendingReview={setPendingReviewId}
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
                                <MessageWithAgent
                                  content={lastAgentMsg.content}
                                  conversationId={ac}
                                  onCancelSending={() => { if (ac) cancelChatGeneration(ac).catch(() => {}); setSending(false); }}
                                  onError={(msg) => setChatError(msg)}
                                  onRefresh={refreshMsgs}
                                  onPendingReview={setPendingReviewId}
                                />
                              </div>
                            )}

                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                              <span style={{ fontSize: 10, color: T.textFaint }}>{time}</span>
                              {m.metadata && (() => {
                                try {
                                  const meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : m.metadata;
                                  if (!meta) return null;
                                  const parts: string[] = [];
                                  if (meta.model) parts.push(meta.model);
                                  if (meta.cost != null) parts.push(`$${Number(meta.cost).toFixed(4)}`);
                                  if (meta.tokens?.totalTokens != null) parts.push(`${Number(meta.tokens.totalTokens).toLocaleString()} tokens`);
                                  return parts.length > 0 ? (
                                    <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>
                                      {parts.join(" \u00b7 ")}
                                    </span>
                                  ) : null;
                                } catch { return null; }
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
              })
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
            {sending && msgs.some(m => isAgentMessage(m)) && !msgs.some(m => {
              try {
                const p = JSON.parse(m.content);
                return p.status === "done" || p.status === "failed" || p.status === "waiting" ||
                       p.phase === "Ferdig" || p.phase === "Feilet";
              } catch { return false; }
            }) && (
              <div style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono, padding: "4px 0 4px 38px" }}>
                Oppdaterer... {thinkSeconds}s
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
          <div style={{
            padding: "8px 24px 0",
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <div style={{ width: "100%", maxWidth: 768 }}>
              <ChatInput
                compact
                onSubmit={handleSend}
                skills={availableSkills}
                selectedSkillIds={selectedSkillIds}
                onSkillsChange={setSelectedSkillIds}
                subAgentsEnabled={subAgentsEnabled}
                onSubAgentsToggle={() => setSubAgentsEnabled((p) => !p)}
                isLoading={sending}
                onCancel={() => {
                  if (ac) cancelChatGeneration(ac).catch(() => {});
                  setSending(false);
                }}
                placeholder={pendingReviewId ? "Skriv feedback til agenten..." : undefined}
                models={allModels}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
            </div>
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

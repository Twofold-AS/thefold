"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import ChatComposer from "@/components/ChatComposer";
import ChatContainer from "@/components/chat/ChatContainer";
import HistoryDrawer, { extractRepoFromId } from "@/components/chat/HistoryDrawer";
import CommandPalette from "@/components/chat/CommandPalette";

import { useApiData } from "@/lib/hooks";
import {
  getConversations,
  getChatHistory,
  sendMessage,
  cancelChatGeneration,
  deleteConversation,
  repoConversationId,
  listSkills,
  listProviders,
  forceContinueTask,
  type Message,
} from "@/lib/api";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api/client";
import { useRepoContext } from "@/lib/repo-context";
import { useAgentStream } from "@/hooks/useAgentStream";
import { useReviewFlow } from "@/hooks/useReviewFlow";
import ModeIndicator from "@/components/ModeIndicator";

function classifyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Noe gikk galt";
  const lower = msg.toLowerCase();
  if (lower.includes("credit") || lower.includes("billing") || lower.includes("quota") || lower.includes("brukt opp"))
    return "AI-credits er brukt opp. Sjekk billing hos leverandøren.";
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many"))
    return "For mange forespørsler — vent litt og prøv igjen.";
  if (lower.includes("api key") || lower.includes("api-nøkkel") || lower.includes("401") || lower.includes("ugyldig"))
    return "API-nøkkelen er ugyldig. Sjekk AI-innstillingene.";
  if (lower.includes("unavailable") || lower.includes("503") || lower.includes("utilgjengelig") || lower.includes("overloaded"))
    return "AI-tjenesten er midlertidig nede. Prøv igjen om litt.";
  if (lower.includes("context length") || lower.includes("too long"))
    return "Meldingen er for lang. Prøv en kortere melding.";
  return msg;
}

function makeOptimisticMsg(conversationId: string, content: string): Message {
  return {
    id: crypto.randomUUID(),
    conversationId,
    role: "user" as const,
    content,
    messageType: "chat",
    metadata: null,
    createdAt: new Date().toISOString(),
  };
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoMsg = searchParams.get("msg");
  const convParam = searchParams.get("conv");

  const { selectedRepo } = useRepoContext();
  const [ac, setAc] = useState<string | null>(convParam || null);
  const [newChat, setNewChat] = useState(!convParam);

  // React to URL conversation changes (sidebar clicks + logo click reset)
  useEffect(() => {
    if (convParam && convParam !== ac) {
      setAc(convParam);
      setNewChat(false);
    } else if (!convParam && ac !== null) {
      // No conv param (logo click or "Ny samtale") → reset to new chat view
      setAc(null);
      setNewChat(true);
    }
  }, [convParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fix #1: Reset sending/task state when switching conversations (prevents SSE bleed)
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [thinkSeconds, setThinkSeconds] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [isIncognito, setIsIncognito] = useState(false);
  const autoMsgSent = useRef(false);
  const hasSent = useRef(false);
  const wasSendingRef = useRef(false);
  const acPrevRef = useRef<string | null>(null);
  const prevIncognitoRef = useRef(false);
  // When a brand-new conversation is created, useApiData refetches with empty result
  // and would wipe the optimistic user message. These refs let the fetcher serve the
  // optimistic msg instead of fetching, until agent.done triggers a real refresh.
  const skipNextFetchRef = useRef(false);
  const optForNewConvRef = useRef<{ convId: string; msg: Message } | null>(null);

  useEffect(() => {
    if (ac === acPrevRef.current) return;
    if (acPrevRef.current !== null) {
      // Actual conversation switch — clear in-flight state
      setSending(false);
      setActiveTaskId(null);
      setChatError(null);
    }
    acPrevRef.current = ac;
  }, [ac]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reset to new chat when inkognito is turned off
  useEffect(() => {
    if (prevIncognitoRef.current && !isIncognito) {
      setAc(null);
      setNewChat(true);
    }
    prevIncognitoRef.current = isIncognito;
  }, [isIncognito]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: convData, loading: convsLoading, refresh: refreshConvs } = useApiData(
    () => getConversations(),
    [],
  );
  const conversations = convData?.conversations ?? [];

  // [debug] history-bug: dump conv ids whenever the list changes so user can
  // verify whether a missing repo ("Mikael-er-kul") is absent from the API
  // response or filtered out client-side. Remove once root cause confirmed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversations.length === 0) return;
    // eslint-disable-next-line no-console
    console.log("[cowork] conversations from /chat/conversations:", conversations.map(c => ({
      id: c.id,
      title: c.title,
      lastActivity: c.lastActivity,
    })));
  }, [conversations]);

  const { data: msgData, loading: msgsLoading, refresh: refreshMsgs, setData: setMsgData } = useApiData(
    () => {
      if (skipNextFetchRef.current && optForNewConvRef.current?.convId === ac) {
        skipNextFetchRef.current = false;
        const opt = optForNewConvRef.current.msg;
        return Promise.resolve({ messages: [opt], hasMore: false });
      }
      return ac ? getChatHistory(ac, 50) : Promise.resolve({ messages: [], hasMore: false });
    },
    [ac],
  );
  const msgs: Message[] = msgData?.messages ?? [];

  const { data: skillsData } = useApiData(() => listSkills(), []);
  const availableSkills = skillsData?.skills ?? [];

  const { data: providerData } = useApiData(() => listProviders(), []);
  const allModels = (providerData?.providers ?? []).flatMap(p =>
    p.models.filter(m => m.enabled).map(m => ({ id: m.modelId, displayName: m.displayName, provider: p.name }))
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const {
    pendingReviewId,
    setPendingReviewId,
    reviewInProgress,
    handleApprove,
    handleReject,
    handleRequestChanges,
  } = useReviewFlow(refreshMsgs, setChatError);

  const filtered = conversations.filter((c) => {
    if (c.id.startsWith("inkognito-")) return false;
    return true;
  });

  // SSE streaming
  const { messages: sseMessages, status: streamStatus, agentStartedTaskId, stalled: streamStalled } = useAgentStream(
    sending ? (activeTaskId || ac) : null,
    {
      onDone: async () => {
        // Await DB refresh BEFORE clearing sending so optimistic msg has a confirmed counterpart
        await refreshMsgs();
        setSending(false);
        setActiveTaskId(null);
        // Refresh sidebar when AI response finishes (title now available from first message)
        refreshConvs();
      },
      onError: (err) => {
        setSending(false);
        setActiveTaskId(null);
        setChatError(classifyError(new Error(err)));
        refreshMsgs();
      },
    }
  );

  // Derive connection status from stream state
  const connectionStatus: "connected" | "connecting" | "disconnected" =
    sending && activeTaskId
      ? streamStalled ? "disconnected" : "connected"
      : sending ? "connecting" : "connected";

  useEffect(() => {
    if (agentStartedTaskId && agentStartedTaskId !== activeTaskId) {
      setActiveTaskId(agentStartedTaskId);
    }
  }, [agentStartedTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (streamStatus === "pending_review" && sending) {
      setSending(false);
      setActiveTaskId(null);
      refreshMsgs();
    }
  }, [streamStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll messages while agent task active
  useEffect(() => {
    if (!sending || !activeTaskId) return;
    const iv = setInterval(() => { refreshMsgs(); }, 8000);
    return () => clearInterval(iv);
  }, [sending, activeTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: trailing refresh timers removed — SSE delivers content immediately (agent.message)
  // and agent.done already calls refreshMsgs() once to sync DB state. No extra polling needed.

  // Convert SSE messages to Message shape
  const sseAsMsgs: Message[] = ac
    ? sseMessages.map((sm) => ({
        id: sm.id,
        conversationId: ac,
        role: sm.role,
        content: sm.content,
        messageType: "chat" as const,
        metadata: null,
        createdAt: new Date().toISOString(),
      }))
    : [];

  const dbIds = new Set(msgs.map((m) => m.id));
  const filteredSseMsgs = sseAsMsgs.filter((m) => !dbIds.has(m.id));

  // Merge DB messages + SSE messages. Optimistic user messages live inside msgs
  // (pushed there by setMsgData before sendMessage resolves), so no separate layer.
  const merged = [...msgs, ...filteredSseMsgs];

  // Deduplicate user messages by trimmed content — optimistic copy in msgs and the
  // server-confirmed copy from refreshMsgs() can briefly co-exist with different ids.
  const seen = new Set<string>();
  const displayMsgs = merged.filter((m) => {
    if (m.role === "user") {
      const key = `${m.role}:${m.content?.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });

  // Think timer
  useEffect(() => {
    if (!sending) { setThinkSeconds(0); return; }
    const start = Date.now();
    const iv = setInterval(() => setThinkSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [sending]);

  // Safety timeout
  useEffect(() => {
    if (!sending) return;
    const max = setTimeout(() => setSending(false), 120000);
    return () => clearTimeout(max);
  }, [sending]);

  // Polling fallback for direct chat (no agent task running).
  // SSE is the fast path; this is the safety net in case the agent.message event is dropped.
  // Active only when sending && no activeTaskId (agent path has its own SSE stream).
  useEffect(() => {
    if (!sending || activeTaskId || !ac) return;

    let stopped = false;
    let firstContentAt: number | null = null;
    const intervals: ReturnType<typeof setInterval>[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const isReviewMsg = (content: string) => {
      try { const p = JSON.parse(content); return p.type === "review" || (p.type === "progress" && p.status === "waiting"); }
      catch { return false; }
    };

    const poll = async () => {
      if (stopped) return;
      try {
        const result = await getChatHistory(ac, 50);
        if (stopped) return;

        const assistantMsgs = result.messages.filter(m => m.role === "assistant" && m.content?.trim());
        const hasContent = assistantMsgs.length > 0;
        const hasReview = assistantMsgs.some(m => isReviewMsg(m.content));

        if (hasContent) {
          setMsgData({ messages: result.messages, hasMore: result.hasMore });
          if (firstContentAt === null) firstContentAt = Date.now();
          if (hasReview || Date.now() - firstContentAt > 20000) {
            setSending(false);
            stopped = true;
          }
        }
      } catch {
        // ignore transient errors
      }
    };

    const startDelay = setTimeout(() => {
      if (stopped) return;
      poll();
      const iv = setInterval(() => { if (!stopped) poll(); }, 2000);
      intervals.push(iv);
      const maxTimeout = setTimeout(() => {
        if (!stopped) { stopped = true; setSending(false); }
      }, 87000);
      timeouts.push(maxTimeout);
    }, 3000);
    timeouts.push(startDelay);

    return () => {
      stopped = true;
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [sending, activeTaskId, ac, setMsgData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendResult = (result: { agentTriggered: boolean; taskId?: string } | null) => {
    if (result?.taskId) {
      setActiveTaskId(result.taskId);
    }
    // Only refresh conversations list — do NOT call refreshMsgs() here.
    // Calling refreshMsgs() immediately overwrites the optimistic message with empty DB state
    // (the message hasn't been written yet). SSE streaming and the polling fallback handle updates.
    refreshConvs();
  };

  // Auto-send msg from search params
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
      const convId = repoName
        ? repoConversationId(repoName)
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const optimisticMsg = makeOptimisticMsg(convId, autoMsg);
      optForNewConvRef.current = { convId, msg: optimisticMsg };
      skipNextFetchRef.current = true;
      setAc(convId);
      router.replace(`?conv=${convId}`, { scroll: false });
      setMsgData({ messages: [optimisticMsg], hasMore: false });

      setSending(true);
      sendMessage(convId, autoMsg, {
        repoName: repoName || undefined,
        repoOwner: selectedRepo?.owner || undefined,
        skillIds: skillsParam ? skillsParam.split(",").filter(Boolean) : undefined,
      })
        .then(handleSendResult)
        .catch((e) => { setSending(false); setChatError(classifyError(e)); });
    }
  }, [autoMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  const curRepo = ac ? extractRepoFromId(ac) : null;

  // Build mode indicators slot (shown above chatbox in both new-chat and existing-chat views)
  const hasModeIndicators = subAgentsEnabled || isIncognito || planMode;
  const modeIndicatorSlot: ReactNode = hasModeIndicators ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {planMode && (
        <ModeIndicator
          icon="edit_note"
          color={T.accent}
          label="Planleggingsmodus aktiv — sender en strukturert plan i stedet for å kjøre direkte"
        />
      )}
      {subAgentsEnabled && (
        <ModeIndicator
          icon="hub"
          color={T.warning ?? "#f59e0b"}
          label="Sub-agenter er aktive — dette medfører ekstra kostnad"
        />
      )}
      {isIncognito && (
        <ModeIndicator
          icon="visibility_off"
          color={T.textMuted}
          label="Inkognito — samtalen lagres ikke i historikken"
        />
      )}
    </div>
  ) : null;

  const startNewChat = useCallback((msg: string, options?: { firecrawlEnabled?: boolean; planMode?: boolean }) => {
    const repoName = selectedRepo?.name || null;
    const convId = isIncognito
      ? `inkognito-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : repoName
        ? repoConversationId(repoName)
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg = makeOptimisticMsg(convId, msg);
    // Pre-seed the fetcher so the useApiData refetch on `ac` change serves the
    // optimistic msg instead of overwriting it with an empty fetch.
    optForNewConvRef.current = { convId, msg: optimisticMsg };
    skipNextFetchRef.current = true;
    setAc(convId);
    setNewChat(false);
    // Persist convId in URL so refresh restores the conversation
    router.replace(`?conv=${convId}`, { scroll: false });
    setMsgData({ messages: [optimisticMsg], hasMore: false });
    hasSent.current = true;
    setSending(true);
    sendMessage(convId, msg, {
      ...(repoName && !isIncognito ? { repoName, repoOwner: selectedRepo?.owner } : {}),
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
      firecrawlEnabled: options?.firecrawlEnabled,
      planMode: options?.planMode || planMode || undefined,
    })
      .then(handleSendResult)
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  }, [selectedRepo, isIncognito, selectedSkillIds, selectedModel, planMode, router, setMsgData, handleSendResult]);

  const handleSend = useCallback(async (value: string, options?: { firecrawlEnabled?: boolean; planMode?: boolean }) => {
    if (!ac || !value) return;
    setChatError(null);

    if (pendingReviewId) {
      handleRequestChanges(pendingReviewId, value);
      setPendingReviewId(null);
      return;
    }

    const optimisticMsg = makeOptimisticMsg(ac, value);
    setMsgData(prev => ({
      messages: [...(prev?.messages ?? []), optimisticMsg],
      hasMore: prev?.hasMore ?? false,
    }));
    hasSent.current = true;
    setSending(true);
    sendMessage(ac, value, {
      repoName: selectedRepo?.name || curRepo || undefined,
      repoOwner: selectedRepo?.owner || undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
      firecrawlEnabled: options?.firecrawlEnabled,
      planMode: options?.planMode || planMode || undefined,
    })
      .then(handleSendResult)
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  }, [ac, pendingReviewId, selectedRepo, curRepo, selectedSkillIds, selectedModel, planMode, setMsgData, handleRequestChanges, handleSendResult]);

  const handleCancel = useCallback(() => {
    if (ac) cancelChatGeneration(ac).catch(() => {});
    setSending(false);
    setActiveTaskId(null);
  }, [ac]);

  const handleForceContinue = useCallback(async () => {
    if (!activeTaskId || !ac) return;
    try {
      await forceContinueTask(activeTaskId, ac);
    } catch {
      // Non-critical
    }
  }, [activeTaskId, ac]);

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    if (ac === id) {
      const remaining = filtered.filter(x => x.id !== id);
      if (remaining.length > 0) {
        setAc(remaining[0].id);
      } else {
        setAc(null);
        setNewChat(true);
      }
    }
    refreshConvs();
  };

  // Stream status text
  const streamStatusText = streamStatus && streamStatus !== "idle" && streamStatus !== "done"
    ? (() => {
        const s = streamStatus.toLowerCase();
        if (s.includes("plan")) return "Planlegger...";
        if (s.includes("build") || s.includes("generer")) return "Genererer kode...";
        if (s.includes("context") || s.includes("github") || s.includes("memory")) return "Henter kontekst...";
        if (s.includes("valid") || s.includes("test")) return "Validerer...";
        if (s.includes("review")) return "Gjennomgår...";
        return "Tenker...";
      })()
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", overflow: "hidden" }}>

      {/* Main content */}
      {newChat ? (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <ChatComposer
            onSubmit={startNewChat}
            skills={availableSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))}
            selectedSkillIds={selectedSkillIds}
            onSkillsChange={setSelectedSkillIds}
            subAgentsEnabled={subAgentsEnabled}
            onSubAgentsToggle={() => setSubAgentsEnabled(p => !p)}
            models={allModels}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            modeIndicatorSlot={modeIndicatorSlot}
            isIncognito={isIncognito}
            onIncognitoToggle={() => setIsIncognito(p => !p)}
            planMode={planMode}
            onPlanModeToggle={() => setPlanMode(p => !p)}
          />
        </div>
      ) : (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Stall banner */}
          {streamStalled && sending && activeTaskId && (
            <div style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: T.surface,
              border: `1px solid ${T.warning}`,
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: 13,
              color: T.warning,
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            }}>
              <span>Agenten har stoppet å svare</span>
              <button
                onClick={handleForceContinue}
                style={{
                  background: T.accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: T.sans,
                }}
              >
                Fortsett
              </button>
              <button
                onClick={handleCancel}
                style={{
                  background: "transparent",
                  color: T.textMuted,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: T.sans,
                }}
              >
                Avbryt
              </button>
            </div>
          )}

          <ChatContainer
            title={ac ? (conversations.find(c => c.id === ac)?.title || (ac.startsWith("inkognito-") ? "Inkognito" : "Ny samtale")) : "—"}
            subtitle={curRepo ?? undefined}
            msgs={displayMsgs}
            msgsLoading={msgsLoading}
            ac={ac}
            sending={sending}
            activeTaskId={activeTaskId}
            thinkSeconds={thinkSeconds}
            streamStatusText={streamStatusText}
            chatError={chatError}
            onClearError={() => setChatError(null)}
            onCancel={handleCancel}
            onApprove={handleApprove}
            onReject={handleReject}
            onRequestChanges={handleRequestChanges}
            onSend={handleSend}
            pendingReviewId={pendingReviewId}
            reviewInProgress={reviewInProgress}
            skills={availableSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))}
            selectedSkillIds={selectedSkillIds}
            onSkillsChange={setSelectedSkillIds}
            subAgentsEnabled={subAgentsEnabled}
            onSubAgentsToggle={() => setSubAgentsEnabled(p => !p)}
            models={allModels}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onNewChat={() => { setNewChat(true); setAc(null); }}
            modeIndicatorSlot={modeIndicatorSlot}
            isIncognito={isIncognito}
            onIncognitoToggle={() => setIsIncognito(p => !p)}
            planMode={planMode}
            onPlanModeToggle={() => setPlanMode(p => !p)}
          />
        </div>
      )}

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        onNewChat={() => { setNewChat(true); setAc(null); }}
        onSendMessage={(msg) => {
          if (newChat) {
            startNewChat(msg);
          } else if (ac) {
            handleSend(msg);
          }
        }}
        onTriggerDream={async () => {
          try {
            await apiFetch("/memory/dream", { method: "POST" });
          } catch { /* non-critical */ }
        }}
      />
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

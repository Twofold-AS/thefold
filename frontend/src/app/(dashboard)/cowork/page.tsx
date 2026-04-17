"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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

  useEffect(() => {
    if (ac === acPrevRef.current) return;
    if (acPrevRef.current !== null) {
      // Actual conversation switch — clear in-flight state
      setSending(false);
      setActiveTaskId(null);
      setChatError(null);
      setPendingMessages([]);
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

  const { data: msgData, loading: msgsLoading, refresh: refreshMsgs, setData: setMsgData } = useApiData(
    () => (ac ? getChatHistory(ac, 50) : Promise.resolve({ messages: [], hasMore: false })),
    [ac],
  );
  const msgs: Message[] = msgData?.messages ?? [];

  // Pending messages that haven't been confirmed by the server yet
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);

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
      onDone: () => {
        setSending(false);
        setActiveTaskId(null);
        // Clear pending messages once server confirms them
        setPendingMessages([]);
        refreshMsgs();
        // Refresh sidebar when AI response finishes (title now available from first message)
        refreshConvs();
      },
      onError: (err) => {
        setSending(false);
        setActiveTaskId(null);
        setChatError(classifyError(new Error(err)));
        // Keep pending messages visible on error (don't wipe them)
        // They will stay in pendingMessages until user manually clears or new message overwrites
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

  // Merge DB messages + SSE messages + pending messages
  // Pending messages are shown first (in order), then DB/SSE messages
  const merged = [...pendingMessages, ...msgs, ...filteredSseMsgs];

  // Deduplicate: user messages with same content (optimistic + DB can produce dupes)
  // Also remove pending messages if they're confirmed in DB
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

  // Direct-chat polling fallback removed — SSE delivers content immediately (agent.message, Fase 2)
  // and agent.done fires reliably to call refreshMsgs(). No polling loop needed for direct chat.

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

      setAc(convId);
      const optimisticMsg = makeOptimisticMsg(convId, autoMsg);
      // Add to pendingMessages so it survives refreshMsgs() calls
      setPendingMessages([optimisticMsg]);

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

  const startNewChat = useCallback((msg: string) => {
    const repoName = selectedRepo?.name || null;
    const convId = isIncognito
      ? `inkognito-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : repoName
        ? repoConversationId(repoName)
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAc(convId);
    setNewChat(false);
    // Refresh sidebar immediately when new conversation is created
    refreshConvs();
    const optimisticMsg = makeOptimisticMsg(convId, msg);
    // Add to pendingMessages so it survives refreshMsgs() calls
    setPendingMessages([optimisticMsg]);
    hasSent.current = true;
    setSending(true);
    sendMessage(convId, msg, {
      ...(repoName && !isIncognito ? { repoName, repoOwner: selectedRepo?.owner } : {}),
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
    })
      .then(handleSendResult)
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  }, [selectedRepo, isIncognito, selectedSkillIds, selectedModel, refreshConvs, handleSendResult]);

  const handleSend = useCallback(async (value: string, options?: { firecrawlEnabled?: boolean }) => {
    if (!ac || !value) return;
    setChatError(null);

    if (pendingReviewId) {
      handleRequestChanges(pendingReviewId, value);
      setPendingReviewId(null);
      return;
    }

    const optimisticMsg = makeOptimisticMsg(ac, value);
    // Add to pendingMessages so it survives refreshMsgs() calls
    setPendingMessages(prev => [...prev, optimisticMsg]);
    hasSent.current = true;
    setSending(true);
    sendMessage(ac, value, {
      repoName: selectedRepo?.name || curRepo || undefined,
      repoOwner: selectedRepo?.owner || undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
      firecrawlEnabled: options?.firecrawlEnabled,
    })
      .then(handleSendResult)
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  }, [ac, pendingReviewId, selectedRepo, curRepo, selectedSkillIds, selectedModel, handleRequestChanges, handleSendResult]);

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

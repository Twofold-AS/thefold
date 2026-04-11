"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import ChatComposer from "@/components/ChatComposer";
import ChatContainer from "@/components/chat/ChatContainer";
import ConversationSidebar, { extractRepoFromId } from "@/components/chat/ConversationSidebar";
import ProactiveSuggestions from "@/components/ProactiveSuggestions";

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
import { useRepoContext } from "@/lib/repo-context";
import { useAgentStream } from "@/hooks/useAgentStream";
import { useReviewFlow } from "@/hooks/useReviewFlow";

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

  const { selectedRepo } = useRepoContext();
  const [ac, setAc] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(false);
  const [thinkSeconds, setThinkSeconds] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const autoMsgSent = useRef(false);

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

  const { data: skillsData } = useApiData(() => listSkills(), []);
  const availableSkills = skillsData?.skills ?? [];

  const { data: providerData } = useApiData(() => listProviders(), []);
  const allModels = (providerData?.providers ?? []).flatMap(p =>
    p.models.filter(m => m.enabled).map(m => ({ id: m.id, displayName: m.displayName, provider: p.name }))
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const filtered = conversations.filter((c) => {
    if (c.id.startsWith("inkognito-")) return false;
    if (selectedRepo) return c.id.startsWith(`repo-${selectedRepo.name}-`);
    return c.id.startsWith("chat-");
  });

  // SSE streaming: connect for agent tasks (activeTaskId) or direct chat (ac as key)
  const { messages: sseMessages, status: streamStatus, agentStartedTaskId, stalled: streamStalled } = useAgentStream(
    sending ? (activeTaskId || ac) : null,
    {
      onDone: () => {
        setSending(false);
        setActiveTaskId(null);
        refreshMsgs();
      },
      onError: (err) => {
        setSending(false);
        setActiveTaskId(null);
        setChatError(classifyError(new Error(err)));
        refreshMsgs();
      },
    }
  );

  // When AI tool-use starts an agent task mid-chat, switch SSE stream to agent's taskId.
  // The backend emits agent.status { status: "agent_started", phase: taskId } which the
  // SSE hook captures as agentStartedTaskId. Switching activeTaskId reconnects the SSE.
  useEffect(() => {
    if (agentStartedTaskId && agentStartedTaskId !== activeTaskId) {
      setActiveTaskId(agentStartedTaskId);
    }
  }, [agentStartedTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the agent submits a review (status: "pending_review" arrives via SSE on taskId),
  // stop the sending spinner and immediately refresh messages — the review record is already
  // in the DB by the time the SSE event is emitted (store-agent-report writes DB first).
  useEffect(() => {
    if (streamStatus === "pending_review" && sending) {
      setSending(false);
      setActiveTaskId(null);
      refreshMsgs();
    }
  }, [streamStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll messages every 8s while watching an agent task — catches review messages that arrive
  // via pub/sub after the agent completes its work (agent.done hasn't fired yet during review wait).
  useEffect(() => {
    if (!sending || !activeTaskId) return;
    const iv = setInterval(() => { refreshMsgs(); }, 8000);
    return () => clearInterval(iv);
  }, [sending, activeTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trailing refreshes after send stops — catches any late pub/sub messages (review, completion)
  // that arrive after the SSE agent.done but before the DB is fully consistent.
  useEffect(() => {
    if (sending || !ac) return;
    // Extra 60 s refresh catches review/completion messages that arrive very
    // late via pub/sub (e.g. slow Linear sync or heavy AI review call).
    const timers = [2000, 8000, 20000, 60000].map(d => setTimeout(() => { refreshMsgs(); }, d));
    return () => timers.forEach(clearTimeout);
  }, [sending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert SSE messages to Message shape for display while streaming
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

  // Deduplicate: drop SSE messages whose IDs already exist in the DB snapshot
  const dbIds = new Set(msgs.map((m) => m.id));
  const filteredSseMsgs = sseAsMsgs.filter((m) => !dbIds.has(m.id));
  const displayMsgs = [...msgs, ...filteredSseMsgs];

  // Think seconds timer
  useEffect(() => {
    if (!sending) { setThinkSeconds(0); return; }
    const start = Date.now();
    const iv = setInterval(() => setThinkSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [sending]);

  // Safety timeout: stop sending after 2 minutes regardless
  useEffect(() => {
    if (!sending) return;
    const max = setTimeout(() => setSending(false), 120000);
    return () => clearTimeout(max);
  }, [sending]);

  // Polling fallback for direct chat (no SSE task stream active).
  // Starts 3 s after send (gives SSE a chance), then polls every 2 s for up to 90 s.
  // Bug B fix: after finding the first non-empty response, keeps polling for another 20 s
  // to catch self-review messages that arrive via pub/sub (async, up to ~15 s late).
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

          // Stop now if review message found, or 20 s elapsed since first content
          if (hasReview || Date.now() - firstContentAt > 20000) {
            setSending(false);
            stopped = true;
          }
        }
      } catch {
        // ignore transient errors during polling
      }
    };

    const startDelay = setTimeout(() => {
      if (stopped) return;
      poll();
      const iv = setInterval(() => { if (!stopped) poll(); }, 2000);
      intervals.push(iv);
      const maxTimeout = setTimeout(() => {
        if (!stopped) { stopped = true; setSending(false); }
      }, 87000); // 3 s start + 87 s = 90 s total
      timeouts.push(maxTimeout);
    }, 3000);
    timeouts.push(startDelay);

    return () => {
      stopped = true;
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, [sending, activeTaskId, ac, setMsgData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle send result: set SSE taskId if present; polling useEffect handles direct chat
  const handleSendResult = (result: { agentTriggered: boolean; taskId?: string } | null) => {
    if (result?.taskId) {
      setActiveTaskId(result.taskId); // Always connect SSE when we have a taskId
    }
    // For direct chat (no taskId): don't call refreshMsgs immediately — response
    // isn't in DB yet. The polling useEffect below detects the reply and stops sending.
    refreshConvs();
  };

  // Review flow
  const {
    pendingReviewId,
    setPendingReviewId,
    handleApprove,
    handleReject,
    handleRequestChanges,
  } = useReviewFlow(refreshMsgs, setChatError);

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
      setMsgData(prev => ({
        messages: [...(prev?.messages ?? []), makeOptimisticMsg(convId, autoMsg)],
        hasMore: prev?.hasMore ?? false,
      }));

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

  const cur = ac ? conversations.find((c) => c.id === ac) : null;
  const curRepo = ac ? extractRepoFromId(ac) : null;

  const startNewChat = (msg: string) => {
    const repoName = selectedRepo?.name || null;
    const convId = repoName
      ? repoConversationId(repoName)
      : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAc(convId);
    setNewChat(false);
    setMsgData(prev => ({
      messages: [...(prev?.messages ?? []), makeOptimisticMsg(convId, msg)],
      hasMore: prev?.hasMore ?? false,
    }));
    setSending(true);
    sendMessage(convId, msg, {
      ...(repoName ? { repoName, repoOwner: selectedRepo?.owner } : {}),
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
    })
      .then(handleSendResult)
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  };

  const handleSend = async (value: string) => {
    if (!ac || !value) return;
    setChatError(null);

    if (pendingReviewId) {
      // handleRequestChanges handles the API call, error reporting, and refreshMsgs internally
      handleRequestChanges(pendingReviewId, value);
      setPendingReviewId(null);
      return;
    }

    setMsgData(prev => ({
      messages: [...(prev?.messages ?? []), makeOptimisticMsg(ac, value)],
      hasMore: prev?.hasMore ?? false,
    }));
    setSending(true);
    sendMessage(ac, value, {
      repoName: selectedRepo?.name || curRepo || undefined,
      repoOwner: selectedRepo?.owner || undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      modelOverride: selectedModel,
    })
      .then(handleSendResult)
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  };

  const handleCancel = () => {
    if (ac) cancelChatGeneration(ac).catch(() => {});
    setSending(false);
    setActiveTaskId(null);
  };

  const handleForceContinue = async () => {
    if (!activeTaskId || !ac) return;
    try {
      await forceContinueTask(activeTaskId, ac);
    } catch {
      // Non-critical — agent may have already resumed
    }
  };

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

  // Map SSE status to human-readable Norwegian text for the typing indicator
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
    <div style={{
      display: "grid",
      gridTemplateColumns: "280px 1fr",
      height: "100%",
      position: "relative",
      overflow: "hidden",
    }}>
      <ConversationSidebar
        conversations={filtered}
        selectedId={newChat ? null : ac}
        loading={convsLoading}
        onSelect={(id) => { setAc(id); setNewChat(false); }}
        onNew={() => { setNewChat(true); setAc(null); }}
        onDelete={handleDelete}
      />

      {newChat ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
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
          />
        </div>
      ) : (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Stall banner — shown when no SSE event for 60s during active agent task */}
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
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
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
          <ProactiveSuggestions
            repo={curRepo ?? undefined}
            compact
            onStartTask={(desc) => handleSend(desc)}
          />
          <ChatContainer
            title={cur ? cur.title || "Ny samtale" : "\u2014"}
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

"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import ChatComposer from "@/components/ChatComposer";
import ChatContainer from "@/components/chat/ChatContainer";
import ConversationSidebar, { extractRepoFromId } from "@/components/chat/ConversationSidebar";

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

  // SSE streaming for active agent tasks
  const { messages: sseMessages, status: streamStatus } = useAgentStream(
    sending && activeTaskId ? activeTaskId : null,
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

  // Handle send result: set SSE taskId or refresh immediately for direct replies
  const handleSendResult = (result: { agentTriggered: boolean; taskId?: string } | null) => {
    if (result?.agentTriggered && result.taskId) {
      setActiveTaskId(result.taskId);
      // onDone/onError callbacks on the hook handle setSending(false)
    } else {
      // Direct chat reply — no agent, response already persisted to DB
      refreshMsgs().then(() => setSending(false));
    }
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

  // streamStatus drives UI implicitly via onDone/onError; referenced to satisfy lint
  void streamStatus;

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
        <ChatContainer
          title={cur ? cur.title || "Ny samtale" : "\u2014"}
          subtitle={curRepo ?? undefined}
          msgs={displayMsgs}
          msgsLoading={msgsLoading}
          ac={ac}
          sending={sending}
          thinkSeconds={thinkSeconds}
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

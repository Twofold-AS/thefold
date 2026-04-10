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
  approveReview,
  rejectReview,
  requestReviewChanges,
  type Message,
} from "@/lib/api";
import { useRepoContext } from "@/lib/repo-context";

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
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const autoMsgSent = useRef(false);
  const slowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStoppedRef = useRef(false);

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

        const newHash = data.messages
          .map((m: Message) => `${m.id}:${(m.content || "").substring(0, 80)}:${m.messageType}`)
          .join("|");
        const oldHash = msgs
          .map((m: Message) => `${m.id}:${(m.content || "").substring(0, 80)}:${m.messageType}`)
          .join("|");

        if (newHash !== oldHash) setMsgData({ ...data });

        const lastUserTime = (() => {
          for (let i = data.messages.length - 1; i >= 0; i--) {
            if (data.messages[i].role === "user") return new Date(data.messages[i].createdAt).getTime();
          }
          return 0;
        })();

        const hasRealReply = data.messages.some(
          (m: Message) =>
            m.role === "assistant" && m.content && m.content.trim().length > 0 &&
            !m.content.startsWith("{") && m.messageType === "chat" &&
            new Date(m.createdAt).getTime() > lastUserTime
        );

        const agentMessages = data.messages.filter((m: Message) =>
          m.role === "assistant" &&
          (m.messageType === "agent_status" || m.messageType === "agent_progress")
        );
        const lastAgent = agentMessages.length > 0 ? agentMessages[agentMessages.length - 1] : null;

        let agentDone = false;
        let agentWaiting = false;
        if (lastAgent) {
          try {
            const p = JSON.parse(lastAgent.content);
            agentDone = p.status === "done" || p.status === "completed" || p.status === "failed"
              || p.phase === "completed" || p.phase === "Ferdig" || p.phase === "Feilet";
            agentWaiting = p.status === "waiting" || p.status === "needs_input";
          } catch { /* ignore */ }
        }

        if (agentDone || agentWaiting || hasRealReply) {
          pollStoppedRef.current = true;
          setSending(false);
        }
      } catch { /* network error — keep polling */ }
    };

    const first = setTimeout(poll, 800);
    const fast = setInterval(poll, 1200);
    const slowdownTimer = setTimeout(() => clearInterval(fast), 8000);
    const slow = setTimeout(() => {
      slowIntervalRef.current = setInterval(poll, 3000);
    }, 8000);
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
  }, [sending, ac]); // eslint-disable-line react-hooks/exhaustive-deps

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
        .then(() => refreshConvs())
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
      .then(() => refreshConvs())
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  };

  const handleSend = async (value: string) => {
    if (!ac || !value) return;
    setChatError(null);

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
      .then(() => refreshConvs())
      .catch((e) => { setSending(false); setChatError(classifyError(e)); });
  };

  const handleApprove = async (reviewId: string) => {
    try {
      await approveReview(reviewId);
      refreshMsgs();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Godkjenning feilet");
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      await rejectReview(reviewId);
      refreshMsgs();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Avvisning feilet");
    }
  };

  const handleRequestChanges = (reviewId: string, feedback?: string) => {
    if (!feedback || feedback.trim() === "") {
      setPendingReviewId(reviewId);
      const input = document.querySelector<HTMLInputElement>("[data-chat-input]");
      if (input) input.focus();
      return;
    }
    requestReviewChanges(reviewId, feedback)
      .then(() => refreshMsgs())
      .catch((e) => setChatError(e instanceof Error ? e.message : "Endring feilet"));
  };

  const handleCancel = () => {
    if (ac) cancelChatGeneration(ac).catch(() => {});
    setSending(false);
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
          msgs={msgs}
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

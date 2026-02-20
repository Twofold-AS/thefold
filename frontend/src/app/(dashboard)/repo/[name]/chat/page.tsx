"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  sendMessage,
  getChatHistory,
  getRepoConversations,
  repoConversationId,
  deleteConversation,
  cancelChatGeneration,
  cancelTask,
  uploadChatFile,
  listSkills,
  approveReview,
  rejectReview,
  forceContinueTask,
  getTask,
  type Message,
  type ConversationSummary,
  type Skill,
} from "@/lib/api";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { ModelSelector } from "@/components/ModelSelector";
import { SkillsSelector, MessageSkillBadges } from "@/components/SkillsSelector";
import { ChatToolsMenu } from "@/components/ChatToolsMenu";
import { InlineSkillForm } from "@/components/InlineSkillForm";
import { LivePreview } from "@/components/LivePreview";
import { AgentStatus, parseAgentStatusContent } from "@/components/AgentStatus";
import { ChatMessage } from "@/components/ChatMessage";
import { usePreferences, useUser } from "@/contexts/UserPreferencesContext";
import { MagicIcon, magicPhrases } from "@/components/MagicIcon";
import Image from "next/image";

export default function RepoChatPage() {
  const params = useParams<{ name: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { preferences } = usePreferences();
  const { initial, avatarColor, aiName, aiInitials } = useUser();
  const modelMode = preferences.modelMode;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showConvList, setShowConvList] = useState(true);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [pollMode, setPollMode] = useState<"idle" | "waiting" | "cooldown">("idle");
  const [heartbeatLost, setHeartbeatLost] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [statusOverride, setStatusOverride] = useState<Record<string, unknown> | null>(null);
  const [statusDismissed, setStatusDismissed] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "56px";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, []);

  const checkNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 100;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (isNearBottomRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  // Load skills for message badges
  useEffect(() => {
    listSkills().then((res) => setAllSkills(res.skills)).catch(() => {});
  }, []);

  // Load conversations
  useEffect(() => {
    const convIdFromTransfer = searchParams.get("convId");

    getRepoConversations(params.name)
      .then((res) => {
        setConversations(res.conversations);
        if (convIdFromTransfer) {
          setActiveConvId(convIdFromTransfer);
        } else if (res.conversations.length > 0) {
          setActiveConvId(res.conversations[0].id);
        }
      })
      .catch(() => {
        if (convIdFromTransfer) {
          setActiveConvId(convIdFromTransfer);
        }
      });
  }, [params.name, searchParams]);

  // Load history once when conversation changes (no constant polling)
  useEffect(() => {
    if (!activeConvId) return;
    loadHistory();
  }, [activeConvId]);

  // Smart polling: only when AI is working
  useEffect(() => {
    if (pollMode === "idle" || !activeConvId) return;

    const interval = pollMode === "waiting" ? 2000 : 1000;

    const timer = setInterval(async () => {
      try {
        const res = await getChatHistory(activeConvId, 100);
        setMessages(res.messages);

        const lastMsg = res.messages[res.messages.length - 1];

        // AI is done — only stop when assistant message has ACTUAL content (not empty placeholder)
        // Exclude agent_thought too — thoughts are intermediate, not completion signals
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.messageType !== "agent_status" && lastMsg.messageType !== "agent_thought" && lastMsg.content && lastMsg.content.trim()) {
          if (pollMode === "waiting") {
            setPollMode("cooldown");
          } else {
            setPollMode("idle");
          }
          setHeartbeatLost(false);
          return;
        }

        // Heartbeat check — use longer timeout for "Venter" phase (review waiting)
        if (lastMsg?.messageType === "agent_status" && lastMsg.updatedAt) {
          let isWaitingPhase = false;
          try {
            const parsed = JSON.parse(lastMsg.content);
            isWaitingPhase = parsed?.phase === "Venter";
          } catch {}
          const timeout = isWaitingPhase ? 300000 : 30000; // 5 min for Venter, 30s otherwise
          const lastUpdate = new Date(lastMsg.updatedAt).getTime();
          const now = Date.now();
          setHeartbeatLost(now - lastUpdate > timeout);
        }
      } catch {
        // Silent
      }
    }, interval);

    return () => clearInterval(timer);
  }, [pollMode, activeConvId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  async function loadHistory() {
    if (!activeConvId) return;
    try {
      const res = await getChatHistory(activeConvId, 100);
      setMessages(res.messages);
    } catch {
      // Silent
    }
  }

  function handleNewConversation() {
    const id = repoConversationId(params.name);
    setActiveConvId(id);
    setMessages([]);
  }

  async function handleDeleteConversation(convId: string) {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        handleNewConversation();
      }
    } catch {
      // Silent
    }
  }

  function handleSuggestedQuestion(q: string) {
    setInput(q);
    textareaRef.current?.focus();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const convId = activeConvId || repoConversationId(params.name);
    if (!activeConvId) setActiveConvId(convId);

    try {
      const content = await file.text();
      await uploadChatFile(convId, file.name, file.type || "text/plain", content, file.size);

      const preview = content.length > 10000 ? content.substring(0, 10000) + "\n\n... (avkortet)" : content;
      setInput(`[Fil: ${file.name}]\n\n${preview}`);
      textareaRef.current?.focus();
    } catch {
      // Silent
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const convId = activeConvId || repoConversationId(params.name);
    if (!activeConvId) setActiveConvId(convId);

    // Optimistic: add new conversation to list immediately
    const isInList = conversations.some((c) => c.id === convId);
    if (!isInList) {
      setConversations((prev) => [
        { id: convId, title: text.substring(0, 80), lastMessage: text, lastActivity: new Date().toISOString() },
        ...prev,
      ]);
    }

    // Optimistic: show user message immediately
    const optimisticMsg: Message = {
      id: "temp-" + Date.now(),
      conversationId: convId,
      role: "user",
      content: text,
      messageType: "chat",
      createdAt: new Date().toISOString(),
      metadata: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput("");
    setSending(true);
    setPollMode("waiting");
    try {
      await sendMessage(convId, text, {
        modelOverride: selectedModel,
        skillIds: activeSkillIds.length > 0 ? activeSkillIds : undefined,
        repoName: params.name,
      });
      await loadHistory();

      // Always refresh conversation list after sending
      try {
        const updated = await getRepoConversations(params.name);
        setConversations(updated.conversations);
      } catch {
        // Keep optimistic state
      }
    } catch {
      // Silent
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return formatTime(dateStr);
    return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  }

  // Agent status tracking for AgentStatus box (rendered separately from messages)
  const lastAgentStatus = useMemo(() => {
    if (statusDismissed) return null;
    if (statusOverride !== null) return statusOverride;
    const statusMsgs = messages.filter(m => m.messageType === "agent_status");
    if (statusMsgs.length === 0) return null;
    const last = statusMsgs[statusMsgs.length - 1];
    // Use typed parser — handles new contract + legacy format
    const parsed = parseAgentStatusContent(last.content);
    if (parsed) return { ...parsed, messageId: last.id, metadata: last.metadata };
    return null;
  }, [messages, statusOverride, statusDismissed]);

  const agentActive = useMemo(() => {
    if (!lastAgentStatus) return false;
    // Only show AgentStatus for real agent tasks (must have taskId in metadata)
    try {
      const meta = typeof lastAgentStatus.metadata === "string"
        ? JSON.parse(lastAgentStatus.metadata)
        : lastAgentStatus.metadata;
      if (!meta?.taskId) return false;
    } catch { return false; }
    return lastAgentStatus.phase !== "Ferdig" && lastAgentStatus.phase !== "Feilet" && lastAgentStatus.phase !== "Stopped";
  }, [lastAgentStatus]);

  // Extract last agent thought for display in AgentWorking
  const lastThought = useMemo(() => {
    const thoughts = messages.filter(m => m.messageType === "agent_thought");
    return thoughts.length > 0 ? thoughts[thoughts.length - 1].content : undefined;
  }, [messages]);

  // Extract active task ID from agent status metadata
  const activeTaskId = useMemo(() => {
    if (!lastAgentStatus) return null;
    try {
      const meta = typeof lastAgentStatus.metadata === "string"
        ? JSON.parse(lastAgentStatus.metadata)
        : lastAgentStatus.metadata;
      return meta?.taskId || null;
    } catch { return null; }
  }, [lastAgentStatus]);

  // FIX 4: Poll task status to detect external stops
  useEffect(() => {
    if (!activeTaskId || !agentActive) return;

    const interval = setInterval(async () => {
      try {
        const result = await getTask(activeTaskId);
        const stoppedStatuses = ["backlog", "cancelled", "done"];
        if (stoppedStatuses.includes(result.task.status)) {
          setStatusOverride({
            type: "agent_status",
            phase: "Stopped",
            title: "Oppgave stoppet",
            error: result.task.errorMessage || "Oppgaven ble stoppet eksternt",
            steps: [{ label: "Oppgaven ble stoppet eksternt", status: "error" }],
          });
          setPollMode("idle");
          clearInterval(interval);
        }
      } catch { /* ignore — task may not exist in tasks-service */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTaskId, agentActive]);

  // Agent callbacks
  function handleAgentReply(answer: string) {
    if (!activeConvId) return;
    const convId = activeConvId;
    setMessages((prev) => [
      ...prev,
      {
        id: "temp-reply-" + Date.now(),
        conversationId: convId,
        role: "user",
        content: answer,
        messageType: "chat",
        createdAt: new Date().toISOString(),
        metadata: null,
      },
    ]);
    setPollMode("waiting");
    sendMessage(convId, answer, { modelOverride: selectedModel, repoName: params.name }).then(() => loadHistory()).catch(() => {});
  }

  function handleAgentCancel() {
    setCancelled(true);
    if (activeConvId) {
      cancelChatGeneration(activeConvId).catch(() => {});
      setPollMode("idle");
      setHeartbeatLost(false);
    }
    // Also cancel the task if we have a taskId
    if (lastAgentStatus) {
      try {
        const meta = typeof lastAgentStatus.metadata === "string"
          ? JSON.parse(lastAgentStatus.metadata)
          : lastAgentStatus.metadata;
        if (meta?.taskId) {
          cancelTask(meta.taskId).catch(() => {});
        }
      } catch {}
    }
  }

  // Review actions from AgentStatus
  async function handleApproveFromChat(reviewId: string) {
    try {
      // Optimistic: show "Godkjenner..." immediately
      setStatusOverride({
        type: "agent_status",
        phase: "Bygger",
        title: "Godkjenner...",
        steps: [
          { label: "Kode skrevet", status: "done" },
          { label: "Validert", status: "done" },
          { label: "Review godkjent", status: "done" },
          { label: "Oppretter PR", status: "active" },
        ],
      });
      await approveReview(reviewId);
      // Optimistic: show "Ferdig"
      setStatusOverride({
        type: "agent_status",
        phase: "Ferdig",
        title: "PR opprettet",
        steps: [
          { label: "Kode skrevet", status: "done" },
          { label: "Validert", status: "done" },
          { label: "Review godkjent", status: "done" },
          { label: "PR opprettet", status: "done" },
        ],
      });
      loadHistory();
    } catch (e: any) {
      console.error("Approve failed:", e);
      setStatusOverride({
        type: "agent_status",
        phase: "Feilet",
        title: "Godkjenning feilet",
        error: e?.message || "Ukjent feil",
        steps: [],
      });
    }
  }

  function handleRequestChangesFromChat(reviewId: string) {
    router.push(`/review/${reviewId}`);
  }

  async function handleRejectFromChat(reviewId: string) {
    try {
      await rejectReview(reviewId, "Avvist fra chat");
      // Optimistic: show "Feilet" immediately
      setStatusOverride({
        type: "agent_status",
        phase: "Feilet",
        title: "Review avvist",
        error: "Avvist fra chat",
        steps: [
          { label: "Kode skrevet", status: "done" },
          { label: "Validert", status: "done" },
          { label: "Review avvist", status: "error" },
        ],
      });
    } catch (e: any) {
      console.error("Reject failed:", e);
    }
  }

  function handleDismissStatus() {
    setStatusDismissed(true);
    setStatusOverride(null);
    setPollMode("idle");
    setHeartbeatLost(false);
  }

  async function handleForceContinue(taskId: string) {
    if (!activeConvId) return;
    try {
      await forceContinueTask(taskId, activeConvId);
      setPollMode("waiting");
    } catch (e: any) {
      console.error("Force continue failed:", e);
    }
  }

  function handleCancelTask(taskId: string) {
    cancelTask(taskId).catch(() => {});
    handleDismissStatus();
  }

  // Check if AI is still thinking
  const lastMsg = messages[messages.length - 1];
  const isWaitingForAI = pollMode === "waiting" && (!lastMsg || lastMsg.role === "user" || lastMsg.messageType === "agent_status");

  // Thinking indicator: show until AI response with actual content appears
  const waitingForReply = useMemo(() => {
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    // User message = still waiting
    if (last.role === "user") return true;
    // Empty assistant placeholder = still waiting
    if (last.role === "assistant" && (!last.content || !last.content.trim())) return true;
    // Agent status = still waiting, UNLESS terminal phase (Ferdig/Feilet)
    if (last.messageType === "agent_status") {
      try {
        const parsed = JSON.parse(last.content);
        if (parsed.phase === "Ferdig" || parsed.phase === "Feilet") return false;
      } catch {}
      return true;
    }
    // Agent thought = still waiting (intermediate feed, not a final response)
    if (last.messageType === "agent_thought") return true;
    return false;
  }, [messages]);

  const showThinking = (sending || waitingForReply) && !cancelled && !statusDismissed;

  // Reset cancelled flag when new messages arrive
  useEffect(() => { setCancelled(false); setStatusDismissed(false); setStatusOverride(null); }, [messages.length]);

  useEffect(() => {
    if (!showThinking) return;
    const interval = setInterval(() => {
      setPhraseIndex((prev) => {
        let next: number;
        do { next = Math.floor(Math.random() * magicPhrases.length); } while (next === prev && magicPhrases.length > 1);
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [showThinking]);

  useEffect(() => {
    if (!showThinking) { setThinkingSeconds(0); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      // Safety timeout — stop counting at 120s
      setThinkingSeconds(prev => elapsed >= 120 ? prev : elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [showThinking]);


  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Chat header — custom, not PageHeaderBar */}
      <div className="flex items-stretch flex-shrink-0" style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}>
        {/* Tittel — LIKE BRED SOM SAMTALE-PANELET */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", width: "280px" }}
        >
          <h1 className="page-title text-xl" style={{ color: "var(--text-primary)" }}>
            {params.name}
          </h1>
        </div>

        {/* AI-modell — cellen ER knappen */}
        <div
          className="relative shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "200px", overflow: "visible" }}
        >
          <ModelSelector value={selectedModel} onChange={setSelectedModel} mode={modelMode === "manual" ? "manual" : "auto"} />
        </div>

        {/* Skills — cellen ER knappen */}
        <div
          className="relative shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "160px", overflow: "visible" }}
        >
          <SkillsSelector selectedIds={activeSkillIds} onChange={setActiveSkillIds} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Ny samtale */}
        <div
          className="flex items-center px-5 cursor-pointer hover:bg-white/5 transition-colors shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
          onClick={handleNewConversation}
        >
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>+ Ny samtale</span>
        </div>

        {/* Slett */}
        <div
          className="flex items-center px-5 cursor-pointer hover:bg-white/5 transition-colors shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
          onClick={() => activeConvId && messages.length > 0 && handleDeleteConversation(activeConvId)}
        >
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Slett</span>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Samtale-panel — fast bredde, koblet med tittel-cellen */}
        {showConvList && (
          <div
            className="hidden lg:flex flex-col shrink-0 overflow-y-auto"
            style={{ width: "280px", borderRight: "1px solid var(--border)" }}
          >
            {conversations.length === 0 ? (
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Ingen samtaler ennå
                </span>
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveConvId(c.id)}
                  className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: c.id === activeConvId ? "rgba(255,255,255,0.06)" : "transparent",
                  }}
                >
                  <span className="text-sm block truncate" style={{
                    color: c.id === activeConvId ? "var(--text-primary)" : "var(--text-secondary)",
                  }}>
                    {c.title || "Ny samtale"}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(c.lastActivity)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Chat + Preview */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Toggle samtale-liste knapp — INNE I chat-area */}
          <button
            onClick={() => setShowConvList(!showConvList)}
            className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 hover:bg-white/5"
            style={{ color: "var(--text-muted)" }}
            title={showConvList ? "Skjul samtaler" : "Vis samtaler"}
          >
            {showConvList ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          </button>

          {/* Messages area */}
          <div
            className="flex flex-col min-h-0"
            style={{ width: showPreview ? "50%" : "100%", transition: "width 0.2s" }}
          >
            <div
              ref={messagesContainerRef}
              onScroll={checkNearBottom}
              className="flex-1 overflow-y-auto chat-scroll pb-4 px-4"
            >
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-sm">
                    <Image src="/logo.svg" alt="TheFold" width={40} height={40} className="mx-auto mb-4 opacity-40" />
                    <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                      Start en samtale om {params.name}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {["Analyser strukturen", "Forklar arkitekturen", "Finn bugs"].map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSuggestedQuestion(q)}
                          className="text-xs px-3 py-1.5 transition-colors"
                          style={{
                            border: "1px solid var(--border)",
                            color: "var(--text-secondary)",
                            background: "transparent",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-4xl mx-auto pt-4">
                  {messages.filter(m => {
                    if (m.messageType === "agent_status") return false;
                    if (m.messageType === "agent_report") return false;
                    if (m.role === "assistant" && (!m.content || !m.content.trim()) && m.messageType !== "agent_thought") return false;
                    return true;
                  }).map((msg) => {
                    const isUser = msg.role === "user";
                    const isContextTransfer = msg.messageType === "context_transfer";

                    if (msg.messageType === "agent_thought") {
                      // Safety: if content is JSON (old messages), extract .thought field
                      let thoughtText = msg.content;
                      try {
                        const parsed = JSON.parse(msg.content);
                        if (parsed.thought) thoughtText = parsed.thought;
                      } catch { /* already plain text */ }
                      return (
                        <div key={msg.id} className="flex items-start gap-1.5 animate-fadeIn max-w-4xl">
                          <span className="text-xs opacity-40 mt-0.5" style={{ color: "var(--text-muted)" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          </span>
                          <span className="text-xs italic opacity-40" style={{ color: "var(--text-muted)" }}>{thoughtText}</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2.5 message-enter ${isUser ? "flex-row-reverse" : ""}`}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 mt-0.5"
                          style={{
                            background: isUser ? avatarColor : "var(--bg-card)",
                            color: isUser ? "#fff" : "var(--text-secondary)",
                            border: isUser ? "none" : "1px solid var(--border)",
                          }}
                        >
                          {isUser ? initial : aiInitials}
                        </div>

                        <div
                          className={`${isUser ? "max-w-[70%] text-right" : "max-w-[85%]"}`}
                          style={{
                            ...(isContextTransfer
                              ? { borderLeft: "2px solid #22c55e", paddingLeft: "12px" }
                              : {}),
                          }}
                        >
                          {isContextTransfer && (
                            <span
                              className="inline-block text-[10px] px-1.5 py-0.5 mb-1 font-medium"
                              style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                            >
                              Context-overføring
                            </span>
                          )}

                          <div
                            className={`text-sm leading-relaxed rounded-xl px-3.5 py-2.5 inline-block ${isUser ? "whitespace-pre-wrap" : ""}`}
                            style={{
                              background: isUser ? "var(--bg-card)" : "var(--bg-chat)",
                              color: "var(--text-primary)",
                              border: isUser ? "1px solid var(--border)" : "none",
                              textAlign: "left",
                            }}
                          >
                            {isUser ? (
                              <span>{msg.content}</span>
                            ) : (
                              <ChatMessage content={msg.content} role="assistant" />
                            )}
                          </div>

                          {/* Timestamp + Token info + Skills */}
                          <div
                            className="text-[10px] mt-1 px-1 flex items-center gap-2 flex-wrap"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <span>{formatTime(msg.createdAt)}</span>
                            {!isUser && msg.metadata && (() => {
                              try {
                                const meta = typeof msg.metadata === "string" ? JSON.parse(msg.metadata) : msg.metadata;
                                if (meta.model) {
                                  return (
                                    <>
                                      <span>{meta.model}</span>
                                      {meta.tokens?.totalTokens != null && <span>{meta.tokens.totalTokens} tokens</span>}
                                      {meta.cost != null && <span>${meta.cost.toFixed(4)}</span>}
                                      {meta.truncated && (
                                        <span style={{ color: "#ef4444" }}>Avbrutt (maks tokens)</span>
                                      )}
                                      {meta.toolsUsed?.length > 0 && (
                                        <span>{meta.toolsUsed.length} verktoy brukt</span>
                                      )}
                                    </>
                                  );
                                }
                              } catch { /* ignore */ }
                              return null;
                            })()}
                          </div>
                          {msg.metadata && (() => {
                            try {
                              const meta = typeof msg.metadata === "string" ? JSON.parse(msg.metadata) : msg.metadata;
                              if (meta.skillIds?.length > 0) {
                                return <div className="px-1"><MessageSkillBadges skillIds={meta.skillIds} allSkills={allSkills} /></div>;
                              }
                            } catch { /* ignore */ }
                            return null;
                          })()}
                        </div>
                      </div>
                    );
                  })}

                  {/* AgentStatus — rendered separately from messages, stays visible on failure/stopped */}
                  {lastAgentStatus && (agentActive || lastAgentStatus.phase === "Feilet" || lastAgentStatus.phase === "Stopped" || lastAgentStatus.phase === "Ferdig" || lastAgentStatus.phase === "Venter") && (
                    <div className="message-enter">
                      <AgentStatus
                        data={{
                          phase: lastAgentStatus.phase,
                          title: lastAgentStatus.title || lastAgentStatus.phase,
                          steps: lastAgentStatus.steps || [],
                          error: lastAgentStatus.error,
                          questions: lastAgentStatus.questions,
                          reviewData: lastAgentStatus.reviewData,
                          planProgress: lastAgentStatus.planProgress,
                          activeTasks: lastAgentStatus.activeTasks,
                          ...(lastAgentStatus.metadata?.taskId ? { taskId: lastAgentStatus.metadata.taskId } : {}),
                        }}
                        lastThought={lastThought}
                        onReply={handleAgentReply}
                        onDismiss={handleDismissStatus}
                        onApprove={handleApproveFromChat}
                        onRequestChanges={handleRequestChangesFromChat}
                        onReject={handleRejectFromChat}
                        onForceContinue={handleForceContinue}
                        onCancelTask={handleCancelTask}
                      />
                    </div>
                  )}

                  {/* Thinking indicator — MagicIcon + aiName + phrase + timer */}
                  {showThinking && !agentActive && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center"
                        style={{ color: "var(--text-muted)" }}>
                        <MagicIcon phrase={magicPhrases[phraseIndex]} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                          {aiName}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                          &middot; {magicPhrases[phraseIndex]}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.4 }}>
                          &middot; tenker &middot; {thinkingSeconds}s
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Heartbeat lost */}
                  {heartbeatLost && (
                    <div className="px-4 py-3 message-enter" style={{ border: "1px solid #ef4444" }}>
                      <span className="text-sm" style={{ color: "#ef4444" }}>
                        Mistet kontakt med {aiName}.
                      </span>
                      <button
                        onClick={() => { setPollMode("idle"); setHeartbeatLost(false); }}
                        className="text-sm ml-2 underline"
                        style={{ color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
                      >
                        Avbryt
                      </button>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex-shrink-0 px-2 pb-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              {/* Inline forms */}
              <div className="max-w-4xl mx-auto">
                {showSkillForm && (
                  <InlineSkillForm
                    onClose={() => setShowSkillForm(false)}
                    onCreated={() => setShowSkillForm(false)}
                  />
                )}
                {showTaskForm && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      padding: "16px",
                      marginBottom: "8px",
                    }}
                  >
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Task-oppretting via Linear kommer snart
                    </p>
                    <button
                      onClick={() => setShowTaskForm(false)}
                      className="text-xs mt-2"
                      style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Lukk
                    </button>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".md,.txt,.json,.ts,.tsx,.js,.jsx,.py,.yaml,.yml,.csv,.html,.css,.sql,.sh,.toml"
                onChange={handleFileUpload}
              />
              <form onSubmit={handleSend} className="flex gap-2 items-end max-w-4xl mx-auto">
                <ChatToolsMenu
                  onCreateSkill={() => setShowSkillForm(true)}
                  onCreateTask={() => setShowTaskForm(true)}
                  onUploadFile={() => fileInputRef.current?.click()}
                />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Melding om ${params.name}...`}
                  className="input-field flex-1 resize-none"
                  style={{ minHeight: "56px", maxHeight: "150px" }}
                  rows={1}
                  disabled={sending}
                />
                {isWaitingForAI && !cancelled ? (
                  <button
                    type="button"
                    onClick={() => handleAgentCancel()}
                    className="flex items-center justify-center hover:bg-white/10 transition-colors"
                    style={{ width: "32px", height: "32px", border: "1px solid var(--border)", borderRadius: "50%", background: "transparent", flexShrink: 0 }}
                    title="Stopp generering"
                  >
                    <div className="w-2.5 h-2.5" style={{ background: "var(--text-primary)" }} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="flex items-center justify-center hover:bg-white/10 transition-colors"
                    style={{
                      width: "32px",
                      height: "32px",
                      border: "1px solid var(--border)",
                      borderRadius: "50%",
                      background: "transparent",
                      flexShrink: 0,
                      opacity: !input.trim() && !sending ? 0.3 : 1,
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-primary)" }}>
                      <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" />
                    </svg>
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* Live Preview Panel */}
          {showPreview && (
            <div className="min-h-0" style={{ width: "50%", borderLeft: "1px solid var(--border)" }}>
              <LivePreview isActive={showPreview} onClose={() => setShowPreview(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

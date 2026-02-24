"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  sendMessage,
  getChatHistory,
  getMainConversations,
  mainConversationId,
  transferContext,
  deleteConversation,
  cancelChatGeneration,
  cancelTask,
  uploadChatFile,
  approveReview,
  rejectReview,
  getTask,
  type Message,
  type ConversationSummary,
} from "@/lib/api";
import {
  Plus,
  Trash2,
  ArrowRightLeft,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  Ghost,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Edit3,
} from "lucide-react";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { AgentProgressCard, type AgentProgressData, type ProgressStep } from "@/components/chat/agent-progress";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatControls } from "@/components/chat/chat-controls";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import { ParticleField, EmberGlow } from "@/components/effects/ParticleField";
import { usePreferences } from "@/contexts/UserPreferencesContext";
import { useRepoContext } from "@/lib/repo-context";

function parseAgentStatus(content: string): AgentProgressData | null {
  try {
    const parsed = JSON.parse(content);
    return {
      phase: parsed.phase || "unknown",
      title: parsed.title || parsed.phase || "Working",
      steps: (parsed.steps || []).map((s: { label: string; status: string }) => ({
        label: s.label,
        status: s.status === "done" ? "done" : s.status === "active" ? "active" : s.status === "error" ? "error" : "pending",
      })) as ProgressStep[],
      error: parsed.error,
      reviewData: parsed.reviewData,
      taskId: parsed.taskId,
    };
  } catch {
    return null;
  }
}

// Parse agent_progress messages (new format from Z-project)
function parseAgentProgress(content: string): AgentProgressData | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.status) {
      // New progress format
      return {
        phase: parsed.phase || parsed.status,
        title: parsed.summary || parsed.title || parsed.status,
        steps: (parsed.steps || []).map((s: { label: string; status: string }) => ({
          label: s.label,
          status: s.status === "done" ? "done" : s.status === "active" ? "active" : s.status === "error" ? "error" : "pending",
        })) as ProgressStep[],
        error: parsed.error,
        reviewData: parsed.report || parsed.reviewData,
        taskId: parsed.taskId,
      };
    }
    return parseAgentStatus(content);
  } catch {
    return parseAgentStatus(content);
  }
}

type ConvFilter = "all" | "repo" | "inkognito";

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { preferences } = usePreferences();
  const { repos, selectedRepo } = useRepoContext();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showConvList, setShowConvList] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [transferred, setTransferred] = useState<string | null>(null);
  const [pollMode, setPollMode] = useState<"idle" | "waiting" | "cooldown">("idle");
  const [cancelled, setCancelled] = useState(false);
  const [statusOverride, setStatusOverride] = useState<Record<string, unknown> | null>(null);
  const [statusDismissed, setStatusDismissed] = useState(false);
  const [showRepoSelector, setShowRepoSelector] = useState(false);

  // Chat controls state
  const [inkognito, setInkognito] = useState(false);
  const [agentMode, setAgentMode] = useState(true);
  const [subAgents, setSubAgents] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [chatRepo, setChatRepo] = useState<string | null>(null);
  const [convFilter, setConvFilter] = useState<ConvFilter>("all");

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);

  const checkNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (isNearBottomRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  // On mount: check for initial query from overview
  useEffect(() => {
    const freshId = mainConversationId();
    setActiveConvId(freshId);
    setMessages([]);
    getMainConversations()
      .then((res) => setConversations(res.conversations))
      .catch(() => {});

    const q = searchParams.get("q");
    if (q) {
      setInput(q);
    }
  }, []);

  // Sync repo context
  useEffect(() => {
    if (selectedRepo) {
      setChatRepo(selectedRepo.fullName);
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (!activeConvId) return;
    loadHistory();
  }, [activeConvId]);

  // Smart polling
  useEffect(() => {
    if (pollMode === "idle" || !activeConvId) return;
    const interval = pollMode === "waiting" ? 2000 : 1000;

    const timer = setInterval(async () => {
      try {
        const res = await getChatHistory(activeConvId, 100);
        setMessages(res.messages);

        const lastMsg = res.messages[res.messages.length - 1];
        if (
          lastMsg &&
          lastMsg.role === "assistant" &&
          lastMsg.messageType !== "agent_status" &&
          lastMsg.messageType !== "agent_thought" &&
          lastMsg.messageType !== "agent_progress" &&
          lastMsg.content?.trim()
        ) {
          setPollMode(pollMode === "waiting" ? "cooldown" : "idle");
        }
      } catch {}
    }, interval);

    return () => clearInterval(timer);
  }, [pollMode, activeConvId]);

  useEffect(() => scrollToBottom(), [messages, scrollToBottom]);

  async function loadHistory() {
    if (!activeConvId) return;
    try {
      const res = await getChatHistory(activeConvId, 100);
      setMessages(res.messages);
    } catch {}
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const convId = activeConvId || mainConversationId();
    if (!activeConvId) setActiveConvId(convId);

    if (!conversations.some((c) => c.id === convId)) {
      setConversations((prev) => [
        { id: convId, title: text.substring(0, 80), lastMessage: text, lastActivity: new Date().toISOString() },
        ...prev,
      ]);
    }

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
        chatOnly: !agentMode || inkognito,
        modelOverride: selectedModel,
      });
      await loadHistory();
      try {
        const updated = await getMainConversations();
        setConversations(updated.conversations);
      } catch {}
    } catch {}
    finally {
      setSending(false);
    }
  }

  function handleNewConversation() {
    const id = mainConversationId();
    setActiveConvId(id);
    setMessages([]);
    setTransferred(null);
  }

  async function handleDeleteConversation(convId: string) {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) handleNewConversation();
    } catch {}
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const convId = activeConvId || mainConversationId();
    if (!activeConvId) setActiveConvId(convId);
    try {
      const content = await file.text();
      await uploadChatFile(convId, file.name, file.type || "text/plain", content, file.size);
      const preview = content.length > 10000 ? content.substring(0, 10000) + "\n\n... (truncated)" : content;
      setInput(`[File: ${file.name}]\n\n${preview}`);
    } catch {}
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleTransferToRepo(repoName: string) {
    if (!activeConvId || transferring) return;
    setTransferring(true);
    try {
      const result = await transferContext(activeConvId, repoName);
      setShowRepoSelector(false);
      setTransferred(repoName);
      router.push(`/repo/${repoName}/chat?convId=${result.targetConversationId}`);
    } catch {}
    finally { setTransferring(false); }
  }

  function handleCancel() {
    setCancelled(true);
    if (activeConvId) {
      cancelChatGeneration(activeConvId).catch(() => {});
      setPollMode("idle");
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("en", { day: "numeric", month: "short" });
  }

  const isReadOnly = !!transferred;

  // Agent status tracking
  const lastAgentStatus = useMemo((): AgentProgressData | null => {
    if (statusDismissed) return null;
    if (statusOverride) return statusOverride as unknown as AgentProgressData;

    // Check for agent_progress first (new format)
    const progressMsgs = messages.filter((m) => m.messageType === "agent_progress");
    if (progressMsgs.length > 0) {
      const last = progressMsgs[progressMsgs.length - 1];
      return parseAgentProgress(last.content);
    }

    // Fallback to legacy agent_status
    const statusMsgs = messages.filter((m) => m.messageType === "agent_status");
    if (statusMsgs.length === 0) return null;
    const last = statusMsgs[statusMsgs.length - 1];
    const parsed = parseAgentStatus(last.content);
    if (!parsed) return null;
    try {
      const meta = typeof last.metadata === "string" ? JSON.parse(last.metadata) : last.metadata;
      if (meta?.taskId) parsed.taskId = meta.taskId;
    } catch {}
    return parsed;
  }, [messages, statusOverride, statusDismissed]);

  const agentActive = useMemo(() => {
    if (!lastAgentStatus) return false;
    const terminal = ["Ferdig", "Feilet", "Stopped", "completed", "failed", "done"];
    return !terminal.includes(lastAgentStatus.phase);
  }, [lastAgentStatus]);

  // Poll task status for external stops
  useEffect(() => {
    const taskId = lastAgentStatus?.taskId;
    if (!taskId || !agentActive) return;
    const interval = setInterval(async () => {
      try {
        const result = await getTask(taskId);
        if (["backlog", "cancelled", "done"].includes(result.task.status)) {
          setStatusOverride({
            phase: "Stopped",
            title: "Task stopped",
            steps: [{ label: "Task was stopped externally", status: "error" }],
          });
          setPollMode("idle");
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [lastAgentStatus?.taskId, agentActive]);

  // Review handlers
  async function handleApprove(reviewId: string) {
    try {
      setStatusOverride({
        phase: "Bygger",
        title: "Creating PR...",
        steps: [
          { label: "Code written", status: "done" },
          { label: "Validated", status: "done" },
          { label: "Review approved", status: "done" },
          { label: "Creating PR", status: "active" },
        ],
      });
      await approveReview(reviewId);
      setStatusOverride({
        phase: "Ferdig",
        title: "PR created",
        steps: [
          { label: "Code written", status: "done" },
          { label: "Validated", status: "done" },
          { label: "Review approved", status: "done" },
          { label: "PR created", status: "done" },
        ],
      });
      loadHistory();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStatusOverride({
        phase: "Feilet",
        title: "Approval failed",
        error: msg,
        steps: [],
      });
    }
  }

  function handleRequestChanges(reviewId: string) {
    router.push(`/review/${reviewId}`);
  }

  async function handleReject(reviewId: string) {
    try {
      await rejectReview(reviewId, "Rejected from chat");
      setStatusOverride({
        phase: "Feilet",
        title: "Review rejected",
        error: "Rejected from chat",
        steps: [
          { label: "Code written", status: "done" },
          { label: "Validated", status: "done" },
          { label: "Review rejected", status: "error" },
        ],
      });
    } catch {}
  }

  function handleCancelTask(taskId: string) {
    cancelTask(taskId).catch(() => {});
    setStatusDismissed(true);
    setStatusOverride(null);
    setPollMode("idle");
  }

  // Reset flags on new messages
  useEffect(() => {
    setCancelled(false);
    setStatusDismissed(false);
    setStatusOverride(null);
  }, [messages.length]);

  // Waiting state
  const waitingForReply = useMemo(() => {
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    if (last.role === "user") return true;
    if (last.role === "assistant" && (!last.content || !last.content.trim())) return true;
    if (last.messageType === "agent_status" || last.messageType === "agent_progress") {
      const parsed = parseAgentProgress(last.content) || parseAgentStatus(last.content);
      if (parsed && ["Ferdig", "Feilet", "Stopped", "completed", "failed", "done"].includes(parsed.phase)) return false;
      return true;
    }
    return false;
  }, [messages]);

  const showThinking = (sending || waitingForReply) && !cancelled && !statusDismissed && !agentActive;

  function getMeta(msg: Message) {
    if (!msg.metadata) return null;
    try {
      return typeof msg.metadata === "string" ? JSON.parse(msg.metadata) : msg.metadata;
    } catch {
      return null;
    }
  }

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      {showConvList && (
        <div
          className="w-[260px] flex-shrink-0 flex flex-col border-r overflow-hidden hidden sm:flex"
          style={{ borderColor: "var(--tf-border-faint)", background: "var(--tf-bg-base)" }}
        >
          <div
            className="flex items-center justify-between px-4 h-12 border-b flex-shrink-0"
            style={{ borderColor: "var(--tf-border-faint)" }}
          >
            <span className="text-xs font-medium" style={{ color: "var(--tf-text-muted)" }}>
              Conversations
            </span>
            <button
              onClick={handleNewConversation}
              className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--tf-surface-raised)]"
              style={{ color: "var(--tf-text-faint)" }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: "var(--tf-border-faint)" }}>
            {(["all", "repo", "inkognito"] as ConvFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setConvFilter(f)}
                className="text-[10px] px-2 py-1 rounded-md transition-colors capitalize"
                style={{
                  background: convFilter === f ? "rgba(255, 107, 44, 0.08)" : "transparent",
                  color: convFilter === f ? "var(--tf-heat)" : "var(--tf-text-faint)",
                }}
              >
                {f === "inkognito" ? (
                  <Ghost className="w-3 h-3 inline mr-0.5" />
                ) : null}
                {f}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <span className="text-xs" style={{ color: "var(--tf-text-faint)" }}>
                  No conversations yet
                </span>
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveConvId(c.id);
                    setTransferred(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setActiveConvId(c.id);
                      setTransferred(null);
                    }
                  }}
                  className="w-full text-left px-4 py-3 transition-colors border-b group cursor-pointer"
                  style={{
                    borderColor: "var(--tf-border-faint)",
                    background: c.id === activeConvId ? "var(--tf-surface)" : "transparent",
                  }}
                >
                  <span
                    className="text-sm block truncate"
                    style={{
                      color: c.id === activeConvId ? "var(--tf-text-primary)" : "var(--tf-text-secondary)",
                    }}
                  >
                    {c.title || "New conversation"}
                  </span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                      {formatDate(c.lastActivity)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--tf-text-faint)" }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className={`flex-1 flex flex-col min-w-0 relative ${inkognito ? "inkognito-active" : ""}`}>
        {/* Chat header */}
        <div
          className="flex items-center justify-between h-12 px-4 border-b flex-shrink-0"
          style={{ borderColor: "var(--tf-border-faint)" }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConvList(!showConvList)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hidden sm:flex"
              style={{ color: "var(--tf-text-faint)" }}
            >
              {showConvList ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
            <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
              Chat
            </span>
            {inkognito && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-medium flex items-center gap-1"
                style={{ background: "rgba(144, 97, 255, 0.08)", color: "#9061FF" }}
              >
                <Ghost className="w-3 h-3" />
                Inkognito
              </span>
            )}
            {chatRepo && !inkognito && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                style={{ background: "rgba(255, 107, 44, 0.08)", color: "var(--tf-heat)" }}
              >
                {chatRepo}
              </span>
            )}
            {agentActive && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                style={{ background: "rgba(255, 107, 44, 0.08)", color: "var(--tf-heat)" }}
              >
                Agent active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && !inkognito && (
              <button
                onClick={() => setShowRepoSelector(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors hover:bg-[var(--tf-surface-raised)]"
                style={{ color: "var(--tf-text-faint)" }}
              >
                <ArrowRightLeft className="w-3 h-3" />
                <span className="hidden sm:inline">Transfer</span>
              </button>
            )}
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors hover:bg-[var(--tf-surface-raised)]"
              style={{ color: "var(--tf-text-faint)" }}
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">New chat</span>
            </button>
          </div>
        </div>

        {/* Transferred notice */}
        {transferred && (
          <div
            className="text-xs px-4 py-2 border-b"
            style={{
              background: "rgba(66, 195, 102, 0.04)",
              borderColor: "var(--tf-border-faint)",
              color: "var(--tf-text-muted)",
            }}
          >
            Transferred to <strong style={{ color: "var(--tf-success)" }}>{transferred}</strong>
          </div>
        )}

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={checkNearBottom}
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full relative overflow-hidden">
              {/* Background particles */}
              <ParticleField count={15} className="opacity-30" />
              <EmberGlow />

              <div className="text-center w-full max-w-2xl px-4 relative z-10 page-enter">
                {/* Animated logo icon */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-6 flame-animate" style={{ background: "rgba(255, 107, 44, 0.1)" }}>
                  <Sparkles className="w-6 h-6" style={{ color: "var(--tf-heat)" }} />
                </div>

                {/* Big centered heading like Firecrawl's agent page */}
                <h1
                  className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight"
                  style={{ color: "var(--tf-text-primary)" }}
                >
                  What do you want to build?
                </h1>
                <p className="text-sm mb-8" style={{ color: "var(--tf-text-muted)" }}>
                  Describe a task or ask a question about your codebase
                </p>

                {/* Suggestion cards — matches Firecrawl's 3-card grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger-children">
                  {[
                    { text: "Analyze the codebase and suggest improvements", icon: "🔍" },
                    { text: "Build a new feature with tests and documentation", icon: "🔨" },
                    { text: "Find and fix bugs in the latest changes", icon: "🐛" },
                  ].map((q) => (
                    <button
                      key={q.text}
                      onClick={() => setInput(q.text)}
                      className="feature-card text-left text-sm p-4 rounded-lg transition-all active:scale-[0.98] group relative overflow-hidden"
                      style={{
                        border: "1px solid var(--tf-border-faint)",
                        color: "var(--tf-text-secondary)",
                        background: "var(--tf-surface)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255, 107, 44, 0.2)";
                        e.currentTarget.style.background = "var(--tf-surface-raised)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--tf-border-faint)";
                        e.currentTarget.style.background = "var(--tf-surface)";
                      }}
                    >
                      {/* Subtle glow overlay */}
                      <div
                        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255, 107, 44, 0.04) 0%, transparent 70%)" }}
                      />
                      <span className="relative z-10">{q.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages
                .filter((m) => {
                  // SKIP agent_thought — NEVER show
                  if (m.messageType === "agent_thought") return false;
                  // SKIP agent_report — replaced by agent_progress
                  if (m.messageType === "agent_report") return false;
                  // Filter out active agent statuses (rendered inline below)
                  if (m.messageType === "agent_status") {
                    const parsed = parseAgentStatus(m.content);
                    const terminal = ["Ferdig", "Feilet", "Stopped", "completed", "failed", "done"];
                    return parsed && terminal.includes(parsed.phase);
                  }
                  // Filter active agent_progress (rendered inline below)
                  if (m.messageType === "agent_progress") {
                    const parsed = parseAgentProgress(m.content);
                    const terminal = ["Ferdig", "Feilet", "Stopped", "completed", "failed", "done"];
                    return parsed && terminal.includes(parsed.phase);
                  }
                  // Skip empty assistant messages
                  if (m.role === "assistant" && (!m.content || !m.content.trim())) return false;
                  return true;
                })
                .map((msg) => {
                  // Terminal agent status — render as AgentProgressCard
                  if (msg.messageType === "agent_status" || msg.messageType === "agent_progress") {
                    const parsed = msg.messageType === "agent_progress"
                      ? parseAgentProgress(msg.content)
                      : parseAgentStatus(msg.content);
                    if (!parsed) return null;
                    return (
                      <AgentProgressCard key={msg.id} data={parsed} />
                    );
                  }

                  // Context transfer
                  if (msg.messageType === "context_transfer") {
                    return (
                      <ChatBubble
                        key={msg.id}
                        role="assistant"
                        content={msg.content}
                        isContextTransfer
                      />
                    );
                  }

                  // Regular message
                  const meta = getMeta(msg);
                  return (
                    <ChatBubble
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      timestamp={msg.createdAt}
                      model={meta?.model}
                      tokens={meta?.tokens?.totalTokens}
                      cost={meta?.cost}
                    />
                  );
                })}

              {/* Active agent status — inline in message stream */}
              {lastAgentStatus && agentActive && (
                <AgentProgressCard
                  data={lastAgentStatus}
                  onApprove={handleApprove}
                  onRequestChanges={handleRequestChanges}
                  onReject={handleReject}
                  onCancel={handleCancelTask}
                />
              )}

              {/* Waiting/review status */}
              {lastAgentStatus && lastAgentStatus.phase === "Venter" && (
                <AgentProgressCard
                  data={lastAgentStatus}
                  onApprove={handleApprove}
                  onRequestChanges={handleRequestChanges}
                  onReject={handleReject}
                  onCancel={handleCancelTask}
                />
              )}

              {/* Thinking indicator */}
              {showThinking && <ThinkingIndicator />}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        {!isReadOnly && (
          <div className="flex-shrink-0 px-4 pb-4 pt-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".md,.txt,.json,.ts,.tsx,.js,.jsx,.py,.yaml,.yml,.csv,.html,.css,.sql,.sh,.toml"
              onChange={handleFileUpload}
            />
            <div className="max-w-3xl mx-auto">
              {/* Chat controls */}
              <ChatControls
                repos={repos}
                selectedRepo={chatRepo}
                onRepoChange={(repo) => setChatRepo(repo)}
                inkognito={inkognito}
                onInkognitoToggle={() => setInkognito(!inkognito)}
                agentMode={agentMode}
                onAgentModeToggle={() => setAgentMode(!agentMode)}
                subAgents={subAgents}
                onSubAgentsToggle={() => setSubAgents(!subAgents)}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />

              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                onFileUpload={() => fileInputRef.current?.click()}
                disabled={sending}
                isStreaming={pollMode === "waiting" && !cancelled}
                onStop={handleCancel}
              />
              <div className="flex items-center justify-center mt-2">
                <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                  TheFold can make mistakes. Review important output carefully.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Repo Selector Modal */}
      {showRepoSelector && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
          onClick={() => setShowRepoSelector(false)}
        >
          <div
            className="rounded-xl p-6 max-w-sm w-[90%]"
            style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border-muted)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4" style={{ color: "var(--tf-text-secondary)" }} />
              <h3 className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                Transfer to repository
              </h3>
            </div>

            <div className="space-y-2">
              {repos.map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => handleTransferToRepo(repo.name)}
                  disabled={transferring}
                  className="w-full text-left p-3 rounded-lg transition-colors hover:bg-[var(--tf-surface-raised)]"
                  style={{
                    border: "1px solid var(--tf-border-faint)",
                    background: "transparent",
                    color: "var(--tf-text-primary)",
                    opacity: transferring ? 0.6 : 1,
                  }}
                >
                  <div className="text-sm">{repo.fullName}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--tf-text-faint)" }}>
                    {repo.status === "healthy" ? "Connected" : repo.status}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowRepoSelector(false)}
              className="w-full mt-4 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--tf-surface-raised)]"
              style={{
                border: "1px solid var(--tf-border-faint)",
                color: "var(--tf-text-secondary)",
                background: "transparent",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

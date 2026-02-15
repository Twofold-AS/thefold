"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  sendMessage,
  getChatHistory,
  getMainConversations,
  mainConversationId,
  transferContext,
  deleteConversation,
  cancelChatGeneration,
  listSkills,
  type Message,
  type ConversationSummary,
  type Skill,
} from "@/lib/api";
import { Send, MessageSquare, PanelLeftClose, PanelLeft } from "lucide-react";
import { ModelSelector } from "@/components/ModelSelector";
import { SkillsSelector, MessageSkillBadges } from "@/components/SkillsSelector";
import { ChatToolsMenu } from "@/components/ChatToolsMenu";
import { InlineSkillForm } from "@/components/InlineSkillForm";
import { AgentStatus, type AgentStep } from "@/components/AgentStatus";
import { usePreferences, useUser } from "@/contexts/UserPreferencesContext";
import { useRepoContext } from "@/lib/repo-context";
import Image from "next/image";

export default function ChatPage() {
  const router = useRouter();
  const { preferences } = usePreferences();
  const { initial, avatarColor } = useUser();
  const { repos } = useRepoContext();
  const modelMode = preferences.modelMode;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [showConvList, setShowConvList] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [transferred, setTransferred] = useState<string | null>(null);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [pollMode, setPollMode] = useState<"idle" | "waiting" | "cooldown">("idle");

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "44px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  // Check if user is near bottom
  const checkNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 100;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Scroll to bottom only if near bottom (with delay for animation)
  const scrollToBottom = useCallback(() => {
    if (isNearBottomRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  // On mount: always start with a fresh conversation
  useEffect(() => {
    const freshId = mainConversationId();
    setActiveConvId(freshId);
    setMessages([]);

    getMainConversations()
      .then((res) => setConversations(res.conversations))
      .catch(() => {});
    listSkills().then((res) => setAllSkills(res.skills)).catch(() => {});
  }, []);

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

        // Check if AI is done (last message is assistant and not agent_status)
        const lastMsg = res.messages[res.messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.messageType !== "agent_status") {
          if (pollMode === "waiting") {
            setPollMode("cooldown");
          } else {
            setPollMode("idle");
          }
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const convId = activeConvId || mainConversationId();
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
    setPollMode("waiting"); // Start smart polling

    try {
      await sendMessage(convId, text, {
        chatOnly: true,
        modelOverride: selectedModel,
        skillIds: activeSkillIds.length > 0 ? activeSkillIds : undefined,
      });
      await loadHistory();

      // Refresh conversation list after sending
      try {
        const updated = await getMainConversations();
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

  function handleNewConversation() {
    const id = mainConversationId();
    setActiveConvId(id);
    setMessages([]);
    setTransferred(null);
  }

  function handleSuggestedQuestion(q: string) {
    setInput(q);
    textareaRef.current?.focus();
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

  async function handleTransferToRepo(repoName: string) {
    if (!activeConvId || transferring) return;
    setTransferring(true);
    try {
      const result = await transferContext(activeConvId, repoName);
      setShowRepoSelector(false);
      setTransferred(repoName);
      router.push(`/repo/${repoName}/chat?convId=${result.targetConversationId}`);
    } catch {
      // Silent
    } finally {
      setTransferring(false);
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

  const isReadOnly = !!transferred;

  // Parse agent_status messages for AgentStatus rendering
  function tryParseAgentStatus(msg: Message): { phase: string; subPhase?: string; steps: AgentStep[]; progress?: number } | null {
    if (msg.messageType !== "agent_status") return null;
    try {
      const data = JSON.parse(msg.content);
      if (data.type === "agent_status" && data.steps) return data;
    } catch {
      // Not JSON agent_status
    }
    return null;
  }

  // Check if AI is still thinking (last message is agent_status or we're sending)
  const lastMsg = messages[messages.length - 1];
  const isWaitingForAI = pollMode === "waiting" && (!lastMsg || lastMsg.role === "user" || lastMsg.messageType === "agent_status");

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Chat header — custom, not PageHeaderBar */}
      <div className="flex items-stretch flex-shrink-0" style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}>
        {/* Tittel — LIKE BRED SOM SAMTALE-PANELET */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", width: "280px" }}
        >
          <h1 className="font-display text-xl" style={{ color: "var(--text-primary)" }}>
            Chat
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

        {/* Overfør til repo */}
        <div
          className="flex items-center px-5 cursor-pointer hover:bg-white/5 transition-colors shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
          onClick={() => messages.length > 0 && setShowRepoSelector(true)}
        >
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{"\u2192"} Overfør til repo</span>
        </div>
      </div>

      {/* Transferred notice */}
      {transferred && (
        <div
          className="text-xs px-3 py-2 mb-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          Samtale overfort til <strong style={{ color: "var(--text-primary)" }}>{transferred}</strong>
        </div>
      )}

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
                  onClick={() => { setActiveConvId(c.id); setTransferred(null); }}
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

        {/* Chat-area */}
        <div className="flex flex-col flex-1 overflow-hidden relative">
          {/* Toggle samtale-liste knapp — INNE I chat-area */}
          <button
            onClick={() => setShowConvList(!showConvList)}
            className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 hover:bg-white/5"
            style={{ color: "var(--text-muted)" }}
            title={showConvList ? "Skjul samtaler" : "Vis samtaler"}
          >
            {showConvList ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          </button>
          {/* Scrollable messages */}
          <div
            ref={messagesContainerRef}
            onScroll={checkNearBottom}
            className="flex-1 overflow-y-auto chat-scroll pb-4 px-2"
          >
            {messages.length === 0 ? (
              /* Empty state */
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-sm">
                  <Image src="/logo.svg" alt="TheFold" width={40} height={40} className="mx-auto mb-4 opacity-40" />
                  <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                    Hva kan jeg hjelpe med?
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {["Analyser kodebasen", "Lag en ny feature", "Fiks en bug"].map((q) => (
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
              <div className="space-y-4 max-w-2xl mx-auto pt-4">
                {messages.map((msg) => {
                  const isUser = msg.role === "user";
                  const isAgentReport = msg.messageType === "agent_report";
                  const isContextTransfer = msg.messageType === "context_transfer";

                  // Agent status message — render as AgentStatus panel
                  const agentData = tryParseAgentStatus(msg);
                  if (agentData) {
                    return (
                      <div key={msg.id} className="message-enter">
                        <AgentStatus
                          currentPhase={agentData.phase}
                          subPhase={agentData.subPhase}
                          steps={agentData.steps}
                          progress={agentData.progress}
                          isComplete={agentData.steps.every((s) => s.status === "done")}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 message-enter ${isUser ? "flex-row-reverse" : ""}`}
                    >
                      {/* Avatar */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 mt-0.5"
                        style={{
                          background: isUser ? avatarColor : "var(--bg-card)",
                          color: isUser ? "#fff" : "var(--text-secondary)",
                          border: isUser ? "none" : "1px solid var(--border)",
                        }}
                      >
                        {isUser ? initial : "TF"}
                      </div>

                      {/* Bubble */}
                      <div
                        className={`max-w-[80%] ${isUser ? "text-right" : ""}`}
                        style={{
                          ...(isAgentReport
                            ? { borderLeft: "2px solid #6366f1", paddingLeft: "12px" }
                            : isContextTransfer
                            ? { borderLeft: "2px solid #22c55e", paddingLeft: "12px" }
                            : {}),
                        }}
                      >
                        {/* Badge for special types */}
                        {isAgentReport && (
                          <span
                            className="inline-block text-[10px] px-1.5 py-0.5 mb-1 font-medium"
                            style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}
                          >
                            Agent Report
                          </span>
                        )}
                        {isContextTransfer && (
                          <span
                            className="inline-block text-[10px] px-1.5 py-0.5 mb-1 font-medium"
                            style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                          >
                            Context-overforing
                          </span>
                        )}

                        <div
                          className="text-sm whitespace-pre-wrap leading-relaxed rounded-xl px-3.5 py-2.5 inline-block"
                          style={{
                            background: isUser ? "transparent" : "var(--bg-chat)",
                            color: isUser ? "#fff" : "var(--text-chat)",
                            textAlign: "left",
                          }}
                        >
                          {msg.content}
                        </div>

                        {/* Timestamp + Skills */}
                        <div
                          className="text-[10px] mt-1 px-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {formatTime(msg.createdAt)}
                        </div>
                        {msg.metadata && (() => {
                          try {
                            const meta = JSON.parse(msg.metadata);
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

                {/* "TheFold tenker..." indicator while waiting for AI */}
                {isWaitingForAI && (
                  <div className="flex items-start gap-3 py-3 message-enter">
                    <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ border: "1px solid var(--border)" }}>
                      <span className="font-brand text-xs brand-shimmer">TF</span>
                    </div>
                    <div className="flex flex-col gap-1 py-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="agent-pulse"
                          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", display: "inline-block" }}
                        />
                        <span className="text-sm agent-shimmer" style={{ color: "var(--text-muted)" }}>TheFold tenker</span>
                        <span className="agent-dots">
                          <span className="dot">.</span>
                          <span className="dot">.</span>
                          <span className="dot">.</span>
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          if (activeConvId) {
                            await cancelChatGeneration(activeConvId);
                            setPollMode("idle");
                          }
                        }}
                        className="text-xs mt-1 transition-colors"
                        style={{
                          color: "var(--text-muted)",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          padding: "4px 12px",
                          cursor: "pointer",
                          width: "fit-content",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--text-secondary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                      >
                        Stopp generering
                      </button>
                    </div>
                  </div>
                )}

                {/* Typing dots while sending (brief, before polling picks up) */}
                {sending && !isWaitingForAI && (
                  <div className="flex gap-2.5 message-enter">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                      style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                    >
                      TF
                    </div>
                    <div className="flex items-center gap-1 px-3 py-2">
                      <span className="typing-dot" style={{ animationDelay: "0ms" }} />
                      <span className="typing-dot" style={{ animationDelay: "150ms" }} />
                      <span className="typing-dot" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          {!isReadOnly && (
            <div className="flex-shrink-0 px-2 pb-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              {/* Inline forms */}
              <div className="max-w-2xl mx-auto">
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

              <form onSubmit={handleSend} className="flex gap-2 items-end max-w-2xl mx-auto">
                <ChatToolsMenu
                  onCreateSkill={() => setShowSkillForm(true)}
                  onCreateTask={() => setShowTaskForm(true)}
                  onTransfer={messages.length > 0 ? () => setShowRepoSelector(true) : undefined}
                />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Skriv en melding..."
                  className="input-field flex-1 resize-none"
                  style={{ minHeight: "44px", maxHeight: "200px", paddingLeft: "16px", paddingRight: "16px" }}
                  rows={1}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="flex items-center justify-center transition-colors"
                  style={{
                    width: "44px",
                    height: "44px",
                    background: "transparent",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Repo Selector Modal */}
      {showRepoSelector && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowRepoSelector(false)}
        >
          <div
            style={{
              background: "var(--bg-primary, var(--bg-page))",
              border: "1px solid var(--border)",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={18} style={{ color: "var(--text-secondary)" }} />
              <h3 className="font-display text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Overfor til repo
              </h3>
            </div>

            <div className="space-y-2">
              {repos.map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => handleTransferToRepo(repo.name)}
                  disabled={transferring}
                  className="w-full text-left p-3 transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    opacity: transferring ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="text-sm font-medium">{repo.fullName}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {repo.status === "healthy" ? "Tilkoblet" : repo.status}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowRepoSelector(false)}
              className="btn-secondary w-full mt-4"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

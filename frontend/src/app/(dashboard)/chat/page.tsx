"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  sendMessage,
  getChatHistory,
  getMainConversations,
  mainConversationId,
  transferContext,
  type Message,
  type ConversationSummary,
} from "@/lib/api";
import { ArrowRight, Send, MessageSquare, PanelLeftClose, PanelLeft } from "lucide-react";
import { ModelSelector } from "@/components/ModelSelector";
import { SkillsSelector } from "@/components/SkillsSelector";
import { ChatToolsMenu } from "@/components/ChatToolsMenu";
import { InlineSkillForm } from "@/components/InlineSkillForm";
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

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Scroll to bottom only if near bottom
  const scrollToBottom = useCallback(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    getMainConversations()
      .then((res) => {
        setConversations(res.conversations);
        if (res.conversations.length > 0) setActiveConvId(res.conversations[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeConvId) return;
    loadHistory();

    pollRef.current = setInterval(loadHistory, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId]);

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

    setInput("");
    setSending(true);

    try {
      await sendMessage(convId, text, {
        chatOnly: true,
        modelOverride: selectedModel,
        skillIds: activeSkillIds.length > 0 ? activeSkillIds : undefined,
      });
      await loadHistory();

      // Always refresh conversation list after sending
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

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between pb-3 mb-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Chat
          </h1>
          <ModelSelector value={selectedModel} onChange={setSelectedModel} mode={modelMode} />
          <SkillsSelector selectedIds={activeSkillIds} onChange={setActiveSkillIds} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleNewConversation} className="btn-outline text-xs px-3 py-1.5">
            Ny samtale
          </button>
          {messages.length > 0 && !isReadOnly && (
            <button
              onClick={() => setShowRepoSelector(!showRepoSelector)}
              className="btn-outline text-xs px-3 py-1.5"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <ArrowRight size={14} />
              Overfør til repo
            </button>
          )}
        </div>
      </div>

      {/* Transferred notice */}
      {transferred && (
        <div
          className="text-xs px-3 py-2 mb-3 rounded-lg"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          Samtale overført til <strong style={{ color: "var(--text-primary)" }}>{transferred}</strong>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Conversation list toggle */}
        <button
          onClick={() => setShowConvList(!showConvList)}
          className="hidden lg:flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            width: "24px",
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          title={showConvList ? "Skjul samtaler" : "Vis samtaler"}
        >
          {showConvList ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
        </button>

        {/* Conversation list */}
        {showConvList && (
          <div
            className="hidden lg:flex flex-col flex-shrink-0 overflow-hidden"
            style={{ width: "220px", borderRight: "1px solid var(--border)" }}
          >
            <div className="section-label mb-1 px-2 pt-1">Samtaler</div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-xs px-2" style={{ color: "var(--text-muted)" }}>
                  Ingen samtaler ennå
                </p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setActiveConvId(c.id); setTransferred(null); }}
                    className="w-full text-left px-2 py-1.5 transition-colors duration-100"
                    style={{
                      color: c.id === activeConvId ? "var(--text-primary)" : "var(--text-secondary)",
                      background: c.id === activeConvId ? "var(--bg-hover)" : "transparent",
                    }}
                    onMouseEnter={(e) => { if (c.id !== activeConvId) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (c.id !== activeConvId) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{c.title}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                        {formatDate(c.lastActivity)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 flex flex-col min-h-0">
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
                        className="text-xs px-3 py-1.5 rounded-full transition-colors"
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

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}
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
                            className="inline-block text-[10px] px-1.5 py-0.5 rounded mb-1 font-medium"
                            style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}
                          >
                            Agent Report
                          </span>
                        )}
                        {isContextTransfer && (
                          <span
                            className="inline-block text-[10px] px-1.5 py-0.5 rounded mb-1 font-medium"
                            style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                          >
                            Context-overføring
                          </span>
                        )}

                        <div
                          className="text-sm whitespace-pre-wrap leading-relaxed rounded-xl px-3.5 py-2.5 inline-block"
                          style={{
                            background: isUser ? "var(--bg-card)" : "transparent",
                            color: "var(--text-primary)",
                            border: isUser ? "1px solid var(--border)" : "none",
                            textAlign: "left",
                          }}
                        >
                          {msg.content}
                        </div>

                        {/* Timestamp */}
                        <div
                          className="text-[10px] mt-1 px-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {sending && (
                  <div className="flex gap-2.5">
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
                      borderRadius: "8px",
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
                  style={{ minHeight: "44px", maxHeight: "200px", borderRadius: "22px", paddingLeft: "16px", paddingRight: "16px" }}
                  rows={1}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="flex items-center justify-center rounded-full transition-colors"
                  style={{
                    width: "44px",
                    height: "44px",
                    background: input.trim() ? "#fafafa" : "var(--bg-card)",
                    color: input.trim() ? "#000" : "var(--text-muted)",
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
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={18} style={{ color: "var(--text-secondary)" }} />
              <h3 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Overfør til repo
              </h3>
            </div>

            <div className="space-y-2">
              {repos.map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => handleTransferToRepo(repo.name)}
                  disabled={transferring}
                  className="w-full text-left p-3 rounded-lg transition-colors"
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

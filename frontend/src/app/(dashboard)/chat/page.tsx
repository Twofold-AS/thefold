"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  sendMessage,
  getChatHistory,
  getMainConversations,
  mainConversationId,
  type Message,
  type ConversationSummary,
} from "@/lib/api";

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "44px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    setInput("");
    setSending(true);

    try {
      await sendMessage(convId, text, { chatOnly: true });
      await loadHistory();
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
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* Minimal header */}
      <div className="flex items-center justify-between pb-3 mb-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Chat
        </h1>
        <button onClick={handleNewConversation} className="btn-outline text-xs px-3 py-1.5">
          New
        </button>
      </div>

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Conversation list */}
        <div className="hidden lg:block w-48 overflow-y-auto pr-2 flex-shrink-0" style={{ borderRight: "1px solid var(--border)" }}>
          <div className="section-label mb-2 px-1">Conversations</div>
          {conversations.length === 0 ? (
            <p className="text-xs px-1" style={{ color: "var(--text-muted)" }}>No conversations yet</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveConvId(c.id)}
                className="w-full text-left px-2 py-2 text-sm mb-0.5 transition-colors duration-100 rounded-lg"
                style={{
                  color: c.id === activeConvId ? "var(--text-primary)" : "var(--text-secondary)",
                  background: c.id === activeConvId ? "var(--bg-hover)" : "transparent",
                }}
              >
                <div className="truncate">{c.title}</div>
              </button>
            ))
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Scrollable messages with visible scrollbar */}
          <div className="flex-1 overflow-y-auto chat-scroll pb-4 pr-2">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Start a conversation with TheFold
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-2xl">
                {messages.map((msg) => (
                  <div key={msg.id} className="group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        {msg.role === "user" ? "You" : "TheFold"}
                      </span>
                      {msg.messageType === "agent_report" && <span className="badge-active text-[10px]">Agent Report</span>}
                      <span className="text-xs ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      {msg.content}
                    </p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input pinned to bottom — auto-resizing textarea */}
          <form onSubmit={handleSend} className="flex gap-2 pt-3 items-end flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              className="input-field flex-1 resize-none"
              style={{ minHeight: "44px", maxHeight: "200px" }}
              rows={1}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()} className="btn-primary" style={{ height: "44px" }}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

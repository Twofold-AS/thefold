"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  sendMessage,
  getChatHistory,
  getRepoConversations,
  repoConversationId,
  type Message,
  type ConversationSummary,
} from "@/lib/api";
import { Monitor } from "lucide-react";
import { ModelSelector } from "@/components/ModelSelector";
import { LivePreview } from "@/components/LivePreview";
import { usePreferences } from "@/contexts/UserPreferencesContext";

export default function RepoChatPage() {
  const params = useParams<{ name: string }>();
  const { preferences } = usePreferences();
  const modelMode = preferences.modelMode;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "44px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    getRepoConversations(params.name)
      .then((res) => {
        setConversations(res.conversations);
        if (res.conversations.length > 0) setActiveConvId(res.conversations[0].id);
      })
      .catch(() => {});
  }, [params.name]);

  useEffect(() => {
    if (!activeConvId) return;
    getChatHistory(activeConvId)
      .then((res) => setMessages(res.messages))
      .catch(() => {});
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  function handleNewConversation() {
    const id = repoConversationId(params.name);
    setActiveConvId(id);
    setMessages([]);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const convId = activeConvId || repoConversationId(params.name);
    if (!activeConvId) setActiveConvId(convId);

    setSending(true);
    try {
      const res = await sendMessage(convId, input.trim(), {
        modelOverride: selectedModel,
      });
      setMessages((prev) => [...prev, res.message]);
      setInput("");
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

  return (
    <div className="flex">
      {/* Chat area - shrinks when preview open */}
      <div
        className="flex flex-col"
        style={{
          height: "calc(100vh - 64px)",
          width: showPreview ? "50%" : "100%",
          transition: "width 0.2s",
        }}
      >
        {/* Header — always full width of chat area */}
        <div
          className="flex items-center justify-between pb-3 mb-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h1 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Chat — {params.name}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="btn-outline text-xs px-3 py-1.5"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Monitor size={16} />
              {showPreview ? "Skjul Preview" : "Vis Preview"}
            </button>
            <button onClick={handleNewConversation} className="btn-outline text-xs px-3 py-1.5">
              Ny samtale
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Scrollable messages */}
          <div className="flex-1 overflow-y-auto chat-scroll pb-4 pr-2">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Start en samtale om {params.name}
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-2xl">
                {messages.map((msg) => (
                  <div key={msg.id} className="group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        {msg.role === "user" ? "Du" : "TheFold"}
                      </span>
                      {msg.messageType === "agent_report" && (
                        <span className="badge-active text-[10px]">Agent-rapport</span>
                      )}
                      {msg.messageType === "context_transfer" && (
                        <span className="badge-active text-[10px]">Context-overf&oslash;ring</span>
                      )}
                    </div>
                    <p
                      className="text-sm whitespace-pre-wrap leading-relaxed"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {msg.content}
                    </p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Model selector + Input */}
          <div className="flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="pt-2 pb-1">
              <ModelSelector value={selectedModel} onChange={setSelectedModel} mode={modelMode} />
            </div>
            <form onSubmit={handleSend} className="flex gap-2 pb-1 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Melding om ${params.name}...`}
                className="input-field flex-1 resize-none"
                style={{ minHeight: "44px", maxHeight: "200px" }}
                rows={1}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="btn-primary"
                style={{ height: "44px" }}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Live Preview Panel — OUTSIDE chat div */}
      <LivePreview isActive={showPreview} onClose={() => setShowPreview(false)} />
    </div>
  );
}

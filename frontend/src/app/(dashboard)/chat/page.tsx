"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { T } from "@/lib/tokens";
import PixelCorners from "@/components/PixelCorners";
import ChatComposer from "@/components/ChatComposer";
import ChatInput from "@/components/ChatInput";
import AgentStream from "@/components/AgentStream";
import RobotIcon from "@/components/icons/RobotIcon";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import { useApiData } from "@/lib/hooks";
import {
  getConversations,
  getChatHistory,
  sendMessage,
  inkognitoConversationId,
  repoConversationId,
  type ConversationSummary,
  type Message,
} from "@/lib/api";

function timeAgo(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "na";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mnd`;
}

function GhostIcon({ color }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1C5 1 3.5 2.5 3 4c-.7 0-1.5.3-1.5 1.5C1.5 7 3 8 3 8s-.5 2 1 3.5c1 1 2 1.5 3 1.5s2-.5 3-1.5c1.5-1.5 1-3.5 1-3.5s1.5-1 1.5-2.5C12.5 4.3 11.7 4 11 4c-.5-1.5-2-3-4-3z"
        stroke={color || T.textFaint}
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  );
}

function extractRepoFromId(id: string): string | null {
  if (!id.startsWith("repo-")) return null;
  // Format: "repo-{repoName}-{uuid}"
  const rest = id.substring(5);
  const lastDash = rest.lastIndexOf("-");
  if (lastDash === -1) return rest;
  // UUID has 4 dashes, so find the first segment before UUID
  // repo-thefold-api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const parts = rest.split("-");
  // UUID is last 5 parts (8-4-4-4-12)
  if (parts.length >= 6) {
    return parts.slice(0, parts.length - 5).join("-");
  }
  return rest;
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const autoMsg = searchParams.get("msg");

  const [ac, setAc] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(false);
  const [tab, setTab] = useState<"Repo" | "Privat">("Repo");
  const [sending, setSending] = useState(false);
  const autoMsgSent = useRef(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const { data: convData, loading: convsLoading, refresh: refreshConvs } = useApiData(
    () => getConversations(),
    [],
  );
  const conversations: ConversationSummary[] = convData?.conversations ?? [];

  const { data: msgData, loading: msgsLoading, refresh: refreshMsgs } = useApiData(
    () => (ac ? getChatHistory(ac, 50) : Promise.resolve({ messages: [], hasMore: false })),
    [ac],
  );
  const msgs: Message[] = msgData?.messages ?? [];

  // Filter conversations by tab
  const filtered = conversations.filter((c) =>
    tab === "Privat" ? c.id.startsWith("inkognito-") : c.id.startsWith("repo-"),
  );

  // Select first conversation when loaded and none selected
  useEffect(() => {
    if (!ac && !newChat && filtered.length > 0 && !convsLoading) {
      setAc(filtered[0].id);
    }
  }, [ac, newChat, filtered, convsLoading]);

  // Auto-send msg from search params
  useEffect(() => {
    if (autoMsg && !autoMsgSent.current) {
      autoMsgSent.current = true;
      const convId = repoConversationId("thefold-api");
      setAc(convId);
      setNewChat(false);
      (async () => {
        setSending(true);
        try {
          await sendMessage(convId, autoMsg);
          refreshConvs();
          refreshMsgs();
        } catch {
          // silent
        } finally {
          setSending(false);
        }
      })();
    }
  }, [autoMsg, refreshConvs, refreshMsgs]);

  // Scroll to bottom on new messages
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const cur = ac ? conversations.find((c) => c.id === ac) : null;
  const isGhost = ac ? ac.startsWith("inkognito-") : false;
  const curRepo = ac ? extractRepoFromId(ac) : null;

  const startNewChat = (msg: string, repo: string | null, ghost: boolean) => {
    const convId = ghost
      ? inkognitoConversationId()
      : repo
        ? repoConversationId(repo)
        : repoConversationId("thefold-api");
    setAc(convId);
    setNewChat(false);
    setSending(true);
    sendMessage(convId, msg, { repoName: repo || undefined })
      .then(() => {
        refreshConvs();
        refreshMsgs();
      })
      .catch(() => {})
      .finally(() => setSending(false));
  };

  const handleSend = (value: string, repo?: string | null) => {
    if (!ac || !value) return;
    setSending(true);
    sendMessage(ac, value, { repoName: repo || curRepo || undefined })
      .then(() => {
        refreshMsgs();
        refreshConvs();
      })
      .catch(() => {})
      .finally(() => setSending(false));
  };

  const isAgentMessage = (m: Message) =>
    m.messageType === "agent_status" ||
    m.messageType === "agent_thought" ||
    m.messageType === "agent_progress" ||
    m.messageType === "agent_report";

  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        minHeight: "calc(100vh - 130px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <PixelCorners />

      {/* Sidebar */}
      <div
        style={{
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <Btn
            primary
            sm
            style={{ width: "100%" }}
            onClick={() => {
              setNewChat(true);
              setAc(null);
            }}
          >
            + Ny samtale
          </Btn>
        </div>
        <div
          style={{
            padding: "8px",
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          {(["Repo", "Privat"] as const).map((f) => (
            <div
              key={f}
              onClick={() => {
                setTab(f);
                setAc(null);
              }}
              style={{
                fontSize: 11,
                fontFamily: T.mono,
                padding: "4px 8px",
                background: tab === f ? T.subtle : "transparent",
                color: tab === f ? T.text : T.textMuted,
                cursor: "pointer",
                border: `1px solid ${tab === f ? T.border : "transparent"}`,
                borderRadius: 6,
              }}
            >
              {f}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {convsLoading ? (
            <div style={{ padding: "20px 16px", textAlign: "center" }}>
              <span style={{ fontSize: 12, color: T.textMuted }}>Laster...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center" }}>
              <span style={{ fontSize: 12, color: T.textFaint }}>Ingen samtaler enna</span>
            </div>
          ) : (
            filtered.map((c) => {
              const isPrivate = c.id.startsWith("inkognito-");
              const repo = extractRepoFromId(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setAc(c.id);
                    setNewChat(false);
                  }}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: ac === c.id && !newChat ? T.subtle : "transparent",
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    {isPrivate && <GhostIcon />}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: c.activeTask ? 600 : 400,
                        color: c.activeTask ? T.text : T.textSec,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.title || "Ny samtale"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {repo && (
                      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                        {repo}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>
                      {timeAgo(c.lastActivity)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main content */}
      {newChat ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <ChatComposer onSubmit={startNewChat} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                {cur ? cur.title || "Ny samtale" : "\u2014"}
              </div>
              {curRepo && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: T.mono,
                    color: T.textFaint,
                    marginTop: 2,
                  }}
                >
                  {curRepo}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Tag variant="brand">sonnet-4-6</Tag>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {msgsLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Laster meldinger...</span>
              </div>
            ) : msgs.length === 0 && ac ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <span style={{ fontSize: 13, color: T.textFaint }}>
                  Ingen meldinger enna. Skriv noe nedenfor.
                </span>
              </div>
            ) : (
              msgs.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  {m.role === "assistant" && (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: T.r,
                        flexShrink: 0,
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <RobotIcon size={16} />
                    </div>
                  )}
                  <div style={{ maxWidth: 540 }}>
                    {isAgentMessage(m) ? (
                      <AgentStream />
                    ) : m.role === "user" ? (
                      <div
                        style={{
                          background: T.subtle,
                          border: `1px solid ${T.border}`,
                          borderRadius: T.r,
                          padding: "10px 16px",
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: T.text,
                          fontFamily: T.sans,
                        }}
                      >
                        {m.content}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.65,
                          color: T.text,
                          fontFamily: T.sans,
                          paddingTop: 4,
                        }}
                      >
                        {m.content}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: T.r,
                    flexShrink: 0,
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <RobotIcon size={16} />
                </div>
                <div style={{ paddingTop: 6 }}>
                  <span style={{ fontSize: 13, color: T.textMuted }}>Tenker...</span>
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}` }}>
            <ChatInput
              compact
              repo={curRepo || undefined}
              ghost={isGhost}
              onSubmit={handleSend}
            />
          </div>
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

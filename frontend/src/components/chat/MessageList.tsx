"use client";

import { useRef, useEffect } from "react";
import { T } from "@/lib/tokens";
import RobotIcon from "@/components/icons/RobotIcon";
import AgentStream from "@/components/AgentStream";
import AgentStatusBar from "@/components/chat/AgentStatusBar";
import TypingIndicator from "@/components/chat/TypingIndicator";
import MemoryInsight from "@/components/chat/MemoryInsight";
import type { Message } from "@/lib/api";

export function isAgentMessage(m: Message): boolean {
  if (m.messageType === "memory_insight") return false;
  return (
    m.messageType === "agent_status" ||
    m.messageType === "agent_thought" ||
    m.messageType === "agent_progress" ||
    m.messageType === "agent_report" ||
    (m.role === "assistant" && m.content.startsWith("{") && m.content.includes('"type":'))
  );
}

function BotAvatar() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
      background: T.surface, border: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <RobotIcon size={16} />
    </div>
  );
}

function MessageMeta({ time, metadata }: { time: string; metadata: Message["metadata"] }) {
  const extra = (() => {
    if (!metadata) return null;
    try {
      const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
      if (!meta) return null;
      const parts: string[] = [];
      if (meta.model) parts.push(meta.model);
      if (meta.cost != null) parts.push(`$${Number(meta.cost).toFixed(4)}`);
      if (meta.tokens?.totalTokens != null) parts.push(`${Number(meta.tokens.totalTokens).toLocaleString()} tokens`);
      return parts.length > 0 ? parts.join(" \u00b7 ") : null;
    } catch { return null; }
  })();

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
      <span style={{ fontSize: 10, color: T.textFaint }}>{time}</span>
      {extra && (
        <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>{extra}</span>
      )}
    </div>
  );
}

interface MessageListProps {
  msgs: Message[];
  loading: boolean;
  ac: string | null;
  sending: boolean;
  activeTaskId?: string | null;
  thinkSeconds: number;
  streamStatusText?: string | null;
  chatError: string | null;
  onClearError: () => void;
  onCancel: () => void;
  onApprove: (reviewId: string) => Promise<void>;
  onReject: (reviewId: string) => Promise<void>;
  onRequestChanges: (reviewId: string, feedback?: string) => void;
}

export default function MessageList({
  msgs,
  loading,
  ac,
  sending,
  activeTaskId,
  thinkSeconds,
  streamStatusText,
  chatError,
  onClearError,
  onCancel,
  onApprove,
  onReject,
  onRequestChanges,
}: MessageListProps) {
  const msgEndRef = useRef<HTMLDivElement>(null);

  const msgsHash = msgs.map(m => `${m.id}:${(m.content || "").substring(0, 40)}`).join(",");
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgsHash]);

  // Filter out empty assistant placeholders — these appear when the AI hands off to the
  // agent via start_task but the backend placeholder wasn't deleted yet (or at all).
  // Also filter out memory_insight if no actual content exists.
  const visibleMsgs = msgs.filter(m => {
    if (m.messageType === "memory_insight") return !!m.content?.trim();
    return !(m.role === "assistant" && !m.content?.trim());
  });

  // Deduplicate: keep only the last agent message (memory_insight always shown)
  let lastAgentIdx = -1;
  for (let i = visibleMsgs.length - 1; i >= 0; i--) {
    if (isAgentMessage(visibleMsgs[i])) { lastAgentIdx = i; break; }
  }
  const dedupedMsgs = visibleMsgs.filter((m, i) => {
    if (m.messageType === "memory_insight") return true;
    if (!isAgentMessage(m)) return true;
    return i === lastAgentIdx;
  });

  // Find the chat message to merge last agent under
  const lastAgentMsg = dedupedMsgs.find(m => isAgentMessage(m));
  const mergedChatId = lastAgentMsg
    ? (() => {
        let found: string | null = null;
        for (const m of dedupedMsgs) {
          if (m.role === "assistant" && !isAgentMessage(m) && m.content?.trim()) {
            found = m.id;
          }
          if (m === lastAgentMsg) break;
        }
        return found;
      })()
    : null;

  // Compute agentIsDone for AgentStatusBar
  const hasAgentMessages = visibleMsgs.some(m => isAgentMessage(m));
  const agentIsDone = hasAgentMessages && (() => {
    const agentMessages = visibleMsgs.filter(m => isAgentMessage(m));
    const last = agentMessages[agentMessages.length - 1];
    if (!last) return false;
    try {
      const p = JSON.parse(last.content);
      return p.status === "done" || p.status === "completed" || p.status === "failed"
        || p.phase === "completed" || p.phase === "Ferdig" || p.phase === "Feilet"
        || p.status === "waiting" || p.status === "needs_input";
    } catch { return false; }
  })();

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      minHeight: 0,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 20,
    }}>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <span style={{ fontSize: 13, color: T.textMuted }}>Laster meldinger...</span>
        </div>
      ) : msgs.length === 0 && ac ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <span style={{ fontSize: 13, color: T.textFaint }}>
            Ingen meldinger enda. Skriv noe nedenfor.
          </span>
        </div>
      ) : (
        dedupedMsgs.map((m) => {
          const time = new Date(m.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
          const isAgent = isAgentMessage(m);

          if (sending && m.role === "assistant" && (!m.content || m.content.trim() === "")) {
            return null;
          }

          return (
            <div key={m.id}>
              {/* USER */}
              {m.role === "user" && (
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 0" }}>
                  <div>
                    <div style={{
                      background: T.subtle,
                      border: `1px solid ${T.border}`,
                      borderRadius: T.r,
                      padding: "10px 16px",
                      fontSize: 13, lineHeight: 1.6, color: T.text,
                    }}>
                      {m.content}
                    </div>
                    <div style={{ fontSize: 10, color: T.textFaint, textAlign: "right", marginTop: 2 }}>{time}</div>
                  </div>
                </div>
              )}

              {/* MEMORY INSIGHT */}
              {m.messageType === "memory_insight" && (
                <div style={{ padding: "2px 0" }}>
                  <MemoryInsight content={m.content} />
                </div>
              )}

              {/* ASSISTANT — standalone agent message (not merged under chat) */}
              {m.role === "assistant" && isAgent && !(m.id === lastAgentMsg?.id && mergedChatId) && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                  <BotAvatar />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <AgentStream
                      content={m.content}
                      onCancel={onCancel}
                      onApprove={onApprove}
                      onReject={onReject}
                      onRequestChanges={onRequestChanges}
                    />
                    <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{time}</div>
                  </div>
                </div>
              )}

              {/* ASSISTANT — chat message, with optional merged agent below */}
              {m.role === "assistant" && !isAgent && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                  <BotAvatar />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {m.content && m.content.trim() !== "" ? (
                      <div style={{ fontSize: 13, lineHeight: 1.65, color: T.text, fontFamily: T.sans, paddingTop: 4 }}>
                        {m.content}
                      </div>
                    ) : null}

                    {m.id === mergedChatId && lastAgentMsg && (
                      <div style={{ marginTop: 8 }}>
                        <AgentStream
                          content={lastAgentMsg.content}
                          onCancel={onCancel}
                          onApprove={onApprove}
                          onReject={onReject}
                          onRequestChanges={onRequestChanges}
                        />
                      </div>
                    )}

                    <MessageMeta time={time} metadata={m.metadata} />
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Typing indicator for direct chat; AgentStatusBar handles agent tasks */}
      {sending && !activeTaskId && (
        <TypingIndicator statusText={streamStatusText ?? "Tenker..."} />
      )}
      {sending && activeTaskId && (
        <AgentStatusBar
          sending={sending}
          thinkSeconds={thinkSeconds}
          hasAgentMessages={hasAgentMessages}
          agentIsDone={agentIsDone}
        />
      )}

      {chatError && (
        <div style={{
          padding: "10px 16px",
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: T.r, fontSize: 12, color: T.error,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>{chatError}</span>
          <span onClick={onClearError} style={{ cursor: "pointer", marginLeft: "auto", fontSize: 14 }}>&times;</span>
        </div>
      )}

      <div ref={msgEndRef} />
    </div>
  );
}

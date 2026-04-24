"use client";

import React, { useRef, useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import AgentStream from "@/components/AgentStream";
import AgentStatusBar from "@/components/chat/AgentStatusBar";
import TypingIndicator from "@/components/chat/TypingIndicator";
import SkillsCollapsible from "@/components/chat/SkillsCollapsible";
import MemoryInsight from "@/components/chat/MemoryInsight";
import ChangedFilesPanel from "@/components/chat/ChangedFilesPanel";
import MarkdownText from "@/components/chat/MarkdownText";
import ProjectPlanModal from "@/components/chat/ProjectPlanModal";
import SwarmStatusMessage, {
  parseSwarmPayload,
  swarmToGroupLine,
} from "@/components/chat/SwarmStatusMessage";
import type { SwarmGroupLine } from "@/components/chat/types";
import type { Message } from "@/lib/api";
import type { ReviewActionType } from "@/hooks/useReviewFlow";

export function isAgentMessage(m: Message): boolean {
  if (m.messageType === "memory_insight") return false;
  // swarm_status is rendered as its own standalone chat entry — never let the
  // agent-message deduplicator collapse it (Fase H).
  if (m.messageType === "swarm_status") return false;
  return (
    m.messageType === "agent_status" ||
    m.messageType === "agent_thought" ||
    m.messageType === "agent_progress" ||
    m.messageType === "agent_report" ||
    (m.role === "assistant" && m.content.startsWith("{") && m.content.includes('"type":'))
  );
}

// Strip XML tool-call leaks from non-native tool-use models (MiniMax / Moonshot
// OpenAI-compat shim sometimes leaves empty <tool_calls> tags in content).
// Applied at render time so existing DB messages display cleanly too.
function sanitizeContent(raw: string): string {
  return raw
    .replace(/<tool_calls>\s*<\/tool_calls>/g, "")
    .replace(/<\/tool_calls>/g, "")
    .replace(/<tool_calls>/g, "")
    .replace(/<end_turn>/g, "")
    .replace(/<\/end_turn>/g, "")
    // Trailing "<" or "</" from a truncated XML fragment (content cut mid-tag).
    .replace(/\n\s*<\/?$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseMeta(metadata: Message["metadata"]): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    return typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  } catch {
    return null;
  }
}

// U11 — Model slug shown ABOVE the bubble. Prefers short slug, falls back to
// full model_id so legacy messages without a slug still render something.
function ModelSlugLabel({ metadata }: { metadata: Message["metadata"] }) {
  const meta = parseMeta(metadata);
  if (!meta) return null;
  const slug = (meta.modelSlug as string | undefined) ?? (meta.model as string | undefined);
  if (!slug) return null;
  return (
    <div style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, marginBottom: 4 }}>
      {slug}
    </div>
  );
}

// U11 — Token counter rendered INSIDE the bubble (tiny footer). Shows
// "in → out tokens · cost" when data is present.
function TokenFooter({ metadata }: { metadata: Message["metadata"] }) {
  const meta = parseMeta(metadata);
  if (!meta) return null;
  const tokens = meta.tokens as { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
  const cost = meta.cost as number | undefined;
  if (!tokens && cost == null) return null;
  const parts: string[] = [];
  if (tokens?.inputTokens != null && tokens?.outputTokens != null) {
    parts.push(`${tokens.inputTokens.toLocaleString()} → ${tokens.outputTokens.toLocaleString()} tokens`);
  } else if (tokens?.totalTokens != null) {
    parts.push(`${tokens.totalTokens.toLocaleString()} tokens`);
  }
  if (typeof cost === "number") {
    parts.push(`$${cost.toFixed(4)}`);
  }
  if (parts.length === 0) return null;
  return (
    <div style={{
      marginTop: 6,
      fontSize: 10,
      color: T.textFaint,
      fontFamily: T.mono,
    }}>
      {parts.join(" \u00b7 ")}
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
  reviewInProgress?: ReviewActionType;
  activePlanMsgId?: string | null;
  /** Active skills for the currently-running task. Only applied to the
   *  last agent message (the one the user is watching). */
  activeSkills?: Array<{ id: string; name: string; description?: string }>;
}

const MessageListComponent = function MessageList({
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
  reviewInProgress,
  activePlanMsgId,
  activeSkills,
}: MessageListProps) {
  const msgEndRef = useRef<HTMLDivElement>(null);
  const [modalPlanContent, setModalPlanContent] = useState<string | null>(null);

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

  // Fase H inline — collect latest swarm_status payload. Parsed once per
  // render and passed into AgentStream so the swarm shows up as inline
  // indented lines in the same stack as steps + tool-calls, not as a
  // standalone chat bubble.
  let latestSwarmGroup: SwarmGroupLine | null = null;
  for (let i = visibleMsgs.length - 1; i >= 0; i--) {
    const m = visibleMsgs[i];
    if (m.messageType !== "swarm_status") continue;
    const parsed = parseSwarmPayload(m.content);
    if (parsed) {
      latestSwarmGroup = swarmToGroupLine(parsed);
      break;
    }
  }
  // Whether the swarm will be adopted by an AgentStream. If no agent message
  // exists, we keep the standalone swarm_status bubble as a fallback.
  const hasAgentToAdoptSwarm = latestSwarmGroup !== null && lastAgentIdx >= 0;
  const swarmGroupsForAgent: SwarmGroupLine[] | undefined = hasAgentToAdoptSwarm && latestSwarmGroup
    ? [latestSwarmGroup]
    : undefined;
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
      alignItems: "center",
    }}>
    <div style={{
      width: "100%",
      maxWidth: 720, // U4 — −30% vs. dagens ubegrensede bredde
      display: "flex",
      flexDirection: "column",
      gap: 20,
    }}>
      {loading && msgs.length === 0 ? (
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
                      background: "rgba(20,20,24,0.82)",
                      backdropFilter: "blur(14px)",
                      WebkitBackdropFilter: "blur(14px)",
                      border: `1px solid ${T.border}`,
                      borderRadius: T.r,
                      padding: "10px 16px",
                    }}>
                      <MarkdownText content={m.content} />
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

              {/* SWARM STATUS fallback (Fase H inline refactor) — only rendered
                  as a standalone bubble when no agent message is in view to
                  adopt it. Normally the swarm is merged inline by AgentStream. */}
              {m.messageType === "swarm_status" && !hasAgentToAdoptSwarm && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SwarmStatusMessage content={m.content} />
                    <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{time}</div>
                  </div>
                </div>
              )}

              {/* PROJECT PLAN — compact AI bubble + modal trigger */}
              {m.role === "assistant" && (() => {
                try {
                  const parsed = JSON.parse(m.content);
                  if (parsed?.type === "project_plan") {
                    const isSuperseded = activePlanMsgId != null && m.id !== activePlanMsgId;
                    return (
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0", opacity: isSuperseded ? 0.45 : 1, transition: "opacity 0.2s" }}>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            display: "inline-block",
                            background: "rgba(20,20,24,0.82)",
                            backdropFilter: "blur(14px)",
                            WebkitBackdropFilter: "blur(14px)",
                            border: `1px solid ${T.border}`,
                            borderRadius: T.r,
                            padding: "10px 16px",
                            maxWidth: "100%",
                          }}>
                            {isSuperseded && (
                              <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 4, fontStyle: "italic" }}>
                                Utdatert plan
                              </div>
                            )}
                            <MarkdownText content={`Prosjektplan klar — **${parsed.title}** (${parsed.totalTasks ?? ""} oppgaver i ${parsed.phases?.length ?? ""} faser)`} />
                            {/* Se prosjektplan — pil med hale */}
                            <button
                              onClick={() => setModalPlanContent(m.content)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                marginTop: 8,
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: "3px 0",
                                color: T.textMuted,
                                fontSize: 12,
                                fontWeight: 500,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
                              onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; }}
                            >
                              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 2 L3 8.5 L10.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M8.5 6.5 L10.5 8.5 L8.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Se prosjektplan
                            </button>
                          </div>
                          <div style={{ fontSize: 10, color: T.textFaint, marginTop: 4 }}>{time}</div>
                        </div>
                      </div>
                    );
                  }
                } catch (e) {
                  // Not JSON — fall through to normal chat rendering
                }
                return null;
              })()}

              {/* ASSISTANT — standalone agent message (not merged under chat) — skip if project_plan was rendered */}
              {m.role === "assistant" && isAgent && !(m.id === lastAgentMsg?.id && mergedChatId) && (() => {
                try {
                  const parsed = JSON.parse(m.content);
                  if (parsed?.type === "project_plan") return null; // Already rendered inline above
                } catch {}
                return (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <AgentStream
                        content={m.content}
                        onCancel={onCancel}
                        onApprove={onApprove}
                        onReject={onReject}
                        onRequestChanges={onRequestChanges}
                        reviewInProgress={reviewInProgress}
                        swarmGroups={m.id === lastAgentMsg?.id ? swarmGroupsForAgent : undefined}
                        activeSkills={m.id === lastAgentMsg?.id ? activeSkills : undefined}
                        taskId={(parseMeta(m.metadata) as { taskId?: string } | null)?.taskId ?? activeTaskId ?? null}
                      />
                      <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{time}</div>
                    </div>
                  </div>
                );
              })()}

              {/* ASSISTANT — chat message, with optional merged agent below.
                  memory_insight is rendered above via <MemoryInsight>; skip here
                  so the raw JSON payload doesn't also render as a chat bubble. */}
              {m.role === "assistant" && !isAgent && m.messageType !== "memory_insight" && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {m.content && m.content.trim() !== "" ? (
                      <>
                        <ModelSlugLabel metadata={m.metadata} />
                        <div style={{
                          display: "inline-block",
                          background: "rgba(20,20,24,0.82)",
                          backdropFilter: "blur(14px)",
                          WebkitBackdropFilter: "blur(14px)",
                          border: `1px solid ${T.border}`,
                          borderRadius: T.r,
                          padding: "10px 16px",
                          maxWidth: "100%",
                        }}>
                          <MarkdownText content={sanitizeContent(m.content)} />
                          <TokenFooter metadata={m.metadata} />
                        </div>
                        {(() => {
                          const meta = parseMeta(m.metadata) as { activeSkills?: Array<{ id: string; name: string; description?: string }> } | null;
                          const skills = meta?.activeSkills ?? [];
                          if (skills.length === 0) return null;
                          return (
                            <div style={{ marginTop: 4, paddingLeft: 2 }}>
                              <SkillsCollapsible skills={skills} />
                            </div>
                          );
                        })()}
                      </>
                    ) : null}

                    {m.id === mergedChatId && lastAgentMsg && (
                      <div style={{ marginTop: 8 }}>
                        <AgentStream
                          content={lastAgentMsg.content}
                          onCancel={onCancel}
                          onApprove={onApprove}
                          onReject={onReject}
                          onRequestChanges={onRequestChanges}
                          swarmGroups={swarmGroupsForAgent}
                          activeSkills={activeSkills}
                          taskId={(parseMeta(lastAgentMsg.metadata) as { taskId?: string } | null)?.taskId ?? activeTaskId ?? null}
                        />
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{time}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Typing indicator for direct chat; AgentStatusBar handles agent tasks */}
      {sending && !activeTaskId && (() => {
        // Hide typing indicator if the last visible message is already from the assistant
        const lastMsg = visibleMsgs[visibleMsgs.length - 1];
        const assistantAlreadyReplied = lastMsg?.role === "assistant" && lastMsg.content?.trim();
        if (assistantAlreadyReplied) return null;
        return <TypingIndicator statusText={streamStatusText ?? "Tenker..."} />;
      })()}
      {sending && activeTaskId && (
        <AgentStatusBar
          sending={sending}
          thinkSeconds={thinkSeconds}
          hasAgentMessages={hasAgentMessages}
          agentIsDone={agentIsDone}
          streamStatusText={streamStatusText}
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

      {/* Project plan modal */}
      {modalPlanContent && (
        <ProjectPlanModal
          content={modalPlanContent}
          onClose={() => setModalPlanContent(null)}
        />
      )}
    </div>
    </div>
  );
};

export default React.memo(MessageListComponent);

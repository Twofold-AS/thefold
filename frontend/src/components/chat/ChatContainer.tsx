"use client";

import { T } from "@/lib/tokens";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import { Clock } from "lucide-react";
import type { Message } from "@/lib/api";
import type { ReviewActionType } from "@/hooks/useReviewFlow";
import type { ReactNode } from "react";

interface Skill {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
}

interface ModelOption {
  id: string;
  displayName: string;
  provider: string;
}

interface ChatContainerProps {
  title: string;
  subtitle?: string;
  msgs: Message[];
  msgsLoading: boolean;
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
  onSend: (value: string, options?: { firecrawlEnabled?: boolean; planMode?: boolean }) => void;
  pendingReviewId: string | null;
  reviewInProgress?: ReviewActionType;
  skills: Skill[];
  selectedSkillIds: string[];
  onSkillsChange: (ids: string[]) => void;
  subAgentsEnabled: boolean;
  onSubAgentsToggle: () => void;
  models: ModelOption[];
  selectedModel: string | null;
  onModelChange: (id: string | null) => void;
  onHistoryToggle?: () => void;
  onNewChat?: () => void;
  /** Rendered above the chat input — for ModeIndicators (sub-agents, plan mode, inkognito) */
  modeIndicatorSlot?: ReactNode;
  isIncognito?: boolean;
  onIncognitoToggle?: () => void;
  planMode?: boolean;
  onPlanModeToggle?: () => void;
  activePlanMsgId?: string | null;
}

export default function ChatContainer({
  title,
  subtitle,
  msgs,
  msgsLoading,
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
  onSend,
  pendingReviewId,
  reviewInProgress,
  skills,
  selectedSkillIds,
  onSkillsChange,
  subAgentsEnabled,
  onSubAgentsToggle,
  models,
  selectedModel,
  onModelChange,
  onHistoryToggle,
  onNewChat,
  modeIndicatorSlot,
  isIncognito,
  onIncognitoToggle,
  planMode,
  onPlanModeToggle,
  activePlanMsgId,
}: ChatContainerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint, marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {onHistoryToggle && (
            <button
              onClick={onHistoryToggle}
              title="Samtalehistorikk"
              style={{
                background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8,
                padding: "6px 10px", cursor: "pointer", color: T.textMuted,
                display: "flex", alignItems: "center", gap: 4, fontSize: 12,
              }}
            >
              <Clock size={14} /> Historikk
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageList
        msgs={msgs}
        loading={msgsLoading}
        ac={ac}
        sending={sending}
        activeTaskId={activeTaskId}
        thinkSeconds={thinkSeconds}
        streamStatusText={streamStatusText}
        chatError={chatError}
        onClearError={onClearError}
        onCancel={onCancel}
        onApprove={onApprove}
        onReject={onReject}
        onRequestChanges={onRequestChanges}
        reviewInProgress={reviewInProgress}
        activePlanMsgId={activePlanMsgId}
      />

      {/* Mode indicators — rendered above the input, aligned to chat input width */}
      {modeIndicatorSlot && (
        <div style={{ display: "flex", justifyContent: "center", padding: "0 20px 4px", flexShrink: 0 }}>
          <div style={{ width: "100%", maxWidth: 700 }}>
            {modeIndicatorSlot}
          </div>
        </div>
      )}

      {/* Input */}
      <MessageInput
        onSubmit={onSend}
        pendingReviewId={pendingReviewId}
        sending={sending}
        onCancel={onCancel}
        skills={skills}
        selectedSkillIds={selectedSkillIds}
        onSkillsChange={onSkillsChange}
        subAgentsEnabled={subAgentsEnabled}
        onSubAgentsToggle={onSubAgentsToggle}
        models={models}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        isIncognito={isIncognito}
        onIncognitoToggle={onIncognitoToggle}
        planMode={planMode}
        onPlanModeToggle={onPlanModeToggle}
      />
    </div>
  );
}

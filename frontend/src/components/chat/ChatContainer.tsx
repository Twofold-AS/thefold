"use client";

import { T } from "@/lib/tokens";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import { Clock } from "lucide-react";
import type { Message } from "@/lib/api";
import type { ReviewActionType } from "@/hooks/useReviewFlow";

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
  /** Active mode label rendered inline inside ChatInput beside the ghost icon. */
  activeModeLabel?: string | null;
  isIncognito?: boolean;
  onIncognitoToggle?: () => void;
  planMode?: boolean;
  onPlanModeToggle?: () => void;
  autoMode?: boolean;
  onAutoModeToggle?: () => void;
  activePlanMsgId?: string | null;
  conversationId?: string;
  projectScope?: "incognito" | "cowork" | "designer";
  onNewProject?: () => void;
  selectedProjectId?: string | null;
  onSelectProject?: (id: string | null) => void;
  /** Skills the agent resolved for the currently-running task — renders as
   *  badge row in AgentStream. Sourced from the SSE agent.skills_active event. */
  activeSkills?: Array<{ id: string; name: string; description?: string }>;
  /** Live tool-calls from useAgentStream — drives the real-time activity
   *  stream in AgentStream (UI-1). */
  liveToolCalls?: Array<{
    id: string;
    toolName: string;
    input: Record<string, unknown>;
    result?: unknown;
    durationMs?: number;
    isError?: boolean;
    status: "running" | "done" | "error";
  }>;
  /** Runde 3-A — plan-preview state from useAgentStream. */
  planPending?: null | {
    masterTaskId: string;
    subtasks: Array<{
      id: string;
      title: string;
      phase: string | null;
      description?: string | null;
      targetFiles?: string[];
      dependsOn?: string[];
    }>;
    countdownSec: number;
    iteration: number;
    receivedAt: number;
  };
  onClearPlanPending?: () => void;
  /** Runde 3-B — interrupt state. */
  interrupted?: null | {
    masterTaskId: string;
    pausedSubTaskId?: string;
    userMessage: string;
  };
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
  activeModeLabel,
  isIncognito,
  onIncognitoToggle,
  planMode,
  onPlanModeToggle,
  autoMode,
  onAutoModeToggle,
  activePlanMsgId,
  conversationId,
  projectScope,
  onNewProject,
  selectedProjectId,
  onSelectProject,
  activeSkills,
  liveToolCalls,
  planPending,
  onClearPlanPending,
  interrupted,
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
        activeSkills={activeSkills}
        liveToolCalls={liveToolCalls}
        isIncognito={isIncognito}
        planPending={planPending}
        onClearPlanPending={onClearPlanPending}
        interrupted={interrupted}
      />

      {/* Input */}
      <MessageInput
        activeModeLabel={activeModeLabel}
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
        autoMode={autoMode}
        onAutoModeToggle={onAutoModeToggle}
        conversationId={conversationId}
        projectScope={projectScope}
        onNewProject={onNewProject}
        selectedProjectId={selectedProjectId}
        onSelectProject={onSelectProject}
      />
    </div>
  );
}

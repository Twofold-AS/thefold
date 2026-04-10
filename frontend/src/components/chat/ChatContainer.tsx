"use client";

import { T } from "@/lib/tokens";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import type { Message } from "@/lib/api";

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
  thinkSeconds: number;
  chatError: string | null;
  onClearError: () => void;
  onCancel: () => void;
  onApprove: (reviewId: string) => Promise<void>;
  onReject: (reviewId: string) => Promise<void>;
  onRequestChanges: (reviewId: string, feedback?: string) => void;
  onSend: (value: string) => void;
  pendingReviewId: string | null;
  skills: Skill[];
  selectedSkillIds: string[];
  onSkillsChange: (ids: string[]) => void;
  subAgentsEnabled: boolean;
  onSubAgentsToggle: () => void;
  models: ModelOption[];
  selectedModel: string | null;
  onModelChange: (id: string | null) => void;
}

export default function ChatContainer({
  title,
  subtitle,
  msgs,
  msgsLoading,
  ac,
  sending,
  thinkSeconds,
  chatError,
  onClearError,
  onCancel,
  onApprove,
  onReject,
  onRequestChanges,
  onSend,
  pendingReviewId,
  skills,
  selectedSkillIds,
  onSkillsChange,
  subAgentsEnabled,
  onSubAgentsToggle,
  models,
  selectedModel,
  onModelChange,
}: ChatContainerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: `1px solid ${T.border}`,
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
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} />
      </div>

      {/* Messages */}
      <MessageList
        msgs={msgs}
        loading={msgsLoading}
        ac={ac}
        sending={sending}
        thinkSeconds={thinkSeconds}
        chatError={chatError}
        onClearError={onClearError}
        onCancel={onCancel}
        onApprove={onApprove}
        onReject={onReject}
        onRequestChanges={onRequestChanges}
      />

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
      />
    </div>
  );
}

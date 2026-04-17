"use client";

import ChatInput from "@/components/ChatInput";

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

interface MessageInputProps {
  onSubmit: (value: string, options?: { firecrawlEnabled?: boolean }) => void;
  pendingReviewId: string | null;
  sending: boolean;
  onCancel: () => void;
  skills: Skill[];
  selectedSkillIds: string[];
  onSkillsChange: (ids: string[]) => void;
  subAgentsEnabled: boolean;
  onSubAgentsToggle: () => void;
  models: ModelOption[];
  selectedModel: string | null;
  onModelChange: (id: string | null) => void;
  isIncognito?: boolean;
  onIncognitoToggle?: () => void;
  planMode?: boolean;
  onPlanModeToggle?: () => void;
}

export default function MessageInput({
  onSubmit,
  pendingReviewId,
  sending,
  onCancel,
  skills,
  selectedSkillIds,
  onSkillsChange,
  subAgentsEnabled,
  onSubAgentsToggle,
  models,
  selectedModel,
  onModelChange,
  isIncognito,
  onIncognitoToggle,
  planMode,
  onPlanModeToggle,
}: MessageInputProps) {
  return (
    <div style={{
      padding: "8px 24px 24px",
      display: "flex",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{ width: "100%", maxWidth: 768 }}>
        <ChatInput
          compact
          onSubmit={(value, options) => onSubmit(value, options)}
          skills={skills}
          selectedSkillIds={selectedSkillIds}
          onSkillsChange={onSkillsChange}
          subAgentsEnabled={subAgentsEnabled}
          onSubAgentsToggle={onSubAgentsToggle}
          isLoading={sending}
          onCancel={onCancel}
          placeholder={pendingReviewId ? "Skriv feedback til agenten..." : undefined}
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          isIncognito={isIncognito}
          onIncognitoToggle={onIncognitoToggle}
          planMode={planMode}
          onPlanModeToggle={onPlanModeToggle}
        />
      </div>
    </div>
  );
}

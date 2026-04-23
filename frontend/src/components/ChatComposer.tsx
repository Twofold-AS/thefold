"use client";

import { T } from "@/lib/tokens";
import ChatInput from "@/components/ChatInput";
import SuggestionChips from "@/components/SuggestionChips";

interface ChatComposerProps {
  onSubmit?: (msg: string, options?: { planMode?: boolean }) => void;
  heading?: string;
  skills?: Array<{ id: string; name: string; enabled: boolean }>;
  selectedSkillIds?: string[];
  onSkillsChange?: (ids: string[]) => void;
  subAgentsEnabled?: boolean;
  onSubAgentsToggle?: () => void;
  models?: Array<{ id: string; displayName: string; provider: string }>;
  selectedModel?: string | null;
  onModelChange?: (modelId: string | null) => void;
  /** Active mode label shown inline in ChatInput beside the ghost icon. */
  activeModeLabel?: string | null;
  isIncognito?: boolean;
  onIncognitoToggle?: () => void;
  planMode?: boolean;
  onPlanModeToggle?: () => void;
  autoMode?: boolean;
  onAutoModeToggle?: () => void;
  /** Fase I.0.e/f */
  conversationId?: string;
  projectScope?: "cowork" | "designer";
  onNewProject?: () => void;
  selectedProjectId?: string | null;
  onSelectProject?: (id: string | null) => void;
  /** Active project name — drives SuggestionChips. Null = generic suggestions. */
  projectName?: string | null;
  /** Active project type — drives SuggestionChips designer variants. */
  projectType?: "code" | "framer" | "figma" | "framer_figma" | null;
}

export default function ChatComposer({
  onSubmit,
  heading,
  skills,
  selectedSkillIds,
  onSkillsChange,
  subAgentsEnabled,
  onSubAgentsToggle,
  models,
  selectedModel,
  onModelChange,
  activeModeLabel,
  isIncognito,
  onIncognitoToggle,
  planMode,
  onPlanModeToggle,
  autoMode,
  onAutoModeToggle,
  conversationId,
  projectScope,
  onNewProject,
  selectedProjectId,
  onSelectProject,
  projectName,
  projectType,
}: ChatComposerProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "0 24px",
      }}
    >
      {/* Welcome heading */}
      <h1
        style={{
          fontSize: 36,
          fontWeight: 400,
          color: T.text,
          fontFamily: T.sans,
          textAlign: "center",
          margin: 0,
          letterSpacing: "-0.02em",
        }}
      >
        {heading || "Velkommen til TheFold."}
      </h1>

      {/* Suggestion chips */}
      <SuggestionChips
        onSelect={(text) => onSubmit?.(text)}
        projectName={projectName ?? null}
        projectType={projectType ?? null}
        incognito={!!isIncognito || !selectedProjectId}
      />

      {/* Chat input — Stitch style */}
      <div style={{ width: "100%", maxWidth: 700 }}>
        <ChatInput
          onSubmit={(msg, opts) => onSubmit?.(msg, opts)}
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
          activeModeLabel={activeModeLabel}
        />
      </div>
    </div>
  );
}

"use client";

import { T } from "@/lib/tokens";
import ChatInput from "@/components/ChatInput";
import SuggestionChips from "@/components/SuggestionChips";

interface ChatComposerProps {
  onSubmit?: (msg: string) => void;
  heading?: string;
  skills?: Array<{ id: string; name: string; enabled: boolean }>;
  selectedSkillIds?: string[];
  onSkillsChange?: (ids: string[]) => void;
  subAgentsEnabled?: boolean;
  onSubAgentsToggle?: () => void;
  models?: Array<{ id: string; displayName: string; provider: string }>;
  selectedModel?: string | null;
  onModelChange?: (modelId: string | null) => void;
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
      <SuggestionChips onSelect={(text) => onSubmit?.(text)} />

      {/* Chat input — Stitch style */}
      <div style={{ width: "100%", maxWidth: 700 }}>
        <ChatInput
          onSubmit={(msg) => onSubmit?.(msg)}
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
    </div>
  );
}

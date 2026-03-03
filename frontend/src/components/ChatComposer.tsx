"use client";

import { T } from "@/lib/tokens";
import ChatInput from "@/components/ChatInput";

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

export default function ChatComposer({ onSubmit, heading, skills, selectedSkillIds, onSkillsChange, subAgentsEnabled, onSubAgentsToggle, models, selectedModel, onModelChange }: ChatComposerProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        minHeight: 400,
        position: "relative",
      }}
    >
      {/* Heading */}
      <div style={{ paddingBottom: 32, textAlign: "center", position: "relative", zIndex: 1 }}>
        <h2 style={{
          fontSize: 32, fontWeight: 400, color: T.text, fontFamily: T.brandFont,
          letterSpacing: "-0.03em",
        }}>
          {heading || "Når AI sier umulig, sier Mikael Kråkenes neste"}
        </h2>
      </div>

      {/* ChatInput wrapper — max 800px */}
      <div style={{ width: "100%", maxWidth: 800, position: "relative", zIndex: 1 }}>
        <div style={{
          position: "absolute", bottom: -12, left: "50%", transform: "translateX(-50%)",
          width: "80%", height: 40,
          background: "radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 70%)",
          pointerEvents: "none", filter: "blur(20px)", zIndex: 0,
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <ChatInput
            onSubmit={(msg) => onSubmit && onSubmit(msg)}
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
    </div>
  );
}

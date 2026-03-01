"use client";

import { useState, useEffect } from "react";
import { T } from "@/lib/tokens";
import ChatInput from "@/components/ChatInput";

interface ChatComposerProps {
  onSubmit?: (msg: string, repo: string | null, ghost: boolean) => void;
  heading?: string;
  defaultGhost?: boolean;
  onGhostChange?: (ghost: boolean) => void;
  skills?: Array<{ id: string; name: string; enabled: boolean }>;
  selectedSkillIds?: string[];
  onSkillsChange?: (ids: string[]) => void;
  subAgentsEnabled?: boolean;
  onSubAgentsToggle?: () => void;
  repos?: string[];
}

export default function ChatComposer({ onSubmit, heading, defaultGhost, onGhostChange, skills, selectedSkillIds, onSkillsChange, subAgentsEnabled, onSubAgentsToggle, repos }: ChatComposerProps) {
  const [repo, setRepo] = useState<string | null>(null);
  const [ghost, setGhost] = useState(defaultGhost ?? false);

  useEffect(() => { setGhost(defaultGhost ?? false); }, [defaultGhost]);

  const handleGhostChange = (newGhost: boolean) => {
    setGhost(newGhost);
    onGhostChange?.(newGhost);
  };

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
          fontSize: 32, fontWeight: 600, color: T.text,
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
            repo={ghost ? null : repo}
            onSubmit={(msg, r) => onSubmit && onSubmit(msg, r ?? null, ghost)}
            onRepoChange={(r) => setRepo(r)}
            ghost={ghost}
            onGhostChange={handleGhostChange}
            skills={skills}
            selectedSkillIds={selectedSkillIds}
            onSkillsChange={onSkillsChange}
            subAgentsEnabled={subAgentsEnabled}
            onSubAgentsToggle={onSubAgentsToggle}
            repos={repos}
          />
        </div>
      </div>
    </div>
  );
}

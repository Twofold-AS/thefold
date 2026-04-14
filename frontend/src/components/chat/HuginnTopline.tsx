"use client";

import { T, S } from "@/lib/tokens";
import { Clock, Command, ChevronDown } from "lucide-react";
import ConnectionStatus from "./ConnectionStatus";

interface Skill {
  id: string;
  name: string;
  enabled: boolean;
}

interface HuginnToplineProps {
  repoName?: string | null;
  onRepoClick?: () => void;
  skills: Skill[];
  selectedSkillIds: string[];
  onSkillsToggle: () => void;
  onHistoryToggle: () => void;
  onCommandPaletteOpen: () => void;
  connectionStatus: "connected" | "connecting" | "disconnected";
}

export default function HuginnTopline({
  repoName,
  onRepoClick,
  skills,
  selectedSkillIds,
  onSkillsToggle,
  onHistoryToggle,
  onCommandPaletteOpen,
  connectionStatus,
}: HuginnToplineProps) {
  const activeSkillCount = selectedSkillIds.length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${S.lg}px`,
        height: 44,
        borderBottom: `1px solid ${T.border}`,
        background: T.surface,
        flexShrink: 0,
      }}
    >
      {/* Left: Repo selector */}
      <div style={{ display: "flex", alignItems: "center", gap: S.md }}>
        {repoName ? (
          <button
            onClick={onRepoClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              fontSize: 12,
              fontFamily: T.mono,
              fontWeight: 500,
              color: T.text,
              background: T.subtle,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <span style={{ color: T.accent }}>⌥</span>
            {repoName}
            <ChevronDown size={12} color={T.textMuted} />
          </button>
        ) : (
          <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textFaint }}>
            Ingen repo valgt
          </span>
        )}
      </div>

      {/* Right: Skills, History, Cmd+K, Status */}
      <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
        {/* Skills toggle */}
        <button
          onClick={onSkillsToggle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            fontSize: 11,
            fontFamily: T.mono,
            color: activeSkillCount > 0 ? T.accent : T.textMuted,
            background: activeSkillCount > 0 ? `${T.accent}10` : "transparent",
            border: `1px solid ${activeSkillCount > 0 ? `${T.accent}40` : T.border}`,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Skills
          {activeSkillCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                background: T.accent,
                color: "#fff",
                borderRadius: 10,
                padding: "1px 5px",
                lineHeight: 1.3,
              }}
            >
              {activeSkillCount}
            </span>
          )}
        </button>

        {/* History */}
        <button
          onClick={onHistoryToggle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            fontSize: 11,
            fontFamily: T.mono,
            color: T.textMuted,
            background: "transparent",
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          <Clock size={12} />
          Historikk
        </button>

        {/* Cmd+K */}
        <button
          onClick={onCommandPaletteOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            fontSize: 11,
            fontFamily: T.mono,
            color: T.textFaint,
            background: "transparent",
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            cursor: "pointer",
          }}
          title="Cmd+K"
        >
          <Command size={12} />K
        </button>

        {/* Connection status */}
        <ConnectionStatus status={connectionStatus} />
      </div>
    </div>
  );
}

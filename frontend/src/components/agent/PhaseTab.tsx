"use client";

import { useState, useEffect } from "react";
import { MotionIcon } from "motion-icons-react";
import "motion-icons-react/style.css";
import { MagicIcon, magicPhrases } from "../MagicIcon";

interface PhaseTabProps {
  phase: string;
  isWorking: boolean;
  isFailed: boolean;
  isWaiting: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

/** Tab header for agent status — shows magic sparkle for working, phase icon for terminal states */
export function PhaseTab({
  phase,
  isWorking,
  isFailed,
  isWaiting,
  collapsed,
  onToggle,
}: PhaseTabProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isWorking) return;
    const interval = setInterval(() => {
      setPhraseIndex((prev) => {
        let next: number;
        do {
          next = Math.floor(Math.random() * magicPhrases.length);
        } while (next === prev && magicPhrases.length > 1);
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isWorking]);

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2 cursor-pointer"
      style={{
        border: "1px solid var(--border)",
        borderBottom: collapsed ? "1px solid var(--border)" : "none",
        background: "transparent",
      }}
      onClick={onToggle}
    >
      {isWorking ? (
        <>
          <span style={{ color: "var(--text-muted)" }}>
            <MagicIcon phrase={magicPhrases[phraseIndex]} />
          </span>
          <span
            className="text-sm font-medium agent-shimmer"
            style={{ color: "var(--text-muted)" }}
          >
            {magicPhrases[phraseIndex]}
          </span>
        </>
      ) : (
        <>
          <PhaseIcon phase={phase} color={
            isFailed ? "#ef4444"
              : isWaiting ? "#eab308"
              : phase === "Ferdig" ? "#22c55e"
              : phase === "Stopped" ? "var(--text-muted)"
              : "var(--text-primary)"
          } />
          <span
            className="text-sm font-medium"
            style={{
              color: isFailed
                ? "#ef4444"
                : isWaiting
                  ? "#eab308"
                  : phase === "Ferdig"
                    ? "#22c55e"
                    : phase === "Stopped"
                      ? "var(--text-muted)"
                      : "var(--text-primary)",
            }}
          >
            {getTabLabel(phase)}
          </span>
        </>
      )}
    </div>
  );
}

function getTabLabel(phase: string): string {
  switch (phase) {
    case "Venter":
      return "Trenger avklaring";
    case "Ferdig":
      return "Fullført";
    case "Feilet":
      return "Feilet";
    case "Stopped":
      return "Stoppet";
    default:
      return phase;
  }
}

/** Phase-specific icon — static, no animations */
function PhaseIcon({ phase, color }: { phase: string; color?: string }) {
  switch (phase) {
    case "Ferdig":
      return (
        <MotionIcon
          name="PartyPopper"
          size={18}
          color={color || "#22c55e"}
        />
      );
    case "Feilet":
      return (
        <MotionIcon
          name="AlertTriangle"
          size={18}
          color={color || "#ef4444"}
        />
      );
    case "Venter":
      return (
        <MotionIcon
          name="MessageCircleQuestion"
          size={18}
          color={color || "#eab308"}
        />
      );
    case "Stopped":
      return (
        <MotionIcon
          name="StopCircle"
          size={18}
          color={color || "var(--text-muted)"}
        />
      );
    case "Bygger":
    case "Forbereder":
      return (
        <MotionIcon
          name="Hammer"
          size={18}
          color={color || "var(--text-primary)"}
        />
      );
    case "Reviewer":
      return (
        <MotionIcon
          name="Eye"
          size={18}
          color={color || "var(--text-primary)"}
        />
      );
    default:
      return (
        <MotionIcon
          name="Hammer"
          size={18}
          color={color || "var(--text-primary)"}
        />
      );
  }
}

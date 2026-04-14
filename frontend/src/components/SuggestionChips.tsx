"use client";

import { T } from "@/lib/tokens";

const SUGGESTIONS = [
  "Bygg en booking-app med kalender",
  "Lag en REST API med autentisering",
  "Fiks auth-systemet med OTP",
  "Opprett en landingsside med Next.js",
];

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

export default function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        justifyContent: "center",
        maxWidth: 700,
      }}
    >
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          style={{
            background: T.suggestion,
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            padding: "8px 16px",
            fontSize: 13,
            color: T.textSec,
            fontFamily: T.sans,
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = T.tabActive;
            e.currentTarget.style.color = T.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = T.suggestion;
            e.currentTarget.style.color = T.textSec;
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

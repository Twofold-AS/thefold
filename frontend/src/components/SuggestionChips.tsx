"use client";

import { useRef, useState } from "react";
import { T } from "@/lib/tokens";

const INCOGNITO_SUGGESTIONS = [
  "Hva vil du bygge?",
  "Start med en idé",
  "Jeg kan hjelpe deg å komme i gang",
  "Beskriv en funksjon du ønsker",
  "Still et teknisk spørsmål",
];

const DEFAULT_SUGGESTIONS = [
  "Bygg en booking-app med kalender",
  "Lag en REST API med autentisering",
  "Fiks auth-systemet med OTP",
  "Opprett en landingsside med Next.js",
  "Legg til dark mode",
  "Skriv tester for API-endepunktene",
];

const DESIGNER_DEFAULT_SUGGESTIONS = [
  "Bygg en Framer-landingsside",
  "Lag en header og footer-komponent",
  "Scrape en nettside og replikér designet",
  "Lag en komponent-bibliotek-struktur",
  "Opprett en responsive navigation",
  "Design en About-seksjon",
];

function projectSuggestions(projectName: string): string[] {
  return [
    `Analyser kodebasen i ${projectName}`,
    `Fiks bugs i ${projectName}`,
    `Legg til tester i ${projectName}`,
    `Dokumenter ${projectName}`,
    `Refaktorer ${projectName}`,
    `Lag en PR-oppsummering for ${projectName}`,
  ];
}

function designerProjectSuggestions(projectName: string): string[] {
  return [
    `Bygg en landingsside for ${projectName}`,
    `Lag en header og footer for ${projectName}`,
    `Generer en About-seksjon for ${projectName}`,
    `Scrape en nettside og replikér designet i ${projectName}`,
    `Opprett en responsive navigation for ${projectName}`,
    `Lag en komponent-bibliotek-struktur i ${projectName}`,
  ];
}

type ProjectType = "code" | "framer" | "figma" | "framer_figma";

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
  /** Active project name. When omitted → DEFAULT_SUGGESTIONS. */
  projectName?: string | null;
  /** When true → INCOGNITO_SUGGESTIONS (generic, no repo/project references). */
  incognito?: boolean;
  /** Project type — framer/figma/framer_figma triggers designer-suggestions. */
  projectType?: ProjectType | null;
}

export default function SuggestionChips({ onSelect, projectName, incognito, projectType }: SuggestionChipsProps) {
  const isDesigner = projectType === "framer" || projectType === "figma" || projectType === "framer_figma";
  const suggestions = incognito
    ? INCOGNITO_SUGGESTIONS
    : projectName
      ? (isDesigner ? designerProjectSuggestions(projectName) : projectSuggestions(projectName))
      : (isDesigner ? DESIGNER_DEFAULT_SUGGESTIONS : DEFAULT_SUGGESTIONS);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    isDown.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.setPointerCapture(e.pointerId);
    setDragging(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDown.current || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 4) setDragging(true);
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const onPointerUp = () => {
    isDown.current = false;
  };

  return (
    <div style={{ maxWidth: 700, width: "100%", overflow: "hidden", borderRadius: 20 }}>
      <style>{`.suggestions-inner::-webkit-scrollbar { display: none; }`}</style>
      <div
        ref={scrollRef}
        className="suggestions-inner"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          gap: 8,
          overflowX: "scroll",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
        } as React.CSSProperties}
      >
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => { if (!dragging) onSelect(s); }}
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
              flexShrink: 0,
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
    </div>
  );
}

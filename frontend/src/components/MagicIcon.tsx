"use client";

export const magicPhrases = ["Tryller", "Glitrer", "Forhekser", "Hokus Pokus", "Alakazam"];

export function MagicIcon({ phrase }: { phrase: string }) {
  switch (phrase) {
    case "Tryller":
      return (
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="3" y1="17" x2="14" y2="6" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" values="0 8.5 11.5;-5 8.5 11.5;5 8.5 11.5;0 8.5 11.5" dur="2s" repeatCount="indefinite" />
          </line>
          <circle cx="14" cy="6" r="1" fill="currentColor"><animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" /></circle>
          <circle cx="16" cy="4" r="0.5" fill="currentColor"><animate attributeName="opacity" values="0.3;1;0.3" dur="0.6s" repeatCount="indefinite" /></circle>
          <circle cx="15" cy="3" r="0.5" fill="currentColor"><animate attributeName="opacity" values="0.5;1;0.5" dur="1s" repeatCount="indefinite" /></circle>
        </svg>
      );
    case "Glitrer":
      return (
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z">
            <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
          </path>
          <path d="M15 10l0.7 2 2 0.7-2 0.7-0.7 2-0.7-2-2-0.7 2-0.7z" opacity="0.6">
            <animate attributeName="opacity" values="0.6;1;0.3;0.6" dur="0.9s" repeatCount="indefinite" />
          </path>
          <path d="M5 12l0.5 1.5 1.5 0.5-1.5 0.5-0.5 1.5-0.5-1.5-1.5-0.5 1.5-0.5z" opacity="0.4">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
          </path>
        </svg>
      );
    case "Forhekser":
      return (
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1">
          <circle cx="10" cy="10" r="7" strokeDasharray="4 3">
            <animateTransform attributeName="transform" type="rotate" values="0 10 10;360 10 10" dur="4s" repeatCount="indefinite" />
          </circle>
          <circle cx="10" cy="10" r="3" strokeDasharray="2 2">
            <animateTransform attributeName="transform" type="rotate" values="360 10 10;0 10 10" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="10" cy="10" r="1" fill="currentColor"><animate attributeName="r" values="1;1.5;1" dur="1.5s" repeatCount="indefinite" /></circle>
        </svg>
      );
    case "Hokus Pokus":
      return (
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 16h8M7 16l1-8h4l1 8" strokeLinecap="round" />
          <ellipse cx="10" cy="8" rx="4" ry="1" />
          <path d="M9 7c0-2-1-4-1-5M11 7c0-2 1-4 1-5" strokeLinecap="round">
            <animate attributeName="d" values="M9 7c0-2-1-4-1-5M11 7c0-2 1-4 1-5;M9 7c0-2-2-3-2-5M11 7c0-2 2-3 2-5;M9 7c0-2-1-4-1-5M11 7c0-2 1-4 1-5" dur="2s" repeatCount="indefinite" />
          </path>
        </svg>
      );
    case "Alakazam":
      return (
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M11 2L6 10h4l-1 8 7-10h-4l2-6z">
            <animate attributeName="opacity" values="1;0.5;1;0.7;1" dur="0.8s" repeatCount="indefinite" />
          </path>
        </svg>
      );
    default:
      return null;
  }
}

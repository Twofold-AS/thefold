"use client";

import { T } from "@/lib/tokens";

interface AegisSpinnerProps {
  size?: number;
  color?: string;
  speed?: number; // seconds per rotation
}

/**
 * Aegishjalmur (Helm of Awe) — Norse protection symbol.
 * 8 trident-staves radiating from center, rotating slowly.
 * No glow, clean stroke-only rendering.
 */
export default function AegisSpinner({
  size = 28,
  color = T.accent,
  speed = 6,
}: AegisSpinnerProps) {
  return (
    <>
      <style>{`
        @keyframes aegisRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation: `aegisRotate ${speed}s linear infinite`,
          flexShrink: 0,
        }}
      >
        {/* 8 staves radiating from center — simplified Aegishjalmur */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 50 50)`}>
            {/* Main stave line */}
            <line x1="50" y1="50" x2="50" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            {/* Trident fork left */}
            <line x1="50" y1="22" x2="42" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
            {/* Trident fork right */}
            <line x1="50" y1="22" x2="58" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
            {/* Cross-bar */}
            <line x1="46" y1="32" x2="54" y2="32" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          </g>
        ))}
        {/* Center circle */}
        <circle cx="50" cy="50" r="5" stroke={color} strokeWidth="2" fill="none" />
      </svg>
    </>
  );
}

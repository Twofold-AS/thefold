"use client";

import { T } from "@/lib/tokens";

interface MagicSpinnerProps {
  size?: number;
  color?: string;
  speed?: number;
  /** "wand" for CoWork, "broom" for Auto */
  variant?: "wand" | "broom";
}

/**
 * Magic spinner — a wand or broom orbiting with sparkle trail.
 * Replaces AegisSpinner (Norse) with a magical theme.
 */
export default function MagicSpinner({
  size = 28,
  color = T.accent,
  speed = 2.5,
  variant = "wand",
}: MagicSpinnerProps) {
  const id = `magic-${variant}-${size}`;

  return (
    <>
      <style>{`
        @keyframes magicOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes magicPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.9; }
        }
        @keyframes sparkleFlicker {
          0%, 100% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        style={{
          width: size,
          height: size,
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Orbit ring — faint dashed circle */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <circle
            cx="50" cy="50" r="40"
            stroke={color}
            strokeWidth="1"
            strokeDasharray="6 4"
            opacity="0.2"
          />
        </svg>

        {/* Orbiting icon */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            animation: `magicOrbit ${speed}s linear infinite`,
          }}
        >
          <g transform="translate(50, 10)">
            {variant === "wand" ? (
              /* Wand — small diagonal stick with star tip */
              <g transform="translate(-8, -8) scale(0.7)">
                <line x1="2" y1="22" x2="18" y2="6" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <path d="M19 2l.6 1.8L21.5 4.5l-1.8.6L19 7l-.6-1.8L16.5 4.5l1.8-.6L19 2z" fill={color} />
              </g>
            ) : (
              /* Broom — small flying broom */
              <g transform="translate(-8, -8) scale(0.7)">
                <line x1="4" y1="4" x2="16" y2="16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <path d="M16 16c1 1.5 2 3 1 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 16c1.5 1 3 2 4 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 16c1.8 .5 3.5 1 4.5 2.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )}
          </g>
        </svg>

        {/* Sparkle trail — 3 sparkles at different orbit positions */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            animation: `magicOrbit ${speed}s linear infinite`,
          }}
        >
          {/* Trailing sparkles behind the icon */}
          <circle cx="32" cy="16" r="2" fill={color} style={{ animation: `sparkleFlicker ${speed * 0.4}s ease-in-out infinite` }} />
          <circle cx="18" cy="28" r="1.5" fill={color} style={{ animation: `sparkleFlicker ${speed * 0.4}s ease-in-out infinite 0.2s` }} />
          <circle cx="14" cy="45" r="1" fill={color} style={{ animation: `sparkleFlicker ${speed * 0.4}s ease-in-out infinite 0.4s` }} />
        </svg>

        {/* Center glow dot */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <circle
            cx="50" cy="50" r="3"
            fill={color}
            style={{ animation: `magicPulse ${speed * 0.6}s ease-in-out infinite` }}
          />
        </svg>
      </div>
    </>
  );
}

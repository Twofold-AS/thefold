"use client";

/**
 * Auto icon — flying broomstick with motion lines.
 * Represents autonomous execution / things running on their own.
 */
export default function MuninnIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Broom handle — diagonal */}
      <line x1="5" y1="5" x2="16" y2="16" strokeWidth="1.8" />
      {/* Bristles — splayed at bottom */}
      <path d="M16 16c1 1.5 2 3 1 4" />
      <path d="M16 16c1.5 1 3 2 4 1" />
      <path d="M16 16c1.8 0.5 3.5 1 4.5 2.5" />
      <path d="M16 16c0.5 1.8 1 3.5 2.5 4.5" />
      {/* Motion lines — speed streaks */}
      <line x1="2" y1="9" x2="6" y2="9" strokeWidth="1.2" opacity="0.5" />
      <line x1="3" y1="12" x2="7" y2="12" strokeWidth="1.2" opacity="0.4" />
      <line x1="1" y1="6" x2="4" y2="6" strokeWidth="1.2" opacity="0.3" />
    </svg>
  );
}

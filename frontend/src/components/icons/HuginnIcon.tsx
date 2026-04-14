"use client";

/**
 * CoWork icon — magic wand with sparkles.
 * Represents collaborative magic / co-creation.
 */
export default function HuginnIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
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
      {/* Wand body — diagonal */}
      <line x1="4" y1="20" x2="15" y2="9" strokeWidth="1.8" />
      {/* Wand tip star */}
      <path d="M17 3l.8 2.2L20 6l-2.2.8L17 9l-.8-2.2L14 6l2.2-.8L17 3z" fill={color} stroke="none" />
      {/* Small sparkle */}
      <path d="M10 2l.4 1.1L11.5 3.5l-1.1.4L10 5l-.4-1.1L8.5 3.5l1.1-.4L10 2z" fill={color} stroke="none" opacity="0.6" />
      {/* Tiny sparkle */}
      <circle cx="20" cy="11" r="0.8" fill={color} opacity="0.5" />
    </svg>
  );
}

import { T } from "@/lib/tokens";

interface RobotIconProps {
  size?: number;
  color?: string;
}

/**
 * AI avatar icon — crystal ball with inner glow.
 * Magical oracle representing AI responses.
 */
export default function RobotIcon({ size = 16, color }: RobotIconProps) {
  const c = color || T.textSec;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Crystal ball */}
      <circle cx="12" cy="11" r="7" />
      {/* Inner shimmer */}
      <path d="M9 8.5c1-1.5 3-2 4.5-1" strokeWidth="1.2" opacity="0.5" />
      {/* Stand base */}
      <path d="M8 18h8" strokeWidth="1.8" />
      {/* Stand neck */}
      <path d="M10 18v-1.5c0-.8.9-1.5 2-1.5s2 .7 2 1.5V18" />
      {/* Tiny sparkle on top */}
      <circle cx="15" cy="6" r="0.7" fill={c} stroke="none" opacity="0.6" />
    </svg>
  );
}

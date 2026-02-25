import { T } from "@/lib/tokens";

interface RobotIconProps {
  size?: number;
  color?: string;
}

export default function RobotIcon({ size = 16, color }: RobotIconProps) {
  const c = color || T.textSec;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <circle cx="12" cy="2" r="1" fill={c} stroke="none" />
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <circle cx="9" cy="12" r="1.5" fill={c} stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill={c} stroke="none" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );
}

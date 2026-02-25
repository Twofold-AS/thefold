import { T } from "@/lib/tokens";

interface CheckIconProps {
  color?: string;
  size?: number;
}

export default function CheckIcon({ color, size = 12 }: CheckIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke={color || T.textMuted}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

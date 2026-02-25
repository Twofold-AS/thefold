import { T } from "@/lib/tokens";

interface TagProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "error" | "brand" | "info";
}

const variantMap = {
  default: { bg: T.subtle, c: T.textSec, bc: T.border },
  accent: { bg: T.accentDim, c: T.accent, bc: "rgba(99,102,241,0.3)" },
  success: { bg: "rgba(52,211,153,0.1)", c: T.success, bc: "rgba(52,211,153,0.25)" },
  error: { bg: "rgba(239,68,68,0.1)", c: T.error, bc: "rgba(239,68,68,0.25)" },
  brand: { bg: "rgba(99,102,241,0.12)", c: T.brandLight, bc: "rgba(165,180,252,0.25)" },
  info: { bg: "rgba(99,102,241,0.1)", c: "#A5B4FC", bc: "rgba(99,102,241,0.25)" },
};

export default function Tag({ children, variant = "default" }: TagProps) {
  const p = variantMap[variant] || variantMap.default;
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: T.mono,
        background: p.bg,
        color: p.c,
        border: `1px solid ${p.bc}`,
        borderRadius: 10,
      }}
    >
      {children}
    </span>
  );
}

import { T } from "@/lib/tokens";

interface SectionLabelProps {
  children: React.ReactNode;
}

export default function SectionLabel({ children }: SectionLabelProps) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: T.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 12,
        fontFamily: T.mono,
      }}
    >
      {children}
    </div>
  );
}

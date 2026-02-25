import { T } from "@/lib/tokens";

interface GridRowProps {
  children: React.ReactNode;
  mb?: number;
}

const SP = (1636 - 1232) / 2;

export function GR({ children, mb }: GridRowProps) {
  return (
    <div style={{ position: "relative", marginBottom: mb || 0 }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: -SP,
          width: SP,
          height: 1,
          background: T.border,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: -SP,
          width: SP,
          height: 1,
          background: T.border,
        }}
      />
      {children}
    </div>
  );
}

export function FGR({ children, mb }: GridRowProps) {
  return <div style={{ position: "relative", marginBottom: mb || 0 }}>{children}</div>;
}

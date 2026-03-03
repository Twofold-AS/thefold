interface GridRowProps {
  children: React.ReactNode;
  mb?: number;
}

export function GR({ children, mb }: GridRowProps) {
  return <div style={{ marginBottom: mb || 0 }}>{children}</div>;
}

export function FGR({ children, mb }: GridRowProps) {
  return <div style={{ marginBottom: mb || 0 }}>{children}</div>;
}

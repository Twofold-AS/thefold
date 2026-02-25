"use client";
import { T } from "@/lib/tokens";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  rows?: number;
  style?: React.CSSProperties;
}

export default function Skeleton({ width = "100%", height = 14, rows = 1, style }: SkeletonProps) {
  const shimmer: React.CSSProperties = {
    background: `linear-gradient(90deg, ${T.subtle} 25%, ${T.surface} 50%, ${T.subtle} 75%)`,
    backgroundSize: "200% 100%",
    animation: "shimmerMove 1.5s ease-in-out infinite",
    borderRadius: 4,
  };
  if (rows > 1) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ ...shimmer, width: i === rows - 1 ? "60%" : width, height }} />
        ))}
      </div>
    );
  }
  return <div style={{ ...shimmer, width, height, ...style }} />;
}

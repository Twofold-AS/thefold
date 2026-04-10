"use client";

import { T } from "@/lib/tokens";

interface LoadingSkeletonProps {
  rows?: number;
  height?: number;
  gap?: number;
}

export default function LoadingSkeleton({ rows = 3, height = 20, gap = 10 }: LoadingSkeletonProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            borderRadius: 4,
            background: `linear-gradient(90deg, ${T.subtle} 0%, ${T.surface} 50%, ${T.subtle} 100%)`,
            backgroundSize: "200% 100%",
            animation: "shimmerMove 1.5s linear infinite",
            opacity: 1 - i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

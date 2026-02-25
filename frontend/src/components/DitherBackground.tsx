"use client";

import dynamic from "next/dynamic";
import { T } from "@/lib/tokens";

const Dither = dynamic(() => import("./Dither"), { ssr: false });

interface DitherBackgroundProps {
  children: React.ReactNode;
}

export default function DitherBackground({ children }: DitherBackgroundProps) {
  return (
    <div style={{ position: "relative", width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Dither canvas — absolutt posisjonert bak innholdet */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <Dither
          waveColor={[0.39, 0.4, 0.95]}
          waveSpeed={0.03}
          waveFrequency={3}
          waveAmplitude={0.3}
          colorNum={4}
          pixelSize={2}
          disableAnimation={false}
          enableMouseInteraction={false}
          mouseRadius={0.3}
        />
      </div>
      {/* Gradient overlay — gjor tekst lesbart */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: `radial-gradient(ellipse at center 40%, transparent 0%, ${T.bg}ee 60%, ${T.bg} 80%)`,
          pointerEvents: "none",
        }}
      />
      {/* Innhold over dither */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

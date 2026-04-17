"use client";
import ColorBends from "./ColorBends";
import DotField from "./DotField";

export default function GlobalBackground() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
      }}
    >
      {/* WebGL shader layer */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ColorBends
          colors={["#A855F7", "#7C3AED", "#1E0B3A"]}
          rotation={90}
          speed={0.15}
          scale={1}
          frequency={1}
          warpStrength={1}
          mouseInfluence={0.5}
          noise={0.08}
          parallax={0.3}
          iterations={1}
          intensity={1.2}
          bandWidth={6}
          transparent={false}
          autoRotate={0}
        />
      </div>
      {/* Interactive dot overlay */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "screen" }}>
        <DotField
          dotRadius={1.5}
          dotSpacing={14}
          bulgeStrength={67}
          glowRadius={160}
          sparkle={false}
          waveAmplitude={0}
          cursorRadius={500}
          cursorForce={0.1}
          bulgeOnly
          gradientFrom="#A855F7"
          gradientTo="#B497CF"
          glowColor="#120F17"
        />
      </div>
    </div>
  );
}

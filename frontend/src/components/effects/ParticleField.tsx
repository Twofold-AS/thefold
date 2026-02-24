"use client";

import { useMemo } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: "sm" | "md" | "lg";
  duration: number;
  delay: number;
}

interface ParticleFieldProps {
  count?: number;
  className?: string;
  color?: string;
}

/**
 * Firecrawl-style floating particle field.
 * CSS-only animation — no JS runtime cost.
 * Renders absolute-positioned dots that float upward with varying speeds.
 */
export function ParticleField({ count = 20, className = "", color }: ParticleFieldProps) {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: 60 + Math.random() * 40,
      size: (["sm", "md", "lg"] as const)[Math.floor(Math.random() * 3)],
      duration: 3 + Math.random() * 5,
      delay: Math.random() * 6,
    }));
  }, [count]);

  return (
    <div className={`ember-field ${className}`}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="ember"
          style={{
            left: `${p.x}%`,
            bottom: `${p.y}%`,
            width: p.size === "sm" ? "1.5px" : p.size === "md" ? "2.5px" : "4px",
            height: p.size === "sm" ? "1.5px" : p.size === "md" ? "2.5px" : "4px",
            opacity: p.size === "lg" ? 0.2 : p.size === "md" ? 0.4 : 0.6,
            background: color || "var(--tf-heat)",
            filter: p.size === "lg" ? "blur(1px)" : "none",
            ["--duration" as string]: `${p.duration}s`,
            ["--delay" as string]: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Ember glow effect — subtle background radial from the center/top.
 */
export function EmberGlow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        background: "radial-gradient(ellipse at 50% 0%, rgba(255, 107, 44, 0.06) 0%, transparent 60%)",
      }}
    />
  );
}

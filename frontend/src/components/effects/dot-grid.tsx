"use client";

import { useEffect, useRef } from "react";

interface DotGridProps {
  className?: string;
  dotColor?: string;
  dotSize?: number;
  spacing?: number;
  opacity?: number;
  animated?: boolean;
}

export function DotGrid({
  className = "",
  dotColor = "rgba(53, 88, 114, 0.4)",
  dotSize = 1.2,
  spacing = 24,
  opacity = 0.5,
  animated = true,
}: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      w = rect.width;
      h = rect.height;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener("resize", resize);

    const cols = Math.ceil(w / spacing) + 1;
    const rows = Math.ceil(h / spacing) + 1;

    // Each dot gets a random twinkle phase
    const phases: number[] = [];
    for (let i = 0; i < cols * rows; i++) {
      phases.push(Math.random() * Math.PI * 2);
    }

    let time = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      time += 0.01;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * spacing;
          const y = row * spacing;
          const idx = row * cols + col;

          let dotOpacity = opacity;
          if (animated) {
            dotOpacity = opacity * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.8 + phases[idx])));
          }

          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fillStyle = dotColor.replace(/[\d.]+\)$/, `${dotOpacity})`);
          ctx.fill();
        }
      }

      if (animated) {
        frameRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [dotColor, dotSize, spacing, opacity, animated]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
      }}
    />
  );
}

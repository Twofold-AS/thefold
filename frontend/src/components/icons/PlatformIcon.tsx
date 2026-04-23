"use client";

import { Github } from "lucide-react";
import type { TFProjectType } from "@/lib/api";

interface PlatformIconProps {
  type: TFProjectType;
  size?: number;
  className?: string;
  /** Override default white color. */
  color?: string;
}

// Fase I.0.d — Platform-ikon pr. prosjekt i sidebaren.
// code → GitHub, framer → Framer-logo, figma → Figma-logo, framer_figma → begge.
// Default color is white (#FFFFFF) — overridable via `color` prop.
export default function PlatformIcon({ type, size = 14, className, color = "#FFFFFF" }: PlatformIconProps) {
  if (type === "code") {
    return <Github size={size} color={color} className={className} />;
  }
  if (type === "framer") {
    return <FramerLogo size={size} color={color} className={className} />;
  }
  if (type === "figma") {
    return <FigmaLogo size={size} color={color} className={className} />;
  }
  // framer_figma
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }} className={className}>
      <FramerLogo size={size} color={color} />
      <FigmaLogo size={size} color={color} />
    </span>
  );
}

function FramerLogo({ size = 14, color = "#FFFFFF", className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-label="Framer">
      <path d="M4 0h16v8h-8zM4 8h8l8 8H4zM4 16h8v8z" />
    </svg>
  );
}

function FigmaLogo({ size = 14, color = "#FFFFFF", className }: { size?: number; color?: string; className?: string }) {
  // Monochrome (white) variant — drop multi-color brand palette for consistency
  // with sidebar "all icons white" direction (2026-04-22).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-label="Figma">
      <circle cx="15.5" cy="12" r="3.5" />
      <path d="M5 19.5a3.5 3.5 0 0 1 3.5-3.5H12v3.5a3.5 3.5 0 1 1-7 0z" />
      <path d="M12 1h3.5a3.5 3.5 0 1 1 0 7H12V1z" />
      <path d="M8.5 1H12v7H8.5a3.5 3.5 0 1 1 0-7z" />
      <path d="M8.5 8H12v7H8.5a3.5 3.5 0 1 1 0-7z" />
    </svg>
  );
}

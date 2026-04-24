"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Pending / waiting-state overlay. Renders children as-is, and when `active`
 * is true, layers a subtle blue gradient sweep on top to signal "the system
 * is waiting for an external event to finish" (review approval, long AI
 * call, stalled sub-agent, etc.).
 *
 * The animation uses the global `shimmerMove` keyframe defined in
 * `app/globals.css`. The overlay is pointer-events:none so clicks still
 * reach underlying content.
 *
 * Do NOT use this for ambient "thinking" states on compact UI
 * (phase-labels, short text runs) — it was too distracting there. Reserve
 * it for larger containers whose state is genuinely blocked on an external
 * signal.
 */
export interface ShimmerOverlayProps {
  /** When true, the shimmer overlay is visible + animating. */
  active: boolean;
  /** Optional className to forward to the wrapper. */
  className?: string;
  /** Optional inline styles merged into the wrapper. */
  style?: CSSProperties;
  /**
   * Border-radius for the overlay. Defaults to "inherit" so the shimmer
   * follows the wrapped element's rounding. Pass 0 for flat/square.
   */
  radius?: CSSProperties["borderRadius"];
  /**
   * Tint color for the gradient. Defaults to indigo (rgb 99,102,241).
   * Accepts any CSS color expression — use "rgba(...)" for transparency.
   */
  tint?: string;
  /** Animation cycle length. Default 2s. */
  speed?: string;
  children: ReactNode;
}

export default function ShimmerOverlay({
  active,
  className,
  style,
  radius = "inherit",
  tint = "rgba(99,102,241,0.18)",
  speed = "2s",
  children,
}: ShimmerOverlayProps) {
  const wrapperStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    ...style,
  };

  return (
    <div className={className} style={wrapperStyle}>
      {children}
      {active && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            borderRadius: radius,
            background: `linear-gradient(90deg, transparent 0%, ${tint} 50%, transparent 100%)`,
            backgroundSize: "200% 100%",
            animation: `shimmerMove ${speed} linear infinite`,
          }}
        />
      )}
    </div>
  );
}

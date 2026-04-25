"use client";

// AgentAvatar — triple-ring pulsing spinner.
// Three concentric stroke-rings rotate at different speeds (outer slowest,
// inner fastest) while the dash-offset breathes on each, giving the
// "pulserende" look the user asked for. Pure SVG + inline keyframes so
// multiple avatars share one animation timeline via CSS.
//
// Color: `#0B1D3A` (darkest stop from the ColorBends background gradient).
// Override via the `color` prop when contrast against the backdrop is too
// low (e.g. dark sidebar — pass "#aecbfa" to match the old shimmer tone).

export type AgentAvatarState = "idle" | "working" | "error";

interface AgentAvatarProps {
  size?: number;
  state?: AgentAvatarState;
  /** Override the ring color. Defaults to #0B1D3A (darkest gradient stop). */
  color?: string;
}

export default function AgentAvatar({
  size = 28,
  state = "idle",
  color = "#0B1D3A",
}: AgentAvatarProps) {
  const resolvedColor = state === "error" ? "#ef4444" : color;
  // When working the rings spin + breathe. When idle they sit still but
  // keep the breathing pulse so the mark never looks dead.
  const animating = state !== "idle";

  return (
    <div
      role="img"
      aria-label={
        state === "working" ? "Agent tenker" : state === "error" ? "Agent-feil" : "Agent"
      }
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        color: resolvedColor,
      }}
    >
      <style>{`
        @keyframes tf-ring-outer { to { transform: rotate(360deg); } }
        @keyframes tf-ring-mid { to { transform: rotate(-360deg); } }
        @keyframes tf-ring-inner { to { transform: rotate(360deg); } }
        @keyframes tf-ring-breath-outer {
          0%, 100% { stroke-dashoffset: 0; opacity: 0.9; }
          50% { stroke-dashoffset: 40; opacity: 0.55; }
        }
        @keyframes tf-ring-breath-mid {
          0%, 100% { stroke-dashoffset: 0; opacity: 0.75; }
          50% { stroke-dashoffset: -30; opacity: 1; }
        }
        @keyframes tf-ring-breath-inner {
          0%, 100% { stroke-dashoffset: 0; opacity: 0.95; }
          50% { stroke-dashoffset: 20; opacity: 0.7; }
        }
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 44 44"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        stroke="currentColor"
      >
        {/* Outer ring — slowest rotation, widest gap */}
        <g
          style={{
            transformOrigin: "22px 22px",
            animation: animating ? "tf-ring-outer 3.6s linear infinite" : undefined,
          }}
        >
          <circle
            cx="22"
            cy="22"
            r="19"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="45 75"
            style={{
              animation: "tf-ring-breath-outer 2.8s ease-in-out infinite",
            }}
          />
        </g>
        {/* Middle ring — counter-rotates for visual layering */}
        <g
          style={{
            transformOrigin: "22px 22px",
            animation: animating ? "tf-ring-mid 2.4s linear infinite" : undefined,
          }}
        >
          <circle
            cx="22"
            cy="22"
            r="13"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="35 50"
            style={{
              animation: "tf-ring-breath-mid 2.2s ease-in-out infinite",
            }}
          />
        </g>
        {/* Inner ring — fastest, tightest arc */}
        <g
          style={{
            transformOrigin: "22px 22px",
            animation: animating ? "tf-ring-inner 1.6s linear infinite" : undefined,
          }}
        >
          <circle
            cx="22"
            cy="22"
            r="7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="18 26"
            style={{
              animation: "tf-ring-breath-inner 1.6s ease-in-out infinite",
            }}
          />
        </g>
      </svg>
    </div>
  );
}

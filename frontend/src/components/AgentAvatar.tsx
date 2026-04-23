"use client";

// AgentAvatar — 3×3 grid of dots that slide through a 4s choreography.
// The animation runs continuously (it's a decorative brand mark); the
// "error" state adds a red tint + pulse over the dot motion.
// Keyframes live in globals.css as .tf-agent-dot + @keyframes tf-moveDot-1..9,
// so multiple avatars share one animation timeline.

export type AgentAvatarState = "idle" | "working" | "error";

interface AgentAvatarProps {
  size?: number;
  state?: AgentAvatarState;
  /** Override the dot color. Defaults to #aecbfa (light-blue shimmer tone). */
  color?: string;
}

export default function AgentAvatar({
  size = 28,
  state = "idle",
  color,
}: AgentAvatarProps) {
  const wrapClass = state === "error" ? "tf-agent-error" : "";
  // Default to the light-blue shimmer tone from SquigglyDivider (#aecbfa)
  // so the loading indicator reads as part of the app's blue shimmer palette.
  const resolvedColor = state === "error" ? undefined : (color ?? "#aecbfa");

  return (
    <div
      role="img"
      aria-label={state === "working" ? "Agent tenker" : state === "error" ? "Agent-feil" : "Agent"}
      className={wrapClass}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        color: resolvedColor,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="-13 -13 45 45"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 9 dots — duplicates at (13,1) and (13,13) are intentional; animations reference them by nth-child. */}
        <circle className="tf-agent-dot" cx="13" cy="1" r="5" />
        <circle className="tf-agent-dot" cx="13" cy="1" r="5" />
        <circle className="tf-agent-dot" cx="25" cy="25" r="5" />
        <circle className="tf-agent-dot" cx="13" cy="13" r="5" />
        <circle className="tf-agent-dot" cx="13" cy="13" r="5" />
        <circle className="tf-agent-dot" cx="25" cy="13" r="5" />
        <circle className="tf-agent-dot" cx="1" cy="25" r="5" />
        <circle className="tf-agent-dot" cx="13" cy="25" r="5" />
        <circle className="tf-agent-dot" cx="25" cy="25" r="5" />
      </svg>
    </div>
  );
}

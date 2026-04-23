"use client";

// SquigglyDivider — static wavy path with an optional travelling shimmer.
//
//   mode="animated": gradient range glides left→right continuously (via
//     <animate> on x1/x2 of the linearGradient). Used where the divider
//     should feel alive — e.g. ModeIndicator underline.
//
//   mode="static":  no motion. The same shimmer gradient covers the full
//     path statically, and the whole svg is rendered at low opacity so the
//     line reads as a subtle separator — used in the sidebar.

import React from "react";

type SquigglyMode = "animated" | "static";

interface SquigglyDividerProps {
  /** Rendered width of the <svg>. Default 100% (fills parent). */
  width?: number | string;
  /** Rendered height of the <svg>. Default 20. */
  height?: number;
  /** Shimmer travel duration (only used when mode="animated"). Default 6s. */
  duration?: string;
  /** Animation mode. Default "animated". */
  mode?: SquigglyMode;
}

export default function SquigglyDivider({
  width = "100%",
  height = 20,
  duration = "6s",
  mode = "animated",
}: SquigglyDividerProps) {
  const id = React.useId();
  const gradId = `tf-wave-${id.replace(/:/g, "")}`;
  const isStatic = mode === "static";

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 400 20"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "block",
        overflow: "visible",
        opacity: isStatic ? 0.45 : 1,
      }}
    >
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={isStatic ? "0" : "-400"}
          y1="0"
          x2={isStatic ? "400" : "0"}
          y2="0"
        >
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0" />
          <stop offset="50%" stopColor="#aecbfa" stopOpacity="1" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          {!isStatic && (
            <>
              <animate
                attributeName="x1"
                values="-400;400"
                dur={duration}
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                values="0;800"
                dur={duration}
                repeatCount="indefinite"
              />
            </>
          )}
        </linearGradient>
      </defs>
      {/* ~40 quadratic waves. Amplitude ≈ ±8. */}
      <path
        d="M0,10 Q5,2 10,10 T20,10 T30,10 T40,10 T50,10 T60,10 T70,10 T80,10 T90,10 T100,10 T110,10 T120,10 T130,10 T140,10 T150,10 T160,10 T170,10 T180,10 T190,10 T200,10 T210,10 T220,10 T230,10 T240,10 T250,10 T260,10 T270,10 T280,10 T290,10 T300,10 T310,10 T320,10 T330,10 T340,10 T350,10 T360,10 T370,10 T380,10 T390,10 T400,10"
        stroke={`url(#${gradId})`}
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

import type React from "react";

// ─── Stitch-inspired dark theme ───
// #f1f3f4 on #202124: ~15.4:1 ✓ AAA
// #9aa0a6 on #202124: ~6.3:1 ✓ AA+
// #80868b on #202124: ~4.6:1 ✓ AA
// #8ab4f8 on #202124: ~7.5:1 ✓ AAA

export const T = {
  bg: "#202124",
  sidebar: "#1b1c1e",
  tabWrapper: "#171919",
  tabActive: "#3c4043",
  search: "#2a2c2d",
  raised: "transparent",
  surface: "#373840",
  subtle: "rgba(255,255,255,0.04)",
  border: "#3c4043",
  borderHover: "#5f6368",
  text: "#f1f3f4",
  textSec: "#9aa0a6",
  textMuted: "#8e9298",
  textFaint: "#5f6368",
  accent: "#8ab4f8",
  accentDim: "rgba(138,180,248,0.08)",
  accentHover: "#669df6",
  brand: "#8ab4f8",
  brandLight: "#aecbfa",
  success: "#81c995",
  warning: "#fdd663",
  error: "#f28b82",
  suggestion: "#2d3032",
  chatbox: "#373840",
  popup: "#373840",

  successA0: "#1a5c38",
  successA10: "#81c995",
  successA20: "#a8dab5",
  warningA0: "#7a5a1e",
  warningA10: "#fdd663",
  warningA20: "#fde293",
  dangerA0: "#7a2020",
  dangerA10: "#f28b82",
  dangerA20: "#f6aca6",
  infoA0: "#1a3a6a",
  infoA10: "#8ab4f8",
  infoA20: "#aecbfa",

  mono: "'Google Sans', ui-monospace, monospace",
  sans: "'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  brandFont: "'Google Sans', -apple-system, sans-serif",
  r: 12,
  rLg: 16,
  rSm: 8,
} as const;

export const S = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const F = {
  hero: { size: 36, weight: 400, lineHeight: 1.2 },
  h1: { size: 24, weight: 600, lineHeight: 1.2 },
  h2: { size: 18, weight: 500, lineHeight: 1.3 },
  h3: { size: 15, weight: 500, lineHeight: 1.4 },
  body: { size: 14, weight: 400, lineHeight: 1.5 },
  small: { size: 12, weight: 400, lineHeight: 1.5 },
  mono: { size: 13, weight: 400, lineHeight: 1.5, family: T.mono },
} as const;

export function font(key: keyof typeof F): React.CSSProperties {
  const f = F[key];
  return {
    fontSize: f.size,
    fontWeight: f.weight,
    lineHeight: f.lineHeight,
    fontFamily: "family" in f ? (f as { family: string }).family : T.sans,
  };
}

export const Layout = {
  sidebarWidth: 340,
  sidebarCollapsed: 0,
  topbarHeight: 56,
} as const;

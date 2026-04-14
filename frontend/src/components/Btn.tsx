"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface BtnProps {
  children: React.ReactNode;
  /** @deprecated Use variant="primary" instead */
  primary?: boolean;
  /** @deprecated Use size="sm" instead */
  sm?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const Spinner = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "spin 0.8s linear infinite" }}>
    <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="24" strokeDashoffset="8" />
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
  </svg>
);

export default function Btn({
  children,
  primary,
  sm,
  variant: variantProp,
  size: sizeProp,
  loading,
  disabled: disabledProp,
  icon,
  fullWidth,
  onClick,
  style: sx,
}: BtnProps) {
  const [h, setH] = useState(false);

  // Backwards-compatible: map old props to new system
  const variant = variantProp ?? (primary ? "primary" : "secondary");
  const size = sizeProp ?? (sm ? "sm" : "md");
  const disabled = disabledProp || loading;

  const padding = { sm: "5px 12px", md: "8px 18px", lg: "12px 24px" }[size];
  const fontSize = { sm: 12, md: 13, lg: 14 }[size];

  const bgColor = (() => {
    if (disabled) return T.subtle;
    switch (variant) {
      case "primary": return h ? "#818CF8" : T.accent;
      case "danger": return h ? "#DC2626" : T.error;
      case "ghost": return h ? T.subtle : "transparent";
      default: return h ? T.subtle : "transparent";
    }
  })();

  const textColor = (() => {
    if (disabled) return T.textFaint;
    switch (variant) {
      case "primary": return "#fff";
      case "danger": return "#fff";
      default: return T.text;
    }
  })();

  const borderColor = (() => {
    if (variant === "primary" && !disabled) return "transparent";
    if (variant === "danger" && !disabled) return "transparent";
    if (variant === "ghost") return "transparent";
    return T.border;
  })();

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => { if (!disabled) setH(true); }}
      onMouseLeave={() => setH(false)}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding,
        fontSize,
        fontFamily: T.sans,
        fontWeight: variant === "primary" || variant === "danger" ? 600 : 500,
        background: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s",
        outline: "none",
        borderRadius: T.r,
        width: fullWidth ? "100%" : undefined,
        ...sx,
      }}
    >
      {loading ? <Spinner /> : icon ? icon : null}
      {children}
    </button>
  );
}

"use client";

import { T } from "@/lib/tokens";

export default function PixelCorners() {
  const c = T.border;
  const a: React.CSSProperties = { position: "absolute", background: c, zIndex: 2, pointerEvents: "none" };
  return (
    <>
      {/* top-left */}
      <div style={{ ...a, top: 0, left: 0, width: 5, height: 1 }} />
      <div style={{ ...a, top: 1, left: 0, width: 3, height: 1 }} />
      <div style={{ ...a, top: 2, left: 0, width: 1, height: 1 }} />
      <div style={{ ...a, top: 0, left: 0, width: 1, height: 5 }} />
      <div style={{ ...a, top: 0, left: 1, width: 1, height: 3 }} />
      <div style={{ ...a, top: 0, left: 2, width: 1, height: 1 }} />
      <div style={{ ...a, top: 2, left: 2, width: 1, height: 1 }} />
      {/* top-right */}
      <div style={{ ...a, top: 0, right: 0, width: 5, height: 1 }} />
      <div style={{ ...a, top: 1, right: 0, width: 2, height: 1 }} />
      <div style={{ ...a, top: 0, right: 0, width: 1, height: 5 }} />
      <div style={{ ...a, top: 0, right: 1, width: 1, height: 3 }} />
      {/* bottom-left */}
      <div style={{ ...a, bottom: 0, left: 0, width: 5, height: 1 }} />
      <div style={{ ...a, bottom: 1, left: 0, width: 2, height: 1 }} />
      <div style={{ ...a, bottom: 0, left: 0, width: 1, height: 5 }} />
      <div style={{ ...a, bottom: 0, left: 1, width: 1, height: 3 }} />
      {/* bottom-right */}
      <div style={{ ...a, bottom: 0, right: 0, width: 5, height: 1 }} />
      <div style={{ ...a, bottom: 1, right: 0, width: 3, height: 1 }} />
      <div style={{ ...a, bottom: 0, right: 0, width: 1, height: 5 }} />
      <div style={{ ...a, bottom: 0, right: 1, width: 1, height: 3 }} />
    </>
  );
}

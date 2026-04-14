"use client";

import { T } from "@/lib/tokens";
import { Check } from "lucide-react";

export interface StitchPopupItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  selected?: boolean;
}

interface StitchPopupProps {
  items: StitchPopupItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export default function StitchPopup({ items, onSelect, onClose, style }: StitchPopupProps) {
  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 98 }}
        onClick={onClose}
      />
      <div
        style={{
          position: "absolute",
          background: T.popup,
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          zIndex: 99,
          minWidth: 260,
          maxHeight: 400,
          overflowY: "auto",
          padding: "6px 0",
          ...style,
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 16px",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.subtle)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {item.icon && (
              <div style={{ flexShrink: 0, marginTop: 2, color: T.textMuted }}>
                {item.icon}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: T.text,
                }}
              >
                {item.title}
              </div>
              {item.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: T.textMuted,
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {item.description}
                </div>
              )}
            </div>
            {item.selected && (
              <div style={{ flexShrink: 0, marginTop: 2, color: T.accent }}>
                <Check size={16} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

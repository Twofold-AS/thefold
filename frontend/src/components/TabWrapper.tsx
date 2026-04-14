"use client";

import { T } from "@/lib/tokens";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabWrapperProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * Stitch-style tab wrapper — same visual as CoWork/Auto tabs in sidebar.
 * Wrapper bg: #171919, active tab: #3c4043, rounded corners.
 */
export default function TabWrapper({ tabs, active, onChange }: TabWrapperProps) {
  return (
    <div
      style={{
        display: "flex",
        background: T.tabWrapper,
        borderRadius: 12,
        padding: 4,
        gap: 4,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: T.sans,
            color: active === tab.id ? T.text : T.textMuted,
            background: active === tab.id ? T.tabActive : "transparent",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          {tab.label}
          {tab.count != null && (
            <span style={{ marginLeft: 6, fontSize: 11, color: active === tab.id ? T.textSec : T.textFaint }}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { T } from "@/lib/tokens";

interface TabBarProps {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}

export default function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <Tabs value={active} onValueChange={onChange}>
      <TabsList
        style={{
          background: "transparent",
          borderBottom: `1px solid ${T.border}`,
          borderRadius: 0,
          padding: 0,
          height: "auto",
          gap: 0,
        }}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            style={{
              borderRadius: 0,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: active === tab.id ? 600 : 400,
              color: active === tab.id ? T.text : T.textMuted,
              background: "transparent",
              borderBottom: active === tab.id ? `2px solid ${T.accent}` : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 10,
                  fontFamily: T.mono,
                  color: active === tab.id ? T.accent : T.textFaint,
                  background: active === tab.id ? T.accentDim : T.subtle,
                  padding: "1px 6px",
                  borderRadius: 10,
                }}
              >
                {tab.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

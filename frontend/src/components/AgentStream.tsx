"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import CheckIcon from "@/components/icons/CheckIcon";

interface SubStep {
  x: string;
  d: boolean;
  a?: boolean;
}

interface Task {
  t: string;
  s: "active" | "done" | "pending";
  st: SubStep[];
}

const tasks: Task[] = [
  {
    t: "Lager ny nettside",
    s: "active",
    st: [
      { x: "Henter komponenter", d: true },
      { x: "Bygger layout", d: true },
      { x: "Skriver kode", d: false, a: true },
      { x: "Integrerer API", d: false },
    ],
  },
  {
    t: "Oppdaterer auth",
    s: "done",
    st: [
      { x: "Analyserer auth.ts", d: true },
      { x: "Refresh-token", d: true },
      { x: "Tester rotering", d: true },
    ],
  },
  {
    t: "Kjorer tester",
    s: "pending",
    st: [
      { x: "Unit tests", d: false },
      { x: "Integration tests", d: false },
    ],
  },
];

export default function AgentStream() {
  const [ex, setEx] = useState<Record<number, boolean>>({ 0: true, 1: false, 2: false });
  const tg = (i: number) => setEx((p) => ({ ...p, [i]: !p[i] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 500 }}>
      {tasks.map((task, ti) => (
        <div key={ti}>
          <div
            onClick={() => tg(ti)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {task.s === "pending" ? (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: T.textFaint,
                  }}
                />
              ) : (
                <CheckIcon
                  color={task.s === "done" ? T.textMuted : T.textFaint}
                  size={14}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                fontFamily: T.sans,
                position: "relative",
                overflow: "hidden",
                color:
                  task.s === "done"
                    ? T.textSec
                    : task.s === "active"
                      ? T.text
                      : T.textFaint,
              }}
            >
              {task.t}
              {task.s === "active" && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background:
                      "linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.18) 50%,transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmerMove 2s linear infinite",
                  }}
                />
              )}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{
                marginLeft: "auto",
                flexShrink: 0,
                transition: "transform 0.2s",
                transform: ex[ti] ? "rotate(0)" : "rotate(-90deg)",
              }}
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke={T.textFaint}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {ex[ti] && (
            <div
              style={{
                paddingLeft: 24,
                paddingBottom: 6,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {task.st.map((s, si) => (
                <div
                  key={si}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "3px 0",
                  }}
                >
                  {s.d ? (
                    <CheckIcon color={T.textMuted} size={12} />
                  ) : s.a ? (
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        border: `2px solid ${T.accent}`,
                        borderTopColor: "transparent",
                        animation: "spin 0.7s linear infinite",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: T.textFaint,
                        }}
                      />
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: T.sans,
                      color: s.d ? T.textMuted : s.a ? T.textSec : T.textFaint,
                    }}
                  >
                    {s.x}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import BellIcon from "@/components/icons/BellIcon";
import Tag from "@/components/Tag";

interface NotifBellProps {
  onGoTask?: (id: string) => void;
}

const alerts = [
  { id: "T-003", title: "Database migrasjon v12", status: "active", repo: "thefold-api" },
  { id: "T-005", title: "Legg til dark mode toggle", status: "pending", repo: "thefold-frontend" },
  { id: "T-004", title: "Oppdater README med nye endepunkter", status: "done", quality: 7, repo: "thefold-api" },
] as const;

export default function NotifBell({ onGoTask }: NotifBellProps) {
  const [open, setOpen] = useState(false);
  const count = alerts.length;

  return (
    <div style={{ position: "relative", zIndex: 60 }}>
      <div
        onClick={() => setOpen((p) => !p)}
        style={{
          cursor: "pointer",
          color: T.textMuted,
          display: "flex",
          alignItems: "center",
          padding: 6,
          position: "relative",
        }}
      >
        <BellIcon />
        {count > 0 && (
          <div
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: T.warning,
              border: `2px solid ${T.bg}`,
            }}
          />
        )}
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            width: 320,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 100,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${T.border}`,
              fontSize: 11,
              fontWeight: 600,
              color: T.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: T.mono,
            }}
          >
            Krever oppmerksomhet ({count})
          </div>
          {alerts.map((a, i) => (
            <div
              key={i}
              onClick={() => {
                onGoTask && onGoTask(a.id);
                setOpen(false);
              }}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                borderBottom: i < alerts.length - 1 ? `1px solid ${T.border}` : "none",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background:
                    a.status === "active"
                      ? T.accent
                      : a.status === "pending"
                        ? T.warning
                        : "quality" in a && a.quality && a.quality < 8
                          ? T.warning
                          : T.success,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: T.text,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: T.mono,
                    color: T.textFaint,
                    marginTop: 1,
                  }}
                >
                  {a.id} · {a.repo}
                </div>
              </div>
              <Tag
                variant={
                  a.status === "active"
                    ? "accent"
                    : a.status === "pending"
                      ? "default"
                      : "quality" in a && a.quality && a.quality < 8
                        ? "error"
                        : "success"
                }
              >
                {a.status === "active"
                  ? "pågår"
                  : a.status === "pending"
                    ? "venter"
                    : "quality" in a && a.quality && a.quality < 8
                      ? "review"
                      : "ok"}
              </Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

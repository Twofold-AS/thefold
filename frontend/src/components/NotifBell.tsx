"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import BellIcon from "@/components/icons/BellIcon";
import Tag from "@/components/Tag";
import { getNotifications } from "@/lib/api";

interface Notification {
  id: string;
  content: string;
  type: string;
  createdAt: string;
}

interface NotifBellProps {
  onGoTask?: (id: string) => void;
}

export default function NotifBell({ onGoTask }: NotifBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [lastSeen, setLastSeen] = useState<string>("");

  // Load last seen from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tf_notif_last_seen");
    if (saved) setLastSeen(saved);
  }, []);

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifs(data.notifications ?? []);
    } catch {
      // Non-critical
    }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  const unreadCount = lastSeen
    ? notifs.filter((n) => new Date(n.createdAt) > new Date(lastSeen)).length
    : notifs.length;

  const handleOpen = () => {
    setOpen((p) => !p);
    if (!open && notifs.length > 0) {
      const newest = notifs[0]?.createdAt;
      if (newest) {
        setLastSeen(newest);
        localStorage.setItem("tf_notif_last_seen", newest);
      }
    }
  };

  const typeLabel = (type: string) => {
    if (type === "agent_report") return "rapport";
    if (type === "agent_status") return "status";
    if (type === "task_start") return "oppgave";
    return type;
  };

  const typeVariant = (type: string) => {
    if (type === "agent_report") return "accent" as const;
    if (type === "task_start") return "success" as const;
    return "default" as const;
  };

  return (
    <div style={{ position: "relative", zIndex: 60 }}>
      <div
        onClick={handleOpen}
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
        {unreadCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: T.error,
              border: `2px solid ${T.bg}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
              color: "#fff",
              fontFamily: T.mono,
              padding: "0 3px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            width: 340,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 100,
            maxHeight: 400,
            overflowY: "auto",
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
            Varsler ({notifs.length})
          </div>
          {notifs.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
              Ingen varsler siste 24 timer
            </div>
          ) : (
            notifs.map((n, i) => (
              <div
                key={n.id}
                onClick={() => {
                  if (n.type === "task_start") {
                    router.push("/tasks");
                  } else {
                    router.push("/chat");
                  }
                  setOpen(false);
                }}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  borderBottom: i < notifs.length - 1 ? `1px solid ${T.border}` : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
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
                    {n.content}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: T.mono,
                      color: T.textFaint,
                      marginTop: 1,
                    }}
                  >
                    {new Date(n.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <Tag variant={typeVariant(n.type)}>
                  {typeLabel(n.type)}
                </Tag>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

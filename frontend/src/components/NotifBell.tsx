"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import BellIcon from "@/components/icons/BellIcon";
import { getNotifications, type NotificationItem } from "@/lib/api";

interface NotifBellProps {
  onGoTask?: (id: string) => void;
  /** Render popup without bell icon (for standalone use from topbar) */
  forceOpen?: boolean;
  onClose?: () => void;
}

const TYPE_LABEL: Record<NotificationItem["type"], string> = {
  review_ready: "gjennomgang",
  task_done: "fullført",
  task_failed: "feilet",
};

const TYPE_COLOR: Record<NotificationItem["type"], string> = {
  review_ready: "#f59e0b",
  task_done: "#22c55e",
  task_failed: "#ef4444",
};

export default function NotifBell({ onGoTask, forceOpen, onClose }: NotifBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [lastSeen, setLastSeen] = useState<string>("");

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

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
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

  const handleNotifClick = (n: NotificationItem) => {
    setOpen(false);
    onClose?.();

    if (n.type === "review_ready") {
      router.push(`/cowork?conv=${encodeURIComponent(n.conversationId)}`);
    } else if (n.type === "task_done" && n.prUrl) {
      window.open(n.prUrl, "_blank", "noopener,noreferrer");
    } else {
      // task_done without PR, task_failed → go to conversation
      router.push(`/cowork?conv=${encodeURIComponent(n.conversationId)}`);
    }
  };

  const closePopup = () => { setOpen(false); onClose?.(); };

  const renderItem = (n: NotificationItem, i: number, total: number) => (
    <div
      key={n.id}
      onClick={() => handleNotifClick(n)}
      style={{
        padding: "12px 16px",
        cursor: "pointer",
        borderBottom: i < total - 1 ? `1px solid ${T.border}` : "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = T.subtle)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: T.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {n.title}
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
          {new Date(n.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 6,
        background: `${TYPE_COLOR[n.type]}22`,
        color: TYPE_COLOR[n.type],
        border: `1px solid ${TYPE_COLOR[n.type]}55`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {TYPE_LABEL[n.type]}
      </span>
    </div>
  );

  // forceOpen mode — popup only, no bell
  if (forceOpen) {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={closePopup} />
        <div style={{
          width: 400,
          background: T.popup,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          zIndex: 100,
          maxHeight: 500,
          overflowY: "auto",
          overflowX: "hidden",
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${T.border}`,
            fontSize: 13,
            fontWeight: 500,
            color: T.text,
          }}>
            Varsler ({notifs.length})
          </div>
          {notifs.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
              Ingen varsler siste 24 timer
            </div>
          ) : (
            notifs.map((n, i) => renderItem(n, i, notifs.length))
          )}
        </div>
      </>
    );
  }

  // Bell icon mode
  return (
    <div style={{ position: "relative", zIndex: 60 }}>
      <div onClick={handleOpen} style={{ cursor: "pointer", color: T.textMuted, padding: 6, position: "relative" }}>
        <BellIcon />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: 2,
            right: 2,
            minWidth: 14,
            height: 14,
            background: "#ef4444",
            borderRadius: 7,
            fontSize: 9,
            fontWeight: 700,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 8,
            width: 340,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            zIndex: 100,
            maxHeight: 400,
            overflowY: "auto",
          }}>
            <div style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${T.border}`,
              fontSize: 11,
              fontWeight: 600,
              color: T.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: T.mono,
            }}>
              Varsler ({notifs.length})
            </div>
            {notifs.length === 0 ? (
              <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.textMuted }}>
                Ingen varsler siste 24 timer
              </div>
            ) : (
              notifs.map((n, i) => renderItem(n, i, notifs.length))
            )}
          </div>
        </>
      )}
    </div>
  );
}

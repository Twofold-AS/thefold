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
  /** Render popup without bell icon (for standalone use from topbar) */
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function NotifBell({ onGoTask, forceOpen, onClose }: NotifBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
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
    const map: Record<string, string> = {
      agent_report: "rapport",
      agent_status: "status",
      task_start: "oppgave",
      healing_notification: "healing",
      system: "system",
    };
    return map[type] || type;
  };

  // Parse notification content — extract human-readable text from any JSON structure
  const parseContent = (content: string): string => {
    if (!content) return "Ny hendelse";

    // Deep extract: recursively find the first meaningful string in any object
    const extractText = (obj: any, depth = 0): string | null => {
      if (depth > 5) return null;
      if (typeof obj === "string" && obj.length > 3 && obj.length < 300 && !obj.startsWith("{") && !obj.startsWith("[")) return obj;
      if (typeof obj !== "object" || obj === null) return null;
      // Priority keys
      for (const key of ["message", "summary", "title", "text", "description", "question", "label"]) {
        if (typeof obj[key] === "string" && obj[key].length > 2) return obj[key];
      }
      // Check payload
      if (obj.payload) {
        const fromPayload = extractText(obj.payload, depth + 1);
        if (fromPayload) return fromPayload;
      }
      // Check nested objects
      for (const val of Object.values(obj)) {
        const found = extractText(val, depth + 1);
        if (found) return found;
      }
      return null;
    };

    try {
      let parsed = JSON.parse(content);

      // Handle double-encoded JSON (string inside string)
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch {}
      }

      // If it's still a plain string after parsing, return it
      if (typeof parsed === "string") return parsed.length > 120 ? parsed.slice(0, 117) + "..." : parsed;

      // Known types
      if (parsed.type === "completion") return `Oppgave fullført${parsed.payload?.prUrl ? " — PR opprettet" : ""}`;
      if (parsed.type === "review") return "Kode-review klar for gjennomgang";
      if (parsed.type === "status" && parsed.phase) return `${parsed.phase}: ${extractText(parsed) || "oppdatering"}`;
      if (parsed.type === "progress" && parsed.summary) return parsed.summary;
      if (parsed.type === "progress" && parsed.phase) return `${parsed.phase}: ${extractText(parsed) || "jobber"}`;

      // Deep extract
      const text = extractText(parsed);
      if (text) return text.length > 120 ? text.slice(0, 117) + "..." : text;

      // Absolute last resort — show type if available
      if (parsed.type) return `${parsed.type}${parsed.phase ? ` (${parsed.phase})` : ""}`;

      return "Ny hendelse";
    } catch {
      // JSON parse failed — content is either plain text or truncated JSON
      // If it looks like truncated JSON, show a friendly fallback
      if (content.startsWith("{") || content.startsWith("[")) {
        return "TheFold jobber...";
      }
      return content.length > 120 ? content.slice(0, 117) + "..." : content;
    }
  };

  // Route to relevant page based on notification type
  const handleNotifClick = (n: Notification) => {
    setOpen(false);

    // Try to extract conversationId from content for direct routing
    let conversationId: string | null = null;
    let taskId: string | null = null;
    try {
      const parsed = JSON.parse(n.content);
      conversationId = parsed.conversationId || parsed.payload?.conversationId || null;
      taskId = parsed.taskId || parsed.payload?.taskId || null;
    } catch {}

    switch (n.type) {
      case "task_start":
        router.push("/tasks");
        break;
      case "healing_notification":
        router.push("/memory");
        break;
      case "agent_report":
      case "agent_status":
        if (taskId) {
          router.push("/tasks");
          return;
        }
        if (conversationId) {
          router.push(`/cowork?conv=${encodeURIComponent(conversationId)}`);
          return;
        }
        router.push("/cowork");
        break;
      default:
        if (conversationId) {
          router.push(`/cowork?conv=${encodeURIComponent(conversationId)}`);
          return;
        }
        router.push("/cowork");
    }
  };

  const isOpen = forceOpen || open;
  const closePopup = () => { setOpen(false); onClose?.(); };

  // In forceOpen mode, render just the popup (no bell icon)
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
            notifs.map((n, i) => (
              <div
                key={n.id}
                onClick={() => { handleNotifClick(n); closePopup(); }}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  borderBottom: i < notifs.length - 1 ? `1px solid ${T.border}` : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.subtle)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{parseContent(n.content)}</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
                  {new Date(n.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  {" — "}
                  {typeLabel(n.type)}
                </div>
              </div>
            ))
          )}
        </div>
      </>
    );
  }

  return (
    <div style={{ position: "relative", zIndex: 60 }}>
      {/* Legacy bell icon mode — kept for backwards compat */}
      <div onClick={handleOpen} style={{ cursor: "pointer", color: T.textMuted, padding: 6 }}>
        <BellIcon />
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
              notifs.map((n, i) => (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    padding: "10px 16px",
                    cursor: "pointer",
                    borderBottom: i < notifs.length - 1 ? `1px solid ${T.border}` : "none",
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
                      fontSize: 12,
                      color: T.text,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {parseContent(n.content)}
                    </div>
                    <div style={{
                      fontSize: 10,
                      fontFamily: T.mono,
                      color: T.textFaint,
                      marginTop: 1,
                    }}>
                      {new Date(n.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <Tag variant="default">
                    {typeLabel(n.type)}
                  </Tag>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

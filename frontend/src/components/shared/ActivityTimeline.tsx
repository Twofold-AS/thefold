import { T } from "@/lib/tokens";
import { CheckCircle, Circle, AlertCircle, Zap } from "lucide-react";

export interface ActivityItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  type?: "success" | "error" | "active" | "default";
}

interface ActivityTimelineProps {
  items: ActivityItem[];
  emptyText?: string;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins}m siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t siden`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d siden`;
  return new Date(date).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

function ItemIcon({ type }: { type: ActivityItem["type"] }) {
  const size = 14;
  switch (type) {
    case "success": return <CheckCircle size={size} color={T.success} />;
    case "error":   return <AlertCircle size={size} color={T.error} />;
    case "active":  return <Zap size={size} color={T.accent} />;
    default:        return <Circle size={size} color={T.textFaint} />;
  }
}

export default function ActivityTimeline({ items, emptyText = "Ingen aktivitet enda" }: ActivityTimelineProps) {
  if (items.length === 0) {
    return (
      <div style={{
        padding: "24px 16px", textAlign: "center",
        border: `1px dashed ${T.border}`, borderRadius: T.r,
        fontSize: 12, color: T.textFaint,
      }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Vertical line */}
      <div style={{
        position: "absolute", left: 7, top: 8, bottom: 8, width: 1,
        background: T.border,
      }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              display: "flex", gap: 14, alignItems: "flex-start",
              padding: "10px 0",
              paddingBottom: i === items.length - 1 ? 0 : 10,
            }}
          >
            {/* Icon dot — sits on the line */}
            <div style={{
              flexShrink: 0, width: 16, height: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: T.bg, position: "relative", zIndex: 1,
            }}>
              <ItemIcon type={item.type} />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <div style={{
                fontSize: 12, fontWeight: 500, color: T.textSec,
                lineHeight: 1.4, marginBottom: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {item.title}
              </div>
              {item.description && (
                <div style={{ fontSize: 11, color: T.textFaint, lineHeight: 1.4 }}>
                  {item.description}
                </div>
              )}
              <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3, fontFamily: T.mono }}>
                {timeAgo(item.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

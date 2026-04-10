"use client";

import { T } from "@/lib/tokens";

function formatTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "na";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mnd`;
}

interface TimeAgoProps {
  date: string;
  style?: React.CSSProperties;
}

export default function TimeAgo({ date, style }: TimeAgoProps) {
  return (
    <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, ...style }}>
      {formatTimeAgo(date)}
    </span>
  );
}

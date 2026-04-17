"use client";
import { useEffect, useState } from "react";

interface BrainEvent {
  type: "dream" | "prune" | "healing";
  phase: string;
  message: string;
  progress?: number;
  userId: string;
}

export default function BrainActivityStripe() {
  const [event, setEvent] = useState<BrainEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(async () => {
      try {
        const resp = await fetch("/api/memory/brain-status", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.active && data.event) {
          setEvent(data.event);
          if (data.event.progress === 100) {
            setTimeout(() => { setVisible(false); setEvent(null); }, 3000);
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [visible]);

  // Expose startBrain globally for triggering from dream/healing pages
  useEffect(() => {
    (window as any).__startBrainActivity = () => setVisible(true);
  }, []);

  if (!visible || !event) return null;

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: "8px 12px", background: "rgba(0,0,0,0.85)",
      borderTop: "1px solid rgba(255,255,255,0.1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#a78bfa" }}>psychology</span>
        <span style={{ fontSize: 12, color: "#e2e8f0" }}>{event.message}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
        <div style={{
          height: "100%", background: "#a78bfa", borderRadius: 2,
          width: `${event.progress ?? 0}%`, transition: "width 0.5s ease"
        }} />
      </div>
    </div>
  );
}

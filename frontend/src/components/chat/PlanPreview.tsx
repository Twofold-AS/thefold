"use client";

// Runde 3-A — PlanPreview
//
// Inline chat-card som vises før master-iteratoren begynner. Lister sub-
// tasks i fase-rekkefølge med en 5-sek countdown som auto-confirmer.
// Knapper: "Kjør i gang" (umiddelbar confirm) og "Avbryt". Bruker kan
// også skrive en chat-melding for å justere planen — håndteres
// utenfor (chat.send setter `editingPlanFor` på request og backend
// router til /agent/edit-plan).

import { useEffect, useState } from "react";
import { T } from "@/lib/tokens";
import { Play, X, CornerDownRight, Clock } from "lucide-react";
import { confirmPlan, cancelPlan } from "@/lib/api/agent";

export interface PlanPreviewProps {
  masterTaskId: string;
  subtasks: Array<{
    id: string;
    title: string;
    phase: string | null;
    description?: string | null;
    targetFiles?: string[];
    dependsOn?: string[];
  }>;
  countdownSec: number;
  iteration: number;
  /** UI-side cleanup — hides the preview the moment user acts. */
  onClear: () => void;
  /** Wall-clock ms when this plan was emitted (used to compute live remaining). */
  receivedAt: number;
}

export default function PlanPreview({
  masterTaskId,
  subtasks,
  countdownSec,
  iteration,
  onClear,
  receivedAt,
}: PlanPreviewProps) {
  // Compute remaining seconds from receivedAt + countdownSec each render.
  const [remaining, setRemaining] = useState<number>(() => {
    const elapsed = (Date.now() - receivedAt) / 1000;
    return Math.max(0, Math.ceil(countdownSec - elapsed));
  });
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => {
      const elapsed = (Date.now() - receivedAt) / 1000;
      setRemaining(Math.max(0, Math.ceil(countdownSec - elapsed)));
    }, 250);
    return () => clearTimeout(t);
  }, [remaining, receivedAt, countdownSec]);

  // Reset on iteration change (re-emit).
  useEffect(() => {
    const elapsed = (Date.now() - receivedAt) / 1000;
    setRemaining(Math.max(0, Math.ceil(countdownSec - elapsed)));
  }, [iteration, receivedAt, countdownSec]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy("confirm");
    try {
      await confirmPlan(masterTaskId);
    } catch {
      // ignore — backend may have already auto-confirmed
    }
    onClear();
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy("cancel");
    try {
      await cancelPlan(masterTaskId);
    } catch {
      // ignore
    }
    onClear();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        background: "rgba(20,20,24,0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        maxWidth: 540,
        marginTop: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
          Plan klar — {subtasks.length} {subtasks.length === 1 ? "fase" : "faser"}
        </span>
        {iteration > 1 && (
          <span
            style={{
              fontSize: 10,
              fontFamily: T.mono,
              color: T.textFaint,
              padding: "1px 6px",
              border: `1px solid ${T.border}`,
              borderRadius: 6,
            }}
          >
            justert ({iteration})
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontFamily: T.mono,
            color: remaining <= 1 ? T.warning : T.textMuted,
          }}
        >
          <Clock size={12} /> {remaining}s
        </span>
      </div>

      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {subtasks.map((s) => (
          <li
            key={s.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              padding: "4px 0",
              borderTop: `1px dashed ${T.border}`,
              fontSize: 12,
              color: T.textSec,
            }}
          >
            <CornerDownRight size={12} color={T.textFaint} style={{ marginTop: 3, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                {s.phase && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: T.mono,
                      color: T.textFaint,
                      padding: "0 4px",
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                    }}
                  >
                    {s.phase}
                  </span>
                )}
                <span style={{ color: T.text, fontWeight: 500 }}>{s.title}</span>
              </div>
              {s.targetFiles && s.targetFiles.length > 0 && (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    fontFamily: T.mono,
                    color: T.textFaint,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={s.targetFiles.join(", ")}
                >
                  {s.targetFiles.slice(0, 3).join(" · ")}
                  {s.targetFiles.length > 3 ? ` · +${s.targetFiles.length - 3}` : ""}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy !== null}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: T.accent,
            color: "#0B1D3A",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: T.sans,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Play size={12} /> Kjør i gang
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy !== null}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: "transparent",
            color: T.textMuted,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: T.sans,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <X size={12} /> Avbryt
        </button>
        <span
          style={{
            alignSelf: "center",
            marginLeft: 4,
            fontSize: 11,
            color: T.textFaint,
            fontFamily: T.sans,
          }}
        >
          eller skriv hva du vil endre i meldingen under
        </span>
      </div>
    </div>
  );
}

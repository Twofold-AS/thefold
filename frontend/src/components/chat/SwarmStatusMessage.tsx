"use client";

// --- SwarmStatusMessage (Fase H, Commit 42 — refactored for inline rendering) ---
// Parse helpers are exported so AgentStream can inline the swarm as lines in
// its merged stack. This component is kept as a FALLBACK rendering path for
// when we receive a swarm_status message but the matching parent agent
// message isn't present in the current view (race condition, history gap).

import { useMemo, useState } from "react";
import { T } from "@/lib/tokens";
import SubAgentLine from "./SubAgentLine";
import type { SwarmGroupLine, LineStatus } from "./types";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export interface SwarmPayload {
  type: "swarm_status";
  parentTaskId: string;
  active: number;
  agents: Array<{
    id: string;
    num: number;
    role: string;
    status: "waiting" | "running" | "completed" | "failed";
    activity: string;
    startedAt?: string;
    completedAt?: string;
  }>;
}

const ROLE_DESC: Record<string, string> = {
  planner: "Bryter ned oppgaven til konkrete steg",
  implementer: "Skriver koden",
  tester: "Skriver tester",
  reviewer: "Gjennomgår kvalitet + arkitektur",
  documenter: "Dokumenterer endringene",
  researcher: "Henter kontekst fra minne + docs",
  security: "Sikkerhets-audit",
};

function toLineStatus(s: SwarmPayload["agents"][number]["status"]): LineStatus {
  if (s === "waiting") return "pending";
  if (s === "running") return "running";
  if (s === "failed") return "error";
  return "done";
}

/** Exported parser — used by MessageList to build the inline swarm group. */
export function parseSwarmPayload(content: string): SwarmPayload | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type !== "swarm_status") return null;
    return parsed as SwarmPayload;
  } catch {
    return null;
  }
}

/** Convert parsed swarm payload to the SwarmGroupLine the AgentStream merges. */
export function swarmToGroupLine(payload: SwarmPayload): SwarmGroupLine {
  return {
    kind: "swarm_group",
    id: `swarm-${payload.parentTaskId}`,
    timestamp: Date.now(),
    label: `Agenter på oppgaven (${payload.agents.length})`,
    agents: payload.agents.map((a) => ({
      index: a.num,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      role: a.role as any,
      label: a.activity || ROLE_DESC[a.role] || a.role,
      status: toLineStatus(a.status),
    })),
  };
}

interface SwarmStatusMessageProps {
  content: string;
}

export default function SwarmStatusMessage({ content }: SwarmStatusMessageProps) {
  const [selected, setSelected] = useState<SwarmPayload["agents"][number] | null>(null);

  const payload = useMemo(() => parseSwarmPayload(content), [content]);
  const group = useMemo<SwarmGroupLine | null>(
    () => (payload ? swarmToGroupLine(payload) : null),
    [payload],
  );

  if (!payload || !group) return null;

  const handleAgentClick = (agentIndex: number) => {
    const a = payload.agents.find((x) => x.num === agentIndex);
    if (a) setSelected(a);
  };

  return (
    <>
      <SubAgentLine group={group} onAgentClick={handleAgentClick} />

      <Dialog.Root open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(2px)",
              zIndex: 200,
            }}
          />
          <Dialog.Content
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(560px, 92vw)",
              maxHeight: "75vh",
              background: "rgba(20,20,24,0.96)",
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: 20,
              overflowY: "auto",
              zIndex: 201,
              color: T.text,
              fontFamily: T.sans,
            }}
          >
            {selected && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <Dialog.Title
                    style={{
                      fontFamily: T.mono,
                      fontSize: 14,
                      fontWeight: 600,
                      margin: 0,
                      flex: 1,
                    }}
                  >
                    {selected.num}# {selected.role}
                  </Dialog.Title>
                  <span
                    style={{
                      fontSize: 11,
                      color: T.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {selected.status}
                  </span>
                  <Dialog.Close asChild>
                    <button
                      aria-label="Lukk"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: T.textMuted,
                        cursor: "pointer",
                        padding: 4,
                        display: "flex",
                      }}
                    >
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </div>

                <div style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>
                  {ROLE_DESC[selected.role] ?? "Sub-agent"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: 6, fontSize: 12 }}>
                  <span style={{ color: T.textFaint }}>Aktivitet</span>
                  <span>{selected.activity}</span>
                  <span style={{ color: T.textFaint }}>Agent-ID</span>
                  <span style={{ fontFamily: T.mono, fontSize: 11 }}>{selected.id}</span>
                  {selected.startedAt && (
                    <>
                      <span style={{ color: T.textFaint }}>Startet</span>
                      <span style={{ fontFamily: T.mono, fontSize: 11 }}>{selected.startedAt}</span>
                    </>
                  )}
                  {selected.completedAt && (
                    <>
                      <span style={{ color: T.textFaint }}>Ferdig</span>
                      <span style={{ fontFamily: T.mono, fontSize: 11 }}>{selected.completedAt}</span>
                    </>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

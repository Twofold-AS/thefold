"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { listBuilderJobs, getBuilderJob, BuilderJobSummary, BuildStepInfo } from "@/lib/api";

function formatAge(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "akkurat nå";
  if (mins < 60) return `${mins}m siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t siden`;
  return `${Math.floor(hrs / 24)}d siden`;
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const secs = Math.floor((to - from) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function statusVariant(s: string): "success" | "error" | "accent" | "default" {
  if (s === "completed") return "success";
  if (s === "failed" || s === "cancelled") return "error";
  if (s === "running" || s === "in_progress") return "accent";
  return "default";
}

function phaseColor(phase: string | null): string {
  switch (phase) {
    case "implement": return T.accent;
    case "integrate": return T.success;
    case "init":
    case "scaffold": return T.textSec;
    default: return T.textMuted;
  }
}

function PhaseBar({ phase, step, total }: { phase: string | null; step: number; total: number }) {
  const phases = ["init", "scaffold", "dependencies", "implement", "integrate", "finalize"];
  return (
    <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
      {phases.map((p) => {
        const idx = phases.indexOf(p);
        const current = phases.indexOf(phase ?? "") === idx;
        const done = phases.indexOf(phase ?? "") > idx;
        return (
          <div
            key={p}
            title={p}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: done ? T.success : current ? T.accent : T.border,
              opacity: done ? 1 : current ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

function StepList({ steps }: { steps: BuildStepInfo[] }) {
  return (
    <div>
      {steps.map((step, i) => (
        <div
          key={step.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "8px 0",
            borderBottom: i < steps.length - 1 ? `1px solid ${T.border}` : "none",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background:
                step.status === "completed"
                  ? T.success
                  : step.status === "failed"
                  ? T.error
                  : step.status === "running"
                  ? T.accent
                  : T.border,
              flexShrink: 0,
              marginTop: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "#fff",
            }}
          >
            {step.status === "completed" ? "✓" : step.status === "failed" ? "✗" : step.stepNumber}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: T.mono,
                  color: T.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {step.phase}
              </span>
              <span style={{ fontSize: 11, color: T.textSec }}>{step.action}</span>
            </div>
            {step.filePath && (
              <div
                style={{
                  fontSize: 11,
                  fontFamily: T.mono,
                  color: T.textFaint,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {step.filePath}
              </div>
            )}
          </div>
          {step.tokensUsed > 0 && (
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, flexShrink: 0 }}>
              {step.tokensUsed.toLocaleString()}t
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function BuildsPage() {
  const [selId, setSelId] = useState<string | null>(null);
  const { data, loading } = useApiData(() => listBuilderJobs({ limit: 30 }), []);
  const { data: detail, loading: detailLoading } = useApiData(
    () => (selId ? getBuilderJob(selId) : Promise.resolve(null)),
    [selId],
  );

  const jobs: BuilderJobSummary[] = data?.jobs ?? [];
  const sel = jobs.find((j) => j.id === selId) ?? null;

  const running = jobs.filter((j) => j.status === "running" || j.status === "in_progress").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: T.text,
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}
        >
          Bygg
        </h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>
          Bygge-historikk, faser og valideringssteg per job.
        </p>
      </div>

      {/* Stats bar */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            overflow: "hidden",
          }}
        >
          {[
            { l: "TOTALT", v: loading ? "–" : String(data?.total ?? 0) },
            { l: "KJØRER", v: loading ? "–" : String(running), accent: running > 0 },
            { l: "FULLFØRTE", v: loading ? "–" : String(completed) },
            { l: "FEILEDE", v: loading ? "–" : String(failed), error: failed > 0 },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: "18px 20px",
                borderRight: i < 3 ? `1px solid ${T.border}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: T.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                {s.l}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  color: (s as any).accent ? T.accent : (s as any).error ? T.error : T.text,
                }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </GR>

      {/* Job list + detail */}
      <GR mb={40}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: sel ? "1fr 1fr" : "1fr",
            marginTop: 20,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            minHeight: 300,
            overflow: "hidden",
          }}
        >
          {/* Job list */}
          <div style={{ borderRight: sel ? `1px solid ${T.border}` : "none" }}>
            {/* Column headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: sel ? "1fr 80px" : "1fr 100px 80px 80px",
                padding: "8px 16px",
                background: T.subtle,
                borderBottom: `1px solid ${T.border}`,
                gap: 12,
              }}
            >
              {(sel
                ? ["JOB", "STATUS"]
                : ["JOB", "FASE", "VARIGHET", "STATUS"]
              ).map((h, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    color: T.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: 24 }}>
                <Skeleton rows={5} />
              </div>
            ) : jobs.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: T.textMuted }}>Ingen bygg ennå.</div>
              </div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => setSelId(selId === job.id ? null : job.id)}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: selId === job.id ? T.subtle : "transparent",
                    borderBottom: `1px solid ${T.border}`,
                    display: "grid",
                    gridTemplateColumns: sel ? "1fr 80px" : "1fr 100px 80px 80px",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontFamily: T.mono,
                        color: T.textSec,
                        marginBottom: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {job.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 11, color: T.textFaint }}>{formatAge(job.createdAt)}</div>
                    {!sel && <PhaseBar phase={job.currentPhase} step={job.currentStep} total={job.totalSteps} />}
                  </div>

                  {!sel && (
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: T.mono,
                          color: phaseColor(job.currentPhase),
                        }}
                      >
                        {job.currentPhase ?? "—"}
                      </div>
                      <div style={{ fontSize: 10, color: T.textFaint }}>
                        {job.currentStep}/{job.totalSteps} steg
                      </div>
                    </div>
                  )}

                  {!sel && (
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: T.mono,
                        color: T.textMuted,
                      }}
                    >
                      {formatDuration(job.startedAt, job.completedAt)}
                    </div>
                  )}

                  <Tag variant={statusVariant(job.status)}>{job.status}</Tag>
                </div>
              ))
            )}
          </div>

          {/* Detail panel */}
          {sel && (
            <div style={{ padding: 24, overflow: "auto" }}>
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontFamily: T.mono,
                    color: T.textSec,
                    marginBottom: 6,
                  }}
                >
                  {sel.id}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <Tag variant={statusVariant(sel.status)}>{sel.status}</Tag>
                  <Tag>{sel.buildStrategy}</Tag>
                </div>
                <PhaseBar phase={sel.currentPhase} step={sel.currentStep} total={sel.totalSteps} />
              </div>

              <SectionLabel>DETALJER</SectionLabel>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1,
                  marginBottom: 20,
                }}
              >
                {[
                  { l: "STEG", v: `${sel.currentStep}/${sel.totalSteps}` },
                  { l: "VARIGHET", v: formatDuration(sel.startedAt, sel.completedAt) },
                  { l: "TOKENS", v: sel.totalTokensUsed.toLocaleString() },
                  { l: "KOSTNAD", v: `$${sel.totalCostUsd.toFixed(4)}` },
                ].map((m, i) => (
                  <div
                    key={i}
                    style={{
                      background: T.subtle,
                      padding: "10px 14px",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>
                      {m.l}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{m.v}</div>
                  </div>
                ))}
              </div>

              <SectionLabel>BYGG-LOGG</SectionLabel>
              {detailLoading ? (
                <Skeleton rows={4} />
              ) : detail?.steps && detail.steps.length > 0 ? (
                <StepList steps={detail.steps} />
              ) : (
                <div style={{ fontSize: 12, color: T.textFaint, padding: "12px 0" }}>
                  Ingen steg registrert.
                </div>
              )}
            </div>
          )}
        </div>
      </GR>
    </>
  );
}

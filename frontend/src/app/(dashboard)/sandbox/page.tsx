"use client";

import { useState, useEffect, useCallback } from "react";
import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import PixelCorners from "@/components/PixelCorners";
import { GR } from "@/components/GridRow";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { listBuilderJobs, getBuilderJob, type BuildStepInfo, type BuilderJobSummary } from "@/lib/api";

function jobStatus(status: string): "pass" | "warn" | "fail" {
  if (status === "completed" || status === "success") return "pass";
  if (status === "failed" || status === "error" || status === "cancelled") return "fail";
  if (status === "running" || status === "in_progress" || status === "pending") return "warn";
  return "warn";
}

function stepStatusColor(status: string): string {
  if (status === "completed" || status === "success" || status === "pass") return T.success;
  if (status === "failed" || status === "error" || status === "fail") return T.error;
  if (status === "skipped" || status === "disabled") return T.textFaint;
  return T.warning;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = end - start;
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}t ${mins % 60}m`;
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("nb-NO", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    });
  } catch { return "—"; }
}

export default function SandboxPage() {
  const { data, loading } = useApiData(() => listBuilderJobs(), []);
  const [sel, setSel] = useState<string | null>(null);
  const [steps, setSteps] = useState<BuildStepInfo[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<BuilderJobSummary | null>(null);

  const jobs = data?.jobs ?? [];

  const fetchSteps = useCallback(async (jobId: string) => {
    setStepsLoading(true);
    try {
      const result = await getBuilderJob(jobId);
      setSteps(result.steps);
      setSelectedJob(result.job);
    } catch {
      setSteps([]);
      setSelectedJob(null);
    } finally {
      setStepsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sel) {
      fetchSteps(sel);
    } else {
      setSteps([]);
      setSelectedJob(null);
    }
  }, [sel, fetchSteps]);

  const passCount = jobs.filter(r => jobStatus(r.status) === "pass").length;
  const warnCount = jobs.filter(r => jobStatus(r.status) === "warn").length;
  const failCount = jobs.filter(r => jobStatus(r.status) === "fail").length;

  const sb = sel !== null ? (selectedJob || jobs.find(r => r.id === sel) || null) : null;

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Sandbox</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Isolert kodevalidering — typecheck, lint, test, snapshot, performance.</p>
      </div>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", border: `1px solid ${T.border}`, borderRadius: T.r, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          {[
            { l: "KJØRINGER", v: loading ? "–" : jobs.length },
            { l: "BESTÅTT", v: loading ? "–" : passCount, c: T.success },
            { l: "ADVARSLER", v: loading ? "–" : warnCount, c: T.warning },
            { l: "FEILET", v: loading ? "–" : failCount, c: T.error },
          ].map((s, i) => (
            <div key={i} style={{ padding: "18px 20px", borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.l}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: s.c || T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </GR>

      <GR mb={40}>
        <div style={{ display: "grid", gridTemplateColumns: sb ? "1fr 1fr" : "1fr", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: `0 0 ${T.r}px ${T.r}px`, minHeight: 300, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          <div style={{ borderRight: sb ? `1px solid ${T.border}` : "none" }}>
            {loading ? (
              <div style={{ padding: 40 }}>
                <Skeleton rows={4} />
              </div>
            ) : jobs.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen kjøringer funnet.</span>
              </div>
            ) : (
              jobs.map((r, i) => {
                const status = jobStatus(r.status);
                return (
                  <div
                    key={r.id}
                    onClick={() => setSel(r.id === sel ? null : r.id)}
                    style={{
                      padding: "14px 20px",
                      cursor: "pointer",
                      background: sel === r.id ? T.subtle : "transparent",
                      borderBottom: i < jobs.length - 1 ? `1px solid ${T.border}` : "none",
                      borderLeft: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{r.id.slice(0, 8)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{r.currentPhase || r.status}</span>
                      <Tag variant={status === "pass" ? "success" : status === "warn" ? "accent" : "error"}>{r.status}</Tag>
                      <Tag>{r.buildStrategy || "sandbox"}</Tag>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>task: {r.taskId.slice(0, 8)}</span>
                      <span style={{ fontSize: 10, color: T.textFaint }}>{formatTime(r.startedAt)}</span>
                      <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>{formatDuration(r.startedAt, r.completedAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {sb && (
            <div style={{ padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 4 }}>
                {sb.currentPhase || sb.status}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Tag variant={jobStatus(sb.status) === "pass" ? "success" : jobStatus(sb.status) === "warn" ? "accent" : "error"}>{sb.status}</Tag>
                <Tag>{sb.buildStrategy || "sandbox"}</Tag>
                {Number(sb.totalCostUsd) > 0 && <Tag>${(Number(sb.totalCostUsd) || 0).toFixed(4)}</Tag>}
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
                <span>Startet: {formatTime(sb.startedAt)}</span>
                {sb.completedAt && <span>Ferdig: {formatTime(sb.completedAt)}</span>}
                <span>Varighet: {formatDuration(sb.startedAt, sb.completedAt)}</span>
              </div>
              <SectionLabel>VALIDATION PIPELINE</SectionLabel>
              {stepsLoading ? (
                <div style={{ padding: "20px 0" }}>
                  <Skeleton rows={4} />
                </div>
              ) : steps.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center" }}>
                  <span style={{ fontSize: 13, color: T.textMuted }}>Ingen steg funnet.</span>
                </div>
              ) : (
                steps.map((st, i) => (
                  <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < steps.length - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: stepStatusColor(st.status) }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.text, width: 100 }}>{st.phase}</span>
                    <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>{st.action}{st.filePath ? ` — ${st.filePath}` : ""}</span>
                    {st.tokensUsed > 0 && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{st.tokensUsed} tok</span>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </GR>
    </>
  );
}

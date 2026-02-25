"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import PixelCorners from "@/components/PixelCorners";
import SectionLabel from "@/components/SectionLabel";
import Toggle from "@/components/Toggle";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import { useApiData } from "@/lib/hooks";
import { listSkills, toggleSkill, Skill } from "@/lib/api";

export default function SkillsPage() {
  const { data, loading, refresh } = useApiData(() => listSkills(), []);
  const [sel, setSel] = useState<string | null>(null);

  const skills: Skill[] = data?.skills ?? [];
  const sk = sel !== null ? skills.find((s) => s.id === sel) ?? null : null;

  if (loading) {
    return (
      <div style={{ paddingTop: 40 }}>
        <div
          style={{
            fontSize: 13,
            color: T.textMuted,
            fontFamily: T.mono,
            padding: "40px 0",
            textAlign: "center",
          }}
        >
          Laster skills...
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: T.text,
                letterSpacing: "-0.03em",
                fontFamily: T.brandFont,
                marginBottom: 8,
              }}
            >
              Skills
            </h2>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Modulært prompt-system med pipeline, routing og scoring.
            </p>
          </div>
          <Btn primary sm onClick={() => alert("Ny skill — kommer snart")}>
            + Ny skill
          </Btn>
        </div>
      </div>

      {/* Stats bar */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <PixelCorners />
          {[
            { l: "AKTIVE", v: skills.filter((s) => s.enabled).length },
            { l: "PIPELINE-FASER", v: "pre \u2192 inject \u2192 post" },
            { l: "TOKEN-BUDSJETT", v: "4 000" },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: "18px 20px",
                borderRight: i < 2 ? `1px solid ${T.border}` : "none",
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
              <div style={{ fontSize: 20, fontWeight: 600, color: T.text }}>{s.v}</div>
            </div>
          ))}
        </div>
      </GR>

      {/* Skills list + detail */}
      <GR mb={40}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: sk ? "1fr 1fr" : "1fr",
            border: `1px solid ${T.border}`,
            borderTop: "none",
            borderRadius: `0 0 ${T.r}px ${T.r}px`,
            minHeight: 300,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <PixelCorners />
          <div style={{ borderRight: sk ? `1px solid ${T.border}` : "none" }}>
            {skills.map((s) => (
              <div
                key={s.id}
                onClick={() => setSel(s.id === sel ? null : s.id)}
                style={{
                  padding: "14px 20px",
                  cursor: "pointer",
                  background: sel === s.id ? T.subtle : "transparent",
                  borderBottom: `1px solid ${T.border}`,
                  borderLeft:
                    sel === s.id ? `3px solid ${T.accent}` : "3px solid transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{s.name}</span>
                  <Tag variant={s.enabled ? "success" : "default"}>
                    {s.enabled ? "aktiv" : "av"}
                  </Tag>
                  <Tag>{s.executionPhase ?? "inject"}</Tag>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    prio: {s.priority ?? 0}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    ~{s.tokenEstimate ?? 0} tokens
                  </span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    confidence: {((Number(s.confidenceScore) || 0) * 100).toFixed(0)}%
                  </span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    {s.totalUses ?? 0}x brukt
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {sk && (
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: T.text,
                    fontFamily: T.brandFont,
                    marginBottom: 8,
                  }}
                >
                  {sk.name}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <Tag variant={sk.enabled ? "success" : "default"}>
                    {sk.enabled ? "aktiv" : "deaktivert"}
                  </Tag>
                  <Tag>{sk.executionPhase ?? "inject"}</Tag>
                  <Tag>{sk.scope}</Tag>
                </div>
              </div>

              <SectionLabel>DETALJER</SectionLabel>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1,
                  marginBottom: 16,
                }}
              >
                {[
                  { l: "PRIORITET", v: sk.priority ?? 0 },
                  { l: "TOKEN-ESTIMAT", v: `~${sk.tokenEstimate ?? 0}` },
                  { l: "CONFIDENCE", v: `${((sk.confidenceScore ?? 0) * 100).toFixed(0)}%` },
                  { l: "BRUK", v: `${sk.totalUses ?? 0}x` },
                ].map((m, i) => (
                  <div
                    key={i}
                    style={{
                      background: T.subtle,
                      padding: "10px 14px",
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: T.textMuted,
                        textTransform: "uppercase",
                        marginBottom: 2,
                      }}
                    >
                      {m.l}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{m.v}</div>
                  </div>
                ))}
              </div>

              <SectionLabel>ROUTING REGLER</SectionLabel>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: T.textSec,
                  padding: "8px 12px",
                  background: T.subtle,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  marginBottom: 16,
                }}
              >
                {sk.routingRules?.keywords?.join(", ") ?? "ingen regler"}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Toggle
                  checked={sk.enabled}
                  onChange={async () => {
                    await toggleSkill(sk.id, !sk.enabled);
                    refresh();
                  }}
                  label={sk.enabled ? "Deaktiver" : "Aktiver"}
                />
                <Btn sm>Rediger</Btn>
              </div>
            </div>
          )}
        </div>
      </GR>
    </>
  );
}

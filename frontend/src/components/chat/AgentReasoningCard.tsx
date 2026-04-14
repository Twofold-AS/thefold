"use client";

import { useState } from "react";
import { T, S } from "@/lib/tokens";
import { Brain, Zap, FileText, ChevronDown, ChevronUp } from "lucide-react";
import Tag from "@/components/Tag";

interface ReasoningData {
  memoriesUsed?: Array<{ id?: string; content: string; type?: string; score?: number }>;
  skillsUsed?: Array<{ name: string; phase?: string }>;
  contextFiles?: string[];
  decisions?: Array<{ what: string; why: string }>;
  modelUsed?: string;
  confidenceScore?: number;
  complexityScore?: number;
}

interface AgentReasoningCardProps {
  reasoning?: ReasoningData;
  /** Raw thinking/reasoning text from the agent */
  thinkingText?: string;
}

export default function AgentReasoningCard({ reasoning, thinkingText }: AgentReasoningCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasContent = reasoning?.memoriesUsed?.length ||
    reasoning?.skillsUsed?.length ||
    reasoning?.contextFiles?.length ||
    reasoning?.decisions?.length ||
    thinkingText;

  if (!hasContent) return null;

  return (
    <div style={{
      marginTop: S.sm,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      background: T.subtle,
      overflow: "hidden",
    }}>
      {/* Toggle header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <Brain size={13} color={T.textMuted} />
        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted, flex: 1 }}>
          Vis resonering
        </span>

        {/* Quick stats */}
        {reasoning?.memoriesUsed?.length ? (
          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.infoA10 }}>
            {reasoning.memoriesUsed.length} minner
          </span>
        ) : null}
        {reasoning?.skillsUsed?.length ? (
          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.accent }}>
            {reasoning.skillsUsed.length} skills
          </span>
        ) : null}
        {reasoning?.confidenceScore != null && (
          <span style={{
            fontSize: 10, fontFamily: T.mono,
            color: reasoning.confidenceScore >= 0.8 ? T.success : reasoning.confidenceScore >= 0.5 ? T.warning : T.error,
          }}>
            {(reasoning.confidenceScore * 100).toFixed(0)}% konfidens
          </span>
        )}

        {expanded ? <ChevronUp size={12} color={T.textFaint} /> : <ChevronDown size={12} color={T.textFaint} />}
      </div>

      {/* Expandable content */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: S.md,
        }}>
          {/* Memories used */}
          {reasoning?.memoriesUsed && reasoning.memoriesUsed.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textMuted, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <Brain size={10} />
                Minner brukt ({reasoning.memoriesUsed.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {reasoning.memoriesUsed.slice(0, 5).map((mem, i) => (
                  <div key={i} style={{
                    fontSize: 11, color: T.textSec, lineHeight: 1.5,
                    padding: "6px 8px",
                    background: T.bg,
                    borderRadius: 4,
                    borderLeft: `2px solid ${T.infoA10}`,
                  }}>
                    {mem.type && <Tag variant="default">{mem.type}</Tag>}
                    <span style={{ marginLeft: mem.type ? 6 : 0 }}>
                      {mem.content.length > 120 ? mem.content.slice(0, 120) + "..." : mem.content}
                    </span>
                    {mem.score != null && (
                      <span style={{ fontSize: 9, fontFamily: T.mono, color: T.textFaint, marginLeft: 6 }}>
                        ({(mem.score * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills used */}
          {reasoning?.skillsUsed && reasoning.skillsUsed.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textMuted, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <Zap size={10} />
                Skills aktivert ({reasoning.skillsUsed.length})
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {reasoning.skillsUsed.map((skill, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontFamily: T.mono,
                    padding: "3px 8px",
                    background: T.accentDim,
                    border: `1px solid ${T.accent}30`,
                    borderRadius: 4,
                    color: T.accent,
                  }}>
                    {skill.name}
                    {skill.phase && <span style={{ color: T.textFaint, marginLeft: 4 }}>({skill.phase})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Context files */}
          {reasoning?.contextFiles && reasoning.contextFiles.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textMuted, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <FileText size={10} />
                Kontekstfiler ({reasoning.contextFiles.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {reasoning.contextFiles.slice(0, 8).map((file, i) => (
                  <span key={i} style={{ fontSize: 11, fontFamily: T.mono, color: T.textSec }}>
                    {file}
                  </span>
                ))}
                {reasoning.contextFiles.length > 8 && (
                  <span style={{ fontSize: 10, color: T.textFaint }}>
                    +{reasoning.contextFiles.length - 8} flere
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Decisions */}
          {reasoning?.decisions && reasoning.decisions.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>
                Valg tatt
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {reasoning.decisions.map((dec, i) => (
                  <div key={i} style={{
                    fontSize: 11, lineHeight: 1.5,
                    padding: "6px 8px",
                    background: T.bg,
                    borderRadius: 4,
                  }}>
                    <div style={{ color: T.text, fontWeight: 500 }}>{dec.what}</div>
                    <div style={{ color: T.textMuted, marginTop: 2 }}>{dec.why}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div style={{ display: "flex", gap: S.md, fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
            {reasoning?.modelUsed && <span>Modell: {reasoning.modelUsed}</span>}
            {reasoning?.complexityScore != null && <span>Kompleksitet: {reasoning.complexityScore}/10</span>}
          </div>

          {/* Raw thinking text fallback */}
          {thinkingText && !reasoning?.memoriesUsed?.length && (
            <div style={{
              fontSize: 11, fontFamily: T.mono, color: T.textSec,
              lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 200, overflow: "auto",
              padding: "8px 10px",
              background: T.bg,
              borderRadius: 4,
            }}>
              {thinkingText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";

interface ClarificationCardProps {
  question: string;
  taskId?: string;
  onRespond: (response: string) => void;
  loading?: boolean;
}

export default function ClarificationCard({
  question,
  taskId,
  onRespond,
  loading,
}: ClarificationCardProps) {
  const [response, setResponse] = useState("");

  const handleSubmit = () => {
    if (!response.trim()) return;
    onRespond(response.trim());
    setResponse("");
  };

  return (
    <div
      style={{
        background: T.raised,
        border: `1px solid ${T.warning}40`,
        borderLeft: `3px solid ${T.warning}`,
        borderRadius: 12,
        padding: S.md,
        margin: `${S.sm}px 0`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: S.xs, marginBottom: S.sm }}>
        <span style={{ fontSize: 14 }}>❓</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
          Agent trenger avklaring
        </span>
        {taskId && (
          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, marginLeft: "auto" }}>
            {taskId.slice(-8)}
          </span>
        )}
      </div>

      <p style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5, margin: `0 0 ${S.sm}px` }}>
        {question}
      </p>

      <div style={{ display: "flex", gap: S.sm, alignItems: "flex-end" }}>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Svar her..."
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          style={{
            flex: 1,
            padding: `${S.sm}px ${S.sm}px`,
            fontSize: 13,
            fontFamily: T.sans,
            background: T.subtle,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            outline: "none",
            resize: "vertical",
            minHeight: 40,
          }}
        />
        <Btn
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          loading={loading}
          disabled={!response.trim()}
        >
          Send svar
        </Btn>
      </div>
    </div>
  );
}

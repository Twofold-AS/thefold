"use client";

import { useState } from "react";
import type { AgentPhaseProps } from "./types";
import { getPhaseTitle } from "./types";
import { StepList } from "./StepList";

/** Phase: needs_input — general waiting (non-review, non-clarification) */
export function AgentWaiting({ data, onReply }: AgentPhaseProps) {
  const [replyText, setReplyText] = useState("");

  return (
    <div style={{ border: "1px solid var(--border)" }}>
      <div
        className="px-4 py-3"
        style={{
          borderBottom:
            data.steps.length > 0 || data.questions?.length
              ? "1px solid rgba(255,255,255,0.06)"
              : "none",
        }}
      >
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {getPhaseTitle("Venter")}
        </span>
      </div>

      <StepList steps={data.steps} />

      {/* Questions */}
      {data.questions && data.questions.length > 0 && (
        <div
          className="px-4 py-3 space-y-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {data.questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs mt-0.5" style={{ color: "#eab308" }}>
                ?
              </span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {q}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {onReply && (
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && replyText.trim()) {
                onReply(replyText.trim());
                setReplyText("");
              }
            }}
            placeholder="Skriv svar her..."
            className="flex-1 text-sm px-3 py-1.5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={() => {
              if (replyText.trim()) {
                onReply(replyText.trim());
                setReplyText("");
              }
            }}
            className="text-xs px-3 py-1.5 font-medium"
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

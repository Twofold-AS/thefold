"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import PillIcon from "@/components/PillIcon";
import ModelPill from "@/components/ModelPill";
import TypewriterPlaceholder from "@/components/TypewriterPlaceholder";

interface ChatInputProps {
  compact?: boolean;
  repo?: string | null;
  onSubmit?: (value: string, repo?: string | null) => void;
  onRepoChange?: (repo: string | null) => void;
  ghost?: boolean;
  onGhostChange?: (ghost: boolean) => void;
}

const repos = ["thefold-api", "thefold-frontend"];

export default function ChatInput({
  compact,
  repo,
  onSubmit,
  onRepoChange,
  ghost,
  onGhostChange,
}: ChatInputProps) {
  const [v, setV] = useState("");
  const [st, setSt] = useState(false);
  const ty = v.length > 0;
  const [rd, setRd] = useState(false);

  const doSend = () => {
    if (v && onSubmit) {
      onSubmit(v, repo);
      setV("");
    } else if (v) {
      setSt(true);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: compact ? undefined : 672,
        background: T.surface,
        borderRadius: T.r * 1.5,
        position: "relative",
      }}
    >
      <div
        style={{
          height: compact ? 48 : 56,
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          position: "relative",
        }}
      >
        {!ty && (
          <div
            style={{
              position: "absolute",
              left: 20,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              fontFamily: T.sans,
            }}
          >
            <TypewriterPlaceholder active={ty} />
          </div>
        )}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && v) doSend();
          }}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: T.text,
            fontSize: 13,
            fontFamily: T.sans,
            position: "relative",
            zIndex: 1,
          }}
        />
      </div>
      <div
        style={{
          height: compact ? 44 : 57,
          borderTop: `1px solid ${T.border}`,
          padding: "0 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* File attach */}
          <PillIcon tooltip="Filer">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 3v8M3 7h8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </PillIcon>
          {/* Ghost toggle */}
          <PillIcon
            tooltip="Privat — kun synlig for deg"
            active={ghost}
            onClick={() => onGhostChange && onGhostChange(!ghost)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1C5 1 3.5 2.5 3 4c-.7 0-1.5.3-1.5 1.5C1.5 7 3 8 3 8s-.5 2 1 3.5c1 1 2 1.5 3 1.5s2-.5 3-1.5c1.5-1.5 1-3.5 1-3.5s1.5-1 1.5-2.5C12.5 4.3 11.7 4 11 4c-.5-1.5-2-3-4-3z"
                stroke="currentColor"
                strokeWidth="1.1"
                fill="none"
              />
              <circle cx="5.5" cy="6" r="1" fill="currentColor" />
              <circle cx="8.5" cy="6" r="1" fill="currentColor" />
            </svg>
          </PillIcon>
          {/* Conditional icons: sub-agents, skills, repo dropdown */}
          {!ghost && (
            <>
              {/* Sub-agents */}
              <PillIcon tooltip="Sub-agenter">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.1" />
                  <circle cx="3.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
                  <circle cx="10.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
                  <path
                    d="M1 12c0-2 1.5-3 2.5-3M13 12c0-2-1.5-3-2.5-3M3.5 12c0-2.5 1.5-4 3.5-4s3.5 1.5 3.5 4"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                </svg>
              </PillIcon>
              {/* Skills */}
              <PillIcon tooltip="Skills">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M8 2L4 8h3l-1 4 4-6H7l1-4z"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinejoin="round"
                  />
                </svg>
              </PillIcon>
              {/* Repo dropdown */}
              <div style={{ marginLeft: 4, position: "relative", zIndex: 50 }}>
                <div
                  onClick={() => setRd((p) => !p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px",
                    background: T.subtle,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: T.mono,
                    color: repo ? T.textSec : T.textFaint,
                    cursor: "pointer",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  >
                    <path d="M2 3.5C2 2.67 2.67 2 3.5 2h2l1 1.5h2c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5h-5A1.5 1.5 0 012 9V3.5z" />
                  </svg>
                  {repo || "Velg repo"}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2.5 4L5 6.5 7.5 4"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                {rd && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      marginBottom: 4,
                      background: T.surface,
                      border: `1px solid ${T.border}`,
                      borderRadius: T.r,
                      overflow: "hidden",
                      zIndex: 100,
                      minWidth: 180,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                    }}
                  >
                    {repos.map((r) => (
                      <div
                        key={r}
                        onClick={() => {
                          onRepoChange && onRepoChange(r);
                          setRd(false);
                        }}
                        style={{
                          padding: "8px 12px",
                          fontSize: 11,
                          fontFamily: T.mono,
                          color: r === repo ? T.text : T.textSec,
                          background: r === repo ? T.subtle : "transparent",
                          cursor: "pointer",
                          borderBottom: `1px solid ${T.border}`,
                        }}
                      >
                        {r}
                      </div>
                    ))}
                    <div
                      onClick={() => {
                        onRepoChange && onRepoChange(null);
                        setRd(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 11,
                        fontFamily: T.mono,
                        color: T.textFaint,
                        cursor: "pointer",
                      }}
                    >
                      Ingen repo
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ModelPill />
          <PillIcon active={ty || st} onClick={doSend} tooltip={st ? "Stopp" : "Send"}>
            {st ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="2" y="2" width="8" height="8" rx="0" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 11V3M7 3L3.5 6.5M7 3l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </PillIcon>
        </div>
      </div>
    </div>
  );
}

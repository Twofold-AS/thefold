"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import ChatInput from "@/components/ChatInput";
import DitherBackground from "@/components/DitherBackground";

interface ChatComposerProps {
  onSubmit?: (msg: string, repo: string | null, ghost: boolean) => void;
  heading?: string;
}

export default function ChatComposer({ onSubmit, heading }: ChatComposerProps) {
  const [repo, setRepo] = useState<string | null>("thefold-api");
  const [ghost, setGhost] = useState(false);

  return (
    <DitherBackground>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          minHeight: 400,
          padding: "0 24px",
        }}
      >
        <div style={{ paddingBottom: 32, textAlign: "center" }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: T.text,
              letterSpacing: "-0.03em",
            }}
          >
            {heading || "Nar AI sier umulig, sier Mikael Krakenes neste"}
          </h2>
        </div>
        {/* Full bredde — fyller content-area */}
        <div style={{ width: "100%", position: "relative" }}>
          {/* Glow under chatboksen */}
          <div
            style={{
              position: "absolute",
              bottom: -12,
              left: "50%",
              transform: "translateX(-50%)",
              width: "60%",
              height: 40,
              background:
                "radial-gradient(ellipse at center, rgba(99,102,241,0.25) 0%, transparent 70%)",
              pointerEvents: "none",
              filter: "blur(20px)",
              zIndex: 0,
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <ChatInput
              repo={ghost ? null : repo}
              onSubmit={(msg, r) => onSubmit && onSubmit(msg, r ?? null, ghost)}
              onRepoChange={setRepo}
              ghost={ghost}
              onGhostChange={setGhost}
            />
          </div>
        </div>
      </div>
    </DitherBackground>
  );
}

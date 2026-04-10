"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { syncTaskToLinear } from "@/lib/api";
import { ExternalLink, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

interface LinearSyncProps {
  taskId: string;
  /** Existing Linear URL if already synced */
  linearUrl?: string | null;
  onSynced?: (linearUrl: string) => void;
}

type SyncState = "idle" | "syncing" | "done" | "error";

export default function LinearSync({ taskId, linearUrl: initialUrl, onSynced }: LinearSyncProps) {
  const [state, setState] = useState<SyncState>("idle");
  const [linearUrl, setLinearUrl] = useState<string | null>(initialUrl ?? null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSync = async () => {
    setState("syncing");
    setErrorMsg(null);
    try {
      const result = await syncTaskToLinear(taskId);
      if (result.linearUrl) {
        setLinearUrl(result.linearUrl);
        onSynced?.(result.linearUrl);
      }
      setState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Sync feilet");
      setState("error");
    }
  };

  if (linearUrl) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CheckCircle size={14} color={T.success} />
        <a
          href={linearUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 12, color: T.accent, textDecoration: "none",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          Åpne i Linear <ExternalLink size={11} />
        </a>
        <button
          onClick={handleSync}
          disabled={state === "syncing"}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: T.textFaint, padding: "2px 6px", fontSize: 11,
            display: "flex", alignItems: "center", gap: 4,
            opacity: state === "syncing" ? 0.5 : 1,
          }}
          title="Synk status til Linear"
        >
          <RefreshCw size={11} style={state === "syncing" ? { animation: "spin 1s linear infinite" } : {}} />
          {state === "syncing" ? "Synkroniserer..." : "Oppdater"}
        </button>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={handleSync}
        disabled={state === "syncing"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", fontSize: 12, fontFamily: T.sans,
          fontWeight: 500, cursor: state === "syncing" ? "not-allowed" : "pointer",
          background: T.subtle, color: T.textSec,
          border: `1px solid ${T.border}`, borderRadius: T.r,
          opacity: state === "syncing" ? 0.6 : 1,
          transition: "all 0.15s",
        }}
      >
        <RefreshCw size={12} style={state === "syncing" ? { animation: "spin 1s linear infinite" } : {}} />
        {state === "syncing" ? "Synkroniserer..." : "Synk til Linear"}
      </button>

      {state === "error" && errorMsg && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.error }}>
          <AlertCircle size={12} />
          {errorMsg}
        </div>
      )}

      {state === "done" && !linearUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.success }}>
          <CheckCircle size={12} />
          Synkronisert
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

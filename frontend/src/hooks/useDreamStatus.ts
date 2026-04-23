"use client";

// --- useDreamStatus (Fase G, Commit 38) ---
// Polls /agent/sleep/status every 30s so the dream widget knows when a sleep
// cycle is running. Polling pauses while the tab is hidden (visibilitychange)
// and re-fetches immediately on tab-focus so the widget doesn't show stale
// "isRunning=true" after the backend finishes.
//
// State stays stable across polls — we only update React state when the
// payload actually differs, so the widget doesn't flicker on every tick.

import { useEffect, useRef, useState } from "react";
// Bruker relativ import i stedet for `@/lib/api/client` fordi Encores
// TS-scanner (root tsconfig) ikke kjenner `@/*`-aliaset og kaster
// resolve-feil selv om denne filen ligger i ignorert frontend/-tre.
import { apiFetch } from "../lib/api/client";

export interface DreamStatus {
  isRunning: boolean;
  startedAt?: string;
  elapsedSeconds?: number;
  phase?: string;
  progress?: { step: number; total: number };
}

const POLL_INTERVAL_MS = 30_000;
const EMPTY: DreamStatus = { isRunning: false };

function shallowEqual(a: DreamStatus, b: DreamStatus): boolean {
  if (a.isRunning !== b.isRunning) return false;
  if (a.startedAt !== b.startedAt) return false;
  if (a.phase !== b.phase) return false;
  const ap = a.progress;
  const bp = b.progress;
  if (!ap && !bp) return true;
  if (!ap || !bp) return false;
  return ap.step === bp.step && ap.total === bp.total;
}

export function useDreamStatus(): DreamStatus {
  const [status, setStatus] = useState<DreamStatus>(EMPTY);
  const statusRef = useRef<DreamStatus>(EMPTY);
  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    // Separate ticking clock for elapsedSeconds so the widget's stopwatch
    // advances every second without triggering a network call.
    let clockId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const next = await apiFetch<DreamStatus>("/agent/sleep/status", { method: "GET" });
        if (cancelled) return;
        if (!shallowEqual(statusRef.current, next)) {
          setStatus(next);
        }
      } catch {
        // Don't hide the widget on a transient network failure — keep last state.
      }
    };

    // Local 1s tick to keep elapsedSeconds fresh without hitting the server.
    clockId = setInterval(() => {
      const cur = statusRef.current;
      if (!cur.isRunning || !cur.startedAt) return;
      const elapsed = Math.floor((Date.now() - new Date(cur.startedAt).getTime()) / 1000);
      if (elapsed !== cur.elapsedSeconds) {
        setStatus((prev) => ({ ...prev, elapsedSeconds: elapsed }));
      }
    }, 1000);

    const startPolling = () => {
      if (intervalId) return;
      poll();
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (clockId) clearInterval(clockId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return status;
}

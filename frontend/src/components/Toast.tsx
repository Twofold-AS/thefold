"use client";

// --- Toast wrapper (U1) ---
// Thin layer over sonner with T-token styling and a `notify.*` API tailored
// for TheFold's message categories. Mount <ToastRoot /> once at the app
// layout root; call notify.* from anywhere.

import { Toaster, toast } from "sonner";
import { T } from "@/lib/tokens";

type ToastKind = "info" | "success" | "warning" | "error" | "dream";

const DURATIONS: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  warning: 5000,
  error: 6000,
  dream: Infinity, // vedvarende — må lukkes manuelt
};

interface NotifyOptions {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

function show(kind: ToastKind, title: string, opts?: NotifyOptions): void {
  const duration = opts?.duration ?? DURATIONS[kind];
  const args = {
    description: opts?.description,
    duration,
    action: opts?.action,
  };
  // sonner-kall per kind — lar biblioteket sette ikon/farge
  switch (kind) {
    case "success":
      toast.success(title, args);
      return;
    case "warning":
      toast.warning(title, args);
      return;
    case "error":
      toast.error(title, args);
      return;
    case "dream":
      toast(title, { ...args, className: "tf-toast-dream" });
      return;
    case "info":
    default:
      toast.info(title, args);
  }
}

export const notify = {
  info: (title: string, opts?: NotifyOptions) => show("info", title, opts),
  success: (title: string, opts?: NotifyOptions) => show("success", title, opts),
  warning: (title: string, opts?: NotifyOptions) => show("warning", title, opts),
  error: (title: string, opts?: NotifyOptions) => show("error", title, opts),
  dream: (title: string, opts?: NotifyOptions) => show("dream", title, opts),
  /** Dismiss all open toasts */
  dismiss: () => toast.dismiss(),
};

/**
 * Single mount-point. Place in app/layout.tsx once.
 * Uses T-token colors instead of sonner defaults for visual consistency.
 */
export function ToastRoot() {
  return (
    <Toaster
      position="bottom-right"
      expand={false}
      richColors={false}
      closeButton
      toastOptions={{
        style: {
          background: "rgba(20,20,24,0.92)",
          border: `1px solid ${T.border}`,
          color: T.text,
          fontSize: 13,
          fontFamily: T.sans,
          backdropFilter: "blur(14px)",
        },
        className: "tf-toast",
      }}
    />
  );
}

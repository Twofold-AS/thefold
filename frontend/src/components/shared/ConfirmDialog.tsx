"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { T } from "@/lib/tokens";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Bekreft",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent style={{ background: T.raised, border: `1px solid ${T.border}`, color: T.text }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: T.text }}>{title}</AlertDialogTitle>
          <AlertDialogDescription style={{ color: T.textSec }}>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            style={{ background: "transparent", color: T.textSec, border: `1px solid ${T.border}` }}
          >
            Avbryt
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            style={{
              background: variant === "danger" ? T.error : T.accent,
              color: "#fff",
              border: "none",
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

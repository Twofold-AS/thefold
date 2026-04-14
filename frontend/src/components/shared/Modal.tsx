"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { T, S } from "@/lib/tokens";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: "sm" | "md" | "lg";
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, width = "md", children, footer }: ModalProps) {
  const widthClass = { sm: "max-w-[400px]", md: "max-w-[560px]", lg: "max-w-[720px]" }[width];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={widthClass} style={{ background: T.raised, border: `1px solid ${T.border}`, color: T.text }}>
        <DialogHeader>
          <DialogTitle style={{ color: T.text, fontSize: 16, fontWeight: 600 }}>{title}</DialogTitle>
        </DialogHeader>
        <div style={{ padding: `${S.md}px 0` }}>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

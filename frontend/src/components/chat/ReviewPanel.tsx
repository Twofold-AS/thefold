"use client";

import { T } from "@/lib/tokens";
import Btn from "@/components/Btn";

interface ReviewPanelProps {
  reviewId: string;
  loading?: string | null;
  onApprove: (reviewId: string) => void;
  onReject: (reviewId: string) => void;
  onRequestChanges: (reviewId: string, feedback?: string) => void;
}

export default function ReviewPanel({
  reviewId,
  loading,
  onApprove,
  onReject,
  onRequestChanges,
}: ReviewPanelProps) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <Btn primary sm onClick={() => onApprove(reviewId)}>
        {loading === "approve" ? "..." : "Godkjenn"}
      </Btn>
      <Btn sm onClick={() => onRequestChanges(reviewId, "")}>
        {loading === "changes" ? "..." : "Be om endringer"}
      </Btn>
      <Btn sm onClick={() => onReject(reviewId)} style={{ color: T.error }}>
        {loading === "reject" ? "..." : "Avvis"}
      </Btn>
    </div>
  );
}

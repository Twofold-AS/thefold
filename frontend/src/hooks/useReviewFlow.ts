"use client";

import { useState } from "react";
import { approveReview, rejectReview, requestReviewChanges } from "../lib/api";

export function useReviewFlow(
  refreshMsgs: () => void,
  setChatError: (error: string | null) => void
) {
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);

  const handleApprove = async (reviewId: string) => {
    try {
      await approveReview(reviewId);
      refreshMsgs();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Godkjenning feilet");
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      await rejectReview(reviewId);
      refreshMsgs();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Avvisning feilet");
    }
  };

  const handleRequestChanges = (reviewId: string, feedback?: string) => {
    if (!feedback || feedback.trim() === "") {
      setPendingReviewId(reviewId);
      const input = document.querySelector<HTMLInputElement>("[data-chat-input]");
      if (input) input.focus();
      return;
    }
    requestReviewChanges(reviewId, feedback)
      .then(() => refreshMsgs())
      .catch((e) => setChatError(e instanceof Error ? e.message : "Endring feilet"));
  };

  return {
    pendingReviewId,
    setPendingReviewId,
    handleApprove,
    handleReject,
    handleRequestChanges,
  };
}

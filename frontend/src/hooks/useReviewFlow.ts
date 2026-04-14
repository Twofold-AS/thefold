"use client";

import { useState, useCallback } from "react";
import { approveReview, rejectReview, requestReviewChanges } from "../lib/api";

export type ReviewActionType = "approve" | "reject" | "changes" | null;

export function useReviewFlow(
  refreshMsgs: () => void,
  setChatError: (error: string | null) => void
) {
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  // Page-level review action state — survives message re-renders
  const [reviewInProgress, setReviewInProgress] = useState<ReviewActionType>(null);

  const handleApprove = useCallback(async (reviewId: string) => {
    setReviewInProgress("approve");
    try {
      await approveReview(reviewId);
      refreshMsgs();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Godkjenning feilet");
    } finally {
      setReviewInProgress(null);
    }
  }, [refreshMsgs, setChatError]);

  const handleReject = useCallback(async (reviewId: string) => {
    setReviewInProgress("reject");
    try {
      await rejectReview(reviewId);
      refreshMsgs();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Avvisning feilet");
    } finally {
      setReviewInProgress(null);
    }
  }, [refreshMsgs, setChatError]);

  const handleRequestChanges = useCallback((reviewId: string, feedback?: string) => {
    if (!feedback || feedback.trim() === "") {
      setPendingReviewId(reviewId);
      const input = document.querySelector<HTMLInputElement>("[data-chat-input]");
      if (input) input.focus();
      return;
    }
    setReviewInProgress("changes");
    requestReviewChanges(reviewId, feedback)
      .then(() => refreshMsgs())
      .catch((e) => setChatError(e instanceof Error ? e.message : "Endring feilet"))
      .finally(() => setReviewInProgress(null));
  }, [refreshMsgs, setChatError]);

  return {
    pendingReviewId,
    setPendingReviewId,
    reviewInProgress,
    handleApprove,
    handleReject,
    handleRequestChanges,
  };
}

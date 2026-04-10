"use client";

import AgentStream from "@/components/AgentStream";
import { approveReview, rejectReview, requestReviewChanges } from "@/lib/api";

interface Props {
  content: string;
  conversationId: string | null;
  onCancelSending: () => void;
  onError: (msg: string) => void;
  onRefresh: () => void;
  onPendingReview: (reviewId: string) => void;
}

export default function MessageWithAgent({
  content,
  conversationId,
  onCancelSending,
  onError,
  onRefresh,
  onPendingReview,
}: Props) {
  return (
    <AgentStream
      content={content}
      onCancel={onCancelSending}
      onApprove={async (reviewId) => {
        try {
          await approveReview(reviewId);
          onRefresh();
        } catch (e) {
          onError(e instanceof Error ? e.message : "Godkjenning feilet");
        }
      }}
      onReject={async (reviewId) => {
        try {
          await rejectReview(reviewId);
          onRefresh();
        } catch (e) {
          onError(e instanceof Error ? e.message : "Avvisning feilet");
        }
      }}
      onRequestChanges={async (reviewId, feedback) => {
        if (!feedback || feedback.trim() === "") {
          onPendingReview(reviewId);
          const input = document.querySelector<HTMLInputElement>("[data-chat-input]");
          if (input) input.focus();
          return;
        }
        try {
          await requestReviewChanges(reviewId, feedback);
          onRefresh();
        } catch (e) {
          onError(e instanceof Error ? e.message : "Endring feilet");
        }
      }}
    />
  );
}

"use client";

import AgentStream from "@/components/AgentStream";
import { approveReview, rejectReview, requestReviewChanges } from "@/lib/api";

interface MessageWithAgentProps {
  content: string;
  /** Called when the user clicks cancel on the agent stream */
  onCancel: () => void;
  /** Called on any review action error with a human-readable message */
  onError: (msg: string) => void;
  /** Called after a successful approve/reject/request-changes to refresh messages */
  onRefresh: () => void;
  /**
   * Called when the user clicks "request changes" without providing inline
   * feedback — the page should set pendingReviewId and focus the chat input.
   */
  onReviewPending: (reviewId: string) => void;
}

/**
 * Renders an AgentStream with all review action handlers wired up.
 * Consolidates the two identical AgentStream blocks from chat/page.tsx.
 */
export default function MessageWithAgent({
  content,
  onCancel,
  onError,
  onRefresh,
  onReviewPending,
}: MessageWithAgentProps) {
  return (
    <AgentStream
      content={content}
      onCancel={onCancel}
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
          onReviewPending(reviewId);
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

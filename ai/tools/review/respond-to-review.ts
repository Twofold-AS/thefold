// ai/tools/review/respond-to-review.ts
// Migrated from ai/tools.ts `respond_to_review` handler.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  reviewId: z.string(),
  action: z.enum(["approve", "request_changes", "reject"]),
  feedback: z.string().optional(),
});

export const respondToReviewTool: Tool<z.infer<typeof inputSchema>> = {
  name: "respond_to_review",
  description:
    "Use when the user responds to a completed project review. Call this when the user approves, requests changes, or rejects the delivery.",
  category: "review",
  inputSchema,

  surfaces: ["chat"],
  costHint: "low",

  async handler(input, _ctx) {
    const { agent: agentClient } = await import("~encore/clients");
    const feedback = input.feedback || "";

    if (input.action === "approve") {
      await agentClient.approveReview({ reviewId: input.reviewId });
      return {
        success: true,
        message: "Prosjektet er godkjent. PR opprettes og sandbox ryddes.",
      };
    }
    if (input.action === "request_changes") {
      await agentClient.requestChanges({ reviewId: input.reviewId, feedback });
      return {
        success: true,
        message: "Tilbakemelding sendt til agenten. Ny iterasjon starter.",
      };
    }
    // reject
    await agentClient.rejectReview({
      reviewId: input.reviewId,
      reason: feedback || undefined,
    });
    return {
      success: true,
      message: "Prosjektet er avvist. Sandbox ryddes.",
    };
  },
};

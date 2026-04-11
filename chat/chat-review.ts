import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "./chat";

// --- ZD: Chat-based review actions (approve/changes/reject from chat) ---

export const approveFromChat = api(
  { method: "POST", path: "/chat/review/approve", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string }): Promise<{ prUrl: string }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    const conv = await db.queryRow<{ owner_email: string }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;
    if (!conv || conv.owner_email !== authData.email) {
      throw APIError.permissionDenied("Not your conversation");
    }

    const { agent } = await import("~encore/clients");
    return agent.approveReview({ reviewId: req.reviewId });
  }
);

export const requestChangesFromChat = api(
  { method: "POST", path: "/chat/review/changes", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string; feedback: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    const conv = await db.queryRow<{ owner_email: string }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;
    if (!conv || conv.owner_email !== authData.email) {
      throw APIError.permissionDenied("Not your conversation");
    }

    const { agent } = await import("~encore/clients");
    await agent.requestChanges({ reviewId: req.reviewId, feedback: req.feedback });
    return { success: true };
  }
);

export const rejectFromChat = api(
  { method: "POST", path: "/chat/review/reject", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string; feedback?: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    const conv = await db.queryRow<{ owner_email: string }>`
      SELECT owner_email FROM conversations WHERE id = ${req.conversationId}
    `;
    if (!conv || conv.owner_email !== authData.email) {
      throw APIError.permissionDenied("Not your conversation");
    }

    const { agent } = await import("~encore/clients");
    await agent.rejectReview({ reviewId: req.reviewId, reason: req.feedback });
    return { success: true };
  }
);

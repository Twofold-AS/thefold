import { repoConversationId } from "@/lib/api";

/**
 * Generate a new conversation ID.
 * - If repoName is provided, returns a stable repo-scoped ID via repoConversationId().
 * - Otherwise returns a unique ephemeral chat ID.
 */
export function createConversationId(repoName?: string | null): string {
  if (repoName) return repoConversationId(repoName);
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

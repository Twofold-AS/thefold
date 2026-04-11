import { repoConversationId } from "./api";

export { repoConversationId };

export function createConversationId(repoName: string | null): string {
  return repoName
    ? repoConversationId(repoName)
    : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

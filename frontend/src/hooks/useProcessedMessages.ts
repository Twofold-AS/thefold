import { useMemo } from "react";
import { type Message } from "@/lib/api";

function isAgentMessage(m: Message): boolean {
  return (
    m.messageType === "agent_status" ||
    m.messageType === "agent_thought" ||
    m.messageType === "agent_progress" ||
    m.messageType === "agent_report" ||
    (m.role === "assistant" && m.content.startsWith("{") && m.content.includes('"type":'))
  );
}

interface ProcessedMessages {
  /** Messages with all-but-the-last agent message removed */
  dedupedMsgs: Message[];
  /** The single surviving agent message, if any */
  lastAgentMsg: Message | undefined;
  /**
   * The ID of the last assistant chat message that appears before lastAgentMsg.
   * When set, the agent status should be rendered merged under that bubble.
   */
  mergedChatId: string | null;
  isAgentMessage: (m: Message) => boolean;
}

/**
 * Deduplicates agent messages (keeps only the last one) and computes the
 * chat-message ID that the agent status should be visually merged under.
 */
export function useProcessedMessages(msgs: Message[]): ProcessedMessages {
  return useMemo(() => {
    // Keep only the last agent message
    let lastAgentIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (isAgentMessage(msgs[i])) { lastAgentIdx = i; break; }
    }
    const dedupedMsgs = msgs.filter((m, i) => {
      if (!isAgentMessage(m)) return true;
      return i === lastAgentIdx;
    });

    const lastAgentMsg = dedupedMsgs.find(m => isAgentMessage(m));

    // Find the last assistant chat bubble that appears before the agent message
    let mergedChatId: string | null = null;
    if (lastAgentMsg) {
      for (const m of dedupedMsgs) {
        if (m.role === "assistant" && !isAgentMessage(m) && m.content?.trim()) {
          mergedChatId = m.id;
        }
        if (m === lastAgentMsg) break;
      }
    }

    return { dedupedMsgs, lastAgentMsg, mergedChatId, isAgentMessage };
  }, [msgs]);
}

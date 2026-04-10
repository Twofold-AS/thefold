import type { Message } from "@/lib/api";

export function isAgentMessage(m: Message): boolean {
  return (
    m.messageType === "agent_status" ||
    m.messageType === "agent_thought" ||
    m.messageType === "agent_progress" ||
    m.messageType === "agent_report" ||
    (m.role === "assistant" && m.content.startsWith("{") && m.content.includes('"type":'))
  );
}

interface ProcessedMessages {
  messages: Message[];
  lastAgentMsg: Message | undefined;
  mergeUnderChatId: string | null;
}

export function useProcessedMessages(msgs: Message[]): ProcessedMessages {
  let lastAgentIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (isAgentMessage(msgs[i])) { lastAgentIdx = i; break; }
  }

  const messages = msgs.filter((m, i) => {
    if (!isAgentMessage(m)) return true;
    return i === lastAgentIdx;
  });

  const lastAgentMsg = messages.find((m) => isAgentMessage(m));

  const mergeUnderChatId = lastAgentMsg
    ? (() => {
        let found: string | null = null;
        for (const m of messages) {
          if (m.role === "assistant" && !isAgentMessage(m) && m.content?.trim()) {
            found = m.id;
          }
          if (m === lastAgentMsg) break;
        }
        return found;
      })()
    : null;

  return { messages, lastAgentMsg, mergeUnderChatId };
}

import log from "encore.dev/log";

// --- Types ---

export interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** Optional priority hint — higher = more important to retain */
  priority?: number;
  /** True if this message contains tool results */
  isToolResult?: boolean;
  /** Approximate token count (computed if absent) */
  tokenCount?: number;
}

export interface ContextManagerResult {
  messages: ContextMessage[];
  originalCount: number;
  trimmedCount: number;
  estimatedTokens: number;
  summarizedRanges: Array<{ start: number; end: number; summary: string }>;
  utilizationPct: number;
}

// --- Token estimation ---

/** Rough estimate: 1 token ≈ 4 chars for English/code content */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function messageTokens(msg: ContextMessage): number {
  if (msg.tokenCount != null) return msg.tokenCount;
  // +4 for role/structural overhead per message
  return estimateTokens(msg.content) + 4;
}

// --- Priority scoring ---

/**
 * Assign a retention score (higher = keep).
 * Priority order: system > recent tool results > recent messages > old messages
 */
function retentionScore(msg: ContextMessage, index: number, total: number): number {
  if (msg.role === "system") return 10000;
  if (msg.priority != null) return msg.priority;

  const recency = index / total; // 0 = oldest, 1 = newest
  let score = recency * 100;

  if (msg.isToolResult) score += 50;
  // Boost last few messages heavily so they're always retained
  if (index >= total - 3) score += 200;

  return score;
}

// --- Summarization ---

/** Produce a compact summary of a block of messages */
function summarizeBlock(messages: ContextMessage[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const prefix = msg.role === "user" ? "User" : "Assistant";
    const snippet = msg.content.slice(0, 200).replace(/\n+/g, " ");
    lines.push(`${prefix}: ${snippet}${msg.content.length > 200 ? "…" : ""}`);
  }
  return `[SUMMARIZED ${messages.length} messages]\n${lines.join("\n")}`;
}

// --- Core function ---

/**
 * Trim a message array to fit within maxTokens.
 *
 * Strategy:
 * 1. Always retain system messages and the last 3 messages.
 * 2. When total > 80% of maxTokens, summarize the oldest non-system, non-recent block.
 * 3. Repeat until under limit.
 */
export function manageContext(
  messages: ContextMessage[],
  maxTokens: number,
): ContextManagerResult {
  const warningThreshold = Math.floor(maxTokens * 0.8);
  const original = messages.map(m => ({ ...m }));
  const summarizedRanges: Array<{ start: number; end: number; summary: string }> = [];

  let working = messages.map(m => ({ ...m }));
  let totalTokens = working.reduce((sum, m) => sum + messageTokens(m), 0);

  if (totalTokens <= warningThreshold) {
    return {
      messages: working,
      originalCount: original.length,
      trimmedCount: 0,
      estimatedTokens: totalTokens,
      summarizedRanges: [],
      utilizationPct: Math.round((totalTokens / maxTokens) * 100),
    };
  }

  log.info("Context approaching limit — trimming", {
    totalTokens,
    maxTokens,
    messageCount: working.length,
  });

  let iterations = 0;
  while (totalTokens > warningThreshold && iterations < 10) {
    iterations++;

    // Find the first summarizable block: non-system, not in the last 3
    const candidates = working
      .map((m, i) => ({ m, i, score: retentionScore(m, i, working.length) }))
      .filter(({ m }) => m.role !== "system")
      .sort((a, b) => a.score - b.score); // lowest score = least important

    if (candidates.length === 0) break;

    // Summarize the bottom ~25% of candidates by score
    const toSummarize = candidates
      .slice(0, Math.max(1, Math.floor(candidates.length * 0.25)))
      .map(c => c.i)
      .sort((a, b) => a - b);

    if (toSummarize.length === 0) break;

    const startIdx = toSummarize[0];
    const endIdx = toSummarize[toSummarize.length - 1];
    const block = working.slice(startIdx, endIdx + 1);
    const summary = summarizeBlock(block);

    const summaryMsg: ContextMessage = {
      role: "assistant",
      content: summary,
      priority: 10, // moderate — keep summaries but prefer real messages
      isToolResult: false,
    };

    summarizedRanges.push({ start: startIdx, end: endIdx, summary });

    // Replace the block with the summary
    working = [
      ...working.slice(0, startIdx),
      summaryMsg,
      ...working.slice(endIdx + 1),
    ];

    totalTokens = working.reduce((sum, m) => sum + messageTokens(m), 0);
  }

  const trimmedCount = original.length - working.length;

  log.info("Context trimmed", {
    originalMessages: original.length,
    trimmedMessages: working.length,
    originalTokens: original.reduce((s, m) => s + messageTokens(m), 0),
    finalTokens: totalTokens,
    utilizationPct: Math.round((totalTokens / maxTokens) * 100),
  });

  return {
    messages: working,
    originalCount: original.length,
    trimmedCount,
    estimatedTokens: totalTokens,
    summarizedRanges,
    utilizationPct: Math.round((totalTokens / maxTokens) * 100),
  };
}

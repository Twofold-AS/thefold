// --- Memory Decay Functions ---
// Extracted to separate file to avoid ~encore/clients dependency in tests

export type MemoryType = 'skill' | 'task' | 'session' | 'error_pattern' | 'decision' | 'general' | 'strategy';

/** Calculate importance score (0.0–1.0) based on memory type and category */
export function calculateImportanceScore(
  memoryType: MemoryType,
  category: string,
  pinned: boolean
): number {
  if (pinned) return 1.0;

  // Base score from memory_type
  let score: number;
  switch (memoryType) {
    case "error_pattern": score = 0.9; break;
    case "decision":      score = 0.85; break;
    case "strategy":      score = 0.8; break;
    case "skill":         score = 0.7; break;
    case "task":          score = 0.6; break;
    case "session":       score = 0.4; break;
    case "general":
    default:              score = 0.3; break;
  }

  // Category modifier
  const cat = category.toLowerCase();
  if (cat.includes("architecture") || cat.includes("security")) {
    score = Math.min(1.0, score + 0.1);
  } else if (cat.includes("chat") || cat.includes("conversation")) {
    score = Math.max(0.1, score - 0.1);
  }

  return Math.round(score * 100) / 100;
}

/**
 * Calculate decayed relevance for a memory.
 *
 * Formula: relevance = importance × recency_factor × access_factor
 *
 * recency_factor = exp(-ln2 × age_days / half_life)
 *   half_life: 90 days for error_pattern/decision, 30 days for others
 *
 * access_factor = 1 + access_recency × access_frequency × 0.5
 *   access_recency = exp(-0.1 × days_since_last_access)
 *   access_frequency = log10(1 + access_count)
 *
 * Pinned memories always return 1.0.
 */
export function calculateDecayedRelevance(
  importance: number,
  createdAt: Date,
  accessCount: number,
  lastAccessedAt: Date,
  memoryType: MemoryType,
  pinned: boolean,
  now?: Date
): number {
  if (pinned) return 1.0;

  const currentTime = (now ?? new Date()).getTime();

  // Half-life: longer-lived types decay slower
  const halfLife = (memoryType === "error_pattern" || memoryType === "decision" || memoryType === "strategy") ? 90 : 30;

  // Recency factor: exponential decay based on age
  const ageDays = (currentTime - createdAt.getTime()) / 86_400_000;
  const recencyFactor = Math.exp(-Math.LN2 * ageDays / halfLife);

  // Access factor: recently/frequently accessed memories decay slower
  const daysSinceAccess = (currentTime - lastAccessedAt.getTime()) / 86_400_000;
  const accessRecency = Math.exp(-0.1 * daysSinceAccess);
  const accessFrequency = Math.log10(1 + accessCount);
  const accessFactor = 1 + accessRecency * accessFrequency * 0.5;

  return Math.min(1.0, Math.round(importance * recencyFactor * accessFactor * 10000) / 10000);
}

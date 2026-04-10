import log from "encore.dev/log";
import { db } from "./db";

// --- Types ---

export interface CachedDecision {
  id: string;
  pattern: string;
  patternRegex: string;
  confidence: number;
  strategy: "fast_path" | "standard" | "careful";
  skipConfidence: boolean;
  skipComplexity: boolean;
  preferredModel: string | null;
  planTemplate: unknown;
  successCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Minimum confidence threshold to consider a cached decision valid
const MIN_MATCH_CONFIDENCE = 0.5;

// --- DB Row helper ---

interface DecisionCacheRow {
  id: string;
  pattern: string;
  pattern_regex: string;
  confidence: number;
  strategy: string;
  skip_confidence: boolean;
  skip_complexity: boolean;
  preferred_model: string | null;
  plan_template: unknown;
  success_count: number;
  failure_count: number;
  created_at: Date;
  updated_at: Date;
}

function rowToDecision(row: DecisionCacheRow): CachedDecision {
  return {
    id: row.id,
    pattern: row.pattern,
    patternRegex: row.pattern_regex,
    confidence: row.confidence,
    strategy: row.strategy as CachedDecision["strategy"],
    skipConfidence: row.skip_confidence,
    skipComplexity: row.skip_complexity,
    preferredModel: row.preferred_model,
    planTemplate:
      typeof row.plan_template === "string"
        ? JSON.parse(row.plan_template)
        : row.plan_template,
    successCount: row.success_count,
    failureCount: row.failure_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- matchDecision ---

/**
 * Find a cached decision that matches the given task description.
 * Uses regex matching against the pattern_regex column.
 * Returns the best match (highest confidence) above MIN_MATCH_CONFIDENCE, or null.
 */
export async function matchDecision(
  taskDescription: string,
): Promise<CachedDecision | null> {
  try {
    // Fetch all decisions with confidence above threshold, sorted by confidence DESC
    const rows = db.query<DecisionCacheRow>`
      SELECT id, pattern, pattern_regex, confidence, strategy,
             skip_confidence, skip_complexity, preferred_model,
             plan_template, success_count, failure_count,
             created_at, updated_at
      FROM decision_cache
      WHERE confidence >= ${MIN_MATCH_CONFIDENCE}
      ORDER BY confidence DESC
      LIMIT 50
    `;

    const desc = taskDescription.toLowerCase();

    for await (const row of rows) {
      try {
        const regex = new RegExp(row.pattern_regex, "i");
        if (regex.test(desc)) {
          log.info("decision cache hit", {
            pattern: row.pattern,
            confidence: row.confidence,
            strategy: row.strategy,
          });
          return rowToDecision(row);
        }
      } catch (regexErr) {
        // Invalid regex stored in DB — skip this entry
        log.warn("decision cache: invalid regex", {
          id: row.id,
          regex: row.pattern_regex,
          error: regexErr instanceof Error ? regexErr.message : String(regexErr),
        });
      }
    }

    return null;
  } catch (err) {
    // Non-critical — decision cache is an optimization, not a hard requirement
    log.warn("matchDecision failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// --- updateDecisionCache ---

/**
 * Update confidence score for a cached decision based on outcome.
 * On success: increase confidence (up to 0.98).
 * On failure: decrease confidence (down to 0.1).
 *
 * Uses a simple exponential moving average:
 *   success: new_conf = conf + 0.05 * (1 - conf)
 *   failure: new_conf = conf - 0.1 * conf
 */
export async function updateDecisionCache(
  patternOrId: string,
  success: boolean,
): Promise<void> {
  try {
    if (success) {
      await db.exec`
        UPDATE decision_cache
        SET success_count = success_count + 1,
            confidence = LEAST(0.98, confidence + 0.05 * (1.0 - confidence)),
            updated_at = NOW()
        WHERE pattern = ${patternOrId} OR id::text = ${patternOrId}
      `;
    } else {
      await db.exec`
        UPDATE decision_cache
        SET failure_count = failure_count + 1,
            confidence = GREATEST(0.1, confidence - 0.1 * confidence),
            updated_at = NOW()
        WHERE pattern = ${patternOrId} OR id::text = ${patternOrId}
      `;
    }

    log.info("decision cache updated", { patternOrId, success });
  } catch (err) {
    // Non-critical
    log.warn("updateDecisionCache failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// --- createDecisionEntry ---

/**
 * Create a new decision cache entry for a pattern that proved successful on the fast path.
 * Used when a standard-path task completes quickly and cheaply, suggesting it could be
 * a fast-path candidate in the future.
 */
export async function createDecisionEntry(params: {
  pattern: string;
  patternRegex: string;
  strategy: CachedDecision["strategy"];
  skipConfidence: boolean;
  skipComplexity: boolean;
  preferredModel: string | null;
  initialConfidence?: number;
}): Promise<void> {
  try {
    const confidence = params.initialConfidence ?? 0.6;

    await db.exec`
      INSERT INTO decision_cache (
        pattern, pattern_regex, confidence, strategy,
        skip_confidence, skip_complexity, preferred_model
      )
      VALUES (
        ${params.pattern},
        ${params.patternRegex},
        ${confidence},
        ${params.strategy},
        ${params.skipConfidence},
        ${params.skipComplexity},
        ${params.preferredModel}
      )
      ON CONFLICT DO NOTHING
    `;

    log.info("decision cache entry created", {
      pattern: params.pattern,
      strategy: params.strategy,
      confidence,
    });
  } catch (err) {
    log.warn("createDecisionEntry failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

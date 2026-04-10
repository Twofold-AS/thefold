import { db } from "./db";
import log from "encore.dev/log";
import crypto from "crypto";

interface RoutingMatch {
  patternHash: string;
  specialist: string;
  modelRecommendation: string | null;
  confidence: number;
}

function hashKeywords(keywords: string[]): string {
  return crypto
    .createHash("sha256")
    .update(keywords.sort().join("|"))
    .digest("hex")
    .substring(0, 16);
}

function extractKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 10);
}

export async function matchRoutingPattern(
  message: string
): Promise<RoutingMatch | null> {
  const keywords = extractKeywords(message);
  if (keywords.length === 0) return null;

  try {
    // Find patterns with keyword overlap
    const rows = db.query<{
      id: string;
      pattern_hash: string;
      task_keywords: string[];
      specialist: string;
      model_recommendation: string | null;
      confidence: number;
      hit_count: number;
    }>`
      SELECT id, pattern_hash, task_keywords, specialist, model_recommendation, confidence, hit_count
      FROM routing_patterns
      WHERE confidence > 0.8 AND hit_count > 5
      ORDER BY confidence DESC LIMIT 20
    `;

    let bestMatch: RoutingMatch | null = null;
    let bestOverlap = 0;

    for await (const row of rows) {
      const patternKeywords = row.task_keywords || [];
      const overlap = keywords.filter((k) => patternKeywords.includes(k)).length;
      const overlapRatio =
        overlap / Math.max(keywords.length, patternKeywords.length);
      if (overlapRatio > 0.6 && overlapRatio > bestOverlap) {
        bestOverlap = overlapRatio;
        bestMatch = {
          patternHash: row.pattern_hash,
          specialist: row.specialist,
          modelRecommendation: row.model_recommendation,
          confidence: row.confidence,
        };
      }
    }

    if (bestMatch) {
      await db.exec`
        UPDATE routing_patterns SET hit_count = hit_count + 1, last_hit_at = NOW()
        WHERE pattern_hash = ${bestMatch.patternHash}
      `;
    }

    return bestMatch;
  } catch {
    return null;
  }
}

export async function recordRoutingPattern(
  message: string,
  result: { success: boolean; model: string; specialist?: string }
): Promise<void> {
  const keywords = extractKeywords(message);
  if (keywords.length < 2) return;

  const hash = hashKeywords(keywords);

  try {
    await db.exec`
      INSERT INTO routing_patterns (pattern_hash, task_keywords, specialist, model_recommendation, confidence, hit_count, success_count)
      VALUES (${hash}, ${keywords}::text[], ${result.specialist || "general"}, ${result.model}, 0.5, 1, ${result.success ? 1 : 0})
      ON CONFLICT (pattern_hash) DO UPDATE SET
        hit_count = routing_patterns.hit_count + 1,
        success_count = routing_patterns.success_count + CASE WHEN ${result.success} THEN 1 ELSE 0 END,
        confidence = LEAST(0.98, routing_patterns.success_count::float / NULLIF(routing_patterns.hit_count, 0)),
        model_recommendation = ${result.model},
        last_hit_at = NOW()
    `;
  } catch (err) {
    log.warn("failed to record routing pattern", { error: String(err) });
  }
}

export async function updateTaskTypeProfile(
  taskType: string,
  data: {
    model: string;
    complexity: number;
    tokens: number;
    retries: number;
  }
): Promise<void> {
  try {
    await db.exec`
      INSERT INTO task_type_profiles (task_type, typical_model, typical_complexity, average_tokens, average_retries, sample_count)
      VALUES (${taskType}, ${data.model}, ${data.complexity}, ${data.tokens}, ${data.retries}, 1)
      ON CONFLICT (task_type) DO UPDATE SET
        typical_model = ${data.model},
        typical_complexity = (task_type_profiles.typical_complexity * task_type_profiles.sample_count + ${data.complexity}) / (task_type_profiles.sample_count + 1),
        average_tokens = (task_type_profiles.average_tokens * task_type_profiles.sample_count + ${data.tokens}) / (task_type_profiles.sample_count + 1),
        average_retries = (task_type_profiles.average_retries * task_type_profiles.sample_count + ${data.retries}) / (task_type_profiles.sample_count + 1),
        sample_count = task_type_profiles.sample_count + 1,
        updated_at = NOW()
    `;
  } catch { /* non-critical */ }
}

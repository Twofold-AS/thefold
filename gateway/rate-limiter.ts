import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { db } from "./db";

// Fase J.6 — Fixed-window rate-limiting, PG-backed.
// Global: 200 req/min pr. bruker.
// Per-endpoint: egne kvoter (f.eks. /ai/chat 20/min, /auth/request-otp 5/time).
// Over limit → kaster APIError.resourceExhausted med Retry-After-metadata.

export interface RateLimitConfig {
  bucket: string;
  windowSeconds: number;
  limit: number;
}

const GLOBAL_LIMIT: RateLimitConfig = {
  bucket: "global",
  windowSeconds: 60,
  limit: 200,
};

// Per-endpoint kvoter. Nøklene matcher endpoint-navn fra Encore requestMeta.
// Hvis et endpoint ikke står her, brukes bare global-limit.
export const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  // AI / dyre kall
  "chat.send":          { bucket: "chat_send",   windowSeconds: 60, limit: 20 },
  "ai.chat":            { bucket: "ai_chat",     windowSeconds: 60, limit: 20 },
  "ai.planTask":        { bucket: "ai_plan",     windowSeconds: 60, limit: 10 },
  "ai.decomposeProject":{ bucket: "ai_decompose",windowSeconds: 60, limit: 5 },

  // Agent / task starts
  "agent.startTask":    { bucket: "agent_start", windowSeconds: 60, limit: 10 },

  // Auth / brute-force-utsatt
  "users.requestOtp":   { bucket: "otp_request", windowSeconds: 3600, limit: 5 },
  "users.verifyOtp":    { bucket: "otp_verify",  windowSeconds: 60, limit: 10 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetEpoch: number;
  retryAfterSeconds?: number;
}

async function checkBucket(
  userId: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const bucketStart = Math.floor(now / cfg.windowSeconds) * cfg.windowSeconds;
  const resetEpoch = bucketStart + cfg.windowSeconds;

  const row = await db.queryRow<{ count: number }>`
    INSERT INTO rate_limit_counters (user_id, bucket, bucket_start_ts, count)
    VALUES (${userId}, ${cfg.bucket}, ${bucketStart}, 1)
    ON CONFLICT (user_id, bucket, bucket_start_ts)
    DO UPDATE SET count = rate_limit_counters.count + 1, updated_at = NOW()
    RETURNING count
  `;

  const count = row?.count ?? 1;
  const remaining = Math.max(0, cfg.limit - count);
  const allowed = count <= cfg.limit;
  const retryAfterSeconds = allowed ? undefined : Math.max(1, resetEpoch - now);

  return { allowed, remaining, resetEpoch, retryAfterSeconds };
}

/**
 * Sjekk rate-limit for en gitt bruker og endpoint.
 * Kaster APIError.resourceExhausted ved overskridelse (global ELLER per-endpoint).
 * Returnerer ellers remaining + reset-info for X-RateLimit-* headers.
 */
export async function enforceRateLimit(
  userId: string,
  endpointName: string,
): Promise<RateLimitResult> {
  // Global først — hvis total overskrides, kast før endpoint-tellere berøres.
  const global = await checkBucket(userId, GLOBAL_LIMIT);
  if (!global.allowed) {
    log.warn("rate limit exceeded (global)", {
      userId,
      endpointName,
      retryAfter: global.retryAfterSeconds,
    });
    throw rateLimitError(global.retryAfterSeconds ?? 60, "global");
  }

  const epCfg = ENDPOINT_LIMITS[endpointName];
  if (epCfg) {
    const ep = await checkBucket(userId, epCfg);
    if (!ep.allowed) {
      log.warn("rate limit exceeded (endpoint)", {
        userId,
        endpointName,
        retryAfter: ep.retryAfterSeconds,
      });
      throw rateLimitError(ep.retryAfterSeconds ?? 60, epCfg.bucket);
    }
    // Returner det strengeste av de to (minst remaining).
    return ep.remaining < global.remaining ? ep : global;
  }

  return global;
}

function rateLimitError(retryAfterSeconds: number, bucket: string): APIError {
  return APIError.resourceExhausted(
    `rate limit exceeded (${bucket}); retry after ${retryAfterSeconds}s`,
  ).withDetails({ retryAfterSeconds, bucket });
}

// --- Cleanup cron ---

export const cleanupRateLimits = api(
  { method: "POST", path: "/gateway/cleanup-rate-limits", expose: false },
  async (): Promise<{ deleted: number }> => {
    const cutoff = Math.floor(Date.now() / 1000) - 3600; // 1 time tilbake
    const row = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM rate_limit_counters WHERE bucket_start_ts < ${cutoff}
        RETURNING user_id
      )
      SELECT COUNT(*)::int as count FROM deleted
    `;
    return { deleted: row?.count ?? 0 };
  }
);

// Renamed from "cleanup-rate-limits" — collided with agent/rate-limiter.ts's
// CronJob of the same name. Encore 1.56+ rejects duplicate cron names.
const _cleanupCron = new CronJob("gateway-cleanup-rate-limits", {
  title: "Clean up old rate-limit counters",
  every: "30m",
  endpoint: cleanupRateLimits,
});

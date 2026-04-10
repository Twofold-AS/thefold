import log from "encore.dev/log";
import type { AgentExecutionContext } from "./types";

// --- Phase-End Hooks (D18) ---

export type HookPhase = "after:building" | "after:completed" | "after:failed" | "after:reviewing";

type HookCallback = (context: HookContext) => Promise<void>;

export interface HookContext {
  ctx: AgentExecutionContext;
  filesChanged?: string[];
  errorMessage?: string;
  qualityScore?: number;
}

const hookRegistry: Map<HookPhase, HookCallback[]> = new Map();

/**
 * Register a callback to run after a specific agent phase completes.
 * Multiple callbacks per phase are supported and run sequentially.
 */
export function registerHook(phase: HookPhase, callback: HookCallback): void {
  const existing = hookRegistry.get(phase) || [];
  hookRegistry.set(phase, [...existing, callback]);
}

/**
 * Run all registered hooks for a phase.
 * Hook failures are caught and logged — they never block the main flow.
 */
export async function runHooks(phase: HookPhase, context: HookContext): Promise<void> {
  const callbacks = hookRegistry.get(phase) || [];
  for (const cb of callbacks) {
    try {
      await cb(context);
    } catch (err) {
      log.warn("hook failed", { phase, error: String(err) });
    }
  }
}

// --- Default hooks ---

registerHook("after:building", async ({ ctx, filesChanged }) => {
  // Extract code patterns from generated files — fire and forget stub
  log.info("hook:after:building", { filesChanged: filesChanged?.length ?? 0, repo: ctx.repoName });
});

registerHook("after:completed", async ({ ctx, qualityScore }) => {
  // Covered by completion.ts (memory store, decision cache) — this is the hook entry point
  log.info("hook:after:completed", { qualityScore, repo: ctx.repoName });
});

registerHook("after:failed", async ({ ctx, errorMessage }) => {
  // Log failed pattern for future avoidance
  log.info("hook:after:failed", { error: errorMessage?.substring(0, 200), repo: ctx.repoName });
});

registerHook("after:reviewing", async ({ ctx, qualityScore }) => {
  // Review completed — log quality signal
  log.info("hook:after:reviewing", { qualityScore, repo: ctx.repoName });
});

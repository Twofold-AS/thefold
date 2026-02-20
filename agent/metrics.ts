import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = SQLDatabase.named("agent");

// === Types ===

export interface PhaseMetrics {
  phase: string;
  tokensInput: number;
  tokensOutput: number;
  cachedTokens: number;
  costUsd: number;
  durationMs: number;
  model: string;
  aiCalls: number;
}

export interface AICallRecord {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  costEstimate?: { totalCost: number };
  modelUsed?: string;
}

export interface PhaseTracker {
  start(phase: string): void;
  recordAICall(response: AICallRecord): void;
  end(): PhaseMetrics | null;
  getAll(): PhaseMetrics[];
}

// === Phase Tracker (in-memory per task) ===

export function createPhaseTracker(): PhaseTracker {
  const completed: PhaseMetrics[] = [];
  let current: {
    phase: string;
    startTime: number;
    tokensInput: number;
    tokensOutput: number;
    cachedTokens: number;
    costUsd: number;
    model: string;
    aiCalls: number;
  } | null = null;

  const tracker: PhaseTracker = {
    start(phase: string) {
      // Auto-end previous phase if still open
      if (current) {
        tracker.end();
      }
      current = {
        phase,
        startTime: Date.now(),
        tokensInput: 0,
        tokensOutput: 0,
        cachedTokens: 0,
        costUsd: 0,
        model: "",
        aiCalls: 0,
      };
    },

    recordAICall(response: AICallRecord) {
      if (!current) return;
      current.tokensInput += response.inputTokens || 0;
      current.tokensOutput += response.outputTokens || 0;
      current.cachedTokens += response.cacheReadTokens || 0;
      current.costUsd += response.costEstimate?.totalCost || 0;
      current.model = response.modelUsed || current.model;
      current.aiCalls++;
    },

    end(): PhaseMetrics | null {
      if (!current) return null;
      const metrics: PhaseMetrics = {
        phase: current.phase,
        tokensInput: current.tokensInput,
        tokensOutput: current.tokensOutput,
        cachedTokens: current.cachedTokens,
        costUsd: current.costUsd,
        durationMs: Date.now() - current.startTime,
        model: current.model,
        aiCalls: current.aiCalls,
      };
      completed.push(metrics);
      current = null;
      return metrics;
    },

    getAll(): PhaseMetrics[] {
      // Include current phase if still open
      if (current) {
        return [...completed, {
          phase: current.phase,
          tokensInput: current.tokensInput,
          tokensOutput: current.tokensOutput,
          cachedTokens: current.cachedTokens,
          costUsd: current.costUsd,
          durationMs: Date.now() - current.startTime,
          model: current.model,
          aiCalls: current.aiCalls,
        }];
      }
      return [...completed];
    },
  };

  return tracker;
}

// === Persistent storage ===

export async function savePhaseMetrics(jobId: string, taskId: string, metrics: PhaseMetrics[]): Promise<void> {
  for (const m of metrics) {
    await db.exec`
      INSERT INTO agent_phase_metrics
        (job_id, task_id, phase, tokens_input, tokens_output, cached_tokens,
         cost_usd, duration_ms, model, ai_calls)
      VALUES
        (${jobId}::uuid, ${taskId}, ${m.phase}, ${m.tokensInput}, ${m.tokensOutput},
         ${m.cachedTokens}, ${m.costUsd}, ${m.durationMs}, ${m.model}, ${m.aiCalls})
    `;
  }
}

// === Query functions ===

export interface PhaseMetricsSummary {
  phase: string;
  avgCostUsd: number;
  avgTokensInput: number;
  avgTokensOutput: number;
  avgDurationMs: number;
  totalCostUsd: number;
  totalAiCalls: number;
  taskCount: number;
  p95CostUsd: number;
}

export async function getPhaseMetricsSummary(days: number = 7): Promise<PhaseMetricsSummary[]> {
  const rows = db.query<PhaseMetricsSummary>`
    SELECT
      phase,
      AVG(cost_usd)::float as "avgCostUsd",
      AVG(tokens_input)::float as "avgTokensInput",
      AVG(tokens_output)::float as "avgTokensOutput",
      AVG(duration_ms)::float as "avgDurationMs",
      SUM(cost_usd)::float as "totalCostUsd",
      SUM(ai_calls)::int as "totalAiCalls",
      COUNT(DISTINCT task_id)::int as "taskCount",
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cost_usd)::float as "p95CostUsd"
    FROM agent_phase_metrics
    WHERE created_at > NOW() - make_interval(days => ${days})
    GROUP BY phase
    ORDER BY "totalCostUsd" DESC
  `;
  const results: PhaseMetricsSummary[] = [];
  for await (const row of rows) results.push(row);
  return results;
}

export interface TaskCostBreakdown {
  taskId: string;
  jobId: string;
  phases: PhaseMetrics[];
  totalCostUsd: number;
  totalTokens: number;
  totalDurationMs: number;
}

export async function getTaskCostBreakdown(taskId: string): Promise<TaskCostBreakdown | null> {
  const rows = db.query<{
    jobId: string; phase: string; tokensInput: number; tokensOutput: number;
    cachedTokens: number; costUsd: number; durationMs: number; model: string; aiCalls: number;
  }>`
    SELECT
      job_id::text as "jobId", phase, tokens_input as "tokensInput",
      tokens_output as "tokensOutput", cached_tokens as "cachedTokens",
      cost_usd::float as "costUsd", duration_ms as "durationMs",
      model, ai_calls as "aiCalls"
    FROM agent_phase_metrics
    WHERE task_id = ${taskId}
    ORDER BY created_at ASC
  `;

  const phases: PhaseMetrics[] = [];
  let jobId = "";
  for await (const row of rows) {
    jobId = row.jobId;
    phases.push({
      phase: row.phase,
      tokensInput: row.tokensInput,
      tokensOutput: row.tokensOutput,
      cachedTokens: row.cachedTokens,
      costUsd: row.costUsd,
      durationMs: row.durationMs,
      model: row.model,
      aiCalls: row.aiCalls,
    });
  }

  if (phases.length === 0) return null;

  return {
    taskId,
    jobId,
    phases,
    totalCostUsd: phases.reduce((s, p) => s + p.costUsd, 0),
    totalTokens: phases.reduce((s, p) => s + p.tokensInput + p.tokensOutput, 0),
    totalDurationMs: phases.reduce((s, p) => s + p.durationMs, 0),
  };
}

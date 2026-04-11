import type { AgentExecutionContext } from "./types";

// --- Types ---

/**
 * Kompakt kontekst for retry-forsøk (YB: Delta-kontekst i retries).
 * I stedet for å sende full context på nytt, sender vi kun delta.
 */
export interface RetryContext {
  /** 1-2 setningers oppsummering av oppgaven */
  taskSummary: string;

  /** Plan-steg som korte titler (ikke full content) */
  planSummary: string;

  /** KUN siste feilmelding — ikke alle previousErrors */
  latestError: string;

  /** KUN filer som endret seg mellom forsøk */
  changedFiles: Array<{
    path: string;
    /** Enkel diff: hva som ble endret. Ikke full filinnhold. */
    diff: string;
  }>;

  /** Diagnose-resultat fra ai.diagnoseFailure */
  diagnosis: {
    rootCause: string;
    reason?: string;
    suggestedAction?: string;
  };

  /** Forsøksnummer */
  attemptNumber: number;

  /** Total context-størrelse i estimerte tokens */
  estimatedTokens: number;
}

export interface ExecutionResult {
  success: boolean;
  filesChanged: Array<{ path: string; content: string; action: string }>;
  sandboxId: string;
  planSummary: string;
  costUsd: number;
  tokensUsed: number;
  errorMessage?: string;
  earlyReturn?: {
    success: boolean;
    filesChanged: string[];
    costUsd: number;
    tokensUsed: number;
    errorMessage: string;
  };
}

export interface ExecutionHelpers {
  report: (
    ctx: AgentExecutionContext,
    content: string,
    status: "working" | "completed" | "failed" | "needs_input",
    extra?: { prUrl?: string; filesChanged?: string[] }
  ) => Promise<void>;
  think: (ctx: AgentExecutionContext, thought: string) => Promise<void>;
  reportSteps: (
    ctx: AgentExecutionContext,
    phase: string,
    steps: Array<{ label: string; status: "active" | "done" | "error" | "info" }>,
    extra?: {
      title?: string;
      questions?: string[];
      planProgress?: { current: number; total: number };
      tasks?: Array<{ id: string; title: string; status: string }>;
    }
  ) => Promise<void>;
  auditedStep: <T>(
    ctx: AgentExecutionContext,
    action: string,
    details: Record<string, unknown>,
    fn: () => Promise<T>
  ) => Promise<T>;
  audit: (opts: {
    sessionId: string;
    actionType: string;
    details?: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
    confidenceScore?: number;
    taskId?: string;
    repoName?: string;
  }) => Promise<void>;
  shouldStopTask: (ctx: AgentExecutionContext, checkpoint: string, sandboxId?: string) => Promise<boolean>;
  updateLinearIfExists: (ctx: AgentExecutionContext, msg: string, status: string) => Promise<void>;
  aiBreaker: { call: <T>(fn: () => Promise<T>) => Promise<T> };
  sandboxBreaker: { call: <T>(fn: () => Promise<T>) => Promise<T> };
}

// --- Utility functions for YB (Delta-kontekst i retries) ---

/**
 * Enkel linje-basert diff mellom to strenger.
 * Returnerer kun endrede/nye/fjernede linjer, maks 500 tegn.
 */
export function computeSimpleDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const changes: string[] = [];

  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines && changes.length < 20; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === undefined && newLine !== undefined) {
      changes.push(`+${i + 1}: ${newLine}`);
    } else if (newLine === undefined && oldLine !== undefined) {
      changes.push(`-${i + 1}: ${oldLine}`);
    } else if (oldLine !== newLine) {
      changes.push(`~${i + 1}: ${newLine}`);
    }
  }

  if (changes.length === 0) return "[no changes detected]";

  const result = changes.join("\n");
  return result.length > 500 ? result.substring(0, 497) + "..." : result;
}

/**
 * Beregner delta-kontekst for retry.
 * Sammenligner nåværende genererte filer med forrige forsøk.
 */
export function computeRetryContext(
  ctx: AgentExecutionContext,
  currentFiles: Array<{ path: string; content: string }>,
  previousFiles: Array<{ path: string; content: string }>,
  planSummary: string,
  validationOutput: string,
  diagnosis: { rootCause: string; reason?: string; suggestedAction?: string },
): RetryContext {
  // 1. Kort oppgave-oppsummering (maks 200 tegn)
  const taskSummary = ctx.taskDescription.length > 200
    ? ctx.taskDescription.substring(0, 197) + "..."
    : ctx.taskDescription;

  // 2. Finn endrede filer
  const changedFiles: RetryContext["changedFiles"] = [];
  const prevMap = new Map(previousFiles.map(f => [f.path, f.content]));

  for (const file of currentFiles) {
    const prev = prevMap.get(file.path);
    if (!prev) {
      changedFiles.push({
        path: file.path,
        diff: `[NEW FILE] ${file.content.substring(0, 500)}${file.content.length > 500 ? "..." : ""}`,
      });
    } else if (prev !== file.content) {
      changedFiles.push({
        path: file.path,
        diff: computeSimpleDiff(prev, file.content),
      });
    }
  }

  // 3. Kun siste feilmelding (maks 1000 tegn)
  const latestError = validationOutput.length > 1000
    ? validationOutput.substring(0, 997) + "..."
    : validationOutput;

  const retryCtx: RetryContext = {
    taskSummary,
    planSummary,
    latestError,
    changedFiles,
    diagnosis,
    attemptNumber: ctx.totalAttempts,
    estimatedTokens: 0,
  };

  // Estimér token-størrelse
  const totalChars = taskSummary.length + planSummary.length + latestError.length
    + changedFiles.reduce((sum, f) => sum + f.path.length + f.diff.length, 0)
    + JSON.stringify(diagnosis).length;
  retryCtx.estimatedTokens = Math.ceil(totalChars / 4);

  return retryCtx;
}

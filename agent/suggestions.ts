import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { tasks, memory, monitor } from "~encore/clients";
import { db } from "./db";

// --- Types ---

interface SuggestionsRequest {
  repo?: string;
  limit?: number;
}

interface Suggestion {
  type: "test_coverage" | "outdated_dep" | "error_pattern" | "cve" | "similar_failure" | "health";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  repo?: string;
  actionLabel?: string;
  actionTaskDescription?: string;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
  generatedAt: string;
}

// --- Endpoint ---

export const suggestions = api(
  { method: "POST", path: "/agent/suggestions", expose: true, auth: true },
  async (req: SuggestionsRequest): Promise<SuggestionsResponse> => {
    const limit = req.limit || 6;
    const results: Suggestion[] = [];

    // 1. Check for pending reviews (high priority — user action needed)
    try {
      const pendingReviews = await db.query<{ task_id: string; quality_score: number | null }>`
        SELECT task_id, (ai_review->>'qualityScore')::float as quality_score
        FROM code_reviews
        WHERE status = 'pending_review'
        ORDER BY created_at DESC
        LIMIT 5
      `;
      for await (const review of pendingReviews) {
        results.push({
          type: "health",
          priority: "high",
          title: `Review venter på godkjenning`,
          description: `Task ${review.task_id} har en review som venter${review.quality_score ? ` (score: ${review.quality_score.toFixed(1)}/10)` : ""}.`,
          actionLabel: "Se review",
          actionTaskDescription: review.task_id,
        });
      }
    } catch (err) {
      log.warn("suggestions: failed to fetch pending reviews", { error: err instanceof Error ? err.message : String(err) });
    }

    // 2. Check for stale/stuck jobs
    try {
      const staleJobs = await db.query<{ id: string; task_id: string; current_phase: string | null; started_at: Date }>`
        SELECT id, task_id, current_phase, started_at
        FROM agent_jobs
        WHERE status = 'running'
          AND started_at < NOW() - INTERVAL '30 minutes'
        ORDER BY started_at ASC
        LIMIT 3
      `;
      for await (const job of staleJobs) {
        results.push({
          type: "health",
          priority: "critical",
          title: `Zombie-jobb oppdaget`,
          description: `Jobb for task ${job.task_id} har kjørt i over 30 minutter${job.current_phase ? ` (fase: ${job.current_phase})` : ""}.`,
          actionLabel: "Sjekk stale jobs",
          actionTaskDescription: job.task_id,
        });
      }
    } catch (err) {
      log.warn("suggestions: failed to fetch stale jobs", { error: err instanceof Error ? err.message : String(err) });
    }

    // 3. Check for error patterns from memory
    try {
      const errorPatterns = await memory.search({
        query: "error failure bug crash",
        limit: 5,
        memoryType: "error_pattern",
      });
      const patternGroups = new Map<string, number>();
      for (const r of errorPatterns.results) {
        const key = r.content.slice(0, 80);
        patternGroups.set(key, (patternGroups.get(key) || 0) + 1);
      }
      for (const [pattern, count] of patternGroups) {
        if (count >= 2) {
          results.push({
            type: "error_pattern",
            priority: "medium",
            title: `Gjentakende feilmønster (${count}x)`,
            description: pattern + "...",
            actionLabel: "Vis oppgaver",
          });
        }
      }
    } catch (err) {
      log.warn("suggestions: failed to fetch error patterns", { error: err instanceof Error ? err.message : String(err) });
    }

    // 4. Check monitor health findings
    try {
      const health = await monitor.watchFindings();
      if (health && health.findings) {
        for (const finding of health.findings.slice(0, 3)) {
          results.push({
            type: "health",
            priority: finding.severity === "critical" ? "critical" : finding.severity === "warn" ? "high" : "medium",
            title: `${finding.findingType}: ${finding.repo}`,
            description: finding.summary || `${finding.findingType} i ${finding.repo}`,
            repo: finding.repo,
            actionLabel: "Kjør monitor",
          });
        }
      }
    } catch (err) {
      log.warn("suggestions: failed to fetch monitor findings", { error: err instanceof Error ? err.message : String(err) });
    }

    // 5. Check for tasks that could be started
    try {
      const backlogTasks = await tasks.listTasks({
        status: "backlog",
        limit: 3,
      });
      if (backlogTasks && backlogTasks.tasks) {
        for (const task of backlogTasks.tasks) {
          results.push({
            type: "health",
            priority: "low",
            title: `Oppgave klar: ${task.title}`,
            description: task.description?.slice(0, 120) || "Ingen beskrivelse",
            repo: task.repo ?? undefined,
            actionLabel: "Start oppgave",
            actionTaskDescription: task.id,
          });
        }
      }
    } catch (err) {
      log.warn("suggestions: failed to fetch backlog tasks", { error: err instanceof Error ? err.message : String(err) });
    }

    // Sort by priority and limit
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    results.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

    return {
      suggestions: results.slice(0, limit),
      generatedAt: new Date().toISOString(),
    };
  }
);

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { github, linear, memory, sandbox, tasks } from "~encore/clients";
import { agentReports } from "../chat/chat";
import { db } from "./db";
import { executeTask } from "./agent";
import type { CodeReview, ReviewFile, AIReviewData, AgentExecutionContext } from "./types";

// Extract repo name from conversation_id format: "repo-{REPONAME}-{UUID}"
function extractRepoFromConversationId(convId: string): string {
  if (!convId.startsWith("repo-")) return "thefold";
  const withoutPrefix = convId.replace(/^repo-/, "");
  const uuidPattern = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const repoName = withoutPrefix.replace(uuidPattern, "");
  return repoName || "thefold";
}

// --- Internal function (same service, no API boundary) ---

export interface SubmitReviewParams {
  conversationId: string;
  taskId: string;
  projectTaskId?: string;
  sandboxId: string;
  repoName?: string;
  filesChanged: ReviewFile[];
  aiReview: AIReviewData;
}

export async function submitReviewInternal(params: SubmitReviewParams): Promise<{ reviewId: string }> {
  // Extract repo name: explicit param > conversation_id pattern > fallback
  const repoName = params.repoName || extractRepoFromConversationId(params.conversationId);

  const row = await db.queryRow<{ id: string }>`
    INSERT INTO code_reviews (
      conversation_id, task_id, project_task_id, sandbox_id,
      repo_name, files_changed, ai_review, status
    ) VALUES (
      ${params.conversationId},
      ${params.taskId},
      ${params.projectTaskId ?? null},
      ${params.sandboxId},
      ${repoName},
      ${JSON.stringify(params.filesChanged)}::jsonb,
      ${JSON.stringify(params.aiReview)}::jsonb,
      'pending'
    )
    RETURNING id
  `;

  if (!row) throw new Error("Failed to insert code review");

  // Notify chat about pending review — structured JSON for AgentStatus rendering
  const firstFile = params.filesChanged[0]?.path || params.taskId;
  await agentReports.publish({
    conversationId: params.conversationId,
    taskId: params.taskId,
    content: JSON.stringify({
      type: "agent_status",
      phase: "Venter",
      title: `Review: ${firstFile}`,
      reviewData: {
        reviewId: row.id,
        quality: params.aiReview.qualityScore,
        filesChanged: params.filesChanged.length,
        concerns: params.aiReview.concerns,
        reviewUrl: `/review/${row.id}`,
      },
      steps: [
        { label: "Kode skrevet", status: "done" },
        { label: "Validert", status: "done" },
        { label: "Venter pa godkjenning", status: "active" },
      ],
    }),
    status: "needs_input",
  });

  return { reviewId: row.id };
}

// --- API: Submit review (internal, not exposed) ---

export const submitReview = api(
  { method: "POST", path: "/agent/review/submit", expose: false },
  async (params: SubmitReviewParams): Promise<{ reviewId: string }> => {
    return submitReviewInternal(params);
  }
);

// --- API: Get review ---

interface GetReviewRequest {
  reviewId: string;
}

interface CodeReviewRow {
  id: string;
  conversation_id: string;
  task_id: string;
  project_task_id: string | null;
  sandbox_id: string;
  repo_name: string | null;
  files_changed: string | ReviewFile[];
  ai_review: string | AIReviewData | null;
  status: string;
  reviewer_id: string | null;
  feedback: string | null;
  created_at: Date;
  reviewed_at: Date | null;
  pr_url: string | null;
}

function rowToCodeReview(row: CodeReviewRow): CodeReview {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    taskId: row.task_id,
    projectTaskId: row.project_task_id ?? undefined,
    sandboxId: row.sandbox_id,
    repoName: row.repo_name ?? undefined,
    filesChanged: typeof row.files_changed === "string"
      ? JSON.parse(row.files_changed)
      : row.files_changed,
    aiReview: row.ai_review
      ? (typeof row.ai_review === "string" ? JSON.parse(row.ai_review) : row.ai_review)
      : undefined,
    status: row.status as CodeReview["status"],
    reviewerId: row.reviewer_id ?? undefined,
    feedback: row.feedback ?? undefined,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? undefined,
    prUrl: row.pr_url ?? undefined,
  };
}

export const getReview = api(
  { method: "POST", path: "/agent/review/get", expose: true, auth: true },
  async (req: GetReviewRequest): Promise<{ review: CodeReview }> => {
    const row = await db.queryRow<CodeReviewRow>`
      SELECT id, conversation_id, task_id, project_task_id, sandbox_id,
             repo_name, files_changed, ai_review, status, reviewer_id, feedback,
             created_at, reviewed_at, pr_url
      FROM code_reviews WHERE id = ${req.reviewId}
    `;

    if (!row) throw APIError.notFound("review ikke funnet");

    return { review: rowToCodeReview(row) };
  }
);

// --- API: List reviews ---

interface ListReviewsRequest {
  status?: string;
  repoName?: string;
  limit?: number;
  offset?: number;
}

interface ReviewSummary {
  id: string;
  taskId: string;
  repoName?: string;
  fileCount: number;
  qualityScore: number | null;
  status: string;
  createdAt: string;
  prUrl?: string;
}

function rowToSummary(row: {
  id: string;
  task_id: string;
  repo_name: string | null;
  files_changed: string | ReviewFile[];
  ai_review: string | AIReviewData | null;
  status: string;
  created_at: Date;
  pr_url: string | null;
}): ReviewSummary {
  const files = typeof row.files_changed === "string"
    ? JSON.parse(row.files_changed) : row.files_changed;
  const aiReview = row.ai_review
    ? (typeof row.ai_review === "string" ? JSON.parse(row.ai_review) : row.ai_review)
    : null;
  return {
    id: row.id,
    taskId: row.task_id,
    repoName: row.repo_name ?? undefined,
    fileCount: Array.isArray(files) ? files.length : 0,
    qualityScore: aiReview?.qualityScore ?? null,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    prUrl: row.pr_url ?? undefined,
  };
}

export const listReviews = api(
  { method: "POST", path: "/agent/review/list", expose: true, auth: true },
  async (req: ListReviewsRequest): Promise<{ reviews: ReviewSummary[]; total: number }> => {
    const limit = Math.min(req.limit || 50, 200);
    const offset = req.offset || 0;

    const reviews: ReviewSummary[] = [];

    // Build query based on filters
    if (req.status && req.repoName) {
      const rows = db.query<{
        id: string; task_id: string; repo_name: string | null;
        files_changed: string | ReviewFile[]; ai_review: string | AIReviewData | null;
        status: string; created_at: Date; pr_url: string | null;
      }>`
        SELECT id, task_id, repo_name, files_changed, ai_review, status, created_at, pr_url
        FROM code_reviews
        WHERE status = ${req.status} AND repo_name = ${req.repoName}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) reviews.push(rowToSummary(row));
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM code_reviews
        WHERE status = ${req.status} AND repo_name = ${req.repoName}
      `;
      return { reviews, total: countRow?.count || 0 };
    }

    if (req.status) {
      const rows = db.query<{
        id: string; task_id: string; repo_name: string | null;
        files_changed: string | ReviewFile[]; ai_review: string | AIReviewData | null;
        status: string; created_at: Date; pr_url: string | null;
      }>`
        SELECT id, task_id, repo_name, files_changed, ai_review, status, created_at, pr_url
        FROM code_reviews
        WHERE status = ${req.status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) reviews.push(rowToSummary(row));
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM code_reviews WHERE status = ${req.status}
      `;
      return { reviews, total: countRow?.count || 0 };
    }

    if (req.repoName) {
      const rows = db.query<{
        id: string; task_id: string; repo_name: string | null;
        files_changed: string | ReviewFile[]; ai_review: string | AIReviewData | null;
        status: string; created_at: Date; pr_url: string | null;
      }>`
        SELECT id, task_id, repo_name, files_changed, ai_review, status, created_at, pr_url
        FROM code_reviews
        WHERE repo_name = ${req.repoName}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for await (const row of rows) reviews.push(rowToSummary(row));
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM code_reviews WHERE repo_name = ${req.repoName}
      `;
      return { reviews, total: countRow?.count || 0 };
    }

    // Default: all reviews
    const rows = db.query<{
      id: string; task_id: string; repo_name: string | null;
      files_changed: string | ReviewFile[]; ai_review: string | AIReviewData | null;
      status: string; created_at: Date; pr_url: string | null;
    }>`
      SELECT id, task_id, repo_name, files_changed, ai_review, status, created_at, pr_url
      FROM code_reviews
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    for await (const row of rows) reviews.push(rowToSummary(row));
    const countRow = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM code_reviews
    `;
    return { reviews, total: countRow?.count || 0 };
  }
);

// --- API: Approve review ---

interface ApproveReviewRequest {
  reviewId: string;
}

export const approveReview = api(
  { method: "POST", path: "/agent/review/approve", expose: true, auth: true },
  async (req: ApproveReviewRequest): Promise<{ prUrl: string }> => {
    const auth = getAuthData();

    const row = await db.queryRow<CodeReviewRow>`
      SELECT id, conversation_id, task_id, project_task_id, sandbox_id,
             repo_name, files_changed, ai_review, status, reviewer_id, feedback,
             created_at, reviewed_at, pr_url
      FROM code_reviews WHERE id = ${req.reviewId}
    `;

    if (!row) throw APIError.notFound("review ikke funnet");
    if (row.status !== "pending" && row.status !== "changes_requested") {
      throw APIError.failedPrecondition("review er allerede behandlet");
    }

    const review = rowToCodeReview(row);

    // STEP 9: Create PR — use repo from review (extracted from conversation_id at submit time)
    const targetRepo = review.repoName || extractRepoFromConversationId(review.conversationId);
    const branchName = `thefold/${review.taskId.toLowerCase().replace(/\s+/g, "-")}`;

    let pr: { url: string; number: number };
    try {
      pr = await github.createPR({
        owner: "Twofold-AS",
        repo: targetRepo,
        branch: branchName,
        title: `[TheFold] ${review.taskId}`,
        body: review.aiReview?.documentation || "Auto-generated by TheFold",
        files: review.filesChanged.map((f) => ({
          path: f.path,
          content: f.content,
          action: f.action,
        })),
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("403") || msg.includes("not accessible") || msg.includes("Resource not accessible")) {
        throw APIError.permissionDenied(
          "GitHub-tokenet har ikke skrivetilgang. Oppdater PAT med 'contents: write' og 'pull_requests: write' scopes i GitHub Settings."
        );
      }
      // Send failure status to chat before re-throwing
      try {
        await agentReports.publish({
          conversationId: review.conversationId,
          taskId: review.taskId,
          content: JSON.stringify({
            type: "agent_status",
            phase: "Feilet",
            title: "PR-opprettelse feilet",
            error: msg,
            steps: [
              { label: "Kode skrevet", status: "done" },
              { label: "Validert", status: "done" },
              { label: "Review godkjent", status: "done" },
              { label: "PR opprettelse", status: "error" },
            ],
          }),
          status: "failed",
        });
        await tasks.updateTaskStatus({ id: review.taskId, status: "blocked", errorMessage: `PR feilet: ${msg}` });
      } catch {
        // Best-effort notification
      }
      throw e;
    }

    // STEP 10: Update Linear if applicable
    if (!review.projectTaskId) {
      try {
        await linear.updateTask({
          taskId: review.taskId,
          state: "in_review",
          comment: `## TheFold har fullført denne oppgaven\n\n${review.aiReview?.documentation || ""}\n\n**PR:** ${pr.url}\n**Kvalitetsvurdering:** ${review.aiReview?.qualityScore || "?"}/10`,
        });
      } catch {
        // Linear update is optional
      }
    }

    // STEP 11: Store memories
    if (review.aiReview?.memoriesExtracted) {
      for (const mem of review.aiReview.memoriesExtracted) {
        try {
          await memory.store({
            content: mem,
            category: "decision",
            linearTaskId: review.taskId,
            memoryType: "decision",
            sourceRepo: `Twofold-AS/${targetRepo}`,
          });
        } catch {
          // Memory storage is optional
        }
      }
    }

    // STEP 12: Destroy sandbox
    try {
      await sandbox.destroy({ sandboxId: review.sandboxId });
    } catch {
      // Sandbox may already be destroyed
    }

    // Update review status
    await db.exec`
      UPDATE code_reviews
      SET status = 'approved',
          reviewer_id = ${auth?.email ?? null},
          reviewed_at = NOW(),
          pr_url = ${pr.url}
      WHERE id = ${req.reviewId}
    `;

    // Update task status to done
    try {
      await tasks.updateTaskStatus({ id: review.taskId, status: "done" });
    } catch {
      // Task update is optional (task may be from Linear, not local)
    }

    // Notify chat — structured "Ferdig" status + persistent completion message
    const prLabel = "PR opprettet";
    const titleMsg = "Review godkjent — PR opprettet";
    const qualityScore = review.aiReview?.qualityScore;
    const fileCount = review.filesChanged.length;
    const fileList = review.filesChanged.map((f) => `- \`${f.path}\` (${f.action})`).join("\n");
    const completionMsg = [
      `**Oppgave fullfort**`,
      ``,
      `**PR:** ${pr.url}`,
      `**Filer endret:** ${fileCount}`,
      fileList,
      qualityScore != null ? `**Kvalitet:** ${qualityScore}/10` : "",
    ].filter(Boolean).join("\n");

    await agentReports.publish({
      conversationId: review.conversationId,
      taskId: review.taskId,
      content: JSON.stringify({
        type: "agent_status",
        phase: "Ferdig",
        title: titleMsg,
        steps: [
          { label: "Kode skrevet", status: "done" },
          { label: "Validert", status: "done" },
          { label: "Review godkjent", status: "done" },
          { label: prLabel, status: "done" },
        ],
      }),
      status: "completed",
      prUrl: pr.url,
      filesChanged: review.filesChanged.map((f) => f.path),
      completionMessage: completionMsg,
    });

    return { prUrl: pr.url };
  }
);

// --- API: Request changes ---

interface RequestChangesRequest {
  reviewId: string;
  feedback: string;
}

export const requestChanges = api(
  { method: "POST", path: "/agent/review/request-changes", expose: true, auth: true },
  async (req: RequestChangesRequest): Promise<{ status: string }> => {
    const auth = getAuthData();

    const row = await db.queryRow<CodeReviewRow>`
      SELECT id, conversation_id, task_id, project_task_id, sandbox_id,
             repo_name, files_changed, ai_review, status, reviewer_id, feedback,
             created_at, reviewed_at, pr_url
      FROM code_reviews WHERE id = ${req.reviewId}
    `;

    if (!row) throw APIError.notFound("review ikke funnet");
    if (row.status !== "pending") {
      throw APIError.failedPrecondition("review er allerede behandlet");
    }

    // Update review
    await db.exec`
      UPDATE code_reviews
      SET status = 'changes_requested',
          reviewer_id = ${auth?.email ?? null},
          feedback = ${req.feedback},
          reviewed_at = NOW()
      WHERE id = ${req.reviewId}
    `;

    const review = rowToCodeReview(row);
    const targetRepo = review.repoName || extractRepoFromConversationId(review.conversationId);

    // Fire-and-forget: re-execute task with feedback
    const ctx: AgentExecutionContext = {
      conversationId: review.conversationId,
      taskId: review.taskId,
      taskDescription: "",
      userMessage: req.feedback,
      repoOwner: "Twofold-AS",
      repoName: targetRepo,
      branch: "main",
      modelMode: "auto",
      selectedModel: "claude-sonnet-4-5-20250929",
      totalCostUsd: 0,
      totalTokensUsed: 0,
      attemptHistory: [],
      errorPatterns: [],
      totalAttempts: 0,
      maxAttempts: 5,
      planRevisions: 0,
      maxPlanRevisions: 2,
    };

    executeTask(ctx, {
      taskDescription: `Tidligere forsøk fikk tilbakemelding fra bruker:\n\n${req.feedback}\n\nVennligst gjør endringene som etterspørres.`,
    }).catch((err) => {
      console.error(`Re-execution after changes request failed:`, err);
    });

    // Notify chat
    await agentReports.publish({
      conversationId: review.conversationId,
      taskId: review.taskId,
      content: `Endringer etterspurt:\n\n${req.feedback}\n\nAgenten jobber med oppdateringer...`,
      status: "working",
    });

    return { status: "changes_requested" };
  }
);

// --- API: Reject review ---

interface RejectReviewRequest {
  reviewId: string;
  reason?: string;
}

export const rejectReview = api(
  { method: "POST", path: "/agent/review/reject", expose: true, auth: true },
  async (req: RejectReviewRequest): Promise<{ status: string }> => {
    const auth = getAuthData();

    const row = await db.queryRow<{ id: string; status: string; sandbox_id: string; conversation_id: string; task_id: string }>`
      SELECT id, status, sandbox_id, conversation_id, task_id
      FROM code_reviews WHERE id = ${req.reviewId}
    `;

    if (!row) throw APIError.notFound("review ikke funnet");
    if (row.status !== "pending" && row.status !== "changes_requested") {
      throw APIError.failedPrecondition("review er allerede behandlet");
    }

    // Update review
    await db.exec`
      UPDATE code_reviews
      SET status = 'rejected',
          reviewer_id = ${auth?.email ?? null},
          feedback = ${req.reason ?? null},
          reviewed_at = NOW()
      WHERE id = ${req.reviewId}
    `;

    // Destroy sandbox
    try {
      await sandbox.destroy({ sandboxId: row.sandbox_id });
    } catch {
      // Sandbox may already be destroyed
    }

    // Update task status to blocked
    try {
      await tasks.updateTaskStatus({ id: row.task_id, status: "blocked", errorMessage: req.reason || "Review avvist" });
    } catch {
      // Task update is optional
    }

    // Notify chat — structured "Feilet" status
    await agentReports.publish({
      conversationId: row.conversation_id,
      taskId: row.task_id,
      content: JSON.stringify({
        type: "agent_status",
        phase: "Feilet",
        title: "Review avvist",
        error: req.reason || "Avvist av bruker",
        steps: [
          { label: "Kode skrevet", status: "done" },
          { label: "Validert", status: "done" },
          { label: "Review avvist", status: "error" },
        ],
      }),
      status: "failed",
    });

    return { status: "rejected" };
  }
);

// --- API: Delete a single review ---

interface DeleteReviewRequest {
  reviewId: string;
}

export const deleteReview = api(
  { method: "POST", path: "/agent/review/delete", expose: true, auth: true },
  async (req: DeleteReviewRequest): Promise<{ deleted: boolean }> => {
    const row = await db.queryRow<{ id: string; status: string; sandbox_id: string; task_id: string }>`
      SELECT id, status, sandbox_id, task_id
      FROM code_reviews WHERE id = ${req.reviewId}
    `;

    if (!row) throw APIError.notFound("review ikke funnet");

    // Destroy sandbox if review is pending and has one
    if (row.sandbox_id && row.status === "pending") {
      try {
        await sandbox.destroy({ sandboxId: row.sandbox_id });
      } catch {
        // Sandbox may already be destroyed
      }
    }

    // Delete the review
    await db.exec`DELETE FROM code_reviews WHERE id = ${req.reviewId}`;

    // Update task status to cancelled
    try {
      await tasks.updateTaskStatus({ id: row.task_id, status: "blocked", errorMessage: "Review slettet" });
    } catch {
      // Task update is optional
    }

    return { deleted: true };
  }
);

// --- API: Cleanup old pending reviews (>24h) ---

export const cleanupReviews = api(
  { method: "POST", path: "/agent/review/cleanup", expose: true, auth: true },
  async (): Promise<{ deleted: number; errors: number }> => {
    let deleted = 0;
    let errors = 0;

    const rows = db.query<{ id: string; sandbox_id: string }>`
      SELECT id, sandbox_id FROM code_reviews
      WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours'
    `;

    for await (const row of rows) {
      try {
        if (row.sandbox_id) {
          try {
            await sandbox.destroy({ sandboxId: row.sandbox_id });
          } catch {
            // Sandbox may already be destroyed
          }
        }
        await db.exec`DELETE FROM code_reviews WHERE id = ${row.id}`;
        deleted++;
      } catch {
        errors++;
      }
    }

    return { deleted, errors };
  }
);

// --- API: Delete ALL reviews (dev/testing only) ---

export const deleteAllReviews = api(
  { method: "POST", path: "/agent/review/delete-all", expose: true, auth: true },
  async (): Promise<{ deleted: number }> => {
    // Collect sandbox IDs first
    const rows = db.query<{ sandbox_id: string }>`
      SELECT DISTINCT sandbox_id FROM code_reviews WHERE sandbox_id IS NOT NULL
    `;

    const sandboxIds: string[] = [];
    for await (const row of rows) {
      if (row.sandbox_id) sandboxIds.push(row.sandbox_id);
    }

    // Destroy all sandboxes
    for (const sid of sandboxIds) {
      try {
        await sandbox.destroy({ sandboxId: sid });
      } catch {
        // Best-effort
      }
    }

    // Delete all reviews
    const result = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM code_reviews RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;

    return { deleted: result?.count || 0 };
  }
);

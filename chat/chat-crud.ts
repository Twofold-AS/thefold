import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "./chat";

// --- Repo Activity ---

interface RepoActivity {
  id: string;
  repoName: string;
  eventType: string;
  title: string;
  description: string | null;
  userId: string | null;
  metadata: string | null;
  createdAt: string;
}

export const getRepoActivity = api(
  { method: "GET", path: "/chat/activity/:repoName", expose: true, auth: true },
  async (req: { repoName: string }): Promise<{ activities: RepoActivity[] }> => {
    const rows = db.query<RepoActivity>`
      SELECT id, repo_name as "repoName", event_type as "eventType", title, description,
             user_id as "userId", metadata, created_at as "createdAt"
      FROM repo_activity
      WHERE repo_name = ${req.repoName}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const activities: RepoActivity[] = [];
    for await (const row of rows) activities.push(row);
    return { activities };
  }
);

// --- Cost Summary ---

interface CostPeriod {
  total: number;
  tokens: number;
  count: number;
}

interface ModelCost {
  model: string;
  total: number;
  tokens: number;
  count: number;
}

interface DailyTrend {
  date: string;
  total: number;
  tokens: number;
}

interface CostSummary {
  today: CostPeriod;
  thisWeek: CostPeriod;
  thisMonth: CostPeriod;
  perModel: ModelCost[];
  dailyTrend: DailyTrend[];
}

export const getCostSummary = api(
  { method: "GET", path: "/chat/costs", expose: true, auth: true },
  async (): Promise<CostSummary> => {
    const today = await db.queryRow<CostPeriod>`
      SELECT
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= CURRENT_DATE
    `;

    const thisWeek = await db.queryRow<CostPeriod>`
      SELECT
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= date_trunc('week', CURRENT_DATE)
    `;

    const thisMonth = await db.queryRow<CostPeriod>`
      SELECT
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= date_trunc('month', CURRENT_DATE)
    `;

    const perModelRows = await db.query<ModelCost>`
      SELECT
        metadata->>'model' as model,
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens,
        COUNT(*)::integer as count
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'model' IS NOT NULL
      AND created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY metadata->>'model'
      ORDER BY total DESC
    `;
    const perModel: ModelCost[] = [];
    for await (const row of perModelRows) perModel.push(row);

    const dailyRows = await db.query<DailyTrend>`
      SELECT
        created_at::date::text as date,
        COALESCE(SUM((metadata->>'cost')::numeric), 0) as total,
        COALESCE(SUM((metadata->'tokens'->>'totalTokens')::integer), 0) as tokens
      FROM messages
      WHERE role = 'assistant'
      AND metadata IS NOT NULL
      AND metadata->>'cost' IS NOT NULL
      AND created_at >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY created_at::date
      ORDER BY date ASC
    `;
    const dailyTrend: DailyTrend[] = [];
    for await (const row of dailyRows) dailyTrend.push(row);

    return {
      today: today || { total: 0, tokens: 0, count: 0 },
      thisWeek: thisWeek || { total: 0, tokens: 0, count: 0 },
      thisMonth: thisMonth || { total: 0, tokens: 0, count: 0 },
      perModel,
      dailyTrend,
    };
  }
);

// --- Notifications ---

export interface NotificationItem {
  id: string;
  type: "review_ready" | "task_done" | "task_failed";
  title: string;
  conversationId: string;
  taskId?: string;
  prUrl?: string;
  reviewId?: string;
  createdAt: string;
}

export const notifications = api(
  { method: "GET", path: "/chat/notifications", expose: true, auth: true },
  async (): Promise<{ notifications: NotificationItem[] }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    const rows = db.query<{
      id: string;
      content: string;
      conversation_id: string;
      created_at: Date;
    }>`
      SELECT m.id, m.content, m.conversation_id, m.created_at
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.owner_email = ${authData.email}
        AND m.message_type = 'agent_progress'
        AND m.content::jsonb->>'status' IN ('waiting', 'done', 'failed')
        AND m.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY m.created_at DESC
      LIMIT 30
    `;

    const result: NotificationItem[] = [];
    for await (const row of rows) {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(String(row.content)); } catch {}

      const status = String(parsed.status ?? "");
      const report = (parsed.report ?? {}) as Record<string, unknown>;

      let type: NotificationItem["type"];
      let title: string;
      if (status === "waiting") {
        type = "review_ready";
        title = "Kode klar for gjennomgang";
      } else if (status === "done") {
        type = "task_done";
        title = report.prUrl ? "Oppgave fullført — PR opprettet" : "Oppgave fullført";
      } else {
        type = "task_failed";
        title = "Oppgave feilet";
      }

      result.push({
        id: row.id,
        type,
        title,
        conversationId: row.conversation_id,
        taskId: report.taskId ? String(report.taskId) : undefined,
        prUrl: report.prUrl ? String(report.prUrl) : undefined,
        reviewId: report.reviewId ? String(report.reviewId) : undefined,
        createdAt: String(row.created_at),
      });
    }
    return { notifications: result };
  }
);

import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { CronJob } from "encore.dev/cron";
import { createHash } from "crypto";
import log from "encore.dev/log";
import { db } from "./chat";

// Cache for Firecrawl-scraped pages. Keyed by (user_email, project_id, url_hash)
// with 24h TTL by default. Enables: caching (skip duplicate Firecrawl calls),
// re-use across conversations in same project, GDPR-friendly cleanup.

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface ScrapeRecord {
  id: string;
  userEmail: string;
  projectId: string | null;
  conversationId: string | null;
  url: string;
  title: string | null;
  contentMd: string;
  links: string[];
  wordCount: number;
  contentHash: string;
  fetchedAt: string;
  expiresAt: string;
  expired: boolean;
  /** Full-page screenshot URL, set when the scrape was done with
   *  `screenshot: true` and Firecrawl returned a URL. */
  screenshotUrl: string | null;
}

interface ScrapeRow {
  id: string;
  user_email: string;
  project_id: string | null;
  conversation_id: string | null;
  url: string;
  title: string | null;
  content_md: string;
  links: unknown;
  word_count: number | null;
  content_hash: string | null;
  fetched_at: Date;
  expires_at: Date;
  screenshot_url: string | null;
}

function parseRow(r: ScrapeRow): ScrapeRecord {
  const linksParsed = typeof r.links === "string" ? JSON.parse(r.links) : r.links;
  return {
    id: r.id,
    userEmail: r.user_email,
    projectId: r.project_id,
    conversationId: r.conversation_id,
    url: r.url,
    title: r.title,
    contentMd: r.content_md,
    links: Array.isArray(linksParsed) ? (linksParsed as string[]) : [],
    wordCount: r.word_count ?? 0,
    contentHash: r.content_hash ?? "",
    fetchedAt: r.fetched_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    expired: r.expires_at.getTime() < Date.now(),
    screenshotUrl: r.screenshot_url ?? null,
  };
}

// --- Internal: lookup cached scrape (used by web_scrape tool) ---

export const lookupScrape = api(
  { method: "POST", path: "/chat/scrape/lookup", expose: false },
  async (req: {
    userEmail: string;
    url: string;
    projectId?: string | null;
  }): Promise<{ record: ScrapeRecord | null }> => {
    const urlHash = sha256Hex(req.url);

    const row = req.projectId
      ? await db.queryRow<ScrapeRow>`
          SELECT id, user_email, project_id, conversation_id, url, title,
                 content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
          FROM web_scrapes
          WHERE user_email = ${req.userEmail}
            AND project_id = ${req.projectId}::uuid
            AND url_hash = ${urlHash}
            AND expires_at > NOW()
          ORDER BY fetched_at DESC LIMIT 1
        `
      : await db.queryRow<ScrapeRow>`
          SELECT id, user_email, project_id, conversation_id, url, title,
                 content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
          FROM web_scrapes
          WHERE user_email = ${req.userEmail}
            AND project_id IS NULL
            AND url_hash = ${urlHash}
            AND expires_at > NOW()
          ORDER BY fetched_at DESC LIMIT 1
        `;

    return { record: row ? parseRow(row) : null };
  },
);

// --- Internal: persist scraped content ---

export const saveScrape = api(
  { method: "POST", path: "/chat/scrape/save", expose: false },
  async (req: {
    userEmail: string;
    projectId?: string | null;
    conversationId?: string | null;
    url: string;
    title?: string;
    contentMd: string;
    links: string[];
    wordCount: number;
    ttlHours?: number;
    screenshotUrl?: string | null;
    htmlCleaned?: string | null;
    images?: string[] | null;
    summary?: string | null;
    rawResponse?: Record<string, unknown> | null;
  }): Promise<{ record: ScrapeRecord }> => {
    const urlHash = sha256Hex(req.url);
    const contentHash = sha256Hex(req.contentMd);
    const ttl = req.ttlHours ?? 24;
    const screenshotUrl = req.screenshotUrl ?? null;
    const htmlCleaned = req.htmlCleaned ?? null;
    const imagesJson = req.images ? JSON.stringify(req.images) : null;
    const summary = req.summary ?? null;
    const rawJson = req.rawResponse ? JSON.stringify(req.rawResponse) : null;

    const row = req.projectId
      ? await db.queryRow<ScrapeRow>`
          INSERT INTO web_scrapes (
            user_email, project_id, conversation_id,
            url, url_hash, title, content_md, links, word_count, content_hash,
            screenshot_url, html_cleaned, images, summary, raw_response,
            expires_at
          ) VALUES (
            ${req.userEmail}, ${req.projectId}::uuid, ${req.conversationId ?? null},
            ${req.url}, ${urlHash}, ${req.title ?? null}, ${req.contentMd},
            ${JSON.stringify(req.links)}::jsonb, ${req.wordCount}, ${contentHash},
            ${screenshotUrl}, ${htmlCleaned}, ${imagesJson}::jsonb, ${summary}, ${rawJson}::jsonb,
            NOW() + (${ttl} || ' hours')::interval
          )
          RETURNING id, user_email, project_id, conversation_id, url, title,
                    content_md, links, word_count, content_hash, screenshot_url,
                    fetched_at, expires_at
        `
      : await db.queryRow<ScrapeRow>`
          INSERT INTO web_scrapes (
            user_email, conversation_id,
            url, url_hash, title, content_md, links, word_count, content_hash,
            screenshot_url, html_cleaned, images, summary, raw_response,
            expires_at
          ) VALUES (
            ${req.userEmail}, ${req.conversationId ?? null},
            ${req.url}, ${urlHash}, ${req.title ?? null}, ${req.contentMd},
            ${JSON.stringify(req.links)}::jsonb, ${req.wordCount}, ${contentHash},
            ${screenshotUrl}, ${htmlCleaned}, ${imagesJson}::jsonb, ${summary}, ${rawJson}::jsonb,
            NOW() + (${ttl} || ' hours')::interval
          )
          RETURNING id, user_email, project_id, conversation_id, url, title,
                    content_md, links, word_count, content_hash, screenshot_url,
                    fetched_at, expires_at
        `;

    if (!row) throw APIError.internal("failed to save scrape");
    return { record: parseRow(row) };
  },
);

// --- Internal: list scrapes (chat tool) ---

export const listScrapesInternal = api(
  { method: "POST", path: "/chat/scrape/list-internal", expose: false },
  async (req: {
    userEmail: string;
    projectId?: string | null;
    includeExpired?: boolean;
    limit?: number;
  }): Promise<{ records: ScrapeRecord[] }> => {
    const limit = Math.min(req.limit ?? 20, 100);

    let rows;
    if (req.projectId) {
      rows = req.includeExpired
        ? await db.query<ScrapeRow>`
            SELECT id, user_email, project_id, conversation_id, url, title,
                   content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
            FROM web_scrapes
            WHERE user_email = ${req.userEmail} AND project_id = ${req.projectId}::uuid
            ORDER BY fetched_at DESC LIMIT ${limit}
          `
        : await db.query<ScrapeRow>`
            SELECT id, user_email, project_id, conversation_id, url, title,
                   content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
            FROM web_scrapes
            WHERE user_email = ${req.userEmail} AND project_id = ${req.projectId}::uuid
              AND expires_at > NOW()
            ORDER BY fetched_at DESC LIMIT ${limit}
          `;
    } else {
      rows = req.includeExpired
        ? await db.query<ScrapeRow>`
            SELECT id, user_email, project_id, conversation_id, url, title,
                   content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
            FROM web_scrapes
            WHERE user_email = ${req.userEmail}
            ORDER BY fetched_at DESC LIMIT ${limit}
          `
        : await db.query<ScrapeRow>`
            SELECT id, user_email, project_id, conversation_id, url, title,
                   content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
            FROM web_scrapes
            WHERE user_email = ${req.userEmail}
              AND expires_at > NOW()
            ORDER BY fetched_at DESC LIMIT ${limit}
          `;
    }

    const records: ScrapeRecord[] = [];
    for await (const r of rows) records.push(parseRow(r));
    return { records };
  },
);

// --- Internal: get a specific scrape by ID ---

export const getScrapeInternal = api(
  { method: "POST", path: "/chat/scrape/get-internal", expose: false },
  async (req: { scrapeId: string }): Promise<{ record: ScrapeRecord | null }> => {
    const row = await db.queryRow<ScrapeRow>`
      SELECT id, user_email, project_id, conversation_id, url, title,
             content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
      FROM web_scrapes
      WHERE id = ${req.scrapeId}::uuid
    `;
    return { record: row ? parseRow(row) : null };
  },
);

// --- Exposed: list scrapes for a project (UI) ---

export const listProjectScrapes = api(
  { method: "POST", path: "/chat/scrape/project-list", expose: true, auth: true },
  async (req: { projectId: string; includeExpired?: boolean; limit?: number }): Promise<{ records: ScrapeRecord[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    const limit = Math.min(req.limit ?? 50, 200);

    const rows = req.includeExpired
      ? await db.query<ScrapeRow>`
          SELECT id, user_email, project_id, conversation_id, url, title,
                 content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
          FROM web_scrapes
          WHERE user_email = ${auth.email} AND project_id = ${req.projectId}::uuid
          ORDER BY fetched_at DESC LIMIT ${limit}
        `
      : await db.query<ScrapeRow>`
          SELECT id, user_email, project_id, conversation_id, url, title,
                 content_md, links, word_count, content_hash, screenshot_url, fetched_at, expires_at
          FROM web_scrapes
          WHERE user_email = ${auth.email} AND project_id = ${req.projectId}::uuid
            AND expires_at > NOW()
          ORDER BY fetched_at DESC LIMIT ${limit}
        `;

    const records: ScrapeRecord[] = [];
    for await (const r of rows) records.push(parseRow(r));
    return { records };
  },
);

// --- Exposed: delete a scrape (UI) ---

export const deleteScrape = api(
  { method: "POST", path: "/chat/scrape/delete", expose: true, auth: true },
  async (req: { scrapeId: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const row = await db.queryRow<{ user_email: string }>`
      SELECT user_email FROM web_scrapes WHERE id = ${req.scrapeId}::uuid
    `;
    if (!row) throw APIError.notFound("scrape not found");
    if (row.user_email !== auth.email) throw APIError.permissionDenied("not owner");

    await db.exec`DELETE FROM web_scrapes WHERE id = ${req.scrapeId}::uuid`;
    return { success: true };
  },
);

// --- Exposed: force re-fetch (invalidate cache) ---

export const invalidateScrape = api(
  { method: "POST", path: "/chat/scrape/invalidate", expose: true, auth: true },
  async (req: { scrapeId: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const row = await db.queryRow<{ user_email: string }>`
      SELECT user_email FROM web_scrapes WHERE id = ${req.scrapeId}::uuid
    `;
    if (!row) throw APIError.notFound("scrape not found");
    if (row.user_email !== auth.email) throw APIError.permissionDenied("not owner");

    await db.exec`
      UPDATE web_scrapes SET expires_at = NOW() - INTERVAL '1 second' WHERE id = ${req.scrapeId}::uuid
    `;
    return { success: true };
  },
);

// --- Cleanup cron: expired scrapes ---

export const cleanupExpiredScrapes = api(
  { method: "POST", path: "/chat/scrape/cleanup-expired", expose: false },
  async (): Promise<{ deleted: number }> => {
    const row = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM web_scrapes WHERE expires_at < NOW() - INTERVAL '1 hour'
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `.catch(() => ({ count: 0 }));
    log.info("web-scrapes cleanup", { deleted: row?.count ?? 0 });
    return { deleted: row?.count ?? 0 };
  },
);

const _cleanupScrapesCron = new CronJob("cleanup-expired-scrapes", {
  title: "Delete web-scrape cache entries > 1h past expiry",
  every: "30m",
  endpoint: cleanupExpiredScrapes,
});

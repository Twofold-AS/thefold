// ai/tools/web/scrape.ts
// Firecrawl-backed web scraping tool. Resolves per-user API key from
// integration_configs (set via Innstillinger → Integrasjoner).
// Falls back to the global FirecrawlApiKey secret if user hasn't set one.

import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  url: z
    .string()
    .url()
    .describe("Absolute URL to fetch (http:// or https://)"),
  maxLength: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max characters to return from page content (default 50000)"),
  formats: z
    .array(z.enum(["markdown", "links", "html", "screenshot", "images", "summary"]))
    .optional()
    .describe(
      "Which Firecrawl formats to fetch. Default: ['markdown', 'links']. " +
      "Add 'screenshot' (full-page image for vision models), 'html' (cleaned HTML), " +
      "'images' (extracted <img> URLs), or 'summary' (AI-generated summary) as needed. " +
      "For 'replicate this page' tasks, request all formats.",
    ),
  screenshot: z
    .boolean()
    .optional()
    .describe("DEPRECATED: use formats: ['screenshot'] instead. Kept for back-compat."),
});

export const webScrapeTool: Tool<z.infer<typeof inputSchema>> = {
  name: "web_scrape",
  description:
    "Fetch and read the content of a web page by URL. Use this whenever the user's message contains a URL (http:// or https://) or when you need current information from a specific public page. Returns Markdown-formatted content with title and link list. Do not use for internal wikis, personal docs, or when the user asks you not to fetch.",
  category: "web",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "medium",
  maxCallsPerSession: 20,

  async handler(input, ctx) {
    const { web, integrations, chat } = await import("~encore/clients");
    const userEmail = ctx.userEmail ?? ctx.userId ?? "";

    // Cache probe first (24h TTL, keyed by user+url+project). If caller asked
    // for a screenshot but the cached record doesn't have one, skip the cache
    // so we re-fetch with Firecrawl screenshot-mode.
    try {
      const lookup = await (chat as unknown as {
        lookupScrape: (r: { userEmail: string; url: string; projectId?: string | null }) => Promise<{
          record: null | {
            id: string; url: string; title: string | null; contentMd: string;
            links: string[]; wordCount: number; fetchedAt: string;
            screenshotUrl: string | null;
          };
        }>;
      }).lookupScrape({ userEmail, url: input.url });

      if (lookup.record && (!input.screenshot || lookup.record.screenshotUrl)) {
        const r = lookup.record;
        const wanted = input.maxLength ?? 50000;
        const charCount = r.contentMd.length;
        const content = charCount > wanted ? r.contentMd.slice(0, wanted) : r.contentMd;
        return {
          success: true,
          message: `[cache hit] ${r.title || r.url} (${r.wordCount} words)`,
          data: {
            url: r.url, title: r.title, content, links: r.links,
            wordCount: r.wordCount, cacheHit: true, scrapeId: r.id,
            truncated: charCount > wanted,
            screenshotUrl: r.screenshotUrl ?? undefined,
          },
        };
      }
    } catch (err) {
      ctx.log.warn("web_scrape: cache lookup failed (continuing)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Per-user Firecrawl key, fallback to global secret inside web.scrape.
    let apiKeyOverride: string | undefined;
    if (ctx.userId) {
      try {
        const res = await (integrations as unknown as {
          resolveApiKey: (r: { userId: string; platform: string }) => Promise<{ value: string | null }>;
        }).resolveApiKey({ userId: ctx.userId, platform: "firecrawl" });
        if (res.value) apiKeyOverride = res.value;
      } catch (err) {
        ctx.log.warn("web_scrape: per-user key lookup failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      const result = await web.scrape({
        url: input.url,
        maxLength: input.maxLength ?? 50000,
        apiKeyOverride,
        formats: input.formats,
        screenshot: input.screenshot,
      });

      // Persist in cache (fire-and-forget).
      (async () => {
        try {
          await (chat as unknown as {
            saveScrape: (r: {
              userEmail: string; conversationId?: string | null;
              url: string; title?: string; contentMd: string;
              links: string[]; wordCount: number; ttlHours?: number;
              screenshotUrl?: string | null;
              htmlCleaned?: string | null;
              images?: string[] | null;
              summary?: string | null;
              rawResponse?: Record<string, unknown> | null;
            }) => Promise<unknown>;
          }).saveScrape({
            userEmail, conversationId: ctx.conversationId ?? null,
            url: input.url, title: result.title,
            contentMd: result.content, links: result.links ?? [],
            wordCount: result.metadata.wordCount, ttlHours: 24,
            screenshotUrl: result.screenshotUrl ?? null,
            htmlCleaned: result.htmlCleaned ?? null,
            images: result.images ?? null,
            summary: result.summary ?? null,
            rawResponse: result.rawResponse ?? null,
          });
        } catch (cacheErr) {
          ctx.log.warn("web_scrape: cache write failed", {
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        }
      })();

      // Sprint A-finalisering — persister scrape som task_transient memory
      // hvis vi kjører i master-iterator-flow. Phase N+ av samme master får
      // full layout/spacing/HTML uten å re-kalle Firecrawl. TTL 24h.
      const masterTaskId = ctx.masterTaskId ?? ctx.taskId;
      if (masterTaskId) {
        (async () => {
          try {
            const { memory: memoryClient } = await import("~encore/clients");
            const crypto = await import("node:crypto");
            const urlHash = crypto.createHash("sha256").update(input.url).digest("hex").slice(0, 12);

            // Cap content til 50k chars (samme som web_scrape default
            // maxLength). Stort nok for layout, lite nok for DB-row-sanity.
            const fullPayload = JSON.stringify({
              url: input.url,
              title: result.title,
              content: result.content,
              screenshotUrl: result.screenshotUrl,
              htmlCleaned: result.htmlCleaned,
              wordCount: result.metadata.wordCount,
              sections: result.sections,
            });
            const capped = fullPayload.length > 50_000
              ? fullPayload.slice(0, 50_000) + '"[truncated]"}'
              : fullPayload;

            await memoryClient.store({
              content: capped,
              category: "task_scrape",
              memoryType: "session",
              projectId: ctx.projectId,
              sourceRepo: ctx.repoName,
              tags: [
                `task:${masterTaskId}`,
                `scrape:${urlHash}`,
                `url:${input.url}`,
              ],
              permanence: "task_transient",
              ttlDays: 1,
              trustLevel: "agent",
            });
            ctx.log.info("web_scrape: persisted as task_transient memory", {
              url: input.url,
              urlHash,
              masterTaskId,
              contentLen: capped.length,
            });
          } catch (memErr) {
            ctx.log.warn("web_scrape: task_transient persistence failed (non-critical)", {
              url: input.url,
              error: memErr instanceof Error ? memErr.message : String(memErr),
            });
          }
        })();
      }

      const charCount = result.content.length;
      const truncated = charCount >= (input.maxLength ?? 50000);
      const extras = [
        result.screenshotUrl && "+screenshot",
        result.htmlCleaned && "+html",
        result.images && `+${result.images.length} images`,
        result.summary && "+summary",
      ].filter(Boolean).join(", ");

      const HTML_CAP = 20_000;
      const htmlForAI = result.htmlCleaned && result.htmlCleaned.length > HTML_CAP
        ? result.htmlCleaned.slice(0, HTML_CAP) + `\n\n<!-- [truncated at ${HTML_CAP}/${result.htmlCleaned.length} chars] -->`
        : result.htmlCleaned;
      const imagesCapped = (result.images ?? []).slice(0, 20);

      return {
        success: true,
        message: `Fetched ${result.title || input.url} (${result.metadata.wordCount} words, ${charCount} chars${truncated ? ", truncated" : ""}${extras ? `, ${extras}` : ""})`,
        data: {
          url: input.url, title: result.title, content: result.content, links: result.links,
          wordCount: result.metadata.wordCount, language: result.metadata.language,
          truncated, cacheHit: false,
          screenshotUrl: result.screenshotUrl,
          htmlCleaned: htmlForAI,
          images: imagesCapped,
          summary: result.summary,
          sections: result.sections,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.warn("web_scrape failed", { url: input.url, error: msg });

      // Detect unrecoverable errors — no point retrying.
      const lower = msg.toLowerCase();
      const isAuth = /401|403|unauthori[sz]ed|forbidden|invalid api key|missing.*key/i.test(msg);
      const isNotFound = /404|not found/i.test(msg);
      const isBlocked = /blocked|captcha|cloudflare|bot detection/i.test(lower);
      const isDns = /enotfound|eai_again|getaddrinfo|dns/i.test(lower);

      if (isAuth) {
        return {
          success: false,
          message: `Kunne ikke hente ${input.url}: ${msg}`,
          bailOut: {
            reason: "firecrawl_auth_failed",
            userMessage: `Firecrawl API-nøkkelen er ugyldig eller mangler. Legg inn en gyldig nøkkel under Innstillinger → Integrasjoner.`,
          },
        };
      }
      if (isNotFound || isDns) {
        return {
          success: false,
          message: `Kunne ikke hente ${input.url}: ${msg}`,
          bailOut: {
            reason: "url_not_reachable",
            userMessage: `URL-en ${input.url} kan ikke nås (${isDns ? "DNS-oppslag feilet" : "404"}). Sjekk at lenken er riktig.`,
          },
        };
      }
      if (isBlocked) {
        return {
          success: false,
          message: `Kunne ikke hente ${input.url}: ${msg}`,
          bailOut: {
            reason: "url_blocked",
            userMessage: `Siden ${input.url} blokkerer scraping (captcha/bot-deteksjon). Vi kan ikke hente innholdet automatisk.`,
          },
        };
      }
      return { success: false, message: `Kunne ikke hente ${input.url}: ${msg}` };
    }
  },
};

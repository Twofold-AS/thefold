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
      return { success: false, message: `Kunne ikke hente ${input.url}: ${msg}` };
    }
  },
};

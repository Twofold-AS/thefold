import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  scrapeId: z.string().uuid().describe("ID from list_scrapes"),
  maxLength: z.number().int().positive().optional().describe("Truncate content to N chars (default 50000)"),
});

export const getCachedScrapeTool: Tool<z.infer<typeof inputSchema>> = {
  name: "get_cached_scrape",
  description:
    "Return the full cached Markdown content of a specific scrape by ID (from list_scrapes). Use this when the user asks you to reference a page scraped in a prior chat within the same project.",
  category: "web",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",
  maxCallsPerSession: 10,

  async handler(input, ctx) {
    const { chat } = await import("~encore/clients");

    try {
      const res = await (chat as unknown as {
        getScrapeInternal: (r: { scrapeId: string }) => Promise<{
          record: null | {
            id: string; url: string; title: string | null; contentMd: string;
            links: string[]; wordCount: number; fetchedAt: string; expiresAt: string; expired: boolean;
          };
        }>;
      }).getScrapeInternal({ scrapeId: input.scrapeId });

      if (!res.record) return { success: false, message: "Scrape-ID finnes ikke" };

      const wanted = input.maxLength ?? 50000;
      const charCount = res.record.contentMd.length;
      const content = charCount > wanted ? res.record.contentMd.slice(0, wanted) : res.record.contentMd;

      return {
        success: true,
        message: `${res.record.title || res.record.url} (cached ${res.record.fetchedAt}${res.record.expired ? ", expired" : ""})`,
        data: {
          scrapeId: res.record.id,
          url: res.record.url,
          title: res.record.title,
          content,
          links: res.record.links,
          wordCount: res.record.wordCount,
          fetchedAt: res.record.fetchedAt,
          expiresAt: res.record.expiresAt,
          expired: res.record.expired,
          truncated: charCount > wanted,
        },
      };
    } catch (err) {
      ctx.log.warn("get_cached_scrape failed", { scrapeId: input.scrapeId, error: err instanceof Error ? err.message : String(err) });
      return { success: false, message: "Kunne ikke hente cached scrape" };
    }
  },
};

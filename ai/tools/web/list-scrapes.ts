import { z } from "zod";
import type { Tool } from "../types";

const inputSchema = z.object({
  projectId: z.string().uuid().optional().describe("Scope to a specific project"),
  includeExpired: z.boolean().optional().describe("Include TTL-expired scrapes (default false)"),
  limit: z.number().int().positive().optional().describe("Max records (default 20)"),
});

export const listScrapesTool: Tool<z.infer<typeof inputSchema>> = {
  name: "list_scrapes",
  description:
    "List previously scraped web pages cached for this user/project (24h TTL). Useful when the user refers to \"the page we scraped earlier\". Returns array of {scrapeId, url, title, fetchedAt, expiresAt, wordCount}.",
  category: "web",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "low",
  maxCallsPerSession: 10,

  async handler(input, ctx) {
    const { chat } = await import("~encore/clients");
    const userEmail = ctx.userEmail ?? ctx.userId ?? "";

    try {
      const res = await (chat as unknown as {
        listScrapesInternal: (r: {
          userEmail: string; projectId?: string | null; includeExpired?: boolean; limit?: number;
        }) => Promise<{
          records: Array<{
            id: string; url: string; title: string | null; wordCount: number;
            projectId: string | null; fetchedAt: string; expiresAt: string; expired: boolean;
          }>;
        }>;
      }).listScrapesInternal({
        userEmail,
        projectId: input.projectId ?? null,
        includeExpired: input.includeExpired,
        limit: input.limit,
      });

      return {
        success: true,
        message: `${res.records.length} cached scrape(s)`,
        data: {
          scrapes: res.records.map((r) => ({
            scrapeId: r.id, url: r.url, title: r.title, wordCount: r.wordCount,
            projectId: r.projectId, fetchedAt: r.fetchedAt, expiresAt: r.expiresAt, expired: r.expired,
          })),
        },
      };
    } catch (err) {
      ctx.log.warn("list_scrapes failed", { error: err instanceof Error ? err.message : String(err) });
      return { success: false, message: "Kunne ikke liste scrapes" };
    }
  },
};

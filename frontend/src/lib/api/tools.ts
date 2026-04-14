import { apiFetch } from "./client";

export interface ScrapeResult {
  content: string;
  title?: string;
}

/**
 * Scrape a URL via the Firecrawl-backed backend endpoint.
 * Returns the page content as Markdown.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  return apiFetch<ScrapeResult>("/tools/scrape", {
    method: "POST",
    body: { url },
  });
}

import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";

const FirecrawlApiKey = secret("FirecrawlApiKey");

interface ScrapeRequest {
  url: string;
}

interface ScrapeResponse {
  content: string;
  title?: string;
}

interface FirecrawlResult {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
    };
  };
  error?: string;
}

/**
 * Scrape a URL using Firecrawl and return the content as Markdown.
 * The API key is stored as an Encore secret (FirecrawlApiKey).
 */
export const scrapeUrl = api(
  { expose: true, method: "POST", path: "/tools/scrape", auth: true },
  async ({ url }: ScrapeRequest): Promise<ScrapeResponse> => {
    if (!url || !url.startsWith("http")) {
      throw new APIError(400, "Invalid URL — must start with http:// or https://");
    }

    const apiKey = FirecrawlApiKey();

    let res: Response;
    try {
      res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      });
    } catch (err) {
      log.error("Firecrawl network error", { url, error: err instanceof Error ? err.message : String(err) });
      throw new APIError(502, "Failed to reach Firecrawl API");
    }

    if (!res.ok) {
      const body = await res.text();
      log.warn("Firecrawl API error", { url, status: res.status, body });
      throw new APIError(res.status as Parameters<typeof APIError>[0], `Firecrawl error: ${body}`);
    }

    const data = (await res.json()) as FirecrawlResult;

    if (!data.success || !data.data) {
      throw new APIError(422, data.error || "Firecrawl returned no content");
    }

    return {
      content: data.data.markdown ?? "",
      title: data.data.metadata?.title,
    };
  },
);

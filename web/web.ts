import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";

const FirecrawlApiKey = secret("FirecrawlApiKey");

interface ScrapeRequest {
  url: string;
  maxLength?: number; // Max chars returned (default 50000)
}

interface ScrapeResponse {
  title: string;
  content: string; // Markdown-formatted content
  links: string[];
  metadata: { wordCount: number; language?: string };
}

export const scrape = api(
  { method: "POST", path: "/web/scrape", expose: false },
  async (req: ScrapeRequest): Promise<ScrapeResponse> => {
    let apiKey: string;
    try {
      apiKey = FirecrawlApiKey();
    } catch {
      throw APIError.failedPrecondition(
        "FirecrawlApiKey secret not configured",
      );
    }

    // Validate URL
    try {
      new URL(req.url);
    } catch {
      throw APIError.invalidArgument("Invalid URL");
    }

    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: req.url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    if (res.status === 429) {
      throw APIError.resourceExhausted(
        "Firecrawl rate limit exceeded. Try again later.",
      );
    }

    if (!res.ok) {
      const errorText = await res.text();
      log.warn("Firecrawl scrape failed", {
        url: req.url,
        status: res.status,
        error: errorText,
      });
      throw APIError.internal(`Firecrawl error: ${res.status}`);
    }

    const data = await res.json();
    const content = data.data?.markdown || "";
    const maxLen = req.maxLength || 50000;

    return {
      title: data.data?.metadata?.title || "",
      content: content.substring(0, maxLen),
      links: (data.data?.links || []).slice(0, 50), // Limit links
      metadata: {
        wordCount: content.split(/\s+/).length,
        language: data.data?.metadata?.language,
      },
    };
  },
);

// Health check
export const webHealth = api(
  { method: "GET", path: "/web/health", expose: true },
  async (): Promise<{ status: string }> => {
    let configured = false;
    try {
      FirecrawlApiKey();
      configured = true;
    } catch {
      // Secret not configured — not an error, just report status
    }
    return { status: configured ? "ready" : "not_configured" };
  },
);

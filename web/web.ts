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

function isUrlAllowed(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only allow http/https
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  // Block internal/metadata hostnames
  const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "metadata.google"];
  if (blocked.some(b => parsed.hostname.includes(b))) return false;
  if (parsed.hostname.endsWith(".internal")) return false;

  // Block private IP ranges
  const parts = parsed.hostname.split(".");
  if (parts[0] === "10") return false;
  if (parts[0] === "172" && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return false;
  if (parts[0] === "192" && parts[1] === "168") return false;

  return true;
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

    // Validate URL format
    try {
      new URL(req.url);
    } catch {
      throw APIError.invalidArgument("Invalid URL");
    }

    // SSRF protection — block internal/private URLs
    if (!isUrlAllowed(req.url)) {
      throw APIError.invalidArgument("URL not allowed: internal or private addresses are blocked");
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

import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";

const FirecrawlApiKey = secret("FirecrawlApiKey");

type ScrapeFormat = "markdown" | "links" | "html" | "screenshot" | "images" | "summary";

interface ScrapeRequest {
  url: string;
  maxLength?: number; // Max chars returned (default 50000)
  /** Per-user API key (from integration_configs). If set, overrides global secret. */
  apiKeyOverride?: string;
  /** @deprecated — use formats: ["screenshot"] instead. Kept for back-compat. */
  screenshot?: boolean;
  /** Which Firecrawl formats to request. Default: ["markdown", "links"]. */
  formats?: ScrapeFormat[];
}

/** A sliced section of markdown content, keyed by heading. */
interface MarkdownSection {
  /** Heading text without leading #s. Top-level intro (before any heading) has level=0, heading="(intro)". */
  heading: string;
  /** 1–6 for ## through ######, or 0 for the pre-heading intro. */
  level: number;
  /** Zero-based character offset into the full content. */
  offset: number;
  /** Character length of this section including its heading line. */
  length: number;
  /** First ~200 chars of the section body as a preview. */
  preview: string;
}

interface ScrapeResponse {
  title: string;
  content: string; // Markdown-formatted content
  links: string[];
  metadata: { wordCount: number; language?: string };
  /** Full-page screenshot URL (Firecrawl-hosted). */
  screenshotUrl?: string;
  /** Cleaned HTML (when "html" requested). */
  htmlCleaned?: string;
  /** Image URLs scraped from the page (when "images" requested). */
  images?: string[];
  /** AI-generated summary (when "summary" requested). */
  summary?: string;
  /**
   * Section index derived from markdown headings. Lets the agent page
   * through a long document by offset/length instead of re-fetching or
   * drinking the full content in one tool result.
   */
  sections?: MarkdownSection[];
  /** Raw Firecrawl response — preserved for forward-compat / debugging. */
  rawResponse?: Record<string, unknown>;
}

/**
 * Build a section index from markdown content by scanning heading lines.
 * Returns an array of sections with offsets into the original content.
 * The pre-heading intro gets its own entry with level=0 and heading="(intro)".
 */
function chunkMarkdownSections(content: string): MarkdownSection[] {
  if (!content) return [];
  const lines = content.split("\n");
  const sections: MarkdownSection[] = [];

  // Track current section start offset + length.
  let cursor = 0;
  let currentStart = 0;
  let currentHeading = "(intro)";
  let currentLevel = 0;

  const flush = (endOffset: number) => {
    const length = endOffset - currentStart;
    if (length <= 0) return;
    const body = content.slice(currentStart, endOffset);
    const preview = body.replace(/\n+/g, " ").slice(0, 200).trim();
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      offset: currentStart,
      length,
      preview,
    });
  };

  for (const line of lines) {
    const lineWithNewline = line.length + 1; // +1 for the \n we split on
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      // Flush prior section up to start of this heading line.
      flush(cursor);
      currentStart = cursor;
      currentLevel = match[1].length;
      currentHeading = match[2];
    }
    cursor += lineWithNewline;
  }
  flush(Math.min(cursor, content.length));

  return sections;
}

// Binary / non-HTML file extensions that Firecrawl cannot meaningfully scrape.
// Filtering here avoids a doomed external call + misleading "scrape succeeded"
// responses containing garbled binary data. The AI should get a clear error
// so it can pivot (e.g. ask the user to extract text first).
const BINARY_EXTENSIONS = new Set([
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
  // Archives
  "zip", "tar", "gz", "7z", "rar", "bz2", "xz",
  // Images
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "ico", "svg",
  // Audio / video
  "mp3", "mp4", "wav", "flac", "ogg", "m4a", "mov", "avi", "mkv", "webm",
  // Executables / binaries
  "exe", "dmg", "iso", "bin", "apk", "ipa", "deb", "rpm", "msi",
  // Other
  "woff", "woff2", "ttf", "otf", "eot",
]);

function looksLikeBinaryUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const lastSegment = pathname.split("/").pop() ?? "";
    const ext = lastSegment.includes(".") ? lastSegment.split(".").pop()!.toLowerCase() : "";
    return BINARY_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
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
    let apiKey: string | null = req.apiKeyOverride?.trim() || null;
    if (!apiKey) {
      try {
        apiKey = FirecrawlApiKey();
      } catch {
        apiKey = null;
      }
    }
    if (!apiKey) {
      throw APIError.unavailable(
        "Web scraping service not configured. Set FirecrawlApiKey via Innstillinger → Integrasjoner.",
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

    // Block binary/non-HTML URLs — Firecrawl can't scrape them and the AI
    // wastes a tool-call on garbled output. Fail fast with a clear error so
    // the agent can pivot to a different approach.
    if (looksLikeBinaryUrl(req.url)) {
      throw APIError.invalidArgument(
        `URL appears to be a binary/non-HTML file and cannot be scraped. ` +
        `Ask the user to provide text content or a page URL instead.`,
      );
    }

    // Resolve requested formats. Back-compat: legacy `screenshot: true` → add screenshot.
    const requested = new Set<ScrapeFormat>(req.formats ?? ["markdown", "links"]);
    if (req.screenshot) requested.add("screenshot");
    // Firecrawl expects wire-names; map friendly names → their API keys.
    const wireFormats: string[] = [];
    if (requested.has("markdown"))   wireFormats.push("markdown");
    if (requested.has("links"))      wireFormats.push("links");
    if (requested.has("html"))       wireFormats.push("html");
    if (requested.has("screenshot")) wireFormats.push("screenshot@fullPage");
    // "images" and "summary" ride on the main response — no extra format key
    // needed for images (Firecrawl returns them in the HTML/metadata when
    // onlyMainContent=false). summary is derived from markdown by caller.
    if (requested.has("images") && !requested.has("html")) {
      wireFormats.push("html"); // need HTML to extract <img> tags
    }

    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: req.url,
        formats: wireFormats,
        onlyMainContent: !requested.has("images"),
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

    // Extract images from HTML if requested.
    let images: string[] | undefined;
    if (requested.has("images") && typeof data.data?.html === "string") {
      const imgMatches = data.data.html.match(/<img[^>]+src=["']([^"']+)["']/gi) ?? [];
      images = imgMatches
        .map((m: string) => m.match(/src=["']([^"']+)["']/i)?.[1])
        .filter((s: string | undefined): s is string => !!s)
        .slice(0, 50);
    }

    const trimmedContent = content.substring(0, maxLen);

    return {
      title: data.data?.metadata?.title || "",
      content: trimmedContent,
      links: (data.data?.links || []).slice(0, 50), // Limit links
      metadata: {
        wordCount: content.split(/\s+/).length,
        language: data.data?.metadata?.language,
      },
      screenshotUrl: typeof data.data?.screenshot === "string" ? data.data.screenshot : undefined,
      htmlCleaned: requested.has("html") && typeof data.data?.html === "string" ? data.data.html : undefined,
      images,
      summary: requested.has("summary") && typeof data.data?.summary === "string" ? data.data.summary : undefined,
      sections: chunkMarkdownSections(trimmedContent),
      rawResponse: data.data,
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

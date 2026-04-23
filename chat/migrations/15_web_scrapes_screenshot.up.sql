-- Fase vision-prep — Add screenshot_url column for Firecrawl screenshot-mode.
-- Nullable: not every scrape needs a screenshot (extra cost / time).
-- Populated by the web_scrape tool when `screenshot: true` is requested
-- (typically when the selected model supports vision and the project is
-- design-platform-based, e.g. Framer).

ALTER TABLE web_scrapes
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT NULL;

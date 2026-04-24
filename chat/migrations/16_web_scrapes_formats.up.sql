-- Firecrawl scrape responses can include markdown, links, html (cleaned),
-- screenshot URL, images, and summary. Store the full response as JSONB for
-- forward-compatibility; callers prefer column-lookup where available, fall
-- back to raw_response for anything new.

ALTER TABLE web_scrapes
  ADD COLUMN IF NOT EXISTS html_cleaned TEXT NULL,
  ADD COLUMN IF NOT EXISTS images JSONB NULL,
  ADD COLUMN IF NOT EXISTS summary TEXT NULL,
  ADD COLUMN IF NOT EXISTS raw_response JSONB NULL;

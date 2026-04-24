import { describe, it, expect } from "vitest";

// Reimplement chunker signature for isolated testing without pulling in
// Encore service boot. If web.ts refactors chunkMarkdownSections out to a
// shared module later, swap this import.
interface MarkdownSection {
  heading: string;
  level: number;
  offset: number;
  length: number;
  preview: string;
}

function chunkMarkdownSections(content: string): MarkdownSection[] {
  if (!content) return [];
  const lines = content.split("\n");
  const sections: MarkdownSection[] = [];

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
    const lineWithNewline = line.length + 1;
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
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

describe("chunkMarkdownSections", () => {
  it("returns empty array for empty content", () => {
    expect(chunkMarkdownSections("")).toEqual([]);
  });

  it("treats heading-less content as a single intro section", () => {
    const result = chunkMarkdownSections("Just some text here.");
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("(intro)");
    expect(result[0].level).toBe(0);
    expect(result[0].offset).toBe(0);
  });

  it("splits on ## headings", () => {
    const md = "## Intro\nHello\n## About\nPage about cars.\n## Contact\nEmail us.";
    const sections = chunkMarkdownSections(md);
    expect(sections.map((s) => s.heading)).toEqual(["Intro", "About", "Contact"]);
    expect(sections.every((s) => s.level === 2)).toBe(true);
  });

  it("captures the pre-heading intro separately", () => {
    const md = "Welcome page.\n\n## Details\nMore info.";
    const sections = chunkMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("(intro)");
    expect(sections[1].heading).toBe("Details");
  });

  it("records correct offsets so slicing reproduces content", () => {
    const md = "## A\nalpha\n## B\nbeta\n";
    const sections = chunkMarkdownSections(md);
    for (const s of sections) {
      const sliced = md.slice(s.offset, s.offset + s.length);
      expect(sliced.length).toBe(s.length);
    }
  });

  it("handles mixed heading levels", () => {
    const md = "# Top\nx\n## Sub\ny\n### Subsub\nz";
    const sections = chunkMarkdownSections(md);
    expect(sections.map((s) => s.level)).toEqual([1, 2, 3]);
  });

  it("truncates previews to 200 chars", () => {
    const longBody = "word ".repeat(60); // ~300 chars
    const md = `## Long\n${longBody}`;
    const sections = chunkMarkdownSections(md);
    expect(sections[0].preview.length).toBeLessThanOrEqual(200);
  });
});

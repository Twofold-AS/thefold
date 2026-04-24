import { describe, it, expect } from "vitest";

// Mirror of BINARY_EXTENSIONS + looksLikeBinaryUrl from web/web.ts.
// Keeps the test isolated from Encore service boot.
const BINARY_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
  "zip", "tar", "gz", "7z", "rar", "bz2", "xz",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "ico", "svg",
  "mp3", "mp4", "wav", "flac", "ogg", "m4a", "mov", "avi", "mkv", "webm",
  "exe", "dmg", "iso", "bin", "apk", "ipa", "deb", "rpm", "msi",
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

describe("looksLikeBinaryUrl", () => {
  it("flags PDF URLs", () => {
    expect(looksLikeBinaryUrl("https://example.com/doc.pdf")).toBe(true);
  });

  it("flags image URLs regardless of casing", () => {
    expect(looksLikeBinaryUrl("https://example.com/foo.PNG")).toBe(true);
    expect(looksLikeBinaryUrl("https://cdn.x.com/image.JPEG?v=1")).toBe(true);
  });

  it("flags archives and executables", () => {
    expect(looksLikeBinaryUrl("https://example.com/app.zip")).toBe(true);
    expect(looksLikeBinaryUrl("https://example.com/install.exe")).toBe(true);
    expect(looksLikeBinaryUrl("https://example.com/font.woff2")).toBe(true);
  });

  it("allows HTML pages and clean URLs", () => {
    expect(looksLikeBinaryUrl("https://example.com/")).toBe(false);
    expect(looksLikeBinaryUrl("https://example.com/about")).toBe(false);
    expect(looksLikeBinaryUrl("https://example.com/page.html")).toBe(false);
    expect(looksLikeBinaryUrl("https://example.com/blog/post-1")).toBe(false);
  });

  it("ignores query strings and fragments when finding extension", () => {
    expect(looksLikeBinaryUrl("https://example.com/foo.pdf?download=1")).toBe(true);
    expect(looksLikeBinaryUrl("https://example.com/about?foo=bar.pdf")).toBe(false);
  });

  it("returns false for malformed URLs", () => {
    expect(looksLikeBinaryUrl("not a url")).toBe(false);
    expect(looksLikeBinaryUrl("")).toBe(false);
  });
});

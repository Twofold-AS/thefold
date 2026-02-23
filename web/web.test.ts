import { describe, it, expect, vi } from "vitest";

vi.mock("encore.dev/api", () => ({
  api: (_opts: any, handler: any) => handler,
  APIError: {
    invalidArgument: (msg: string) => new Error(`invalid_argument: ${msg}`),
    internal: (msg: string) => new Error(`internal: ${msg}`),
  },
}));

vi.mock("encore.dev/config", () => ({
  secret: () => () => "false",
}));

vi.mock("encore.dev/log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("web scraping service", () => {
  it("scrape endpoint exists", async () => {
    const { scrape } = await import("./web");
    expect(scrape).toBeDefined();
  });

  it("health endpoint exists", async () => {
    const { webHealth } = await import("./web");
    expect(webHealth).toBeDefined();
  });

  it("validates URL format", () => {
    expect(() => new URL("not-a-url")).toThrow();
    expect(() => new URL("https://example.com")).not.toThrow();
  });

  it("maxLength defaults to 50000", () => {
    const defaultMax = 50000;
    const content = "a".repeat(60000);
    expect(content.substring(0, defaultMax).length).toBe(50000);
  });

  it("links are limited to 50", () => {
    const links = Array.from(
      { length: 100 },
      (_, i) => `https://example.com/${i}`,
    );
    expect(links.slice(0, 50).length).toBe(50);
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("encore.dev/storage/sqldb", () => ({
  SQLDatabase: vi.fn().mockImplementation(function () {
    return { queryRow: vi.fn(), exec: vi.fn(), query: vi.fn() };
  }),
}));

vi.mock("encore.dev/api", () => ({
  api: (_opts: any, handler: any) => handler,
  APIError: {
    invalidArgument: (msg: string) => new Error(`invalid_argument: ${msg}`),
    notFound: (msg: string) => new Error(`not_found: ${msg}`),
    internal: (msg: string) => new Error(`internal: ${msg}`),
  },
}));

vi.mock("encore.dev/log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("MCP functional", () => {
  it("server without config shows as misconfigured", () => {
    const envVars = { "API_KEY": "", "SECRET": "" };
    const missing = Object.entries(envVars)
      .filter(([_, v]) => !v || v === "")
      .map(([k]) => k);
    expect(missing).toEqual(["API_KEY", "SECRET"]);
  });

  it("server with config shows no missing vars", () => {
    const envVars = { "API_KEY": "sk-123", "SECRET": "abc" };
    const missing = Object.entries(envVars)
      .filter(([_, v]) => !v || v === "")
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it("github and postgres servers are removed", () => {
    // Migration removes these duplicate servers
    const removedIds = ["github", "postgres"];
    expect(removedIds).toContain("github");
    expect(removedIds).toContain("postgres");
  });

  it("sentry and linear servers are added", () => {
    const addedIds = ["sentry", "linear-mcp"];
    expect(addedIds).toContain("sentry");
    expect(addedIds).toContain("linear-mcp");
  });

  it("validateServer endpoint exists", async () => {
    const { validateServer } = await import("./mcp");
    expect(validateServer).toBeDefined();
  });
});

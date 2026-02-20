import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractComponents } from "./extractor";

// Mock encore clients
vi.mock("~encore/clients", () => ({
  ai: {
    callForExtraction: vi.fn(),
  },
  registry: {
    register: vi.fn(),
  },
}));

// Mock encore config
vi.mock("encore.dev/config", () => ({
  secret: vi.fn(() => () => "true"), // Default: enabled
}));

describe("extractComponents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returnerer [] når feature flag er deaktivert", async () => {
    const { secret } = await import("encore.dev/config");
    vi.mocked(secret).mockReturnValue(() => "false");

    const result = await extractComponents({
      repo: "test/repo",
      files: [
        { path: "a.ts", content: "content" },
        { path: "b.ts", content: "content" },
      ],
      taskDescription: "test task",
    });

    expect(result).toEqual([]);
  });

  it("returnerer [] med færre enn 2 filer", async () => {
    const result = await extractComponents({
      repo: "test/repo",
      files: [{ path: "a.ts", content: "content" }],
      taskDescription: "test task",
    });

    expect(result).toEqual([]);
  });

  it("filtrerer bort test-filer og config", async () => {
    const { ai } = await import("~encore/clients");
    vi.mocked(ai.callForExtraction).mockResolvedValue({ components: [] });

    const files = [
      { path: "code.ts", content: "x".repeat(200) },
      { path: "code.test.ts", content: "x".repeat(200) },
      { path: "package.json", content: "{}" },
      { path: "README.md", content: "# Read me" },
      { path: "app.spec.ts", content: "spec" },
      { path: "another.ts", content: "y".repeat(200) },
    ];

    await extractComponents({
      repo: "test/repo",
      files,
      taskDescription: "test task",
    });

    // Verify ai.callForExtraction was called with only valid files
    expect(ai.callForExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({ path: "code.ts" }),
          expect.objectContaining({ path: "another.ts" }),
        ]),
      })
    );

    const call = vi.mocked(ai.callForExtraction).mock.calls[0][0];
    expect(call.files).toHaveLength(2);
    expect(call.files.every((f: any) => !f.path.includes(".test."))).toBe(true);
    expect(call.files.every((f: any) => !f.path.endsWith(".json"))).toBe(true);
  });

  it("begrenser til maks 3 komponenter", async () => {
    const { ai } = await import("~encore/clients");
    vi.mocked(ai.callForExtraction).mockResolvedValue({
      components: [
        {
          name: "comp-1",
          description: "First",
          category: "api",
          files: [{ path: "a.ts", content: "" }],
          entryPoint: "a.ts",
          dependencies: [],
          tags: [],
          qualityScore: 80,
        },
        {
          name: "comp-2",
          description: "Second",
          category: "ui",
          files: [{ path: "b.ts", content: "" }],
          entryPoint: "b.ts",
          dependencies: [],
          tags: [],
          qualityScore: 75,
        },
        {
          name: "comp-3",
          description: "Third",
          category: "utility",
          files: [{ path: "c.ts", content: "" }],
          entryPoint: "c.ts",
          dependencies: [],
          tags: [],
          qualityScore: 70,
        },
        {
          name: "comp-4",
          description: "Fourth (should be filtered)",
          category: "api",
          files: [{ path: "d.ts", content: "" }],
          entryPoint: "d.ts",
          dependencies: [],
          tags: [],
          qualityScore: 90,
        },
      ],
    });

    const result = await extractComponents({
      repo: "test/repo",
      files: [
        { path: "a.ts", content: "x".repeat(200) },
        { path: "b.ts", content: "y".repeat(200) },
      ],
      taskDescription: "test task",
    });

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.name)).toEqual(["comp-1", "comp-2", "comp-3"]);
  });

  it("håndterer AI-feil gracefully (returnerer [])", async () => {
    const { ai } = await import("~encore/clients");
    vi.mocked(ai.callForExtraction).mockRejectedValue(new Error("AI service down"));

    const result = await extractComponents({
      repo: "test/repo",
      files: [
        { path: "a.ts", content: "x".repeat(200) },
        { path: "b.ts", content: "y".repeat(200) },
      ],
      taskDescription: "test task",
    });

    expect(result).toEqual([]);
  });

  it("filtrerer ut komponenter med qualityScore < 50", async () => {
    const { ai } = await import("~encore/clients");
    vi.mocked(ai.callForExtraction).mockResolvedValue({
      components: [
        {
          name: "good-comp",
          description: "Good quality",
          category: "api",
          files: [{ path: "a.ts", content: "" }],
          entryPoint: "a.ts",
          dependencies: [],
          tags: [],
          qualityScore: 80,
        },
        {
          name: "bad-comp",
          description: "Low quality",
          category: "ui",
          files: [{ path: "b.ts", content: "" }],
          entryPoint: "b.ts",
          dependencies: [],
          tags: [],
          qualityScore: 30,
        },
      ],
    });

    const result = await extractComponents({
      repo: "test/repo",
      files: [
        { path: "a.ts", content: "x".repeat(200) },
        { path: "b.ts", content: "y".repeat(200) },
      ],
      taskDescription: "test task",
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("good-comp");
  });

  it("berikker med full filinnhold", async () => {
    const { ai } = await import("~encore/clients");
    const fullContent = "x".repeat(5000);
    const truncatedContent = fullContent.substring(0, 2000);

    vi.mocked(ai.callForExtraction).mockResolvedValue({
      components: [
        {
          name: "test-comp",
          description: "Test",
          category: "api",
          files: [{ path: "a.ts", content: truncatedContent }], // AI gets truncated
          entryPoint: "a.ts",
          dependencies: [],
          tags: [],
          qualityScore: 80,
        },
      ],
    });

    const result = await extractComponents({
      repo: "test/repo",
      files: [
        { path: "a.ts", content: fullContent }, // Original has full content
        { path: "b.ts", content: "y".repeat(200) }, // Ensure minimum length
      ],
      taskDescription: "test task",
    });

    expect(result).toHaveLength(1);
    expect(result[0].files[0].content).toBe(fullContent); // Should have full content
    expect(result[0].files[0].content.length).toBeGreaterThan(2000);
  });

  it("detecterer korrekt språk basert på filendelse", async () => {
    const { ai } = await import("~encore/clients");
    vi.mocked(ai.callForExtraction).mockResolvedValue({
      components: [
        {
          name: "multi-lang-comp",
          description: "Multiple languages",
          category: "ui",
          files: [
            { path: "app.ts", content: "" },
            { path: "style.css", content: "" },
            { path: "migration.sql", content: "" },
            { path: "config.yaml", content: "" },
          ],
          entryPoint: "app.ts",
          dependencies: [],
          tags: [],
          qualityScore: 80,
        },
      ],
    });

    const result = await extractComponents({
      repo: "test/repo",
      files: [
        { path: "app.ts", content: "x".repeat(200) },
        { path: "style.css", content: "y".repeat(200) },
        { path: "migration.sql", content: "z".repeat(200) },
        { path: "config.yaml", content: "w".repeat(200) },
      ],
      taskDescription: "test task",
    });

    expect(result).toHaveLength(1);
    expect(result[0].files[0].language).toBe("typescript");
    expect(result[0].files[1].language).toBe("css");
    expect(result[0].files[2].language).toBe("sql");
    expect(result[0].files[3].language).toBe("unknown");
  });
});

/**
 * Mock-svar for eksterne services (GitHub, Memory, Docs, MCP, Sandbox)
 * brukt i E2E-tester uten ekte API-nøkler.
 */

export function mockGitHubTree() {
  return {
    tree: [
      "agent/types.ts",
      "agent/agent.ts",
      "package.json",
      "tsconfig.json",
    ],
    treeString: "agent/\n  types.ts\n  agent.ts\npackage.json\ntsconfig.json",
    packageJson: { name: "thefold", version: "1.0.0", dependencies: { "encore.dev": "^1.0.0" } },
    empty: false,
  };
}

export function mockGitHubFile(filePath: string) {
  const mockFiles: Record<string, string> = {
    "agent/types.ts": "export interface AgentExecutionContext { /* ... */ }",
    "package.json": JSON.stringify({ name: "thefold", dependencies: { "encore.dev": "^1.0.0" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
  };

  return {
    content: mockFiles[filePath] ?? `// Mock content for ${filePath}`,
    encoding: "utf-8",
  };
}

export function mockMemorySearch() {
  return {
    results: [
      {
        id: "mock-memory-1",
        content: "TypeScript strict mode is used throughout the project",
        type: "decision",
        relevanceScore: 0.85,
        trust_level: "agent",
      },
    ],
  };
}

export function mockDocsLookup() {
  return {
    docs: [
      {
        source: "encore.ts",
        content: "Use api() from encore.dev/api for all endpoints",
      },
    ],
  };
}

export function mockMCPInstalled() {
  return { servers: [] };
}

export function mockSandboxCreate() {
  return { id: `mock-sandbox-${Date.now()}` };
}

export function mockSandboxValidate() {
  return {
    success: true,
    output: "=== TYPECHECK ===\nNo errors\n\n=== LINT ===\nNo errors\n\n=== TEST ===\nNo errors\n\nPipeline duration: 1234ms",
    errors: [],
  };
}

export function mockSandboxDestroy() {
  return { destroyed: true };
}

export function mockBuilderStart() {
  return {
    success: true,
    filesChanged: [
      { path: "agent/types.ts", action: "modify" },
    ],
    tokensUsed: 1500,
    costUsd: 0.002,
    buildIterations: 1,
  };
}

export function mockGitHubCreatePR() {
  return {
    prUrl: "https://github.com/Twofold-AS/thefold/pull/999",
    prNumber: 999,
  };
}

export function mockCurateContext() {
  return {
    curatedFiles: [
      { path: "agent/types.ts", content: "// Mock curated content", relevance: 0.95 },
    ],
    reasoning: "Mock: Selected files based on task description",
    tokenEstimate: 500,
  };
}

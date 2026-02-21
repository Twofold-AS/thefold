import { describe, it, expect } from "vitest";
import {
  extractImports,
  resolveImport,
  buildImportGraph,
  getRelatedFiles,
} from "./code-graph";

describe("extractImports", () => {
  it("should extract ES6 named imports", () => {
    const content = `import { foo, bar } from "./utils";`;
    expect(extractImports(content)).toContain("./utils");
  });

  it("should extract default imports", () => {
    const content = `import config from "../config";`;
    expect(extractImports(content)).toContain("../config");
  });

  it("should extract star imports", () => {
    const content = `import * as helpers from "./helpers";`;
    expect(extractImports(content)).toContain("./helpers");
  });

  it("should extract re-exports", () => {
    const content = `export { default } from "./types";`;
    expect(extractImports(content)).toContain("./types");
  });

  it("should extract require calls", () => {
    const content = `const x = require("./lib");`;
    expect(extractImports(content)).toContain("./lib");
  });

  it("should ignore non-relative imports", () => {
    const content = `
import { api } from "encore.dev/api";
import React from "react";
import { foo } from "~encore/clients";
import { bar } from "./local";
    `;
    const imports = extractImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toBe("./local");
  });

  it("should handle multiple imports in one file", () => {
    const content = `
import { A } from "./a";
import { B } from "./b";
import { C } from "../c";
    `;
    expect(extractImports(content)).toHaveLength(3);
  });
});

describe("resolveImport", () => {
  const knownFiles = new Set([
    "src/types.ts",
    "src/utils/hash.ts",
    "src/config.ts",
    "src/index.ts",
    "src/components/Button.tsx",
    "lib/index.ts",
  ]);

  it("should resolve with .ts extension", () => {
    expect(resolveImport("src/auth.ts", "./types", knownFiles)).toBe("src/types.ts");
  });

  it("should resolve with .tsx extension", () => {
    expect(resolveImport("src/app.ts", "./components/Button", knownFiles)).toBe(
      "src/components/Button.tsx",
    );
  });

  it("should resolve parent directory imports", () => {
    expect(resolveImport("src/utils/hash.ts", "../config", knownFiles)).toBe("src/config.ts");
  });

  it("should resolve index.ts", () => {
    expect(resolveImport("src/auth.ts", "../lib", knownFiles)).toBe("lib/index.ts");
  });

  it("should return null for unresolvable imports", () => {
    expect(resolveImport("src/auth.ts", "./nonexistent", knownFiles)).toBeNull();
  });
});

describe("buildImportGraph", () => {
  it("should build bidirectional graph", () => {
    const files = [
      { path: "src/types.ts", content: `export interface User {}` },
      { path: "src/auth.ts", content: `import { User } from "./types";` },
      {
        path: "src/api.ts",
        content: `import { login } from "./auth";\nimport { User } from "./types";`,
      },
    ];

    const graph = buildImportGraph(files);

    // auth imports types
    expect(graph.imports.get("src/auth.ts")).toContain("src/types.ts");
    // api imports auth + types
    expect(graph.imports.get("src/api.ts")).toContain("src/auth.ts");
    expect(graph.imports.get("src/api.ts")).toContain("src/types.ts");
    // types is imported by auth + api
    expect(graph.importedBy.get("src/types.ts")).toContain("src/auth.ts");
    expect(graph.importedBy.get("src/types.ts")).toContain("src/api.ts");
    // types imports nothing
    expect(graph.imports.get("src/types.ts")).toHaveLength(0);
  });

  it("should ignore self-references", () => {
    const files = [
      { path: "src/a.ts", content: `import { x } from "./a";` }, // self-import
    ];
    const graph = buildImportGraph(files);
    expect(graph.imports.get("src/a.ts")).toHaveLength(0);
  });

  it("should ignore unresolvable imports", () => {
    const files = [{ path: "src/a.ts", content: `import { x } from "./nonexistent";` }];
    const graph = buildImportGraph(files);
    expect(graph.imports.get("src/a.ts")).toHaveLength(0);
  });
});

describe("getRelatedFiles", () => {
  const files = [
    { path: "src/types.ts", content: `export interface User {}` },
    { path: "src/config.ts", content: `export const CONFIG = {};` },
    {
      path: "src/db.ts",
      content: `import { User } from "./types";\nimport { CONFIG } from "./config";`,
    },
    { path: "src/auth.ts", content: `import { db } from "./db";` },
    { path: "src/api.ts", content: `import { auth } from "./auth";` },
    { path: "src/unrelated.ts", content: `console.log("no imports");` },
  ];

  const graph = buildImportGraph(files);

  it("should find direct imports (depth 1)", () => {
    const related = getRelatedFiles(graph, ["src/db.ts"], 1);
    expect(related).toContain("src/types.ts"); // db imports types
    expect(related).toContain("src/config.ts"); // db imports config
    expect(related).toContain("src/auth.ts"); // auth imports db (importedBy)
    expect(related).not.toContain("src/unrelated.ts");
  });

  it("should find transitive dependencies (depth 2)", () => {
    const related = getRelatedFiles(graph, ["src/auth.ts"], 2);
    expect(related).toContain("src/db.ts"); // auth imports db (depth 1)
    expect(related).toContain("src/types.ts"); // db imports types (depth 2)
    expect(related).toContain("src/config.ts"); // db imports config (depth 2)
    expect(related).toContain("src/api.ts"); // api imports auth (importedBy depth 1)
  });

  it("should respect maxDepth", () => {
    const related = getRelatedFiles(graph, ["src/api.ts"], 1);
    expect(related).toContain("src/auth.ts"); // api imports auth (depth 1)
    // db er depth 2 via auth, bør ikke være med ved maxDepth=1
    expect(related).not.toContain("src/config.ts");
  });

  it("should include target files themselves", () => {
    const related = getRelatedFiles(graph, ["src/db.ts"], 1);
    expect(related).toContain("src/db.ts");
  });

  it("should handle multiple targets", () => {
    const related = getRelatedFiles(graph, ["src/types.ts", "src/config.ts"], 1);
    expect(related).toContain("src/db.ts"); // imports both
  });

  it("should return unique files only", () => {
    const related = getRelatedFiles(graph, ["src/db.ts"], 2);
    const unique = new Set(related);
    expect(related.length).toBe(unique.size);
  });

  it("should handle empty graph", () => {
    const emptyGraph = buildImportGraph([]);
    const related = getRelatedFiles(emptyGraph, ["nonexistent.ts"], 2);
    expect(related).toContain("nonexistent.ts"); // bare target selv
  });
});

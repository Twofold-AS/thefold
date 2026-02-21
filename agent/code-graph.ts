// Symbol-based code search using import graphs
// Finds precise file dependencies by parsing imports
// NOTE: Cannot import builder/graph.ts directly (Encore cross-service rule)
// Functions copied from builder/graph.ts with modifications for agent use case

import log from "encore.dev/log";

// --- Types ---

export interface ImportGraph {
  /** filsti → liste av filer den importerer */
  imports: Map<string, string[]>;
  /** filsti → liste av filer som importerer den */
  importedBy: Map<string, string[]>;
}

// --- Import parsing (basert på builder/graph.ts extractImports + resolveImport) ---

/**
 * Ekstraher import-stier fra TypeScript/JavaScript kilde.
 * Håndterer: import ... from "...", require("..."), export ... from "..."
 * Returnerer KUN relative imports (starter med ./ eller ../).
 *
 * NOTE: Denne er en kopi av builder/graph.ts extractImports.
 * Vi kan ikke importere builder direkte (Encore cross-service regel).
 */
export function extractImports(content: string): string[] {
  const imports: string[] = [];
  const patterns = [
    /import\s+.*?\s+from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
    /export\s+.*?\s+from\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith(".")) {
        imports.push(importPath);
      }
    }
  }

  return imports;
}

/**
 * Resolve en relativ import-sti til en filsti.
 * Prøver vanlige TS/JS extensions.
 *
 * NOTE: Basert på builder/graph.ts resolveImport.
 */
export function resolveImport(
  fromFile: string,
  importPath: string,
  knownFiles: Set<string>,
): string | null {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/")) || ".";
  const segments = importPath.split("/");
  const resolvedSegments: string[] = fromDir.split("/");

  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      resolvedSegments.pop();
    } else {
      resolvedSegments.push(seg);
    }
  }

  const basePath = resolvedSegments.join("/");

  const candidates = [
    basePath,
    basePath + ".ts",
    basePath + ".tsx",
    basePath + ".js",
    basePath + ".jsx",
    basePath + "/index.ts",
    basePath + "/index.tsx",
    basePath + "/index.js",
  ];

  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

// --- Import graph building ---

/**
 * Bygg import-graf fra en liste av filer med innhold.
 * Parser alle imports og bygger bidireksjonal graf (imports + importedBy).
 */
export function buildImportGraph(
  files: Array<{ path: string; content: string }>,
): ImportGraph {
  const graph: ImportGraph = {
    imports: new Map(),
    importedBy: new Map(),
  };

  const knownFiles = new Set(files.map((f) => f.path));

  // Initialiser alle filer i grafen
  for (const file of files) {
    graph.imports.set(file.path, []);
    graph.importedBy.set(file.path, []);
  }

  // Parse imports og bygg relasjoner
  for (const file of files) {
    const rawImports = extractImports(file.content);

    for (const imp of rawImports) {
      const resolved = resolveImport(file.path, imp, knownFiles);
      if (resolved && resolved !== file.path) {
        // file.path importerer resolved
        graph.imports.get(file.path)!.push(resolved);
        // resolved er importert av file.path
        if (!graph.importedBy.has(resolved)) {
          graph.importedBy.set(resolved, []);
        }
        graph.importedBy.get(resolved)!.push(file.path);
      }
    }
  }

  return graph;
}

// --- Traversal ---

/**
 * Finn alle relaterte filer for en gitt target-fil.
 * Traverserer BEGGE retninger:
 *   - imports: hva denne filen avhenger av (nedover)
 *   - importedBy: hva som bruker denne filen (oppover)
 * Stopper ved maxDepth for å unngå å hente hele repoet.
 *
 * @param graph Import-graf bygget av buildImportGraph
 * @param targetFiles Filer vi vil finne avhengigheter for
 * @param maxDepth Maks traverseringsdybde (default: 2)
 * @returns Unike filstier som er relatert til targets
 */
export function getRelatedFiles(
  graph: ImportGraph,
  targetFiles: string[],
  maxDepth: number = 2,
): string[] {
  const related = new Set<string>();
  const visited = new Set<string>();

  function traverse(filePath: string, depth: number, direction: "imports" | "importedBy") {
    if (depth > maxDepth) return;
    if (visited.has(`${filePath}:${direction}:${depth}`)) return;
    visited.add(`${filePath}:${direction}:${depth}`);

    const connections = graph[direction].get(filePath) || [];
    for (const conn of connections) {
      related.add(conn);
      traverse(conn, depth + 1, direction);
    }
  }

  for (const target of targetFiles) {
    related.add(target);
    traverse(target, 1, "imports");
    traverse(target, 1, "importedBy");
  }

  return [...related];
}

/**
 * Logg import-graf statistikk for debugging.
 */
export function logGraphStats(graph: ImportGraph): void {
  const totalFiles = graph.imports.size;
  const totalEdges = [...graph.imports.values()].reduce((sum, deps) => sum + deps.length, 0);
  const maxImports = Math.max(...[...graph.imports.values()].map((deps) => deps.length), 0);
  const orphans = [...graph.imports.entries()].filter(
    ([path, deps]) => deps.length === 0 && (graph.importedBy.get(path)?.length || 0) === 0,
  ).length;

  log.info("import graph built", {
    totalFiles,
    totalEdges,
    maxImports,
    orphanFiles: orphans,
  });
}

// Dependency graph analysis for builder service
// Analyzes plan steps, finds import/reference relationships, builds dependency graph

import type { BuildPlanStep, DependencyGraph } from "./types";

/**
 * Analyze dependencies between files in a build plan.
 * Examines file content for import/require statements to build a dependency graph.
 */
export function analyzeDependencies(steps: BuildPlanStep[]): DependencyGraph {
  const graph: DependencyGraph = {};
  const filePaths = new Set<string>();

  // Collect all file paths from the plan
  for (const step of steps) {
    if (step.filePath && (step.action === "create_file" || step.action === "modify_file")) {
      filePaths.add(step.filePath);
      graph[step.filePath] = [];
    }
  }

  // Analyze content for import references
  for (const step of steps) {
    if (!step.filePath || !step.content) continue;
    if (step.action !== "create_file" && step.action !== "modify_file") continue;

    const imports = extractImports(step.content);

    for (const imp of imports) {
      // Resolve relative imports to plan file paths
      const resolved = resolveImport(step.filePath, imp, filePaths);
      if (resolved && resolved !== step.filePath) {
        graph[step.filePath].push(resolved);
      }
    }
  }

  // Also analyze descriptions for dependency hints
  for (const step of steps) {
    if (!step.filePath || !step.description) continue;
    if (step.action !== "create_file" && step.action !== "modify_file") continue;

    for (const otherPath of filePaths) {
      if (otherPath === step.filePath) continue;
      // Check if description mentions another file
      const otherBasename = otherPath.split("/").pop()?.replace(/\.\w+$/, "") || "";
      if (otherBasename.length > 2 && step.description.includes(otherBasename)) {
        if (!graph[step.filePath].includes(otherPath)) {
          graph[step.filePath].push(otherPath);
        }
      }
    }
  }

  return graph;
}

/**
 * Extract import paths from TypeScript/JavaScript source code.
 * Handles: import ... from "...", require("..."), dynamic import("...")
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
      // Only relative imports (./  ../)
      if (importPath.startsWith(".")) {
        imports.push(importPath);
      }
    }
  }

  return imports;
}

/**
 * Resolve a relative import path to a file path within the plan.
 * Tries common TypeScript file extensions.
 */
export function resolveImport(fromFile: string, importPath: string, knownFiles: Set<string>): string | null {
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

  // Try exact match first, then common extensions
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

/**
 * Topological sort using Kahn's algorithm.
 * Returns files in dependency order (dependencies first).
 * Throws if a cycle is detected.
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const inDegree: Map<string, number> = new Map();
  const adjacency: Map<string, string[]> = new Map();

  // Initialize
  for (const node of Object.keys(graph)) {
    if (!inDegree.has(node)) inDegree.set(node, 0);
    if (!adjacency.has(node)) adjacency.set(node, []);
  }

  // Build reverse adjacency (dependency → dependent)
  for (const [node, deps] of Object.entries(graph)) {
    for (const dep of deps) {
      // dep must be built before node
      if (!adjacency.has(dep)) adjacency.set(dep, []);
      adjacency.get(dep)!.push(node);
      inDegree.set(node, (inDegree.get(node) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [node, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(node);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    for (const dependent of (adjacency.get(node) || [])) {
      const newDegree = (inDegree.get(dependent) || 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length !== inDegree.size) {
    const remaining = [...inDegree.entries()]
      .filter(([, d]) => d > 0)
      .map(([n]) => n);
    throw new Error(`Cycle detected in dependency graph: ${remaining.join(", ")}`);
  }

  return sorted;
}

/**
 * Get relevant context files for a given file based on the dependency graph.
 * Returns only files that this file depends on (directly or indirectly).
 */
export function getRelevantContext(
  filePath: string,
  contextWindow: Record<string, string>,
  graph: DependencyGraph
): Record<string, string> {
  const relevant: Record<string, string> = {};
  const visited = new Set<string>();

  function collectDeps(fp: string) {
    if (visited.has(fp)) return;
    visited.add(fp);

    const deps = graph[fp] || [];
    for (const dep of deps) {
      if (contextWindow[dep]) {
        relevant[dep] = contextWindow[dep];
      }
      collectDeps(dep);
    }
  }

  collectDeps(filePath);
  return relevant;
}

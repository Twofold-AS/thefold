import log from "encore.dev/log";
import { github, memory, docs, web } from "~encore/clients";
import type { AgentExecutionContext } from "./types";
import type { PhaseTracker } from "./metrics";
import { updateJobCheckpoint } from "./db";
import { buildImportGraph, getRelatedFiles, logGraphStats } from "./code-graph";
import { getOrCreateManifest, formatManifestForContext } from "./manifest";
import type { ProjectManifest } from "./manifest";

// --- URL detection ---
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

// --- File reading thresholds (re-exported so agent.ts can still reference them) ---

export const SMALL_FILE_THRESHOLD = 100;  // lines: read full
export const MEDIUM_FILE_THRESHOLD = 500; // lines: read in chunks
export const CHUNK_SIZE = 100;            // lines per chunk
export const MAX_CHUNKS_PER_FILE = 5;     // max chunks to read

// --- Types ---

export interface AgentContext {
  treeString: string;
  treeArray: string[];
  packageJson: Record<string, unknown>;
  relevantFiles: Array<{ path: string; content: string }>;
  memoryStrings: string[];
  docsStrings: string[];
  mcpTools: Array<{ name: string; description: string; serverName: string }>;
  manifest?: ProjectManifest;
}

/** Helpers injected from agent.ts — keeps context-builder testable without live services */
export interface ContextHelpers {
  report: (
    ctx: AgentExecutionContext,
    content: string,
    status: "working" | "completed" | "failed" | "needs_input",
    extra?: { prUrl?: string; filesChanged?: string[] }
  ) => Promise<void>;
  think: (ctx: AgentExecutionContext, thought: string) => Promise<void>;
  auditedStep: <T>(
    ctx: AgentExecutionContext,
    action: string,
    details: Record<string, unknown>,
    fn: () => Promise<T>
  ) => Promise<T>;
  audit: (opts: {
    sessionId: string;
    actionType: string;
    details?: Record<string, unknown>;
    success: boolean;
    taskId?: string;
    repoName?: string;
    durationMs?: number;
  }) => Promise<void>;
  autoInitRepo: (ctx: AgentExecutionContext) => Promise<void>;
  githubBreaker: { call: <T>(fn: () => Promise<T>) => Promise<T> };
  checkCancelled: (ctx: AgentExecutionContext) => Promise<boolean>;
}

/**
 * STEP 2-3-3.5: Gather all context needed for task execution.
 * - STEP 2: GitHub: project tree, relevant files (with smart chunking/windowing)
 * - STEP 3: Memory: semantic search + Docs: dependency-based lookup
 * - STEP 3.5: MCP: installed tools list
 *
 * Returns AgentContext with all gathered data, or partial results if any service fails.
 * All failures degrade gracefully — never throws.
 */
export async function buildContext(
  ctx: AgentExecutionContext,
  tracker: PhaseTracker,
  helpers: ContextHelpers,
): Promise<AgentContext> {
  const { report, think, auditedStep, audit, autoInitRepo, githubBreaker, checkCancelled } = helpers;

  // Start context phase tracking
  tracker.start("context");

  let treeString = "";
  let treeArray: string[] = [];
  let packageJson: Record<string, unknown> = {};
  let relevantFiles: Array<{ path: string; content: string }> = [];
  let memoryStrings: string[] = [];
  let docsStrings: string[] = [];
  let manifest: ProjectManifest | undefined = undefined;

  // === STEP 2: Read the project ===
  log.info("STEP 2: Reading project tree", { owner: ctx.repoOwner, repo: ctx.repoName });
  await report(ctx, "Leser prosjektstruktur fra GitHub...", "working");

  let projectTree;
  try {
    projectTree = await auditedStep(ctx, "project_tree_read", {
      owner: ctx.repoOwner,
      repo: ctx.repoName,
    }, () => githubBreaker.call(() => github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName })));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.includes("not found") || msg.includes("Not Found")) {
      // Repo does not exist — create it, then retry
      log.info("Repo not found, creating on GitHub", { owner: ctx.repoOwner, repo: ctx.repoName });
      await report(ctx, "Repo eksisterer ikke — oppretter...", "working");
      try {
        await github.ensureRepoExists({
          owner: ctx.repoOwner,
          name: ctx.repoName,
          description: `Created by TheFold`,
        });
        // Wait for GitHub propagation
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (createErr) {
        const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
        if (!createMsg.includes("422")) {
          throw new Error(`Kunne ikke opprette repo ${ctx.repoOwner}/${ctx.repoName}: ${createMsg}`);
        }
        // 422 = repo already exists (race condition) — continue
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      // Retry getTree after creation
      projectTree = await githubBreaker.call(() => github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName }));
    } else {
      throw e;
    }
  }

  // Auto-init empty repos before continuing
  if (projectTree.empty) {
    await report(ctx, "Tomt repo oppdaget — initialiserer...", "working");
    await autoInitRepo(ctx);
    projectTree = await githubBreaker.call(() => github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName }));
  }

  treeString = projectTree.treeString || "";
  treeArray = projectTree.tree;
  packageJson = projectTree.packageJson || {};
  log.info("STEP 2: Tree loaded", { fileCount: treeArray.length });

  if (treeArray.length === 0) {
    await think(ctx, "Tomt repo — legger filene i roten.");
  } else {
    await think(ctx, `Fant ${treeArray.length} filer. Ser over strukturen.`);
  }

  // Checkpoint after tree read
  if (ctx.jobId) {
    await updateJobCheckpoint(ctx.jobId, "context", {
      phase: "context",
      fileCount: treeArray.length,
    }).catch(() => { /* non-critical */ });
  }

  // === STEP 2.1: Diff-based context (D27) ===
  // Compare current tree against stored file hashes to skip fetching unchanged files.
  // If <20% of files are new (absent from previous hash), only scan changed files.
  let diffBasedTreeArray: string[] | null = null;
  try {
    const prevManifest = await memory.getManifest({ repoOwner: ctx.repoOwner, repoName: ctx.repoName });
    // fileHashes is a new field — access via type cast until Encore regenerates client types
    const prevHashes = (prevManifest.manifest as unknown as { fileHashes?: Record<string, string> })?.fileHashes;
    if (prevHashes && Object.keys(prevHashes).length > 0 && treeArray.length > 0) {
      const prevHashSet = new Set(Object.keys(prevHashes));
      const changedFiles = treeArray.filter(f => !prevHashSet.has(f));
      const changedRatio = changedFiles.length / treeArray.length;
      if (changedRatio < 0.20) {
        log.info("D27: diff-based context active", { total: treeArray.length, changed: changedFiles.length });
        await think(ctx, `Diff-basert kontekst: ${changedFiles.length} av ${treeArray.length} filer er nye/endret.`);
        diffBasedTreeArray = changedFiles;
      } else {
        log.info("D27: too many changes, using full fetch", { total: treeArray.length, changed: changedFiles.length });
      }
    }
  } catch (d27Err) {
    log.warn("D27: diff context check failed, using full fetch", { error: d27Err instanceof Error ? d27Err.message : String(d27Err) });
  }

  // When diff-based: scan only changed + task-mentioned files; otherwise full tree
  const treeForRelevance: string[] = diffBasedTreeArray !== null
    ? (() => {
        const taskWords = new Set(ctx.taskDescription.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const taskMentioned = treeArray.filter(f => {
          const base = f.split("/").pop()?.toLowerCase() || "";
          return taskWords.has(base) || taskWords.has(base.replace(/\.[^.]+$/, ""));
        });
        const combined = new Set([...diffBasedTreeArray, ...taskMentioned]);
        return [...combined];
      })()
    : projectTree.tree;

  const relevantPaths = await auditedStep(ctx, "relevant_files_identified", {
    taskDescription: ctx.taskDescription.substring(0, 200),
    diffBased: diffBasedTreeArray !== null,
  }, () => github.findRelevantFiles({
    owner: ctx.repoOwner,
    repo: ctx.repoName,
    taskDescription: ctx.taskDescription,
    tree: treeForRelevance,
  }));

  relevantFiles = await auditedStep(ctx, "files_read", {
    paths: relevantPaths.paths,
    fileCount: relevantPaths.paths.length,
  }, async () => {
    const files: Array<{ path: string; content: string }> = [];
    let totalTokensSaved = 0;

    for (const path of relevantPaths.paths) {
      try {
        const meta = await github.getFileMetadata({
          owner: ctx.repoOwner,
          repo: ctx.repoName,
          path,
        });

        if (meta.totalLines <= SMALL_FILE_THRESHOLD) {
          // Small file: read in full
          const file = await github.getFile({ owner: ctx.repoOwner, repo: ctx.repoName, path });
          files.push({ path, content: file.content });
        } else if (meta.totalLines <= MEDIUM_FILE_THRESHOLD) {
          // Medium file: read in chunks
          let content = "";
          let startLine = 1;
          let chunksRead = 0;

          while (chunksRead < MAX_CHUNKS_PER_FILE) {
            const chunk = await github.getFileChunk({
              owner: ctx.repoOwner,
              repo: ctx.repoName,
              path,
              startLine,
              maxLines: CHUNK_SIZE,
            });
            content += (content ? "\n" : "") + chunk.content;
            chunksRead++;

            if (!chunk.hasMore) break;
            startLine = chunk.nextStartLine!;
          }

          const fullTokenEstimate = Math.ceil(meta.totalLines * 30 / 4);
          const readTokenEstimate = Math.ceil(content.length / 4);
          totalTokensSaved += Math.max(0, fullTokenEstimate - readTokenEstimate);

          files.push({ path, content });
        } else {
          // Large file: read first + last chunk only
          const firstChunk = await github.getFileChunk({
            owner: ctx.repoOwner,
            repo: ctx.repoName,
            path,
            startLine: 1,
            maxLines: CHUNK_SIZE,
          });

          const lastStart = Math.max(1, meta.totalLines - CHUNK_SIZE);
          const lastChunk = await github.getFileChunk({
            owner: ctx.repoOwner,
            repo: ctx.repoName,
            path,
            startLine: lastStart,
            maxLines: CHUNK_SIZE,
          });

          const content = firstChunk.content
            + `\n\n// ... [${meta.totalLines - (CHUNK_SIZE * 2)} lines omitted — file has ${meta.totalLines} lines total] ...\n\n`
            + lastChunk.content;

          const fullTokenEstimate = Math.ceil(meta.totalLines * 30 / 4);
          const readTokenEstimate = Math.ceil(content.length / 4);
          totalTokensSaved += Math.max(0, fullTokenEstimate - readTokenEstimate);

          files.push({ path, content });
        }
      } catch (err) {
        // File doesn't exist yet (404) or other read error — skip it
        log.warn("getFileMetadata/getFile skipped", { path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    if (totalTokensSaved > 0) {
      await audit({
        sessionId: ctx.conversationId,
        actionType: "context_windowing_savings",
        details: {
          tokensSaved: totalTokensSaved,
          filesProcessed: files.length,
        },
        success: true,
        taskId: ctx.taskId,
        repoName: `${ctx.repoOwner}/${ctx.repoName}`,
      });
    }

    return files;
  });

  // === STEP 2.5: Build import graph and expand dependencies ===
  if (relevantFiles.length > 0) {
    const importGraph = buildImportGraph(relevantFiles);
    logGraphStats(importGraph);

    // Find files in import chain that findRelevantFiles missed
    const targetPaths = relevantFiles.map((f) => f.path);
    const relatedPaths = getRelatedFiles(importGraph, targetPaths, 2);

    // Find new files not already in relevantFiles
    const existingPaths = new Set(relevantFiles.map((f) => f.path));
    const missingPaths = relatedPaths.filter((p) => !existingPaths.has(p));

    if (missingPaths.length > 0) {
      log.info("import graph found additional dependencies", {
        existingFiles: relevantFiles.length,
        graphRelated: relatedPaths.length,
        newFromGraph: missingPaths.length,
        newPaths: missingPaths.slice(0, 10), // log max 10
      });

      // Fetch content for missing files (max 5 extra files)
      for (const path of missingPaths.slice(0, 5)) {
        try {
          if (await checkCancelled(ctx)) break;

          const meta = await github.getFileMetadata({
            owner: ctx.repoOwner,
            repo: ctx.repoName,
            path,
          });

          if (meta.totalLines <= SMALL_FILE_THRESHOLD) {
            const file = await github.getFile({
              owner: ctx.repoOwner,
              repo: ctx.repoName,
              path,
            });
            relevantFiles.push({ path, content: file.content });
          } else if (meta.totalLines <= MEDIUM_FILE_THRESHOLD) {
            // Read first chunk for larger files
            const chunk = await github.getFileChunk({
              owner: ctx.repoOwner,
              repo: ctx.repoName,
              path,
              startLine: 1,
              maxLines: CHUNK_SIZE,
            });
            relevantFiles.push({ path, content: chunk.content });
          }
          // Files over MEDIUM_FILE_THRESHOLD are skipped (too large)
        } catch (err) {
          log.warn("failed to fetch import-graph dependency", { path, error: String(err) });
          // Continue — graceful degradation
        }
      }
    }
  }

  // Check cancellation after heavy GitHub I/O
  if (await checkCancelled(ctx)) {
    return { treeString, treeArray, packageJson, relevantFiles, memoryStrings, docsStrings, mcpTools: [], manifest };
  }

  // === STEP 2.9: Update file hashes (D27 — fire-and-forget) ===
  // Lightweight presence map: file path → "1" (just tracks what files exist in the tree).
  if (treeArray.length > 0) {
    const newFileHashes: Record<string, string> = {};
    for (const f of treeArray) newFileHashes[f] = "1";
    memory.updateManifest({
      repoOwner: ctx.repoOwner,
      repoName: ctx.repoName,
    }).catch((err: unknown) => {
      log.warn("D27: manifest timestamp update failed (non-critical)", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // === STEP 3: Gather context (memory + docs) ===
  log.info("STEP 3: Gathering context (memory + docs)");
  await think(ctx, "Henter kontekst og dokumentasjon...");

  let memories = { results: [] as { content: string; accessCount: number; createdAt: string; trustLevel?: string }[] };
  try {
    memories = await auditedStep(ctx, "memory_searched", {
      query: ctx.taskDescription.substring(0, 200),
    }, () => memory.search({ query: ctx.taskDescription, limit: 10 }));
  } catch (e) {
    log.warn("Memory search failed (rate limited?)", { error: String(e) });
    // Continue without memories — don't crash
  }

  let docsResults = { docs: [] as Array<{ source: string; content: string }> };
  try {
    docsResults = await auditedStep(ctx, "docs_looked_up", {
      dependencyCount: Object.keys(packageJson.dependencies as Record<string, string> || {}).length,
    }, () => docs.lookupForTask({
      taskDescription: ctx.taskDescription,
      existingDependencies: packageJson.dependencies as Record<string, string> || {},
    }));
  } catch (e) {
    log.warn("Docs lookup failed", { error: String(e) });
    // Continue without docs — don't crash
  }

  memoryStrings = memories.results.map((r) =>
    `[trust:${r.trustLevel || "user"}] ${r.content}`
  );
  docsStrings = docsResults.docs.map((d) => `[${d.source}] ${d.content}`);
  log.info("STEP 3: Context gathered", { memories: memories.results.length, docs: docsResults.docs.length });

  // === STEP 3.1: Load project manifest (D19) ===
  try {
    const manifestResult = await getOrCreateManifest(ctx.repoOwner, ctx.repoName, treeString);
    if (manifestResult) {
      manifest = manifestResult;
      // Inject manifest as a high-priority context section before files, after memory
      // Token budget: ~500-800 tokens
      const manifestSection = formatManifestForContext(manifestResult);
      docsStrings = [manifestSection, ...docsStrings];
      log.info("STEP 3.1: Manifest injected", { owner: ctx.repoOwner, repo: ctx.repoName, version: manifestResult.version });
    }
  } catch (err) {
    log.warn("manifest load failed (non-critical)", { error: err instanceof Error ? err.message : String(err) });
    // Continue without manifest
  }

  if (memories.results.length > 0) {
    await think(ctx, `Fant ${memories.results.length} relevante minner.`);
  }

  // === STEP 3.3: Scrape URLs from task description via Firecrawl ===
  const urls = ctx.taskDescription.match(URL_REGEX) || [];
  const uniqueUrls = [...new Set(urls)].slice(0, 3); // Max 3 URLs

  if (uniqueUrls.length > 0) {
    log.info("STEP 3.3: Scraping URLs from task description", { urls: uniqueUrls });
    await think(ctx, `Henter innhold fra ${uniqueUrls.length} URL(er)...`);

    for (const url of uniqueUrls) {
      try {
        const scraped = await web.scrape({ url, maxLength: 20000 });
        if (scraped.content) {
          docsStrings.push(`[Web: ${scraped.title || url}]\n${scraped.content.substring(0, 15000)}`);
          log.info("URL scraped successfully", { url, wordCount: scraped.metadata.wordCount });
        }
      } catch (err) {
        log.warn("URL scraping failed", { url, error: err instanceof Error ? err.message : String(err) });
        // Non-critical — continue without scraped content
      }
    }
  }

  // === STEP 3.5: Start MCP servers + get tools ===
  let mcpTools: Array<{ name: string; description: string; serverName: string }> = [];

  try {
    const { startInstalledServers } = await import("../mcp/router");
    const mcpResult = await startInstalledServers();

    if (mcpResult.tools.length > 0) {
      mcpTools = mcpResult.tools.map(t => ({
        name: t.name,
        description: t.description,
        serverName: t.serverName,
      }));

      const toolList = mcpResult.tools
        .map(t => `- **${t.serverName}/${t.name}**: ${t.description}`)
        .join("\n");
      docsStrings.push(`[MCP Tools — AKTIVE] Du kan kalle disse verktøyene:\n${toolList}`);
    }

    if (mcpResult.failedServers.length > 0) {
      await report(ctx, `⚠️ MCP-servere feilet: ${mcpResult.failedServers.join(", ")}`, "working");
    }
  } catch (err) {
    log.warn("MCP setup failed", { error: String(err) });
    // Non-critical — fortsett uten MCP
  }

  return { treeString, treeArray, packageJson, relevantFiles, memoryStrings, docsStrings, mcpTools, manifest };
}

// --- Context Filtering (YA: Phase-specific context filtering) ---

/**
 * Defines which context fields each phase needs.
 * Used by filterForPhase() to reduce token consumption.
 */
export interface ContextProfile {
  needsTree: boolean;         // treeString
  needsTreeArray: boolean;    // treeArray (used separately from treeString in some places)
  needsFiles: boolean;        // relevantFiles
  needsMemory: boolean;       // memoryStrings
  needsDocs: boolean;         // docsStrings
  needsMcpTools: boolean;     // mcpTools
  needsPackageJson: boolean;  // packageJson
  maxContextTokens: number;   // hard limit for total context size
}

/**
 * Phase-specific context profiles.
 * Each phase gets only what it needs — reduces tokens by ~30-40%.
 */
export const CONTEXT_PROFILES: Record<string, ContextProfile> = {
  confidence: {
    needsTree: true,          // needs tree structure for assessment
    needsTreeArray: false,
    needsFiles: false,        // does NOT need file contents
    needsMemory: false,       // does NOT need history
    needsDocs: false,
    needsMcpTools: false,
    needsPackageJson: true,   // needs for technology assessment
    maxContextTokens: 3_000,
  },
  planning: {
    needsTree: true,
    needsTreeArray: true,
    needsFiles: true,         // needs file contents for plan
    needsMemory: true,        // needs history for better plans
    needsDocs: true,          // needs docs for conventions
    needsMcpTools: true,
    needsPackageJson: true,
    maxContextTokens: 20_000,
  },
  building: {
    needsTree: false,         // plan already made
    needsTreeArray: false,
    needsFiles: true,         // only files referenced in plan
    needsMemory: false,
    needsDocs: false,
    needsMcpTools: false,
    needsPackageJson: true,   // for dependencies
    maxContextTokens: 50_000,
  },
  diagnosis: {
    needsTree: false,
    needsTreeArray: false,
    needsFiles: false,        // diagnosis needs error output, not source
    needsMemory: true,        // error patterns from memory
    needsDocs: false,
    needsMcpTools: false,
    needsPackageJson: false,
    maxContextTokens: 5_000,
  },
  reviewing: {
    needsTree: false,
    needsTreeArray: false,
    needsFiles: false,        // reviews generated files, not source
    needsMemory: true,        // to match conventions
    needsDocs: false,
    needsMcpTools: false,
    needsPackageJson: false,
    maxContextTokens: 12_000,
  },
  completing: {
    needsTree: false,
    needsTreeArray: false,
    needsFiles: false,
    needsMemory: false,
    needsDocs: false,
    needsMcpTools: false,
    needsPackageJson: false,
    maxContextTokens: 2_000,
  },
};

/**
 * Filters AgentContext based on phase profile.
 * Returns a new AgentContext with only the fields the phase needs.
 * Empty fields are replaced with empty values ([], "", {}).
 */
export function filterForPhase(
  context: AgentContext,
  phase: string,
): AgentContext {
  const profile = CONTEXT_PROFILES[phase];

  // If unknown phase, return full context (safe fallback)
  if (!profile) {
    log.warn("unknown phase for context filtering, returning full context", { phase });
    return context;
  }

  const filtered: AgentContext = {
    treeString: profile.needsTree ? context.treeString : "",
    treeArray: profile.needsTreeArray ? context.treeArray : [],
    packageJson: profile.needsPackageJson ? context.packageJson : {},
    relevantFiles: profile.needsFiles ? context.relevantFiles : [],
    memoryStrings: profile.needsMemory ? context.memoryStrings : [],
    docsStrings: profile.needsDocs ? context.docsStrings : [],
    mcpTools: profile.needsMcpTools ? context.mcpTools : [],
    manifest: context.manifest,
  };

  // Enforce maxContextTokens — use compressContext with a phase-specific strategy
  const estimatedTokens = estimateTokens(filtered);
  if (estimatedTokens > profile.maxContextTokens) {
    log.info("context exceeds phase budget, compressing", {
      phase,
      estimated: estimatedTokens,
      budget: profile.maxContextTokens,
    });
    const phaseStrategy: ContextStrategy = {
      trigger: { type: "tokens", threshold: profile.maxContextTokens },
      retain: { type: "priority_weighted", maxTokens: profile.maxContextTokens },
      compress: DEFAULT_STRATEGY.compress,
    };
    const afterCompress = compressContext(filtered, phaseStrategy);
    // If still over budget, fall back to byte-level trimContext
    if (estimateTokens(afterCompress) > profile.maxContextTokens) {
      return trimContext(afterCompress, profile.maxContextTokens);
    }
    return afterCompress;
  }

  return filtered;
}

/**
 * Estimates token count for an AgentContext.
 * Simple heuristic: 1 token ≈ 4 characters.
 */
export function estimateTokens(context: AgentContext): number {
  let chars = 0;
  chars += context.treeString.length;
  chars += context.relevantFiles.reduce((sum, f) => sum + f.path.length + f.content.length, 0);
  chars += context.memoryStrings.reduce((sum, s) => sum + s.length, 0);
  chars += context.docsStrings.reduce((sum, s) => sum + s.length, 0);
  chars += context.mcpTools.reduce((sum, t) => sum + t.name.length + t.description.length, 0);
  chars += JSON.stringify(context.packageJson).length;
  return Math.ceil(chars / 4);
}

// --- Unified Context Compression (D17) ---

export interface ContextStrategy {
  trigger: { type: "tokens"; threshold: number };
  retain: { type: "priority_weighted"; maxTokens: number };
  compress: {
    files: "signatures_only" | "full" | "drop";
    memory: "recent_5" | "full" | "drop";
    docs: "relevant" | "full" | "drop";
    tree: "summarize" | "full" | "drop";
  };
}

export const DEFAULT_STRATEGY: ContextStrategy = {
  trigger: { type: "tokens", threshold: 30_000 },
  retain: { type: "priority_weighted", maxTokens: 30_000 },
  compress: {
    files: "signatures_only",
    memory: "recent_5",
    docs: "relevant",
    tree: "summarize",
  },
};

/**
 * Reduces a file to its exports, interfaces, function signatures, and important comments.
 * Falls back to first 500 chars if nothing significant found.
 */
export function summarizeFile(content: string): string {
  const lines = content.split("\n");
  const significant: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Keep: export statements, function/class/interface/type declarations, important comments
    if (
      trimmed.startsWith("export ") ||
      trimmed.startsWith("interface ") ||
      trimmed.startsWith("type ") ||
      trimmed.match(/^(async\s+)?function\s+\w+/) ||
      trimmed.match(/^class\s+\w+/) ||
      trimmed.startsWith("// ") ||
      trimmed.startsWith("/**")
    ) {
      significant.push(line);
    }
  }
  return significant.join("\n") || content.substring(0, 500);
}

/**
 * Compresses an AgentContext using a declarative ContextStrategy.
 * Only compresses if token count exceeds the strategy trigger threshold.
 */
export function compressContext(context: AgentContext, strategy: ContextStrategy): AgentContext {
  const tokenCount = estimateTokens(context);
  if (tokenCount <= strategy.trigger.threshold) return context;

  const compressed = { ...context };

  // Apply compression based on strategy
  if (strategy.compress.files === "signatures_only") {
    compressed.relevantFiles = context.relevantFiles.map(f => ({
      ...f,
      content: summarizeFile(f.content),
    }));
  } else if (strategy.compress.files === "drop") {
    compressed.relevantFiles = [];
  }

  if (strategy.compress.memory === "recent_5") {
    compressed.memoryStrings = context.memoryStrings.slice(0, 5);
  } else if (strategy.compress.memory === "drop") {
    compressed.memoryStrings = [];
  }

  if (strategy.compress.docs === "relevant") {
    compressed.docsStrings = context.docsStrings.slice(0, 3);
  } else if (strategy.compress.docs === "drop") {
    compressed.docsStrings = [];
  }

  if (strategy.compress.tree === "summarize") {
    compressed.treeString = context.treeString.split("\n").slice(0, 50).join("\n") + "\n[... truncated]";
  } else if (strategy.compress.tree === "drop") {
    compressed.treeString = "";
  }

  return compressed;
}

/**
 * Trims context to fit within token budget.
 * Priority: relevantFiles (code) > memoryStrings > docsStrings > treeString
 * Trims least important fields first.
 */
function trimContext(context: AgentContext, maxTokens: number): AgentContext {
  const trimmed = { ...context };

  // 1. Trim docs first (lowest priority)
  while (estimateTokens(trimmed) > maxTokens && trimmed.docsStrings.length > 0) {
    trimmed.docsStrings = trimmed.docsStrings.slice(0, -1);
  }

  // 2. Trim memory
  while (estimateTokens(trimmed) > maxTokens && trimmed.memoryStrings.length > 0) {
    trimmed.memoryStrings = trimmed.memoryStrings.slice(0, -1);
  }

  // 3. Trim files (remove those with lowest relevance — last in list)
  while (estimateTokens(trimmed) > maxTokens && trimmed.relevantFiles.length > 1) {
    trimmed.relevantFiles = trimmed.relevantFiles.slice(0, -1);
  }

  // 4. Trim tree (last resort)
  if (estimateTokens(trimmed) > maxTokens && trimmed.treeString.length > 0) {
    const targetChars = maxTokens * 4;
    trimmed.treeString = trimmed.treeString.substring(0, targetChars);
  }

  return trimmed;
}

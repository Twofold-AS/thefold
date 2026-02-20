import log from "encore.dev/log";
import { github, memory, docs, mcp } from "~encore/clients";
import type { AgentExecutionContext } from "./types";
import type { PhaseTracker } from "./metrics";
import { updateJobCheckpoint } from "./db";

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

  // === STEP 2: Read the project ===
  log.info("STEP 2: Reading project tree", { owner: ctx.repoOwner, repo: ctx.repoName });
  await report(ctx, "Leser prosjektstruktur fra GitHub...", "working");

  let projectTree = await auditedStep(ctx, "project_tree_read", {
    owner: ctx.repoOwner,
    repo: ctx.repoName,
  }, () => githubBreaker.call(() => github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName })));

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

  const relevantPaths = await auditedStep(ctx, "relevant_files_identified", {
    taskDescription: ctx.taskDescription.substring(0, 200),
  }, () => github.findRelevantFiles({
    owner: ctx.repoOwner,
    repo: ctx.repoName,
    taskDescription: ctx.taskDescription,
    tree: projectTree.tree,
  }));

  relevantFiles = await auditedStep(ctx, "files_read", {
    paths: relevantPaths.paths,
    fileCount: relevantPaths.paths.length,
  }, async () => {
    const files: Array<{ path: string; content: string }> = [];
    let totalTokensSaved = 0;

    for (const path of relevantPaths.paths) {
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

  // Check cancellation after heavy GitHub I/O
  if (await checkCancelled(ctx)) {
    return { treeString, treeArray, packageJson, relevantFiles, memoryStrings, docsStrings };
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

  if (memories.results.length > 0) {
    await think(ctx, `Fant ${memories.results.length} relevante minner.`);
  }

  // === STEP 3.5: Start MCP servers + get tools ===
  let mcpTools: Array<{ name: string; description: string; serverName: string }> = [];

  try {
    const { startInstalledServers } = await import("../mcp/router");
    const { secret } = await import("encore.dev/config");
    const MCPRoutingEnabled = secret("MCPRoutingEnabled");
    const mcpRoutingEnabled = MCPRoutingEnabled();

    if (mcpRoutingEnabled === "true") {
      // Ny sti: Start servere og hent ekte tools
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
    } else {
      // Gammel sti: Bare list opp installerte servere som info
      const mcpResult = await mcp.installed();
      if (mcpResult.servers.length > 0) {
        const toolList = mcpResult.servers
          .map(s => `- **${s.name}**: ${s.description ?? "No description"} (${s.category})`)
          .join("\n");
        docsStrings.push(`[MCP Tools] Du har tilgang til disse verktøyene:\n${toolList}\n\nNOTE: MCP-kall routing er ikke aktivert. Sett MCPRoutingEnabled=true for å aktivere.`);
      }
    }
  } catch (err) {
    log.warn("MCP setup failed", { error: String(err) });
    // Non-critical — fortsett uten MCP
  }

  return { treeString, treeArray, packageJson, relevantFiles, memoryStrings, docsStrings, mcpTools };
}

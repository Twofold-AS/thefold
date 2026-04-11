import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { sanitize } from "./sanitize";
import { buildSystemPromptWithPipeline, logSkillResults } from "./prompts";
import { callAIWithFallback, stripMarkdownJson, DEFAULT_MODEL } from "./call";

// --- File Generation (for builder service) ---

interface GenerateFileRequest {
  task: string;
  fileSpec: {
    filePath: string;
    description: string;
    action: "create" | "modify";
    existingContent?: string;
  };
  existingFiles: Record<string, string>;
  projectStructure: string[];
  skillFragments: string[];
  patterns: Array<{ problem: string; solution: string }>;
  model?: string;
}

interface GenerateFileResponse {
  content: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const generateFile = api(
  { method: "POST", path: "/ai/generate-file", expose: false },
  async (req: GenerateFileRequest): Promise<GenerateFileResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const pipeline = await buildSystemPromptWithPipeline("agent_coding", {
      task: req.task,
      files: [req.fileSpec.filePath],
    });

    let systemPrompt = `Generate the requested file. Return ONLY the file content — no markdown blocks, no explanations, no comments about what you are doing. Just raw code.

Task: ${sanitize(req.task)}`;

    if (pipeline.systemPrompt) {
      systemPrompt += "\n\n" + pipeline.systemPrompt;
    }

    if (req.skillFragments.length > 0) {
      systemPrompt += "\n\n## Skill Instructions\n" + req.skillFragments.join("\n\n");
    }

    let userPrompt = `## File to generate: ${req.fileSpec.filePath}\n`;
    userPrompt += `Action: ${req.fileSpec.action}\n`;

    if (req.fileSpec.description) {
      userPrompt += `Description: ${req.fileSpec.description}\n`;
    }

    if (req.fileSpec.action === "modify" && req.fileSpec.existingContent) {
      userPrompt += `\n## Existing content:\n\`\`\`\n${req.fileSpec.existingContent.substring(0, 20000)}\n\`\`\`\n`;
    }

    if (req.projectStructure.length > 0) {
      userPrompt += `\n## Project structure:\n${req.projectStructure.slice(0, 100).join("\n")}\n`;
    }

    const existingFileEntries = Object.entries(req.existingFiles);
    if (existingFileEntries.length > 0) {
      userPrompt += "\n## Context from completed files:\n";
      let contextTokens = 0;
      for (const [fpath, fcontent] of existingFileEntries) {
        const contentSlice = fcontent.substring(0, 8000);
        contextTokens += contentSlice.length / 4;
        if (contextTokens > 20000) break;
        userPrompt += `\n### ${fpath}\n\`\`\`\n${contentSlice}\n\`\`\`\n`;
      }
    }

    if (req.patterns.length > 0) {
      userPrompt += "\n## Relevant patterns:\n";
      for (const p of req.patterns.slice(0, 3)) {
        userPrompt += `- Problem: ${p.problem}\n  Solution: ${p.solution}\n`;
      }
    }

    userPrompt += "\n\nGenerate ONLY the file content. No markdown blocks, no explanations.";

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: sanitize(userPrompt) }],
      maxTokens: 16384,
    });

    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    let content = response.content;
    const codeBlockMatch = content.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }
    if (content.startsWith("```")) {
      content = content.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "");
    }

    return {
      content,
      tokensUsed: response.tokensUsed,
      modelUsed: response.modelUsed,
      costUsd: response.costEstimate.totalCost,
    };
  }
);

// --- Fix File (for builder service) ---

interface FixFileRequest {
  task: string;
  filePath: string;
  currentContent: string;
  errors: string[];
  existingFiles: Record<string, string>;
  model?: string;
}

interface FixFileResponse {
  content: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const fixFile = api(
  { method: "POST", path: "/ai/fix-file", expose: false },
  async (req: FixFileRequest): Promise<FixFileResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const systemPrompt = `Fix the TypeScript errors in this file. Return the CORRECTED file, complete, without markdown blocks or explanations. Just raw code.`;

    let userPrompt = `## Fix errors in: ${req.filePath}\n\n`;
    userPrompt += `## Errors:\n${req.errors.slice(0, 10).join("\n")}\n\n`;
    userPrompt += `## Current file content:\n\`\`\`\n${req.currentContent.substring(0, 20000)}\n\`\`\`\n`;

    const deps = Object.entries(req.existingFiles);
    if (deps.length > 0) {
      userPrompt += "\n## Related files:\n";
      for (const [depPath, depContent] of deps.slice(0, 5)) {
        userPrompt += `\n### ${depPath}\n\`\`\`\n${depContent.substring(0, 5000)}\n\`\`\`\n`;
      }
    }

    userPrompt += `\nOriginal task: ${req.task}\n\nReturn the COMPLETE corrected file. No markdown, no explanations.`;

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: sanitize(userPrompt) }],
      maxTokens: 16384,
    });

    let content = response.content;
    const codeBlockMatch = content.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }
    if (content.startsWith("```")) {
      content = content.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "");
    }

    return {
      content,
      tokensUsed: response.tokensUsed,
      modelUsed: response.modelUsed,
      costUsd: response.costEstimate.totalCost,
    };
  }
);

// --- Component Extraction (for registry service) ---

interface ExtractionRequest {
  task: string;
  repo: string;
  files: Array<{ path: string; content: string; lines: number }>;
}

interface ExtractionResponse {
  components: Array<{
    name: string;
    description: string;
    category: string;
    files: Array<{ path: string; content: string }>;
    entryPoint: string;
    dependencies: string[];
    tags: string[];
    qualityScore: number;
  }>;
}

export const callForExtraction = api(
  { method: "POST", path: "/ai/call-for-extraction", expose: false },
  async (req: ExtractionRequest): Promise<ExtractionResponse> => {
    const systemPrompt = `Analyze the provided files and identify up to 3 reusable, self-contained components.

A good component has:
- Clearly defined interface (exports)
- Low coupling to the rest of the project
- At least 50 lines of code (non-trivial)
- Reuse value in other projects
- Clear category

Categories: auth, payments, pdf, email, api, database, ui, utility, testing, devops

Return ONLY valid JSON without markdown blocks. Format:
{
  "components": [
    {
      "name": "kebab-case-name",
      "description": "Short description",
      "category": "category",
      "files": [{"path": "path", "content": ""}],
      "entryPoint": "main-file.ts",
      "dependencies": ["npm-package"],
      "tags": ["tag1", "tag2"],
      "qualityScore": 75
    }
  ]
}

If no reusable components are found, return: {"components": []}`;

    let userPrompt = `Repo: ${sanitize(req.repo)}\nTask: ${sanitize(req.task)}\n\nFiles:\n`;
    let tokenEstimate = 0;
    for (const f of req.files) {
      if (tokenEstimate > 15000) break;
      userPrompt += `\n--- ${f.path} (${f.lines} lines) ---\n${sanitize(f.content)}\n`;
      tokenEstimate += f.content.length / 4;
    }

    userPrompt += "\n\nIdentify reusable components from these files.";

    const response = await callAIWithFallback({
      model: "claude-sonnet-4-5-20250929",
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 4096,
    });

    try {
      let content = response.content.trim();
      const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)```/);
      if (jsonMatch) content = jsonMatch[1].trim();

      const parsed = JSON.parse(content);

      if (!parsed.components || !Array.isArray(parsed.components)) {
        return { components: [] };
      }

      return { components: parsed.components };
    } catch (parseErr) {
      log.warn("extraction AI response parse failed", {
        error: String(parseErr),
        contentPreview: response.content.substring(0, 200),
      });
      return { components: [] };
    }
  }
);

// --- AI Memory Consolidation ---

interface ConsolidateMemoriesRequest {
  memories: Array<{ id: string; content: string; memoryType: string }>;
  context?: string;
}

interface ConsolidateMemoriesResponse {
  consolidatedContent: string;
  keyInsights: string[];
  tokensUsed: number;
  costUsd: number;
}

/**
 * Synthesize a cluster of related memories into a single consolidated insight.
 * Used by the Dream Engine (D11) weekly consolidation cron.
 */
export const consolidateMemories = api(
  { method: "POST", path: "/ai/consolidate-memories", expose: false },
  async (req: ConsolidateMemoriesRequest): Promise<ConsolidateMemoriesResponse> => {
    if (req.memories.length === 0) {
      return { consolidatedContent: "", keyInsights: [], tokensUsed: 0, costUsd: 0 };
    }

    const model = "claude-haiku-4-5-20250929";

    const memorySections = req.memories
      .map((m, i) => `[Memory ${i + 1}] (type: ${m.memoryType})\n${m.content}`)
      .join("\n\n---\n\n");

    const contextNote = req.context ? `\nContext: ${req.context}\n` : "";

    const systemPrompt = `You are a memory consolidation assistant. Given a set of related memories,
synthesize them into a single, concise, actionable insight that captures the essential knowledge.
Do NOT simply concatenate — synthesize and distill.
Respond with valid JSON only, no markdown:
{
  "consolidated": "single paragraph synthesizing the key insight",
  "keyInsights": ["short insight 1", "short insight 2"]
}`;

    const userPrompt = `${contextNote}
Consolidate these ${req.memories.length} related memories into one synthesized insight:

${memorySections}

Respond with JSON only.`;

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1024,
    });

    let consolidatedContent = "";
    let keyInsights: string[] = [];

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));
      consolidatedContent = parsed.consolidated ?? "";
      keyInsights = Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [];
    } catch {
      consolidatedContent = response.content.trim().substring(0, 1000);
      log.warn("consolidateMemories: JSON parse failed, using raw response");
    }

    return {
      consolidatedContent,
      keyInsights,
      tokensUsed: response.tokensUsed,
      costUsd: response.costEstimate.totalCost,
    };
  }
);

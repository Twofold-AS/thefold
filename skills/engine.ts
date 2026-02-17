import { api, APIError } from "encore.dev/api";
import { db } from "./skills";

// --- Types ---

type ExecutionPhase = "pre_run" | "inject" | "post_run";

interface SkillPipelineContext {
  task: string;
  repo?: string;
  labels?: string[];
  files?: string[];
  userId: string;
  totalTokenBudget: number;
  taskType?: string; // 'all' | 'planning' | 'coding' | 'debugging' | 'reviewing'
}

interface ResolvedSkill {
  id: string;
  name: string;
  phase: ExecutionPhase;
  priority: number;
  promptFragment: string;
  tokenEstimate: number;
  routingRules: Record<string, unknown>;
}

interface SkillPipelineResult {
  preRunResults: SkillRunResult[];
  injectedPrompt: string;
  injectedSkillIds: string[];
  tokensUsed: number;
  postRunSkills: ResolvedSkill[];
}

interface SkillRunResult {
  skillId: string;
  skillName: string;
  phase: ExecutionPhase;
  success: boolean;
  output: unknown;
  tokensUsed: number;
  duration: number;
}

// --- Resolve: automatic routing ---

interface ResolveRequest {
  context: SkillPipelineContext;
}

interface ResolveResponse {
  result: SkillPipelineResult;
}

export const resolve = api(
  { method: "POST", path: "/skills/resolve", expose: false },
  async (req: ResolveRequest): Promise<ResolveResponse> => {
    console.log("[DEBUG-AF] skills.resolve called");
    const ctx = req.context;

    // 1. Fetch all enabled skills matching scope
    const rows = await db.query<{
      id: string;
      name: string;
      prompt_fragment: string;
      task_phase: string;
      priority: number;
      token_estimate: number;
      routing_rules: Record<string, unknown>;
      scope: string;
    }>`
      SELECT id, name, prompt_fragment, task_phase, priority,
             COALESCE(token_estimate, 0) as token_estimate,
             COALESCE(routing_rules, '{}'::jsonb) as routing_rules,
             scope
      FROM skills
      WHERE enabled = TRUE
      AND (scope = 'global' OR scope = ${`repo:${ctx.repo || ""}`} OR scope = ${`user:${ctx.userId}`})
      ORDER BY priority ASC
    `;

    const allSkills: Array<{
      id: string;
      name: string;
      promptFragment: string;
      phase: ExecutionPhase;
      taskPhase: string;
      priority: number;
      tokenEstimate: number;
      routingRules: Record<string, unknown>;
    }> = [];

    for await (const row of rows) {
      allSkills.push({
        id: row.id,
        name: row.name,
        promptFragment: row.prompt_fragment,
        phase: "inject" as ExecutionPhase,
        taskPhase: row.task_phase || "all",
        priority: row.priority ?? 100,
        tokenEstimate: row.token_estimate ?? 0,
        routingRules: row.routing_rules ?? {},
      });
    }

    console.log("[DEBUG-AF] skills.resolve found", allSkills.length, "enabled skills");

    // 2. Filter on routing rules (keywords, file patterns, labels)
    let matched = allSkills.filter((s) => matchesRoutingRules(s.routingRules, ctx));

    // 2.5. Filter on task phase if specified
    if (ctx.taskType && ctx.taskType !== "all") {
      matched = matched.filter((s) => s.taskPhase === "all" || s.taskPhase === ctx.taskType);
    }

    // 3. Token budget: include skills until budget exhausted
    const tokenBudget = ctx.totalTokenBudget || 4000;
    let tokensUsed = 0;
    const selected: typeof matched = [];

    for (const skill of matched) {
      const estimate = skill.tokenEstimate || 200;
      if (tokensUsed + estimate > tokenBudget) break;
      tokensUsed += estimate;
      selected.push(skill);
    }

    // 4. Build injected prompt from inject-phase skills
    const inject = selected.filter((s) => s.phase === "inject");
    const postRun = selected.filter((s) => s.phase === "post_run");
    const injectedPrompt = inject.map((s) => s.promptFragment).join("\n\n");

    return {
      result: {
        preRunResults: [],
        injectedPrompt,
        injectedSkillIds: inject.map((s) => s.id),
        tokensUsed,
        postRunSkills: postRun.map(toResolvedSkill),
      },
    };
  }
);

// --- Execute Pre-Run ---

interface ExecutePreRunRequest {
  skills: ResolvedSkill[];
  context: SkillPipelineContext;
}

interface ExecutePreRunResponse {
  results: SkillRunResult[];
  approved: boolean;
}

export const executePreRun = api(
  { method: "POST", path: "/skills/execute-pre-run", expose: false },
  async (req: ExecutePreRunRequest): Promise<ExecutePreRunResponse> => {
    const results: SkillRunResult[] = [];
    let allApproved = true;

    for (const skill of req.skills) {
      const start = Date.now();

      // Input validation: check that required context fields exist
      const validationErrors: string[] = [];
      if (!req.context.task || req.context.task.trim().length === 0) {
        validationErrors.push("Missing or empty task description");
      }
      if (!req.context.userId || req.context.userId.trim().length === 0) {
        validationErrors.push("Missing userId");
      }

      // Context enrichment: add metadata about the skill being applied
      const enrichedContext: Record<string, unknown> = {
        skillName: skill.name,
        skillPriority: skill.priority,
        tokenEstimate: skill.tokenEstimate,
        hasRepo: !!req.context.repo,
        fileCount: req.context.files?.length ?? 0,
        labelCount: req.context.labels?.length ?? 0,
      };

      const approved = validationErrors.length === 0;
      if (!approved) allApproved = false;

      results.push({
        skillId: skill.id,
        skillName: skill.name,
        phase: "pre_run",
        success: approved,
        output: {
          approved,
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
          enrichedContext,
        },
        tokensUsed: 0,
        duration: Date.now() - start,
      });
    }

    return {
      results,
      approved: allApproved,
    };
  }
);

// --- Execute Post-Run ---

interface ExecutePostRunRequest {
  skills: ResolvedSkill[];
  aiOutput: string;
  context: SkillPipelineContext;
}

interface ExecutePostRunResponse {
  results: SkillRunResult[];
  approved: boolean;
}

export const executePostRun = api(
  { method: "POST", path: "/skills/execute-post-run", expose: false },
  async (req: ExecutePostRunRequest): Promise<ExecutePostRunResponse> => {
    const results: SkillRunResult[] = [];
    let allApproved = true;

    for (const skill of req.skills) {
      const start = Date.now();

      // Quality review: check that AI output is not empty or failed
      const qualityIssues: string[] = [];

      if (!req.aiOutput || req.aiOutput.trim().length === 0) {
        qualityIssues.push("AI output is empty");
      } else if (req.aiOutput.trim().length < 10) {
        qualityIssues.push("AI output is suspiciously short (< 10 chars)");
      }

      // Check for common failure patterns in output
      const lowerOutput = (req.aiOutput || "").toLowerCase();
      if (lowerOutput.includes("i cannot") || lowerOutput.includes("i'm unable")) {
        qualityIssues.push("AI output indicates inability to complete task");
      }
      if (lowerOutput.includes("// todo") || lowerOutput.includes("// ...")) {
        qualityIssues.push("AI output contains placeholder code (TODO or ...)");
      }

      const approved = qualityIssues.length === 0;
      if (!approved) allApproved = false;

      // Log the skill result
      try {
        await logResult({
          skillId: skill.id,
          success: approved,
          tokensUsed: skill.tokenEstimate,
        });
      } catch {
        // Non-critical — don't fail the pipeline
      }

      results.push({
        skillId: skill.id,
        skillName: skill.name,
        phase: "post_run",
        success: approved,
        output: {
          approved,
          qualityIssues: qualityIssues.length > 0 ? qualityIssues : undefined,
          outputLength: (req.aiOutput || "").length,
        },
        tokensUsed: 0,
        duration: Date.now() - start,
      });
    }

    return {
      results,
      approved: allApproved,
    };
  }
);

// --- Log Result ---

interface LogResultRequest {
  skillId: string;
  success: boolean;
  tokensUsed: number;
}

interface LogResultResponse {
  updated: boolean;
}

export const logResult = api(
  { method: "POST", path: "/skills/log-result", expose: false },
  async (req: LogResultRequest): Promise<LogResultResponse> => {
    // Increment the appropriate counter
    if (req.success) {
      await db.exec`
        UPDATE skills SET
          success_count = COALESCE(success_count, 0) + 1,
          total_uses = COALESCE(total_uses, 0) + 1,
          last_used_at = NOW(),
          avg_token_cost = CASE
            WHEN COALESCE(total_uses, 0) = 0 THEN ${req.tokensUsed}
            ELSE (COALESCE(avg_token_cost, 0) * COALESCE(total_uses, 0) + ${req.tokensUsed}) / (COALESCE(total_uses, 0) + 1)
          END,
          confidence_score = CASE
            WHEN (COALESCE(success_count, 0) + 1 + COALESCE(failure_count, 0)) = 0 THEN 0.5
            ELSE (COALESCE(success_count, 0) + 1)::decimal / (COALESCE(success_count, 0) + 1 + COALESCE(failure_count, 0))
          END
        WHERE id = ${req.skillId}::uuid
      `;
    } else {
      await db.exec`
        UPDATE skills SET
          failure_count = COALESCE(failure_count, 0) + 1,
          total_uses = COALESCE(total_uses, 0) + 1,
          last_used_at = NOW(),
          avg_token_cost = CASE
            WHEN COALESCE(total_uses, 0) = 0 THEN ${req.tokensUsed}
            ELSE (COALESCE(avg_token_cost, 0) * COALESCE(total_uses, 0) + ${req.tokensUsed}) / (COALESCE(total_uses, 0) + 1)
          END,
          confidence_score = CASE
            WHEN (COALESCE(success_count, 0) + COALESCE(failure_count, 0) + 1) = 0 THEN 0.5
            ELSE COALESCE(success_count, 0)::decimal / (COALESCE(success_count, 0) + COALESCE(failure_count, 0) + 1)
          END
        WHERE id = ${req.skillId}::uuid
      `;
    }

    return { updated: true };
  }
);

// --- Helpers ---

function matchesRoutingRules(
  rules: Record<string, unknown>,
  ctx: SkillPipelineContext
): boolean {
  // If no routing rules, always include (backward compatible)
  if (!rules || Object.keys(rules).length === 0) return true;

  const keywords = (rules.keywords as string[]) || [];
  const filePatterns = (rules.file_patterns as string[]) || [];
  const labels = (rules.labels as string[]) || [];

  // If all rule arrays are empty, include by default
  if (keywords.length === 0 && filePatterns.length === 0 && labels.length === 0) {
    return true;
  }

  const taskLower = ctx.task.toLowerCase();

  // Keyword matching
  if (keywords.length > 0) {
    const hasKeyword = keywords.some((kw) => taskLower.includes(kw.toLowerCase()));
    if (hasKeyword) return true;
  }

  // File pattern matching
  if (filePatterns.length > 0 && ctx.files && ctx.files.length > 0) {
    const hasMatch = filePatterns.some((pattern) =>
      ctx.files!.some((file) => matchGlob(pattern, file))
    );
    if (hasMatch) return true;
  }

  // Label matching
  if (labels.length > 0 && ctx.labels && ctx.labels.length > 0) {
    const hasLabel = labels.some((label) =>
      ctx.labels!.some((l) => l.toLowerCase() === label.toLowerCase())
    );
    if (hasLabel) return true;
  }

  return false;
}

function matchGlob(pattern: string, filename: string): boolean {
  // Simple glob matching: *.ts matches any .ts file
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`, "i").test(filename);
}

function toResolvedSkill(s: {
  id: string;
  name: string;
  phase: ExecutionPhase;
  priority: number;
  promptFragment: string;
  tokenEstimate: number;
  routingRules: Record<string, unknown>;
}): ResolvedSkill {
  return {
    id: s.id,
    name: s.name,
    phase: s.phase,
    priority: s.priority,
    promptFragment: s.promptFragment,
    tokenEstimate: s.tokenEstimate,
    routingRules: s.routingRules,
  };
}

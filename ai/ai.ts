import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import log from "encore.dev/log";
import { skills } from "~encore/clients";
import { estimateCost, getUpgradeModel, type CostEstimate } from "./router";
import { sanitize } from "./sanitize";

// --- Secrets ---
const anthropicKey = secret("AnthropicAPIKey");

// Optional secrets - will be checked at runtime
const openaiKey = secret("OpenAIAPIKey");
const moonshotKey = secret("MoonshotAPIKey");

// --- Constants ---
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_FALLBACK_UPGRADES = 2;

// --- Types ---

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Direct chat — quick response, no code execution
export interface ChatRequest {
  messages: ChatMessage[];
  memoryContext: string[];
  systemContext: "direct_chat" | "agent_planning" | "agent_coding" | "agent_review";
  model?: string; // Optional - uses DefaultAIModel if not set
  repoName?: string; // Which repo the user is chatting about (from repo-chat)
  repoContext?: string; // Actual file content from the repo (tree + relevant files)
  conversationId?: string; // For tool-use (e.g. start_task needs conversation reference)
  aiName?: string; // User-configurable AI assistant name (default: "Jorgen Andre")
}

export interface ChatResponse {
  content: string;
  tokensUsed: number;
  stopReason: string;
  modelUsed: string;
  costUsd: number;
  toolsUsed?: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  truncated: boolean;
}

// Structured agent call — returns JSON for the agent to parse
export interface AgentThinkRequest {
  task: string;
  projectStructure: string; // file tree from GitHub
  relevantFiles: FileContent[]; // actual file contents
  memoryContext: string[];
  docsContext: string[]; // from Context7
  previousAttempt?: string; // if retrying after error
  errorMessage?: string; // the error to fix
  model?: string; // Optional - uses DefaultAIModel if not set
}

export interface FileContent {
  path: string;
  content: string;
}

export interface AgentThinkResponse {
  plan: TaskStep[];
  reasoning: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export interface TaskStep {
  description: string;
  action: "create_file" | "modify_file" | "delete_file" | "run_command";
  filePath?: string;
  content?: string; // for create_file: full content. for modify_file: new content
  command?: string; // for run_command
}

// Code generation — returns actual file contents
export interface CodeGenRequest {
  step: TaskStep;
  projectContext: string; // relevant surrounding code
  memoryContext: string[];
  docsContext: string[];
  encoreRules: boolean; // enforce Encore conventions
  model?: string; // Optional - uses DefaultAIModel if not set
}

export interface CodeGenResponse {
  files: GeneratedFile[];
  explanation: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export interface GeneratedFile {
  path: string;
  content: string;
  action: "create" | "modify" | "delete";
}

// Code review — analyzes what was built, produces documentation
export interface ReviewRequest {
  taskDescription: string;
  filesChanged: GeneratedFile[];
  validationOutput: string;
  memoryContext: string[];
  model?: string; // Optional - uses DefaultAIModel if not set
}

export interface ReviewResponse {
  documentation: string; // markdown doc for Linear/PR
  memoriesExtracted: string[]; // key decisions to remember
  qualityScore: number; // 1-10 self-assessment
  concerns: string[]; // any issues found
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

// --- AI Provider Detection ---

type AIProvider = "anthropic" | "openai" | "moonshot";

function getProvider(modelName: string): AIProvider {
  if (modelName.startsWith("claude-")) return "anthropic";
  if (modelName.startsWith("gpt-")) return "openai";
  if (modelName.startsWith("moonshot-")) return "moonshot";
  throw APIError.invalidArgument(`Unknown model: ${modelName}`);
}

// --- Helper Functions ---

function stripMarkdownJson(text: string): string {
  let jsonText = text.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }
  return jsonText;
}

export interface AICallOptions {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}

export interface AICallResponse {
  content: string;
  tokensUsed: number;
  stopReason: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costEstimate: CostEstimate;
}

async function callAI(options: AICallOptions): Promise<AICallResponse> {
  const provider = getProvider(options.model);

  switch (provider) {
    case "anthropic":
      return callAnthropic(options);
    case "openai":
      return callOpenAI(options);
    case "moonshot":
      return callMoonshot(options);
  }
}

/**
 * Call AI with automatic fallback — if the model fails, upgrade to next tier.
 * Retries up to MAX_FALLBACK_UPGRADES times with progressively better models.
 */
export async function callAIWithFallback(options: AICallOptions): Promise<AICallResponse> {
  let currentModel = options.model;
  let attempts = 0;

  while (attempts <= MAX_FALLBACK_UPGRADES) {
    try {
      return await callAI({ ...options, model: currentModel });
    } catch (error) {
      attempts++;
      const upgrade = getUpgradeModel(currentModel);

      if (!upgrade || attempts > MAX_FALLBACK_UPGRADES) {
        throw error; // No upgrade path or max attempts reached
      }

      // Upgrade to next tier and retry
      currentModel = upgrade;
    }
  }

  // Should not reach here, but TypeScript needs it
  throw APIError.internal("model fallback exhausted");
}

async function callAnthropic(options: AICallOptions): Promise<AICallResponse> {
  const client = new Anthropic({ apiKey: anthropicKey() });

  // DEL 7A: Use cache_control for system prompts (stable per conversation)
  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    {
      type: "text",
      text: options.system,
      cache_control: { type: "ephemeral" },
    },
  ];

  const response = await client.messages.create({
    model: options.model,
    max_tokens: options.maxTokens,
    system: systemBlocks,
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content.find((c) => c.type === "text");
  if (!text || text.type !== "text") {
    throw APIError.internal("no text in Anthropic response");
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadTokens = (response.usage as any).cache_read_input_tokens ?? 0;
  const cacheCreationTokens = (response.usage as any).cache_creation_input_tokens ?? 0;

  // DEL 7B: Token tracking
  logTokenUsage({
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    model: options.model,
    endpoint: "anthropic",
  });

  return {
    content: text.text,
    tokensUsed: inputTokens + outputTokens,
    stopReason: response.stop_reason || "end_turn",
    modelUsed: options.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costEstimate: estimateCost(inputTokens, outputTokens, options.model),
  };
}

async function callOpenAI(options: AICallOptions): Promise<AICallResponse> {
  let apiKey: string;
  try {
    apiKey = openaiKey();
  } catch {
    throw APIError.failedPrecondition(
      "OpenAI provider not configured. Set OpenAIAPIKey secret."
    );
  }

  const client = new OpenAI({ apiKey });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: options.system },
    ...options.messages,
  ];

  const response = await client.chat.completions.create({
    model: options.model,
    max_tokens: options.maxTokens,
    messages,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw APIError.internal("no content in OpenAI response");
  }

  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;

  logTokenUsage({ inputTokens, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0, model: options.model, endpoint: "openai" });

  return {
    content: choice.message.content,
    tokensUsed: response.usage?.total_tokens || 0,
    stopReason: choice.finish_reason || "stop",
    modelUsed: options.model,
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costEstimate: estimateCost(inputTokens, outputTokens, options.model),
  };
}

async function callMoonshot(options: AICallOptions): Promise<AICallResponse> {
  let apiKey: string;
  try {
    apiKey = moonshotKey();
  } catch {
    throw APIError.failedPrecondition(
      "Moonshot provider not configured. Set MoonshotAPIKey secret."
    );
  }

  // Moonshot uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.moonshot.cn/v1",
  });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: options.system },
    ...options.messages,
  ];

  const response = await client.chat.completions.create({
    model: options.model,
    max_tokens: options.maxTokens,
    messages,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw APIError.internal("no content in Moonshot response");
  }

  const inputTokensMoon = response.usage?.prompt_tokens || 0;
  const outputTokensMoon = response.usage?.completion_tokens || 0;

  logTokenUsage({ inputTokens: inputTokensMoon, outputTokens: outputTokensMoon, cacheReadTokens: 0, cacheCreationTokens: 0, model: options.model, endpoint: "moonshot" });

  return {
    content: choice.message.content,
    tokensUsed: response.usage?.total_tokens || 0,
    stopReason: choice.finish_reason || "stop",
    modelUsed: options.model,
    inputTokens: inputTokensMoon,
    outputTokens: outputTokensMoon,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costEstimate: estimateCost(inputTokensMoon, outputTokensMoon, options.model),
  };
}

// --- Token Tracking (DEL 7B) ---

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
  endpoint: string;
}

function logTokenUsage(usage: TokenUsage): void {
  const cacheSavings = usage.cacheReadTokens > 0
    ? ` (cache read: ${usage.cacheReadTokens}, cache creation: ${usage.cacheCreationTokens})`
    : "";
  log.info(`[AI Token Usage] ${usage.model} via ${usage.endpoint}: ${usage.inputTokens} in / ${usage.outputTokens} out${cacheSavings}`);
}

// --- System Prompts ---

const DEFAULT_AI_NAME = "J\u00f8rgen Andr\u00e9";

const BASE_RULES = `You are TheFold, an autonomous internal fullstack developer.

## Absolute Rules — NEVER break these
1. Backend APIs: ONLY use \`api()\` from "encore.dev/api"
2. Secrets: ONLY use \`secret()\` from "encore.dev/config" — NEVER hardcode, NEVER use dotenv
3. Databases: ONLY use \`SQLDatabase\` from "encore.dev/storage/sqldb"
4. Pub/Sub: ONLY use \`Topic\`/\`Subscription\` from "encore.dev/pubsub"
5. Cron: ONLY use \`CronJob\` from "encore.dev/cron"
6. Cache: Use the cache service via \`~encore/clients\` (PostgreSQL-backed until CacheCluster is available)
7. NEVER use Express, Fastify, Hono, Koa, or any HTTP framework
8. NEVER use process.env, dotenv, or .env files for secrets
9. NEVER hardcode API keys, tokens, passwords, or connection strings
10. ALWAYS use TypeScript strict mode patterns

## Quality Standards
- Every function must have a clear single responsibility
- Error handling must be explicit — no silent failures
- All user-facing strings in Norwegian unless specified otherwise
- SQL migrations must be idempotent where possible
- Test coverage for critical paths`;

const CONTEXT_PROMPTS: Record<string, string> = {
  direct_chat: "", // Placeholder — overridden dynamically by getDirectChatPrompt()

  agent_planning: `${BASE_RULES}

You are planning how to implement a task. Respond with a JSON object:
{
  "plan": [
    {
      "description": "what this step does",
      "action": "create_file|modify_file|delete_file|run_command",
      "filePath": "path/to/file.ts",
      "content": "file content or null",
      "command": "npm install x or null"
    }
  ],
  "reasoning": "why this approach"
}

Be precise. Every file must be complete — no placeholders, no "// TODO", no "...".
Read the existing code carefully before modifying. Maintain existing patterns.`,

  agent_coding: `${BASE_RULES}

You are generating production code. Return ONLY the complete file content.
No markdown fences, no explanations — just the code.
The code must be complete, correct, and follow all Encore.ts conventions.
Read Context7 docs carefully for correct API usage.`,

  agent_review: `${BASE_RULES}

You are reviewing code you just wrote. Be honest and critical.
Respond with JSON:
{
  "documentation": "markdown describing what was built and why",
  "memoriesExtracted": ["key decision 1", "architectural choice 2"],
  "qualityScore": 8,
  "concerns": ["potential issue 1"]
}`,

  project_decomposition: `${BASE_RULES}

You are an experienced technical architect decomposing a large project request into atomic, independently executable tasks.

## Decomposition Rules
1. Each task MUST be independently executable with a fresh context window
2. Each task should produce at most 3-5 files
3. Tasks within the same phase can execute in parallel (no inter-dependencies within a phase)
4. Tasks in later phases depend on earlier phases completing first
5. Generate context_hints describing what each task needs from completed tasks
6. Generate a compact conventions document (<2000 tokens) covering:
   - File naming conventions
   - Import patterns
   - Error handling patterns
   - Test patterns
   - Framework-specific rules (Encore.ts in our case)

## Output Format
Respond with JSON only:
{
  "phases": [
    {
      "name": "Phase Name",
      "description": "What this phase accomplishes",
      "tasks": [
        {
          "title": "Short task title",
          "description": "Detailed description sufficient for an autonomous agent to execute this task independently. Include specific file paths, patterns to follow, and expected outputs.",
          "dependsOnIndices": [],
          "contextHints": ["what context curator should fetch for this task"]
        }
      ]
    }
  ],
  "conventions": "# Project Conventions\\n...",
  "reasoning": "Explanation of decomposition strategy",
  "estimatedTotalTasks": 12
}

## Phase Organization
- Phase 0: Foundation (data models, schemas, types)
- Phase 1: Core logic (services, business rules)
- Phase 2: Integration (API endpoints, connections between services)
- Phase 3: UI/Frontend (if applicable)
- Phase 4: Tests and documentation

## Task Description Quality
Each task description must include:
- What to build (specific files and their purpose)
- How it connects to other parts (imports, API calls)
- Patterns to follow (reference existing code or conventions)
- Expected output (files created, types exported, endpoints added)`,

  confidence_assessment: `${BASE_RULES}

Du vurderer din egen evne til a fullfare en oppgave. Svar ALLTID pa norsk.

Vurder oppgaven I KONTEKST av repoet:
- Tomt repo = nye filer opprettes i roten, ingen eksisterende kode a ta hensyn til
- Enkle oppgaver (lage statiske filer som HTML, CSS, README, config) = 100% confidence
- Usikkerhet om prosjekttype (Encore, Next, etc.) er IKKE relevant for enkel fil-oppretting

Analyser:
1. **Oppgaveforstaelse (0-100):**
   - Er oppgaven klart definert?
   - Er det tvetydige krav?
   - Forstar jeg onsket resultat?

2. **Kodebase-kjennskap (0-100):**
   - For tomme repoer: gi 100 (ingen eksisterende kode a forholde seg til)
   - For eksisterende repoer: forstar jeg monsteret og strukturen?

3. **Teknisk kompleksitet (0-100):**
   - Er dette teknisk gjennomforbart?
   - Har jeg de riktige verktoyene?

4. **Testbarhet (0-100):**
   - Kan jeg skrive tester for dette?
   - For enkle fil-opprettelser uten logikk: gi 100

**Poengretningslinjer:**
- 95-100: Helt trygg, start umiddelbart. Bruk dette for: enkle fil-opprettelser, klare oppgaver, tomme repoer
- 80-94: Trygg med smaa usikkerheter, fortsett
- 60-79: Moderat trygg, klargjor spesifikke punkter forst
- Under 60: Lav trygghet, klargjor ELLER del opp i deloppgaver

**Anbefalte handlinger:**
- "proceed": Overall >= 90, ingen store usikkerheter
- "clarify": Overall 60-89, trenger spesifikke svar
- "break_down": Overall < 60, for stort/komplekst

Eksempler:
- "Lag index.html og style.css med heading og styling" i tomt repo -> 100% proceed
- "Implementer OAuth med Google" uten redirect URL -> 70% clarify
- "Fiks buggen" uten stacktrace eller kontekst -> 50% clarify

Svar med KUN JSON i dette formatet:
{
  "overall": 85,
  "breakdown": {
    "task_understanding": 90,
    "codebase_familiarity": 80,
    "technical_complexity": 85,
    "test_coverage_feasible": 80
  },
  "uncertainties": ["spesifikt hva jeg er usikker pa"],
  "recommended_action": "proceed",
  "clarifying_questions": [],
  "suggested_subtasks": []
}

Vaer spesifikk om usikkerheter og sporsmal. Aldri si "Jeg er usikker" — si noyaktig HVA du er usikker pa.`,
};

/** Build the direct_chat system prompt with a configurable AI name */
function getDirectChatPrompt(aiName: string): string {
  return `Du er ${aiName} — en autonom AI-utviklingsagent bygget med Encore.ts og Next.js. Du ER selve produktet. Når brukeren snakker om "repoet" eller "prosjektet", refererer de til kodebasen du opererer i.

TheFold sine backend-services: gateway (auth), users (OTP login), chat (samtaler), ai (multi-model routing), agent (autonom task-kjøring), github (repo-operasjoner), sandbox (kodevalidering), linear (task-sync), memory (pgvector søk), skills (prompt-pipeline), monitor (health checks), cache (PostgreSQL cache), builder (kode-generering), tasks (oppgavestyring), mcp (server-integrasjoner), templates (scaffolding), registry (komponent-marketplace).

Frontend: Next.js 15 dashboard med chat, tools, skills, marketplace, repo-oversikt, settings.

${BASE_RULES}

Regler:
- Svar ALLTID på norsk
- Bruk ALDRI emojier — ingen emojier overhodet. Ren tekst. Bruk markdown for struktur (overskrifter, lister, kodeblokker) men ALDRI emojier.
- Vær konsis og direkte — korte svar, ikke lange utredninger
- Ikke generer kode med mindre brukeren ber om det
- Ikke lag lister med emojier
- Når du analyserer et repo, beskriv det du faktisk finner — ikke gjett
- For spørsmål som "se over repoet": gi en kort oppsummering (3-5 setninger) av hva du finner
- For spørsmål som "hva bør vi endre": gi 3-5 konkrete forslag som korte punkter
- Hvis brukeren vil at du GJØR endringer (ikke bare snakker om dem), forklar at de kan starte en task
- Hvis du har repo-kontekst (filstruktur og kode), basér svaret ditt KUN på den faktiske koden du ser. ALDRI dikt opp filer, funksjoner, eller kode som ikke finnes i konteksten.
- Hvis du IKKE har repo-kontekst, si det ærlig: "Jeg har ikke tilgang til filene i dette repoet akkurat nå." — ALDRI hallusinér innhold.
- Du har tilgang til minner fra tidligere samtaler. Minner kan komme fra ANDRE repoer. Hvis repo-konteksten (faktiske filer) og minner er motstridende, STOL PÅ FIL-KONTEKSTEN — den er sannheten. Minner er hint, ikke fakta.

Du har tilgang til verktøy for å gjøre handlinger:
- create_task: Opprett en utviklingsoppgave
- start_task: Start en task — agenten begynner å jobbe
- list_tasks: Se status på tasks
- read_file: Les en fil fra repoet
- search_code: Søk i kodebasen

NÅR BRUKEREN BER DEG GJØRE NOE: Bruk verktøyene. Ikke bare forklar — GJØR det.
- "Lag en plan for X" → bruk create_task for hvert steg
- "Fiks denne buggen" → bruk create_task + start_task
- "Hva er status?" → bruk list_tasks
- "Se på filen X" → bruk read_file

VIKTIG — Når du oppretter en oppgave med create_task:
- Vis ALDRI Task ID / UUID til brukeren — de trenger ikke se det
- Etter create_task, oppsummer hva oppgaven innebærer i 1-2 setninger
- Spør deretter: "Vil du at jeg starter oppgaven nå?"
- Hvis brukeren sier ja → bruk start_task med IDen du fikk fra create_task`;
}

// --- Skills Pipeline Integration ---

const CONTEXT_TO_SKILLS_CONTEXT: Record<string, string> = {
  direct_chat: "chat",
  agent_planning: "planning",
  agent_coding: "coding",
  agent_review: "review",
  confidence_assessment: "planning",
  project_decomposition: "planning",
};

const CONTEXT_TO_TASK_PHASE: Record<string, string> = {
  direct_chat: "all",
  agent_planning: "planning",
  agent_coding: "coding",
  agent_review: "reviewing",
  confidence_assessment: "planning",
  project_decomposition: "planning",
};

interface PipelineContext {
  task: string;
  repo?: string;
  labels?: string[];
  files?: string[];
  userId?: string;
  tokenBudget?: number;
  taskType?: string;
}

interface PipelineResult {
  systemPrompt: string;
  skillIds: string[];
  postRunSkillIds: string[];
  tokensUsed: number;
}

async function buildSystemPromptWithPipeline(
  baseContext: string,
  pipelineCtx?: PipelineContext,
  aiName?: string
): Promise<PipelineResult> {
  const resolvedAiName = aiName || DEFAULT_AI_NAME;
  const basePrompt = baseContext === "direct_chat"
    ? getDirectChatPrompt(resolvedAiName)
    : (CONTEXT_PROMPTS[baseContext] || getDirectChatPrompt(resolvedAiName));

  // If no pipeline context, fall back to legacy approach
  if (!pipelineCtx) {
    return await buildSystemPromptLegacy(baseContext, basePrompt);
  }

  try {
    const resolved = await skills.resolve({
      context: {
        task: pipelineCtx.task,
        repo: pipelineCtx.repo,
        labels: pipelineCtx.labels,
        files: pipelineCtx.files,
        userId: pipelineCtx.userId || "system",
        totalTokenBudget: pipelineCtx.tokenBudget || 4000,
        taskType: pipelineCtx.taskType || CONTEXT_TO_TASK_PHASE[baseContext] || "all",
      },
    });

    const result = resolved.result;

    // Execute pre-run skills (v1: passthrough)
    if (result.preRunResults && result.preRunResults.length > 0) {
      // Pre-run skills are already resolved; in v1 they are always approved
    }

    // Build system prompt with injected skills
    let prompt = basePrompt;
    if (result.injectedPrompt) {
      prompt += "\n\n## Active Skills\n" + result.injectedPrompt;
    }

    return {
      systemPrompt: prompt,
      skillIds: result.injectedSkillIds || [],
      postRunSkillIds: (result.postRunSkills || []).map((s: { id: string }) => s.id),
      tokensUsed: result.tokensUsed || 0,
    };
  } catch {
    // Fallback to legacy if pipeline fails
    return await buildSystemPromptLegacy(baseContext, basePrompt);
  }
}

async function buildSystemPromptLegacy(baseContext: string, basePrompt: string): Promise<PipelineResult> {
  const skillsContext = CONTEXT_TO_SKILLS_CONTEXT[baseContext] || "coding";
  try {
    const activeSkills = await skills.getActiveSkills({ context: skillsContext });
    if (activeSkills.promptFragments.length === 0) {
      return { systemPrompt: basePrompt, skillIds: [], postRunSkillIds: [], tokensUsed: 0 };
    }
    let prompt = basePrompt + "\n\n## Active Skills\n";
    for (const fragment of activeSkills.promptFragments) {
      prompt += `\n${fragment}\n`;
    }
    return { systemPrompt: prompt, skillIds: [], postRunSkillIds: [], tokensUsed: 0 };
  } catch {
    return { systemPrompt: basePrompt, skillIds: [], postRunSkillIds: [], tokensUsed: 0 };
  }
}

async function logSkillResults(skillIds: string[], success: boolean, tokensUsed: number): Promise<void> {
  const tokensPerSkill = skillIds.length > 0 ? Math.round(tokensUsed / skillIds.length) : 0;
  for (const id of skillIds) {
    try {
      await skills.logResult({ skillId: id, success, tokensUsed: tokensPerSkill });
    } catch {
      // Non-critical, don't fail the request
    }
  }
}

// --- Chat Tool-Use (Function Calling) ---

const CHAT_TOOLS: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = [
  {
    name: "create_task",
    description: "Opprett en ny utviklingsoppgave. Bruk dette når brukeren ber deg lage, bygge, fikse, eller endre noe i kodebasen.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Kort tittel for oppgaven" },
        description: { type: "string", description: "Detaljert beskrivelse av hva som skal gjøres" },
        priority: { type: "number", enum: [1, 2, 3, 4], description: "1=Urgent, 2=High, 3=Normal, 4=Low" },
        repoName: { type: "string", description: "Hvilket repo oppgaven gjelder" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "start_task",
    description: "Start en eksisterende oppgave — agenten begynner å jobbe. Bruk dette når brukeren sier 'start', 'kjør', 'begynn'. VIKTIG: Bruk NØYAKTIG samme taskId som ble returnert fra create_task. Bruk ALDRI en ID du husker fra tidligere — bruk ID fra siste create_task respons.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task UUID fra create_task responsen — KOPIER NØYAKTIG" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "list_tasks",
    description: "List oppgaver for et repo. Bruk dette når brukeren spør om status, hva som gjenstår, osv.",
    input_schema: {
      type: "object",
      properties: {
        repoName: { type: "string" },
        status: { type: "string", enum: ["backlog", "planned", "in_progress", "in_review", "done", "blocked"] },
      },
    },
  },
  {
    name: "read_file",
    description: "Les en spesifikk fil fra repoet. Bruk dette når brukeren ber deg se på en fil, eller du trenger mer kontekst.",
    input_schema: {
      type: "object",
      properties: {
        repoName: { type: "string" },
        path: { type: "string", description: "Filsti i repoet" },
      },
      required: ["repoName", "path"],
    },
  },
  {
    name: "search_code",
    description: "Søk etter relevante filer i repoet basert på en beskrivelse.",
    input_schema: {
      type: "object",
      properties: {
        repoName: { type: "string" },
        query: { type: "string" },
      },
      required: ["repoName", "query"],
    },
  },
];

async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  repoName?: string,
  conversationId?: string,
): Promise<Record<string, unknown>> {
  const owner = "Twofold-AS";

  switch (name) {
    case "create_task": {
      console.log("[DEBUG-AF] === CREATE_TASK TOOL ===");
      console.log("[DEBUG-AF] Input:", JSON.stringify(input).substring(0, 300));

      const { tasks: tasksClient } = await import("~encore/clients");
      const taskRepo = (input.repoName as string) || repoName || undefined;

      // Duplicate check — prevent creating same task twice
      try {
        const existing = await tasksClient.listTasks({ repo: taskRepo, limit: 20 });
        const duplicate = existing.tasks.find((t: { title: string; status: string }) =>
          t.title.toLowerCase() === (input.title as string).toLowerCase() &&
          !["deleted", "done", "blocked", "failed"].includes(t.status)
        );
        if (duplicate) {
          console.log("[DEBUG-AF] Duplicate found:", duplicate.id);
          return { success: false, taskId: duplicate.id, message: `Oppgave "${input.title}" finnes allerede (ID: ${duplicate.id})` };
        }
      } catch { /* non-critical — proceed with creation */ }

      const result = await tasksClient.createTask({
        title: input.title as string,
        description: (input.description as string) || "",
        priority: (input.priority as number) || 3,
        repo: taskRepo,
        source: "chat",
      });

      console.log("[DEBUG-AF] Task created with ID:", result.task.id);

      // Fire-and-forget: enrich task with AI complexity assessment
      enrichTaskWithAI(result.task.id, input.title as string, (input.description as string) || "", taskRepo).catch((e) =>
        log.error("Task enrichment failed:", { error: e instanceof Error ? e.message : String(e) })
      );

      return { success: true, taskId: result.task.id, message: `Oppgave opprettet: "${input.title}". Bruk start_task for å starte den.` };
    }

    case "start_task": {
      console.log("[DEBUG-AF] === START_TASK TOOL ===");
      console.log("[DEBUG-AF] Input taskId:", input.taskId);
      console.log("[DEBUG-AF] conversationId:", conversationId);

      try {
        const { tasks: tasksClient } = await import("~encore/clients");
        const taskId = String(input.taskId || "").trim();

        console.log("[DEBUG-AF] Using taskId:", taskId);

        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!taskId || !uuidRegex.test(taskId)) {
          console.log("[DEBUG-AF] ERROR: Invalid UUID format:", taskId);
          return { success: false, error: `Ugyldig task ID format: "${taskId}". Trenger UUID.` };
        }

        // Verify task exists and get repo info + status
        let taskData: { repo?: string | null; title?: string | null; status?: string | null; errorMessage?: string | null } | null = null;
        try {
          const result = await tasksClient.getTaskInternal({ id: taskId });
          if (result?.task) {
            taskData = { repo: result.task.repo, title: result.task.title, status: result.task.status, errorMessage: result.task.errorMessage };
            console.log("[DEBUG-AF] Task found:", taskData.title, "status:", taskData.status, "repo:", taskData.repo);
          }
        } catch (e) {
          console.log("[DEBUG-AF] ERROR: getTaskInternal failed:", e instanceof Error ? e.message : String(e));
          taskData = null;
        }

        if (!taskData) {
          console.log("[DEBUG-AF] ERROR: Task not found:", taskId);
          return { success: false, error: `Fant ikke oppgave med ID ${taskId}` };
        }

        // Status guard — blocked/done/in_progress tasks cannot be started
        if (taskData.status === "blocked") {
          console.log("[DEBUG-AF] Task is blocked:", taskData.errorMessage);
          return { success: false, error: `Oppgaven "${taskData.title}" er blokkert${taskData.errorMessage ? ": " + taskData.errorMessage : ""}. Opprett en ny oppgave.` };
        }
        if (taskData.status === "done") {
          console.log("[DEBUG-AF] Task already done");
          return { success: false, error: "Oppgaven er allerede fullfort." };
        }
        if (taskData.status === "in_progress") {
          console.log("[DEBUG-AF] Task already in_progress");
          return { success: false, error: "Oppgaven kjorer allerede." };
        }

        // Update status to in_progress
        try {
          await tasksClient.updateTaskStatus({ id: taskId, status: "in_progress" });
          console.log("[DEBUG-AF] Task status updated to in_progress");
        } catch (e) {
          console.log("[DEBUG-AF] WARNING: Failed to update task status:", e);
        }

        // Start agent with correct repo from task or chat context
        const { agent: agentClient } = await import("~encore/clients");
        const startPayload = {
          conversationId: conversationId || "tool-" + Date.now(),
          taskId,
          userMessage: "Start oppgave: " + taskData.title,
          thefoldTaskId: taskId,
          repoName: taskData.repo || repoName,
          repoOwner: "Twofold-AS",
        };

        console.log("[DEBUG-AF] Calling agent.startTask with:", JSON.stringify(startPayload).substring(0, 500));

        agentClient.startTask(startPayload).then(() => {
          console.log("[DEBUG-AF] agent.startTask promise resolved");
        }).catch(async (e: Error) => {
          console.error("[DEBUG-AF] ERROR: agent.startTask FAILED:", e.message);
          try {
            await tasksClient.updateTaskStatus({ id: taskId, status: "blocked", errorMessage: e.message?.substring(0, 500) });
            console.log("[DEBUG-AF] Task marked as blocked after agent failure");
          } catch { /* non-critical */ }
        });

        console.log("[DEBUG-AF] agent.startTask fired (async)");
        return { success: true, message: `Oppgave "${taskData.title || taskId}" startet. Agenten jobber nå.` };
      } catch (e) {
        console.error("[DEBUG-AF] START_TASK CRASHED:", e instanceof Error ? e.message : String(e));
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "list_tasks": {
      const { tasks: tasksClient } = await import("~encore/clients");
      const result = await tasksClient.listTasks({
        repo: (input.repoName as string) || repoName || undefined,
        status: (input.status || undefined) as any,
      });
      return { tasks: result.tasks.map((t: { id: string; title: string; status: string; priority: number }) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })), total: result.total };
    }

    case "read_file": {
      const { github: ghClient } = await import("~encore/clients");
      try {
        const file = await ghClient.getFile({
          owner,
          repo: (input.repoName as string) || repoName || "",
          path: input.path as string,
        });
        return { path: input.path, content: file.content?.substring(0, 5000) };
      } catch {
        return { error: `Kunne ikke lese ${input.path}` };
      }
    }

    case "search_code": {
      const { github: ghClient } = await import("~encore/clients");
      try {
        const repo = (input.repoName as string) || repoName || "";
        const tree = await ghClient.getTree({ owner, repo });
        const relevant = await ghClient.findRelevantFiles({
          owner,
          repo,
          taskDescription: input.query as string,
          tree: tree.tree,
        });
        return { matchingFiles: relevant.paths };
      } catch {
        return { error: "Kunne ikke søke i repoet" };
      }
    }

    default:
      return { error: `Ukjent tool: ${name}` };
  }
}

/** Fire-and-forget: assess complexity and update task with enrichment data */
async function enrichTaskWithAI(taskId: string, title: string, description: string, repoName?: string) {
  try {
    const { tasks: tasksClient } = await import("~encore/clients");

    const complexity = await assessComplexity({
      taskDescription: title + "\n" + description,
      projectStructure: "",
      fileCount: 0,
    });

    await tasksClient.updateTask({
      id: taskId,
      estimatedComplexity: complexity.complexity,
      estimatedTokens: complexity.tokensUsed,
    });
  } catch (e) {
    log.error("enrichTaskWithAI failed:", { taskId, error: e instanceof Error ? e.message : String(e) });
  }
}

async function callAnthropicWithTools(options: AICallOptions & {
  tools: typeof CHAT_TOOLS;
  repoName?: string;
  conversationId?: string;
}): Promise<AICallResponse & { toolsUsed: string[] }> {
  const client = new Anthropic({ apiKey: anthropicKey() });

  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    { type: "text", text: options.system, cache_control: { type: "ephemeral" } },
  ];

  const allToolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let lastCreatedTaskId: string | null = null;

  // Mutable messages array for tool-loop
  const messages: Array<{ role: "user" | "assistant"; content: string | any[] }> = [
    ...options.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const MAX_TOOL_LOOPS = 10;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    console.log(`[DEBUG-AH] Tool loop iteration ${loop + 1}`);

    const response = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens,
      system: systemBlocks,
      messages,
      tools: options.tools as any,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    console.log(`[DEBUG-AH] Stop reason: ${response.stop_reason}, content blocks: ${response.content.length}`);

    // If end_turn or no tool_use — return final content
    if (response.stop_reason !== "tool_use") {
      const textContent = response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");

      console.log(`[DEBUG-AH] Final content length: ${textContent.length}`);

      const cacheReadTokens = (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
      const cacheCreationTokens = (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;

      logTokenUsage({
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        model: options.model,
        endpoint: "anthropic-tools",
      });

      return {
        content: textContent,
        tokensUsed: totalInputTokens + totalOutputTokens,
        stopReason: response.stop_reason || "end_turn",
        modelUsed: options.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        costEstimate: estimateCost(totalInputTokens, totalOutputTokens, options.model),
        toolsUsed: allToolsUsed,
      };
    }

    // stop_reason === "tool_use" — execute tools
    const toolUseBlocks = response.content.filter((block: any) => block.type === "tool_use");
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];

    for (const toolBlock of toolUseBlocks) {
      const toolName = (toolBlock as any).name;
      const toolInput = { ...(toolBlock as any).input } as Record<string, unknown>;

      console.log(`[DEBUG-AH] Executing tool: ${toolName}, input: ${JSON.stringify(toolInput).substring(0, 300)}`);
      allToolsUsed.push(toolName);

      // For start_task, prefer lastCreatedTaskId over potentially hallucinated input
      if (toolName === "start_task" && lastCreatedTaskId) {
        console.log(`[DEBUG-AH] start_task: overriding taskId ${toolInput.taskId} → ${lastCreatedTaskId}`);
        toolInput.taskId = lastCreatedTaskId;
      }

      try {
        // Check if this is an MCP tool call
        if (toolName.startsWith("mcp_")) {
          // Parse: mcp_{serverName}_{toolName}
          const parts = toolName.split("_");
          if (parts.length >= 3) {
            const serverName = parts[1];
            const actualToolName = parts.slice(2).join("_");

            console.log(`[DEBUG-AH] MCP tool call: ${serverName}/${actualToolName}`);

            try {
              const { mcp } = await import("~encore/clients");
              const mcpResult = await mcp.callTool({
                serverName,
                toolName: actualToolName,
                args: toolInput,
              });

              // Konverter MCP-resultat til Anthropic tool_result format
              const resultText = mcpResult.result.content
                .map((c: any) => c.text ?? "")
                .filter(Boolean)
                .join("\n");

              toolResults.push({
                type: "tool_result",
                tool_use_id: (toolBlock as any).id,
                content: resultText || "OK",
                is_error: mcpResult.result.isError ?? false,
              });

              console.log(`[DEBUG-AH] MCP tool result: ${resultText.substring(0, 200)}`);
            } catch (mcpErr) {
              console.error(`[DEBUG-AH] MCP tool ${toolName} FAILED:`, mcpErr);
              toolResults.push({
                type: "tool_result",
                tool_use_id: (toolBlock as any).id,
                content: `MCP tool call failed: ${String(mcpErr)}`,
                is_error: true,
              });
            }
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: (toolBlock as any).id,
              content: `Invalid MCP tool name format: ${toolName}`,
              is_error: true,
            });
          }
        } else {
          // Regular tool call
          const result = await executeToolCall(toolName, toolInput, options.repoName, options.conversationId);

          // Track lastCreatedTaskId
          if (toolName === "create_task" && result?.taskId) {
            lastCreatedTaskId = result.taskId as string;
            console.log(`[DEBUG-AH] lastCreatedTaskId: ${lastCreatedTaskId}`);
          }

          console.log(`[DEBUG-AH] Tool ${toolName} result: ${JSON.stringify(result).substring(0, 200)}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: (toolBlock as any).id,
            content: JSON.stringify(result),
          });
        }
      } catch (e) {
        console.error(`[DEBUG-AH] Tool ${toolName} FAILED:`, e);
        toolResults.push({
          type: "tool_result",
          tool_use_id: (toolBlock as any).id,
          content: JSON.stringify({ error: String(e) }),
          is_error: true,
        });
      }
    }

    // CRITICAL: Append assistant response AND tool results to messages for next iteration
    messages.push({
      role: "assistant",
      content: response.content as any, // Includes BOTH text and tool_use blocks
    });
    messages.push({
      role: "user",
      content: toolResults,
    });

    console.log(`[DEBUG-AH] Sent tool results back, looping... (tools so far: ${allToolsUsed.join(", ")})`);
  }

  // Max loops reached
  console.warn("[DEBUG-AH] Max tool loops reached!");

  const cacheReadTokens = 0;
  const cacheCreationTokens = 0;

  logTokenUsage({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    model: options.model,
    endpoint: "anthropic-tools",
  });

  return {
    content: "Beklager, for mange verktøy-kall. Prøv igjen med en enklere forespørsel.",
    tokensUsed: totalInputTokens + totalOutputTokens,
    stopReason: "max_loops",
    modelUsed: options.model,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costEstimate: estimateCost(totalInputTokens, totalOutputTokens, options.model),
    toolsUsed: allToolsUsed,
  };
}

// --- Endpoints ---

// Direct chat
export const chat = api(
  { method: "POST", path: "/ai/chat", expose: false },
  async (req: ChatRequest): Promise<ChatResponse> => {
    const model = req.model || DEFAULT_MODEL;

    // OWASP A03: Sanitize user messages
    req.messages = req.messages.map((m) =>
      m.role === "user" ? { ...m, content: sanitize(m.content) } : m
    );

    // Extract task from last user message for skill routing
    const lastUserMsg = [...req.messages].reverse().find((m) => m.role === "user");
    const pipeline = await buildSystemPromptWithPipeline(req.systemContext, {
      task: lastUserMsg?.content || "",
    }, req.aiName);

    let system = pipeline.systemPrompt;

    // Inject repo context if chatting from a specific repo
    if (req.repoName) {
      system += `\n\nDu ser på repoet: ${req.repoName}. Når brukeren refererer til "repoet", "prosjektet", eller "koden", mener de dette spesifikke repoet.`;
    }

    // Inject actual repo file content
    if (req.repoContext) {
      system += `\n\n--- REPO-KONTEKST ---\nDette er FAKTISK innhold fra repoet. Basér svaret ditt KUN på dette — ALDRI dikt opp filer eller kode som ikke er her.\n${req.repoContext}`;
    }

    if (req.memoryContext.length > 0) {
      system += "\n\n## Relevant Context from Memory\n";
      req.memoryContext.forEach((m, i) => {
        system += `${i + 1}. ${m}\n`;
      });
    }

    // ALWAYS use tool-use — AI decides whether to invoke tools (create_task, start_task, etc.)
    console.log("[DEBUG-AG] ai.chat: using callAnthropicWithTools, repoName:", req.repoName || "(none)");
    const toolResponse = await callAnthropicWithTools({
      model,
      system,
      messages: req.messages,
      maxTokens: 8192,
      tools: CHAT_TOOLS,
      repoName: req.repoName,
      conversationId: req.conversationId,
    });

    await logSkillResults(pipeline.skillIds, true, toolResponse.tokensUsed);

    return {
      content: toolResponse.content,
      tokensUsed: toolResponse.tokensUsed,
      stopReason: toolResponse.stopReason,
      modelUsed: toolResponse.modelUsed,
      costUsd: toolResponse.costEstimate.totalCost,
      toolsUsed: toolResponse.toolsUsed.length > 0 ? toolResponse.toolsUsed : undefined,
      usage: {
        inputTokens: toolResponse.inputTokens,
        outputTokens: toolResponse.outputTokens,
        totalTokens: toolResponse.inputTokens + toolResponse.outputTokens,
      },
      truncated: toolResponse.stopReason === "max_tokens",
    };
  }
);

// Agent planning — breaks task into steps
export const planTask = api(
  { method: "POST", path: "/ai/plan", expose: false },
  async (req: AgentThinkRequest): Promise<AgentThinkResponse> => {
    const model = req.model || DEFAULT_MODEL;

    // OWASP A03: Sanitize task description (may come from Linear)
    req.task = sanitize(req.task, { maxLength: 100_000 });

    let prompt = `## Task\n${req.task}\n\n`;
    prompt += `## Project Structure\n\`\`\`\n${req.projectStructure}\n\`\`\`\n\n`;

    if (req.relevantFiles.length > 0) {
      prompt += `## Relevant Files\n`;
      req.relevantFiles.forEach((f) => {
        prompt += `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\`\n\n`;
      });
    }

    if (req.docsContext.length > 0) {
      prompt += `## Library Documentation\n`;
      req.docsContext.forEach((d, i) => {
        prompt += `${i + 1}. ${d}\n`;
      });
      prompt += "\n";
    }

    if (req.previousAttempt && req.errorMessage) {
      prompt += `## Previous Attempt Failed\nError: ${req.errorMessage}\nFix the issue and try a different approach.\n\n`;
    }

    prompt += `Create a step-by-step plan. Respond with JSON only.`;

    const messages: ChatMessage[] = [{ role: "user", content: prompt }];

    if (req.memoryContext.length > 0) {
      messages.push({
        role: "user",
        content: `Relevant memories:\n${req.memoryContext.join("\n")}`,
      });
    }

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: req.task,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages,
      maxTokens: 16384,
    });

    // Log skill usage
    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);

      // Validate and normalize plan steps
      const rawPlan = Array.isArray(parsed.plan) ? parsed.plan : [];
      const validatedPlan: TaskStep[] = rawPlan.map((step: Record<string, unknown>) => ({
        action: String(step.action || "create_file") as TaskStep["action"],
        filePath: String(step.filePath || step.file_path || ""),
        content: String(step.content || ""),
        command: step.command != null ? String(step.command) : undefined,
        description: String(step.description || step.reasoning || ""),
      }));

      return {
        plan: validatedPlan,
        reasoning: String(parsed.reasoning || ""),
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch (e) {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      throw APIError.internal("failed to parse planning response as JSON: " + (e instanceof Error ? e.message : String(e)));
    }
  }
);

// Code review and documentation
export const reviewCode = api(
  { method: "POST", path: "/ai/review", expose: false },
  async (req: ReviewRequest): Promise<ReviewResponse> => {
    const model = req.model || DEFAULT_MODEL;

    let prompt = `## Task\n${req.taskDescription}\n\n`;
    prompt += `## Files Changed\n`;
    req.filesChanged.forEach((f) => {
      prompt += `### ${f.path} (${f.action})\n\`\`\`\n${f.content}\n\`\`\`\n\n`;
    });
    prompt += `## Validation Output\n\`\`\`\n${req.validationOutput}\n\`\`\`\n\n`;
    prompt += `Review this work. Respond with JSON only.`;

    const pipeline = await buildSystemPromptWithPipeline("agent_review", {
      task: req.taskDescription,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8192,
    });

    // Log skill usage
    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);
      return {
        documentation: parsed.documentation,
        memoriesExtracted: parsed.memoriesExtracted || [],
        qualityScore: parsed.qualityScore || 5,
        concerns: parsed.concerns || [],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      throw APIError.internal("failed to parse review response");
    }
  }
);

// --- Project Review (whole-project, used by orchestrator) ---

interface ProjectReviewRequest {
  projectDescription: string;
  phases: Array<{
    name: string;
    tasks: Array<{
      title: string;
      status: string;
      filesChanged: string[];
    }>;
  }>;
  allFiles: Array<{ path: string; content: string; action: string }>;
  totalCostUsd: number;
  totalTokensUsed: number;
  model?: string;
}

interface ProjectReviewResponse {
  documentation: string;
  qualityScore: number;
  concerns: string[];
  architecturalDecisions: string[];
  memoriesExtracted: string[];
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const reviewProject = api(
  { method: "POST", path: "/ai/review-project", expose: false },
  async (req: ProjectReviewRequest): Promise<ProjectReviewResponse> => {
    const model = req.model || "claude-sonnet-4-5-20250929";

    // Build file summary with token-trimming
    const MAX_FILE_TOKENS = 60000;
    let fileTokens = 0;
    let fileSection = "## Alle filer\n\n";
    const fullFiles: string[] = [];
    const summaryFiles: string[] = [];

    // Sort: shorter files first (more likely to fit in full)
    const sortedFiles = [...req.allFiles].sort((a, b) => a.content.length - b.content.length);

    for (const f of sortedFiles) {
      const fileTokenEst = Math.ceil(f.content.length / 4);
      if (fileTokens + fileTokenEst < MAX_FILE_TOKENS) {
        fullFiles.push(`### ${f.path} (${f.action})\n\`\`\`\n${f.content}\n\`\`\`\n`);
        fileTokens += fileTokenEst;
      } else {
        const lines = f.content.split("\n").length;
        summaryFiles.push(`- ${f.path} (${f.action}, ${lines} linjer)`);
      }
    }

    fileSection += fullFiles.join("\n");
    if (summaryFiles.length > 0) {
      fileSection += `\n### Filer vist som sammendrag (token-grense)\n${summaryFiles.join("\n")}\n`;
    }

    // Build phase summary
    let phaseSection = "## Faser og oppgaver\n\n";
    for (const phase of req.phases) {
      phaseSection += `### ${phase.name}\n`;
      for (const task of phase.tasks) {
        const fileList = task.filesChanged.length > 0
          ? ` (${task.filesChanged.length} filer: ${task.filesChanged.slice(0, 5).join(", ")}${task.filesChanged.length > 5 ? "..." : ""})`
          : "";
        phaseSection += `- [${task.status}] ${task.title}${fileList}\n`;
      }
      phaseSection += "\n";
    }

    const prompt = [
      `## Prosjektbeskrivelse\n${req.projectDescription}\n`,
      phaseSection,
      fileSection,
      `## Kostnad\nTotalt: $${req.totalCostUsd.toFixed(4)} (${req.totalTokensUsed} tokens)\n`,
      "",
      "Review hele dette prosjektet. Gi en samlet vurdering av:",
      "1. Hva som ble bygget og hvorfor",
      "2. Arkitektoniske valg som ble gjort",
      "3. Samlet kodekvalitet (1-10)",
      "4. Bekymringer eller svakheter",
      "5. Viktige beslutninger å huske til fremtiden",
      "",
      "Svar KUN med JSON i dette formatet:",
      '{ "documentation": "markdown", "qualityScore": 7, "concerns": ["..."], "architecturalDecisions": ["..."], "memoriesExtracted": ["..."] }',
    ].join("\n");

    const systemPrompt = [
      "Du er en senior arkitekt som reviewer et komplett prosjekt bygget av en AI-agent.",
      "Du skal gi en helhetlig vurdering — ikke per-fil, men prosjektet som helhet.",
      "Fokuser på: arkitektur, kodekvalitet, sikkerhet, testbarhet, vedlikeholdbarhet.",
      "Svar KUN med gyldig JSON.",
    ].join("\n");

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8192,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);
      return {
        documentation: parsed.documentation || "",
        qualityScore: parsed.qualityScore || 5,
        concerns: parsed.concerns || [],
        architecturalDecisions: parsed.architecturalDecisions || [],
        memoriesExtracted: parsed.memoriesExtracted || [],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      return {
        documentation: response.content,
        qualityScore: 5,
        concerns: ["Kunne ikke parse AI-respons som JSON"],
        architecturalDecisions: [],
        memoriesExtracted: [],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

// --- Complexity Assessment ---

export interface AssessComplexityRequest {
  taskDescription: string;
  projectStructure: string;
  fileCount: number;
  model?: string;
}

export interface AssessComplexityResponse {
  complexity: number; // 1-10
  reasoning: string;
  suggestedModel: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const assessComplexity = api(
  { method: "POST", path: "/ai/assess-complexity", expose: false },
  async (req: AssessComplexityRequest): Promise<AssessComplexityResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const prompt = `Assess the complexity of this task on a scale of 1-10.

## Task
${req.taskDescription}

## Project (${req.fileCount} files)
${req.projectStructure.substring(0, 2000)}

Respond with JSON only:
{
  "complexity": 5,
  "reasoning": "why this complexity level",
  "suggestedModel": "claude-sonnet-4-5-20250929"
}

Guidelines:
- 1-3: Simple (rename, add field, small fix) → use haiku/budget model
- 4-6: Standard (new endpoint, refactor, bug fix) → use sonnet/standard model
- 7-10: Complex (new service, architecture change, multi-file) → use opus/premium model`;

    const response = await callAIWithFallback({
      model,
      system: BASE_RULES,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1024,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));
      return {
        complexity: parsed.complexity || 5,
        reasoning: parsed.reasoning || "",
        suggestedModel: parsed.suggestedModel || DEFAULT_MODEL,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      return {
        complexity: 5,
        reasoning: "Could not parse complexity assessment",
        suggestedModel: DEFAULT_MODEL,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

// --- Diagnosis & Plan Revision (DEL 2C) ---

export interface DiagnoseRequest {
  task: string;
  plan: TaskStep[];
  currentStep: number;
  error: string;
  previousErrors: string[];
  codeContext: string;
  model?: string;
}

export interface DiagnosisResult {
  rootCause: 'bad_plan' | 'implementation_error' | 'missing_context' | 'impossible_task' | 'environment_error';
  reason: string;
  suggestedAction: 'revise_plan' | 'fix_code' | 'fetch_more_context' | 'escalate_to_human' | 'retry';
  confidence: number;
}

export const diagnoseFailure = api(
  { method: "POST", path: "/ai/diagnose", expose: false },
  async (req: DiagnoseRequest): Promise<{ diagnosis: DiagnosisResult; tokensUsed: number; costUsd: number }> => {
    const model = req.model || DEFAULT_MODEL;

    const prompt = `You are diagnosing why a step in an autonomous coding task failed.

## Task
${req.task}

## Current Plan
${req.plan.map((s, i) => `${i + 1}. [${s.action}] ${s.description}${s.filePath ? ` (${s.filePath})` : ''}`).join('\n')}

## Failed at Step ${req.currentStep + 1}
Error: ${req.error}

${req.previousErrors.length > 0 ? `## Previous Errors in This Session\n${req.previousErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : ''}

## Code Context
${req.codeContext.substring(0, 3000)}

Analyze the root cause and suggest the best action. Respond with JSON only:
{
  "rootCause": "bad_plan|implementation_error|missing_context|impossible_task|environment_error",
  "reason": "specific explanation of what went wrong",
  "suggestedAction": "revise_plan|fix_code|fetch_more_context|escalate_to_human|retry",
  "confidence": 0.8
}

Root cause guidelines:
- bad_plan: The approach itself is wrong, need a different strategy
- implementation_error: Right approach, but code has bugs (typos, wrong API, logic error)
- missing_context: Need more information about the codebase or requirements
- impossible_task: The task cannot be done with current constraints
- environment_error: Transient issue (timeout, API down, network)`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: req.task,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content)) as DiagnosisResult;

      // Log skill usage
      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        diagnosis: parsed,
        tokensUsed: response.tokensUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      return {
        diagnosis: {
          rootCause: 'implementation_error',
          reason: 'Could not parse diagnosis — defaulting to implementation error',
          suggestedAction: 'fix_code',
          confidence: 0.3,
        },
        tokensUsed: response.tokensUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

export interface RevisePlanRequest {
  task: string;
  originalPlan: TaskStep[];
  diagnosis: DiagnosisResult;
  constraints: string[];
  model?: string;
}

export const revisePlan = api(
  { method: "POST", path: "/ai/revise-plan", expose: false },
  async (req: RevisePlanRequest): Promise<AgentThinkResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const prompt = `You need to create a NEW plan for this task. The previous plan failed.

## Task
${req.task}

## Previous Plan (FAILED)
${req.originalPlan.map((s, i) => `${i + 1}. [${s.action}] ${s.description}`).join('\n')}

## Diagnosis
Root cause: ${req.diagnosis.rootCause}
Reason: ${req.diagnosis.reason}
Suggested action: ${req.diagnosis.suggestedAction}

## Constraints
${req.constraints.map((c) => `- ${c}`).join('\n')}

Create a DIFFERENT approach that avoids the previous failure. Respond with JSON:
{
  "plan": [{ "description": "...", "action": "create_file|modify_file|delete_file|run_command", "filePath": "...", "content": "...", "command": "..." }],
  "reasoning": "why this new approach will work"
}`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: req.task,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 16384,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));

      // Log skill usage
      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        plan: parsed.plan,
        reasoning: parsed.reasoning,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      throw APIError.internal("failed to parse revised plan as JSON");
    }
  }
);

// --- Confidence Assessment ---

export interface TaskConfidence {
  overall: number;
  breakdown: {
    task_understanding: number;
    codebase_familiarity: number;
    technical_complexity: number;
    test_coverage_feasible: number;
  };
  uncertainties: string[];
  recommended_action: "proceed" | "clarify" | "break_down";
  clarifying_questions?: string[];
  suggested_subtasks?: string[];
}

export interface AssessConfidenceRequest {
  taskDescription: string;
  projectStructure: string;
  relevantFiles: Array<{ path: string; content: string }>;
  memoryContext: string[];
  docsContext: string[];
  model?: string;
}

export interface AssessConfidenceResponse {
  confidence: TaskConfidence;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const assessConfidence = api(
  { method: "POST", path: "/ai/assess-confidence", expose: false },
  async (req: AssessConfidenceRequest): Promise<AssessConfidenceResponse> => {
    const model = req.model || DEFAULT_MODEL;

    let prompt = `## Task to Assess\n${req.taskDescription}\n\n`;
    prompt += `## Project Structure\n\`\`\`\n${req.projectStructure}\n\`\`\`\n\n`;

    if (req.relevantFiles.length > 0) {
      prompt += `## Relevant Files\n`;
      req.relevantFiles.forEach((f) => {
        prompt += `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\`\n\n`;
      });
    }

    if (req.docsContext.length > 0) {
      prompt += `## Available Documentation\n`;
      req.docsContext.forEach((d, i) => {
        prompt += `${i + 1}. ${d}\n`;
      });
      prompt += "\n";
    }

    if (req.memoryContext.length > 0) {
      prompt += `## Past Context\n`;
      req.memoryContext.forEach((m, i) => {
        prompt += `${i + 1}. ${m}\n`;
      });
      prompt += "\n";
    }

    prompt += `Assess your confidence in completing this task. Respond with JSON only.`;

    const messages: ChatMessage[] = [{ role: "user", content: prompt }];

    const pipeline = await buildSystemPromptWithPipeline("confidence_assessment", {
      task: req.taskDescription,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages,
      maxTokens: 4096,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const confidence = JSON.parse(jsonText) as TaskConfidence;

      // Compute overall from breakdown if not provided
      if (!confidence.overall && confidence.breakdown) {
        const b = confidence.breakdown;
        confidence.overall = Math.round(
          (b.task_understanding +
            b.codebase_familiarity +
            b.technical_complexity +
            b.test_coverage_feasible) / 4
        );
      }

      // Determine recommended action if missing
      if (!confidence.recommended_action) {
        if (confidence.overall >= 75) {
          confidence.recommended_action = "proceed";
        } else if (confidence.overall >= 60) {
          confidence.recommended_action = "clarify";
        } else {
          confidence.recommended_action = "break_down";
        }
      }

      // Log skill usage
      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        confidence,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      throw APIError.internal("failed to parse confidence assessment as JSON");
    }
  }
);

// --- Project Decomposition ---

interface DecomposeProjectRequest {
  userMessage: string;
  repoOwner: string;
  repoName: string;
  projectStructure: string;
  existingFiles?: Array<{ path: string; content: string }>;
}

interface DecomposeProjectResponse {
  phases: Array<{
    name: string;
    description: string;
    tasks: Array<{
      title: string;
      description: string;
      dependsOnIndices: number[];
      contextHints: string[];
    }>;
  }>;
  conventions: string;
  reasoning: string;
  estimatedTotalTasks: number;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const decomposeProject = api(
  { method: "POST", path: "/ai/decompose-project", expose: false },
  async (req: DecomposeProjectRequest): Promise<DecomposeProjectResponse> => {
    // OWASP A03: Sanitize user message (may be very long project description)
    req.userMessage = sanitize(req.userMessage, { maxLength: 100_000 });

    // Use a higher-tier model for decomposition — this is architectural planning
    const model = "claude-sonnet-4-5-20250929";

    let prompt = `## User Request\n${req.userMessage}\n\n`;
    prompt += `## Repository\n${req.repoOwner}/${req.repoName}\n\n`;
    prompt += `## Project Structure\n\`\`\`\n${req.projectStructure}\n\`\`\`\n\n`;

    if (req.existingFiles && req.existingFiles.length > 0) {
      prompt += `## Existing Files (for context)\n`;
      for (const f of req.existingFiles) {
        prompt += `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\`\n\n`;
      }
    }

    prompt += `Decompose this request into atomic tasks organized in phases. Respond with JSON only.`;

    const pipeline = await buildSystemPromptWithPipeline("project_decomposition", {
      task: req.userMessage,
      repo: `${req.repoOwner}/${req.repoName}`,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 16384,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);

      // Validate structure
      if (!parsed.phases || !Array.isArray(parsed.phases)) {
        throw new Error("missing phases array");
      }

      // Validate dependsOnIndices consistency
      let totalTaskCount = 0;
      for (const phase of parsed.phases) {
        totalTaskCount += phase.tasks?.length || 0;
      }

      let taskIndex = 0;
      for (const phase of parsed.phases) {
        for (const task of phase.tasks || []) {
          for (const depIdx of task.dependsOnIndices || []) {
            if (depIdx < 0 || depIdx >= totalTaskCount || depIdx === taskIndex) {
              log.warn("invalid dependsOnIndex detected, removing", { depIdx, taskIndex, totalTaskCount });
              task.dependsOnIndices = (task.dependsOnIndices || []).filter((i: number) => i !== depIdx);
            }
          }
          taskIndex++;
        }
      }

      // Validate conventions length (<2000 tokens ~ <8000 chars)
      const conventions = parsed.conventions || "";
      if (conventions.length > 8000) {
        log.warn("conventions too long, truncating", { length: conventions.length });
      }

      // Log skill usage
      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        phases: parsed.phases,
        conventions: conventions.substring(0, 8000),
        reasoning: parsed.reasoning || "",
        estimatedTotalTasks: parsed.estimatedTotalTasks || totalTaskCount,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch (err) {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      if (err instanceof SyntaxError) {
        throw APIError.internal("failed to parse decomposition response as JSON");
      }
      throw APIError.internal(`decomposition validation failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
);

// --- Phase Revision (between-phase re-planning) ---

interface ReviseProjectPhaseRequest {
  projectConventions: string;
  completedPhase: {
    name: string;
    tasks: Array<{
      title: string;
      status: string;
      outputFiles: string[];
      outputTypes: string[];
      errorMessage?: string;
    }>;
  };
  nextPhase: {
    name: string;
    tasks: Array<{
      title: string;
      description: string;
      contextHints: string[];
    }>;
  };
  projectStructure: string;
}

interface ReviseProjectPhaseResponse {
  revisedTasks: Array<{
    originalTitle: string;
    revisedDescription?: string;
    shouldSkip?: boolean;
    newContextHints?: string[];
    reason: string;
  }>;
  newTasksToAdd: Array<{
    title: string;
    description: string;
    contextHints: string[];
    insertAfterTitle?: string;
  }>;
  reasoning: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const reviseProjectPhase = api(
  { method: "POST", path: "/ai/revise-project-phase", expose: false },
  async (req: ReviseProjectPhaseRequest): Promise<ReviseProjectPhaseResponse> => {
    // Use a lower-tier model — this is a short meta-reasoning task
    const model = "claude-haiku-4-5-20251001";

    const completedSummary = req.completedPhase.tasks.map((t) => {
      const status = t.status === "completed" ? "\u2705" : t.status === "failed" ? "\u274C" : "\u23ED\uFE0F";
      const files = t.outputFiles.length > 0 ? ` (files: ${t.outputFiles.join(", ")})` : "";
      const err = t.errorMessage ? ` Error: ${t.errorMessage}` : "";
      return `${status} ${t.title}${files}${err}`;
    }).join("\n");

    const nextTasksSummary = req.nextPhase.tasks.map((t) =>
      `- ${t.title}: ${t.description.substring(0, 200)}${t.description.length > 200 ? "..." : ""}\n  Context hints: ${t.contextHints.join(", ") || "none"}`
    ).join("\n");

    const prompt = `## Completed Phase: ${req.completedPhase.name}
${completedSummary}

## Next Phase: ${req.nextPhase.name}
${nextTasksSummary}

## Project Conventions (summary)
${req.projectConventions.substring(0, 1000)}

## Current Project Structure
${req.projectStructure.substring(0, 2000)}

Based on what was ACTUALLY built (or failed) in the completed phase, revise the next phase's tasks.

Respond with JSON only:
{
  "revisedTasks": [
    {
      "originalTitle": "exact title from next phase",
      "revisedDescription": "updated description if needed, or omit",
      "shouldSkip": false,
      "newContextHints": ["updated hints if needed"],
      "reason": "why this change"
    }
  ],
  "newTasksToAdd": [
    {
      "title": "new task if needed",
      "description": "what to build",
      "contextHints": ["relevant context"],
      "insertAfterTitle": "title of task to insert after"
    }
  ],
  "reasoning": "overall explanation of adjustments"
}

Rules:
- Only revise tasks that NEED changes based on completed phase results
- If a dependency failed, consider skipping dependent tasks or adjusting them
- Update contextHints to reference actual output files from completed tasks
- Keep changes minimal — don't rewrite tasks that are already correct
- If everything went well, return empty revisedTasks and newTasksToAdd arrays`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: "phase revision",
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));

      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        revisedTasks: parsed.revisedTasks || [],
        newTasksToAdd: parsed.newTasksToAdd || [],
        reasoning: parsed.reasoning || "",
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      // Revision parsing failed — return no changes (safe fallback)
      return {
        revisedTasks: [],
        newTasksToAdd: [],
        reasoning: "Could not parse revision response — keeping original plan",
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

// --- Task Order Planning (for tasks service) ---

interface PlanTaskOrderRequest {
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    labels: string[];
    dependsOn: string[];
  }>;
  repo: string;
}

interface PlanTaskOrderResponse {
  orderedTasks: Array<{
    id: string;
    plannedOrder: number;
    estimatedComplexity: number;
    reasoning: string;
  }>;
}

export const planTaskOrder = api(
  { method: "POST", path: "/ai/plan-task-order", expose: false },
  async (req: PlanTaskOrderRequest): Promise<PlanTaskOrderResponse> => {
    if (!req.tasks || req.tasks.length === 0) {
      return { orderedTasks: [] };
    }

    const model = "claude-haiku-4-5-20251001";

    const taskList = req.tasks.map((t, i) => `${i + 1}. [${t.id}] ${t.title}${t.description ? ` — ${t.description}` : ""}${t.labels.length > 0 ? ` (labels: ${t.labels.join(", ")})` : ""}${t.dependsOn.length > 0 ? ` (depends on: ${t.dependsOn.join(", ")})` : ""}`).join("\n");

    const prompt = `## Tasks for repo: ${req.repo}\n\n${taskList}\n\nAnalyze these tasks and return an optimal execution order as JSON.`;

    const systemPrompt = `You are a project planner. Analyze the given tasks and suggest an optimal execution order.

Prioritize:
1. Dependencies (depends_on must be resolved first)
2. Foundation first (types → lib → features → tests)
3. Simple tasks first for momentum
4. Security fixes > bugs > upgrades

Respond with JSON only:
{
  "orderedTasks": [
    { "id": "uuid", "plannedOrder": 1, "estimatedComplexity": 3, "reasoning": "short explanation" }
  ]
}

estimatedComplexity is 1-5 (1=trivial, 5=very complex).
plannedOrder starts at 1 and increments sequentially.`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: "task order planning",
      repo: req.repo,
    });

    const response = await callAIWithFallback({
      model,
      system: systemPrompt + "\n\n" + pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));

      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        orderedTasks: (parsed.orderedTasks || []).map((t: { id: string; plannedOrder: number; estimatedComplexity: number; reasoning: string }) => ({
          id: t.id,
          plannedOrder: t.plannedOrder,
          estimatedComplexity: t.estimatedComplexity || 3,
          reasoning: t.reasoning || "",
        })),
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      // Fallback: return tasks in original order with default complexity
      return {
        orderedTasks: req.tasks.map((t, i) => ({
          id: t.id,
          plannedOrder: i + 1,
          estimatedComplexity: 3,
          reasoning: "AI planning failed — using default order",
        })),
      };
    }
  }
);

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

    let systemPrompt = `Du er en kode-generator. Returner KUN filinnholdet uten markdown-blokker, uten forklaring, uten kommentarer om hva du gjør. Bare ren kode.

Oppgave: ${sanitize(req.task)}`;

    if (pipeline.systemPrompt) {
      systemPrompt += "\n\n" + pipeline.systemPrompt;
    }

    if (req.skillFragments.length > 0) {
      systemPrompt += "\n\n## Skill Instructions\n" + req.skillFragments.join("\n\n");
    }

    // Build user prompt with file-specific context
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

    // Strip any markdown code blocks the AI might still add
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

    const systemPrompt = `Du er en feilfikser. Du får en fil med TypeScript-feil. Returner den KORRIGERTE filen, komplett, uten markdown-blokker, uten forklaring. Bare ren kode.`;

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
    const systemPrompt = `Du er en kode-analytiker som identifiserer gjenbrukbare komponenter.

Analyser filene og identifiser MAKS 3 selvstendige, gjenbrukbare komponenter.

En god komponent har:
- Klart definert interface (eksporter)
- Lav kobling til resten av prosjektet
- Minst 50 linjer kode (ikke trivielt)
- Gjenbruksverdi i andre prosjekter
- Tydelig kategori

Kategorier: auth, payments, pdf, email, api, database, ui, utility, testing, devops

Returner KUN gyldig JSON uten markdown-blokker. Format:
{
  "components": [
    {
      "name": "kebab-case-navn",
      "description": "Kort beskrivelse",
      "category": "kategori",
      "files": [{"path": "sti", "content": ""}],
      "entryPoint": "hovedfil.ts",
      "dependencies": ["npm-pakke"],
      "tags": ["tag1", "tag2"],
      "qualityScore": 75
    }
  ]
}

Hvis ingen gjenbrukbare komponenter finnes, returner: {"components": []}`;

    // Bygg bruker-prompt med filkontekst
    let userPrompt = `Repo: ${sanitize(req.repo)}\nOppgave: ${sanitize(req.task)}\n\nFiler:\n`;
    let tokenEstimate = 0;
    for (const f of req.files) {
      if (tokenEstimate > 15000) break; // Token-grense
      userPrompt += `\n--- ${f.path} (${f.lines} linjer) ---\n${sanitize(f.content)}\n`;
      tokenEstimate += f.content.length / 4;
    }

    userPrompt += "\n\nIdentifiser gjenbrukbare komponenter fra disse filene.";

    const response = await callAIWithFallback({
      model: "claude-sonnet-4-5-20250929", // Bruk rimelig modell
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 4096,
    });

    // Parse JSON-respons
    try {
      let content = response.content.trim();
      // Strip eventuelle markdown code blocks
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

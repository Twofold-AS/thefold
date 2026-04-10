# Sprint 7 — Agent Tool-Use Arkitektur

## Problemet i dag

Agentens 12-stegs loop er HARDKODET. Hvert steg er et direkte service-kall:

```
executeTask()
  → buildContext()        // hardkodet: github.getTree, memory.search, docs, mcp
  → assessAndRoute()      // hardkodet: ai.assessConfidence, ai.assessComplexity
  → executePlan()         // hardkodet: ai.planTask, builder.start, sandbox.validate
  → handleReview()        // hardkodet: ai.reviewCode, submitReview
  → completeTask()        // hardkodet: github.createPR, memory.store, linear.update
```

AI-en får IKKE velge hva den gjør. Den kan ikke bestemme "jeg trenger mer kontekst fra dette repoet" midt i en build, eller "la meg sjekke om denne filen allerede finnes" før den begynner å skrive kode. Rekkefølgen er fast.

## Løsningen: AI-drevet tool-use loop

I stedet for hardkodede steg, gi agenten TOOLS som den kan kalle selv. AI-en bestemmer rekkefølgen basert på oppgaven.

### Hvordan Claude Code gjør det (referanse)

Claude Code sin pipeline fra input til output:
1. Parse input
2. Samle kontekst (system prompt, conversation history, tools)
3. Kall modellen med tools tilgjengelig
4. Modellen returnerer enten tekst (ferdig) eller tool_use (fortsett)
5. Kjør tool → mate resultat tilbake → gå til steg 3
6. Gjenta til modellen sier "ferdig" eller max iterasjoner

Verktøyene er: Read, Write, Edit, Bash, Grep, Glob, WebSearch, etc. Modellen bestemmer SELV hvilke den trenger og i hvilken rekkefølge.

### TheFold sin nye agent-loop

```
agentLoop(task, context)
  → AI kalles med tools tilgjengelig
  → AI velger tool(s) å kalle
  → Verktøy kjøres, resultat mates tilbake
  → AI velger neste tool(s) eller avslutter
  → Gjenta til: ferdig, maks iterasjoner, eller bruker-review
```

---

## Agent Tools — TheFold sin verktøykasse

### Kategori 1: Kontekst-tools (hent informasjon)

| Tool | Hva den gjør | Erstatter |
|------|-------------|-----------|
| `read_project_tree` | Hent filstruktur fra GitHub | Hardkodet i buildContext() STEP 2 |
| `read_file` | Les én fil fra repo | Hardkodet i buildContext() findRelevantFiles |
| `search_code` | Søk i kodebasen (filnavn, innhold) | Hardkodet i buildContext() findRelevantFiles |
| `search_memory` | Søk i minner (semantisk) | Hardkodet i buildContext() STEP 3 |
| `search_docs` | Søk i library docs (Context7) | Hardkodet i buildContext() STEP 3 |
| `read_task` | Les task-detaljer fra tasks-service | Hardkodet i readTaskDescription() |

### Kategori 2: Handling-tools (gjør noe)

| Tool | Hva den gjør | Erstatter |
|------|-------------|-----------|
| `write_file` | Skriv en fil til sandbox | Hardkodet i builder phases |
| `delete_file` | Slett en fil i sandbox | Hardkodet i builder phases |
| `run_command` | Kjør kommando i sandbox (npm install, tsc, etc.) | Hardkodet i sandbox.runCommand |
| `validate_code` | Kjør validation pipeline (tsc + lint + test) | Hardkodet i sandbox.validate |
| `create_task` | Opprett en deloppgave | Allerede chat-tool, nå også agent-tool |
| `update_task_status` | Oppdater task status | Hardkodet i diverse helpers |

### Kategori 3: Fullføring-tools (lever resultat)

| Tool | Hva den gjør | Erstatter |
|------|-------------|-----------|
| `create_pr` | Opprett GitHub PR | Hardkodet i completeTask() |
| `submit_review` | Send til bruker-review | Hardkodet i handleReview() |
| `store_memory` | Lagre et minne for fremtiden | Hardkodet i completeTask() |
| `update_linear` | Oppdater Linear task status | Hardkodet i completeTask() |
| `report_progress` | Send statusmelding til bruker | Hardkodet report()/think() |

### Kategori 4: MCP-tools (dynamiske)

Alle installerte MCP-servere er tilgjengelige som tools med `mcp_`-prefix. Dette fungerer allerede i chat — nå får agenten også tilgang.

---

## Implementasjonsplan

### Fase 1: Tool-definisjon og registry (ai/agent-tools.ts)

**Ny fil:** `ai/agent-tools.ts`

Definerer alle agent-tools i samme format som CHAT_TOOLS (Anthropic tool-use format), men med utvidet metadata:

```typescript
export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  category: "context" | "action" | "completion" | "mcp";
  requiresSandbox: boolean;  // true = sandbox må finnes
  requiresRepo: boolean;     // true = repoName/repoOwner må finnes
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "read_project_tree",
    description: "Les filstruktur fra GitHub-repoet. Returnerer liste med filstier.",
    input_schema: {
      type: "object",
      properties: {
        maxDepth: { type: "number", description: "Maks dybde i filtreet (default: uendelig)" },
        filterPattern: { type: "string", description: "Glob-filter (f.eks. 'src/**/*.ts')" },
      },
      required: [],
    },
    category: "context",
    requiresSandbox: false,
    requiresRepo: true,
  },
  {
    name: "read_file",
    description: "Les innholdet av en spesifikk fil fra repoet.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Filsti relativ til repo-rot" },
      },
      required: ["path"],
    },
    category: "context",
    requiresSandbox: false,
    requiresRepo: true,
  },
  {
    name: "search_code",
    description: "Søk i kodebasen etter filnavn eller innhold. Returnerer matchende filstier.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Søketekst — kan være filnavn, funksjonsnavn, eller kodesnippet" },
      },
      required: ["query"],
    },
    category: "context",
    requiresSandbox: false,
    requiresRepo: true,
  },
  {
    name: "search_memory",
    description: "Søk i TheFold sine minner for relevant kontekst fra tidligere oppgaver.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Hva du leter etter" },
        category: { type: "string", enum: ["general", "skill", "task", "error_pattern", "decision"], description: "Filtrer på minnekategori" },
      },
      required: ["query"],
    },
    category: "context",
    requiresSandbox: false,
    requiresRepo: false,
  },
  {
    name: "search_docs",
    description: "Søk i bibliotekdokumentasjon via Context7. Bruk for å finne korrekt API-bruk.",
    input_schema: {
      type: "object",
      properties: {
        library: { type: "string", description: "Bibliotek/pakke-navn (f.eks. 'encore.dev', 'react')" },
        query: { type: "string", description: "Hva du leter etter i docs" },
      },
      required: ["library", "query"],
    },
    category: "context",
    requiresSandbox: false,
    requiresRepo: false,
  },
  {
    name: "write_file",
    description: "Skriv eller overskriv en fil i sandbox. Oppretter mapper automatisk.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Filsti relativ til sandbox-rot" },
        content: { type: "string", description: "Fullstendig filinnhold" },
      },
      required: ["path", "content"],
    },
    category: "action",
    requiresSandbox: true,
    requiresRepo: false,
  },
  {
    name: "delete_file",
    description: "Slett en fil fra sandbox.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Filsti relativ til sandbox-rot" },
      },
      required: ["path"],
    },
    category: "action",
    requiresSandbox: true,
    requiresRepo: false,
  },
  {
    name: "run_command",
    description: "Kjør en kommando i sandbox (f.eks. 'npm install', 'npx tsc --noEmit').",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Kommandoen som skal kjøres" },
        timeout: { type: "number", description: "Timeout i ms (default: 30000)" },
      },
      required: ["command"],
    },
    category: "action",
    requiresSandbox: true,
    requiresRepo: false,
  },
  {
    name: "validate_code",
    description: "Kjør full validation pipeline: typecheck (tsc) → lint (eslint) → test (npm test). Returnerer resultater for hvert steg.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
    category: "action",
    requiresSandbox: true,
    requiresRepo: false,
  },
  {
    name: "create_pr",
    description: "Opprett en GitHub Pull Request med alle endringer fra sandbox.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "PR-tittel" },
        description: { type: "string", description: "PR-beskrivelse (markdown)" },
        branch: { type: "string", description: "Branch-navn (default: auto-generert)" },
      },
      required: ["title", "description"],
    },
    category: "completion",
    requiresSandbox: true,
    requiresRepo: true,
  },
  {
    name: "submit_review",
    description: "Send koden til bruker-review. Agenten pauser til brukeren godkjenner eller ber om endringer.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Oppsummering av hva som ble bygd" },
        filesChanged: { type: "array", items: { type: "string" }, description: "Liste med endrede filstier" },
      },
      required: ["summary"],
    },
    category: "completion",
    requiresSandbox: true,
    requiresRepo: false,
  },
  {
    name: "store_memory",
    description: "Lagre et minne for fremtidige oppgaver. Bruk for viktige beslutninger, patterns, eller feilløsninger.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Hva som skal huskes" },
        category: { type: "string", enum: ["general", "skill", "task", "error_pattern", "decision"], description: "Minnekategori" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for fremtidig søk" },
      },
      required: ["content", "category"],
    },
    category: "completion",
    requiresSandbox: false,
    requiresRepo: false,
  },
  {
    name: "report_progress",
    description: "Send en statusmelding til brukeren. Bruk for å rapportere fremgang underveis.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Statusmelding" },
        phase: { type: "string", enum: ["analyzing", "planning", "building", "testing", "reviewing", "completing"], description: "Hvilken fase agenten er i" },
      },
      required: ["message"],
    },
    category: "completion",
    requiresSandbox: false,
    requiresRepo: false,
  },
  {
    name: "update_task_status",
    description: "Oppdater status på en oppgave i tasks-service.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["in_progress", "in_review", "done", "blocked"], description: "Ny status" },
        errorMessage: { type: "string", description: "Feilmelding (for blocked)" },
      },
      required: ["status"],
    },
    category: "action",
    requiresSandbox: false,
    requiresRepo: false,
  },
];
```

### Fase 2: Tool executor (ai/agent-tool-executor.ts)

**Ny fil:** `ai/agent-tool-executor.ts`

Utfører agent-tools mot riktig service. Tilsvarer `executeToolCall()` i chat, men for agent-kontekst:

```typescript
import { github, memory, sandbox, tasks, agent as agentClient, docs } from "~encore/clients";

interface ToolContext {
  repoOwner: string;
  repoName: string;
  sandboxId?: string;
  taskId: string;
  userId: string;
}

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: string; error?: boolean }> {
  switch (name) {
    case "read_project_tree": {
      const tree = await github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName });
      return { result: tree.tree.join("\n") };
    }
    case "read_file": {
      const file = await github.getFile({ owner: ctx.repoOwner, repo: ctx.repoName, path: input.path as string });
      return { result: file.content || "" };
    }
    case "search_code": {
      const tree = await github.getTree({ owner: ctx.repoOwner, repo: ctx.repoName });
      const relevant = await github.findRelevantFiles({ owner: ctx.repoOwner, repo: ctx.repoName, taskDescription: input.query as string, tree: tree.tree });
      return { result: relevant.paths.join("\n") };
    }
    case "search_memory": {
      const results = await memory.search({ query: input.query as string, category: input.category as string, limit: 10 });
      return { result: results.memories.map(m => m.content).join("\n---\n") };
    }
    case "write_file": {
      if (!ctx.sandboxId) return { result: "No sandbox available", error: true };
      await sandbox.writeFile({ sandboxId: ctx.sandboxId, path: input.path as string, content: input.content as string });
      return { result: `File written: ${input.path}` };
    }
    case "run_command": {
      if (!ctx.sandboxId) return { result: "No sandbox available", error: true };
      const cmdResult = await sandbox.runCommand({ sandboxId: ctx.sandboxId, command: input.command as string });
      return { result: cmdResult.output || cmdResult.error || "OK" };
    }
    case "validate_code": {
      if (!ctx.sandboxId) return { result: "No sandbox available", error: true };
      const valResult = await sandbox.validate({ sandboxId: ctx.sandboxId });
      const steps = valResult.steps.map(s => `${s.name}: ${s.passed ? "PASS" : "FAIL"} ${s.output || ""}`).join("\n");
      return { result: `Validation ${valResult.passed ? "PASSED" : "FAILED"}:\n${steps}` };
    }
    case "report_progress": {
      // Delegerer til agent report-system
      return { result: "Progress reported" };
    }
    // ... etc for alle tools
    default: {
      // Check MCP tools
      if (name.startsWith("mcp_")) {
        const parts = name.split("_");
        const serverName = parts[1];
        const toolName = parts.slice(2).join("_");
        const mcpResult = await (await import("~encore/clients")).mcp.callTool({ serverName, toolName, args: input });
        return { result: mcpResult.result.content.map((c: any) => c.text ?? "").join("\n") };
      }
      return { result: `Unknown tool: ${name}`, error: true };
    }
  }
}
```

### Fase 3: Agent loop med tool-use (agent/tool-loop.ts)

**Ny fil:** `agent/tool-loop.ts`

Erstatter den hardkodede executeTask-flyten med en tool-use-drevet loop:

```typescript
import { callWithTools } from "../ai/tools"; // Fra Sprint 6.25
import { AGENT_TOOLS } from "../ai/agent-tools";
import { executeAgentTool } from "../ai/agent-tool-executor";
import { getActiveToolsForAI } from "../mcp/router"; // MCP tools

const MAX_AGENT_ITERATIONS = 50;
const MAX_TOKENS_PER_CALL = 8192;

export interface AgentLoopOptions {
  taskDescription: string;
  repoOwner: string;
  repoName: string;
  sandboxId?: string;
  taskId: string;
  userId: string;
  model: string;
  initialContext?: string; // Forhåndslastet kontekst (tree, memory, etc.)
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  // 1. Samle tilgjengelige tools
  const staticTools = AGENT_TOOLS.filter(t => {
    if (t.requiresSandbox && !options.sandboxId) return false;
    if (t.requiresRepo && !options.repoName) return false;
    return true;
  });

  // MCP tools (allerede formatert for AI)
  const mcpTools = getActiveToolsForAI();

  const allTools = [...staticTools, ...mcpTools];

  // 2. System prompt for agent
  const systemPrompt = buildAgentSystemPrompt(options);

  // 3. Bygg initial melding
  const messages = [{
    role: "user" as const,
    content: buildInitialMessage(options),
  }];

  // 4. Tool-use loop
  const toolContext: ToolContext = {
    repoOwner: options.repoOwner,
    repoName: options.repoName,
    sandboxId: options.sandboxId,
    taskId: options.taskId,
    userId: options.userId,
  };

  // callWithTools fra Sprint 6.25 håndterer allerede tool-loopen!
  // Vi trenger bare å mate inn agent-tools i stedet for chat-tools,
  // og bruke executeAgentTool i stedet for executeToolCall.

  const result = await callWithTools({
    model: options.model,
    system: systemPrompt,
    messages,
    maxTokens: MAX_TOKENS_PER_CALL,
    tools: allTools,
    executeToolFn: executeAgentTool, // Injisert tool-executor
    toolContext,
    maxIterations: MAX_AGENT_ITERATIONS,
  });

  return {
    success: !result.content.includes("FAILED"),
    filesChanged: extractFilesChanged(result),
    toolsUsed: result.toolsUsed,
    totalCost: result.costEstimate.totalCost,
    totalTokens: result.tokensUsed,
  };
}
```

### Fase 4: Koble ny loop til agent/agent.ts

`executeTask()` endres fra hardkodet flyt til:

```typescript
export async function executeTask(ctx: TaskContext, options?: ExecuteTaskOptions): Promise<ExecuteTaskResult> {
  // 1. Les task (beholdes — trenger taskId for å starte)
  const task = await readTaskDescription(ctx, options);

  // 2. Opprett sandbox (beholdes — agenten trenger et arbeidsområde)
  const sandboxId = await createSandbox(ctx);

  // 3. Kjør agent loop — AI bestemmer resten
  const result = await runAgentLoop({
    taskDescription: task.description,
    repoOwner: ctx.repoOwner,
    repoName: ctx.repoName,
    sandboxId,
    taskId: ctx.taskId,
    userId: ctx.userId,
    model: selectOptimalModel(task.complexity),
    initialContext: task.context, // Eventuell forhåndslastet kontekst
  });

  // 4. Cleanup
  if (!result.success) {
    await sandbox.destroy({ sandboxId });
  }

  return result;
}
```

---

## Migrasjonsstrategi — gradvis overgang

### Steg 1: Bygg tool-infrastrukturen (agent-tools.ts, agent-tool-executor.ts)
- Definer alle tools
- Implementer executeAgentTool med kall til eksisterende services
- Test hver tool isolert

### Steg 2: Utvid callWithTools (fra Sprint 6.25)
- Legg til `executeToolFn`-parameter (injiserbar tool-executor)
- Legg til `toolContext`-parameter
- Chat bruker fortsatt `executeToolCall`, agent bruker `executeAgentTool`
- Legg til `maxIterations`-parameter (chat: 10, agent: 50)

### Steg 3: Bygg agent-loop (tool-loop.ts)
- Implementer `runAgentLoop`
- Test med enkle oppgaver (les fil, skriv fil, valider)

### Steg 4: Feature-flag overgang
**VIKTIG:** IKKE bak et feature flag. I stedet:
- Ny agent-loop erstatter gammel direkte
- Gammel kode fjernes etterpå
- Hvis noe feiler, git revert — ikke feature flags som aldri blir fjernet

### Steg 5: Rydd opp gammel hardkodet flyt
- Fjern buildContext() → erstattes av AI som kaller context-tools selv
- Fjern assessAndRoute() → erstattes av AI som vurderer selv basert på kontekst
- Fjern executePlan() → erstattes av AI som skriver filer og validerer selv
- Behold handleReview() og completeTask() som tools agenten kan kalle

---

## Hva dette gir

### Fordeler
1. **AI velger rekkefølge:** Enkel oppgave? Les én fil, skriv endring, valider, ferdig. Kompleks oppgave? Les 10 filer, sjekk docs, planlegg, bygg fase for fase.
2. **Selvhelbredende:** Validering feiler? AI leser feilen, fikser, kjører på nytt — uten hardkodet retry-logikk.
3. **MCP-tools native:** Nye MCP-servere = nye tools agenten kan bruke umiddelbart.
4. **Lettere å utvide:** Ny capability = ny tool-definisjon + executor case. Ingen endring i agent-loop.
5. **Bedre for andre modeller:** GPT-4o, Gemini osv. kan kjøre agent-loopen fordi tool-use er standardisert (Sprint 6.25).

### Risiko
1. **Token-bruk øker:** AI trenger tools-definisjoner i kontekst (~2000 tokens for 15 tools).
2. **Løping:** AI kan loope unødvendig (les same fil 3 ganger). Mitigering: tool-result caching per sesjon.
3. **Uforutsigbar rekkefølge:** Hardkodet loop er forutsigbar. AI-drevet loop kan gjøre ting i overraskende rekkefølge. Mitigering: God system prompt + safety guards (maks iterasjoner, sandbox isolasjon).

### Tall
- Nåværende agent: ~12 steg, fast rekkefølge, ~5 AI-kall per oppgave
- Ny agent: ~5-50 iterasjoner avhengig av oppgave, AI bestemmer, ~3-20 AI-kall per oppgave
- Enkel oppgave (endre 1 fil): 3-5 iterasjoner (les → skriv → valider → PR)
- Kompleks oppgave (ny feature, 10+ filer): 20-40 iterasjoner

---

## Avhengighet av Sprint 6.25

Sprint 7 KREVER at Sprint 6.25 er ferdig:

1. **`callWithTools` (6.25 Steg 4)** er grunnlaget for agent-loopen. Den håndterer tool-use-cycling uansett provider.
2. **Provider-agnostisk (6.25 Steg 3)** gjør at agent-loopen fungerer med alle providers fra dag 1.
3. **Feature flags fjernet (6.25 Steg 6)** betyr at MCP tools er alltid tilgjengelige for agenten.
4. **`ai/tools.ts` (6.25 Steg 4)** er filen der `callWithTools` bor — agent-tools utvider dette.

---

## Filstruktur etter Sprint 7

```
ai/
  types.ts              (Sprint 6.25)
  prompts.ts            (Sprint 6.25)
  call.ts               (Sprint 6.25 — provider-registry)
  tools.ts              (Sprint 6.25 — callWithTools, chat tools)
  agent-tools.ts        (Sprint 7 — agent tool definitions)
  agent-tool-executor.ts (Sprint 7 — tool execution logic)
  agent-prompts.ts      (Sprint 7 — agent-spesifikke system prompts)
  router.ts             (eksisterende)
  provider-registry.ts  (eksisterende, uten feature flag)
  providers/            (eksisterende)
  sanitize.ts           (eksisterende)
  sub-agents.ts         (eksisterende)
  orchestrate-sub-agents.ts (eksisterende)
  ai.ts                 (14 endepunkter)

agent/
  agent.ts              (forenklet — kaller runAgentLoop)
  tool-loop.ts          (Sprint 7 — AI-drevet agent loop)
  context-builder.ts    (UTGÅR gradvis — erstattes av context-tools)
  confidence.ts         (UTGÅR gradvis — AI vurderer selv)
  execution.ts          (UTGÅR gradvis — AI bygger selv via tools)
  review-handler.ts     (beholdes som tool)
  completion.ts         (beholdes som tool)
```

## Estimert tid
- Fase 1 (tool-definisjon): ~2 timer
- Fase 2 (callWithTools-utvidelse): ~2 timer
- Fase 3 (agent-loop): ~4 timer
- Fase 4 (kobling): ~2 timer
- Fase 5 (opprydding): ~2 timer
- Testing: ~3 timer
- **Total: ~15 timer**

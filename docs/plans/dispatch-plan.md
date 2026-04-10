# TheFold — Dispatch Kjøreplan

Kort, nummererte kommandoer du sender fra telefonen. Hver kommando er selvstendig — Claude leser kontekst fra denne filen og kodebasen.

---

## Fullført

- **Sprint 6.25** — ai.ts restrukturering + multi-provider aktivering (7 steg, 7 commits)
- **Sprint 6.25b** — Prompt cleanup, alle system prompts til engelsk (3 commits)
- **D1–D3** — Ferdig

---

## Sprint 7 — Agent Tool-Use Architecture

Les alltid `docs/plans/sprint-7-agent-tools.md` for full kontekst.

### D4: agent/agent-tools.ts — Tool definitions + engelsk
```
Opprett ny fil: agent/agent-tools.ts

Definer AgentTool interface og AGENT_TOOLS array med 15 tools i 4 kategorier.
ALLE descriptions på engelsk (Sprint 6.25b-prinsippet: engelsk for AI-resonnering).

Interface:
  AgentTool { name, description, input_schema, category: "context"|"action"|"completion"|"mcp", requiresSandbox: boolean, requiresRepo: boolean }

Context tools (requiresRepo: true, requiresSandbox: false):
  - read_project_tree: "Read the file tree from the GitHub repository. Returns list of file paths."
  - read_file: "Read the content of a specific file from the repository."
  - search_code: "Search the codebase by filename or content. Returns matching file paths."
  - search_memory: "Search TheFold's memory for relevant context from previous tasks."
  - search_docs: "Search library documentation via Context7 for correct API usage."
  - search_skills: "Search for specialized skills/context relevant to the current task."

Action tools (requiresSandbox: true):
  - write_file: "Write or overwrite a file in the sandbox. Creates directories automatically."
  - delete_file: "Delete a file from the sandbox."
  - run_command: "Run a command in the sandbox (e.g. 'npm install', 'npx tsc --noEmit')."
  - validate_code: "Run the full validation pipeline: typecheck → lint → test. Returns results per step."
  - update_task_status: "Update the status of a task." (requiresSandbox: false)

Completion tools:
  - create_pr: "Create a GitHub Pull Request with all changes from the sandbox." (requiresSandbox: true, requiresRepo: true)
  - submit_review: "Submit the code for user review. The agent pauses until the user approves or requests changes." (requiresSandbox: true)
  - store_memory: "Store a memory for future tasks. Use for important decisions, patterns, or error resolutions." (requiresSandbox: false)
  - report_progress: "Send a status message to the user." (requiresSandbox: false)

Eksporter: AgentTool interface, AGENT_TOOLS array, getAvailableTools(ctx) helper som filtrerer basert på sandbox/repo tilgjengelighet.

Kopier input_schema-mønsteret fra sprint-7-agent-tools.md men med engelske descriptions.

Commit: "feat: add agent tool definitions (Sprint 7 D4)"
```

### D5: agent/agent-tool-executor.ts — Tool executor
```
Opprett ny fil: agent/agent-tool-executor.ts

Importerer services via ~encore/clients: github, memory, sandbox, tasks, skills, mcp, docs.

Definerer:
  ToolContext { repoOwner, repoName, sandboxId?, taskId, userId }
  ToolResult { result: string, error?: boolean }

Eksporterer:
  executeAgentTool(name: string, input: Record<string,unknown>, ctx: ToolContext): Promise<ToolResult>

Switch-case for alle 15 tools. Viktige detaljer:
  - read_project_tree → github.getTree({ owner, repo })
  - read_file → github.getFile({ owner, repo, path })
  - search_code → github.findRelevantFiles({ owner, repo, taskDescription: query, tree })
  - search_memory → memory.search({ query, category, limit: 10 })
  - search_docs → docs.lookupDocs({ library, query }) (sjekk at docs-servicen har dette endpointet)
  - search_skills → skills.resolve({ context: { task: query, userId, totalTokenBudget: 4000, taskType } }) — returner injectedPrompt
  - write_file → sandbox.writeFile({ sandboxId, path, content })
  - delete_file → sandbox.deleteFile({ sandboxId, path })
  - run_command → sandbox.runCommand({ sandboxId, command })
  - validate_code → sandbox.validate({ sandboxId })
  - update_task_status → tasks.updateStatus({ id: ctx.taskId, status })
  - create_pr → github.createPR (sjekk faktisk endpoint-signatur i github/github.ts)
  - submit_review → agent.submitReviewInternal (sjekk faktisk endpoint i agent/review.ts)
  - store_memory → memory.store({ content, category, tags, repo: ctx.repoName })
  - report_progress → returnerer "Progress reported" (pub/sub håndteres av kaller)
  - mcp_* prefix → mcp.callTool({ serverName, toolName, args }) (kopier mønster fra ai/tools.ts linje 472-509)
  - default → { result: "Unknown tool: ${name}", error: true }

Alle tool-kall i try/catch som returnerer { result: error.message, error: true } ved feil.

For docs-endpoint: les docs/docs.ts for å finne riktig endpointnavn og signatur.
For github.createPR: les github/github.ts for signatur.
For agent.submitReviewInternal: les agent/review.ts for signatur.

Commit: "feat: add agent tool executor (Sprint 7 D5)"
```

### D6: Refaktorer callWithTools + agent tool-loop
```
To endringer i denne dispatch:

DEL A — Refaktorer ai/tools.ts callAnthropicWithToolsSDK:
Legg til valgfrie parametere i ToolCallOptions:
  executeToolFn?: (name: string, input: Record<string,unknown>, ctx: any) => Promise<{result: string, error?: boolean}>
  toolContext?: Record<string, unknown>
  maxIterations?: number

I callAnthropicWithToolsSDK:
  - MAX_TOOL_LOOPS = options.maxIterations || 10
  - Når executeToolFn finnes OG toolName IKKE starter med "mcp_":
    - Kall options.executeToolFn(toolName, toolInput, options.toolContext) i stedet for executeToolCall()
    - Push resultatet som tool_result
  - Behold eksisterende MCP-logikk og chat-spesifikk logikk (lastCreatedTaskId, duplicate create_task block) KUN når executeToolFn IKKE er satt
  - "Beklager, for mange verktøy-kall" → "Max tool iterations reached. Try a simpler request."

Dette er bakoverkompatibelt: chat kaller uten executeToolFn → eksisterende oppførsel.

DEL B — Opprett agent/tool-loop.ts:
Importerer: callWithTools fra ai/tools, AGENT_TOOLS fra agent/agent-tools, executeAgentTool fra agent/agent-tool-executor, getActiveToolsForAI fra mcp/router, BASE_RULES fra ai/prompts.

Eksporterer:
  AgentLoopOptions { taskDescription, repoOwner, repoName, sandboxId?, taskId, userId, model, initialContext? }
  AgentLoopResult { success, filesChanged: string[], toolsUsed: string[], totalCost, totalTokens, finalMessage }
  runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult>

runAgentLoop gjør:
1. Filtrer AGENT_TOOLS basert på sandboxId/repoName tilgjengelighet (bruk getAvailableTools fra D4)
2. Hent MCP tools via getActiveToolsForAI() — merge med agent tools
3. Bygg agent system prompt (engelsk):
   "You are TheFold's autonomous agent executing a development task.
    You have tools to read code, write files, run commands, and validate.
    Work step by step: understand the task → gather context → plan → implement → validate → submit for review.
    When validation fails, read the errors, fix the code, and validate again.
    When you are done, use submit_review to send your work for human review.
    ${BASE_RULES}"
4. Initial user message: options.taskDescription + (options.initialContext || "")
5. Kall callWithTools med:
   - tools: allTools
   - executeToolFn: executeAgentTool
   - toolContext: { repoOwner, repoName, sandboxId, taskId, userId }
   - maxIterations: 30
6. Parse resultat → AgentLoopResult

Commit: "feat: add agent tool-use loop with injectable executor (Sprint 7 D6)"
```

### D7: Koble agent loop til executeTask
```
Les agent/agent.ts og agent/execution.ts.

Opprett en ny funksjon i agent/execution.ts:
  executeWithToolLoop(ctx, tracker, helpers, options): Promise<ExecutionResult>

Denne funksjonen:
1. Oppretter sandbox via sandbox.create()
2. Kloner repo inn i sandbox (sjekk eksisterende sandbox-logikk i execution.ts)
3. Kaller runAgentLoop() fra agent/tool-loop.ts
4. Mapper AgentLoopResult → ExecutionResult (filesChanged, sandboxId, success, costUsd, tokensUsed)
5. Ved feil: returnerer ExecutionResult med success=false og errorMessage

I executePlan() (execution.ts), legg til en sjekk HELT ØVERST:
  const useToolLoop = ctx.toolLoopEnabled ?? false;
  if (useToolLoop) {
    return executeWithToolLoop(ctx, tracker, helpers, options);
  }

I AgentExecutionContext (agent/types.ts), legg til:
  toolLoopEnabled?: boolean;

I agent/agent.ts executeTask(), sett ctx.toolLoopEnabled = false (hardkodet for nå).
Kommentar: "Set to true to use AI-driven tool loop instead of hardcoded plan→build→validate flow"

IKKE aktiver ennå — dette er infrastruktur. Manuell testing via å endre til true.

Commit: "feat: wire agent tool loop into executeTask (Sprint 7 D7)"
```

### D8: Skills som agent-tool + opprydding
```
To deler:

DEL A — Forbedre search_skills i agent-tool-executor.ts:
Nåværende search_skills kaller skills.resolve(). Utvid:
1. Kall skills.resolve() med keywords fra query, taskType fra input
2. Returner formatert resultat: skill-navn, kort beskrivelse, promptFragment (trimmet til 2000 tokens per skill)
3. Legg til activate_skill tool i agent-tools.ts:
   "activate_skill": "Load a specific skill's full context for use in the current task."
   Input: { skillId: string }
   Kaller skills.getSkill({ id }) og returnerer full promptFragment

DEL B — Oppdater docs og dispatch-plan:
1. Oppdater CLAUDE.md med ny Sprint 7-seksjon: agent tool-loop arkitektur, nye filer, toolLoopEnabled flag
2. Oppdater GRUNNMUR-STATUS.md hvis den finnes
3. Kjør tsc --noEmit — fiks eventuelle feil
4. Oppdater dispatch-plan.md: marker D4-D8 som fullført

Commit: "feat: skills as agent tool + docs update (Sprint 7 D8)"
```

---

## Etter Sprint 7

### D9: Testing og aktivering (fremtidig)
```
Sett toolLoopEnabled = true i agent.ts. Test med en enkel oppgave (opprett en fil, valider den). Verifiser at agenten bruker tools riktig: read_project_tree → write_file → validate_code → submit_review. Fiks eventuelle problemer. Commit: "feat: enable agent tool loop"
```

### D10: Fjern gammel hardkodet flyt (fremtidig)
```
Når tool-loopen er verifisert stabilt: fjern den gamle executePlan-flyten, buildContext, assessAndRoute. Behold handleReview og completeTask som tools. Commit: "chore: remove legacy hardcoded agent flow"
```

---

## Dispatch Tips

- Send KUN "Kjør D4", "Kjør D5" osv. fra telefonen
- Hver D-kommando er selvstendig — Claude leser denne filen + relevante kodefiler
- **D4–D5** er uavhengige av hverandre (kan kjøres parallelt med to sessions)
- **D6** avhenger av D4 + D5
- **D7** avhenger av D6
- **D8** avhenger av D5 + D7
- Etter hvert steg: Claude committer med angitt melding
- Hvis noe feiler: send "Fiks feil i D[n]"
- Alle descriptions er engelske (Sprint 6.25b-prinsipp)

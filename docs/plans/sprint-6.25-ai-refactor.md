# Sprint 6.25 — Restrukturering av ai.ts + multi-provider aktivering

## Risikovurdering

### Hvorfor dette er TRYGT
ai.ts har 14 eksporterte `api()`-endepunkter. Alle andre services (chat, agent, builder, tasks, registry) kaller disse via Encore sin genererte `~encore/clients`-import. Det betyr:

1. **Kontrakten er endepunkt-signaturer.** Så lenge de 14 `export const X = api(...)` beholder NØYAKTIG samme path, method, request-type og response-type, kan ingen kaller merke endringen.
2. **Interne funksjoner er usynlige.** `callAI()`, `callAnthropic()`, `callOpenAI()`, `callMoonshot()`, `buildSystemPromptWithPipeline()`, `callAnthropicWithTools()`, `CHAT_TOOLS`, `CONTEXT_PROMPTS`, `BASE_RULES` — ingen av disse importeres av noen annen service. De er private til ai-servicen.
3. **Encore-begrensning:** Kun filer i `ai/`-mappen kan importere fra hverandre med relative paths. Andre services MÅ gå via `~encore/clients`. Så det er fysisk umulig at noe utenfor `ai/` importerer interne funksjoner.

### Eneste reelle risiko
- **Sirkulære imports** — Encore kan klage hvis nye filer i `ai/` importerer hverandre feil. Løsning: Strict one-way dependency order (se under).
- **Runtime-feil** — Hvis en utflyttet funksjon ikke finner en secret/import den trenger. Løsning: Hvert steg testes med `encore run` + type check.
- **Merge-konflikter** — Hvis Sprint 6.24 har ucommittede endringer. Løsning: Commit 6.24 først.
- **Streaming-regression** — Sprint 6.24 fikset streaming for Anthropic. Ny `callAI` via provider-registry bruker `fetch()`. Løsning: Anthropic-stien i `callAI` bruker fortsatt SDK med streaming, andre providers bruker fetch.

### Tallene
| Hva | Linjer i ai.ts | Risiko for ekstern breakage |
|-----|----------------|---------------------------|
| Typer/interfaces (linje 22-131) | ~110 | NULL — re-export fra ai.ts |
| Provider-routing: callAI, callAnthropic, callOpenAI, callMoonshot (linje 134-431) | ~300 | NULL — kun brukt internt |
| Token-tracking (linje 434-450) | ~17 | NULL — kun brukt internt |
| System-prompts: BASE_RULES, CONTEXT_PROMPTS, getDirectChatPrompt (linje 452-694) | ~243 | NULL — kun brukt internt |
| Skills-pipeline (linje 696-812) | ~117 | NULL — kun brukt internt |
| Chat tool-use: CHAT_TOOLS, executeToolCall, callAnthropicWithTools (linje 814-1377) | ~564 | NULL — kun brukt internt |
| 14 api()-endepunkter (linje 1379-2756) | ~1377 | **DISSE FLYTTES IKKE** — de forblir i ai.ts |

**Konklusjon:** ~1351 linjer flyttes ut + provider-systemet kobles inn. Filen krymper fra 2756 til ~1400 linjer.

---

## Eksisterende filer i ai/ (referanse)
Filer vi BRUKER men ikke restrukturerer:
- `router.ts` — selectOptimalModel, getUpgradeModel, estimateCost (9.4K)
- `providers.ts` — CRUD for provider/model-system (8.1K)
- `provider-interface.ts` — AIProviderAdapter interface (2.0K) — **KOBLES INN i Steg 3**
- `provider-registry.ts` — Provider registry med caching (5.2K) — **KOBLES INN i Steg 3**
- `providers/anthropic.ts`, `openai.ts`, `openrouter.ts`, `fireworks.ts` — **KOBLES INN i Steg 3**
- `sanitize.ts` — Input sanitization (1.9K)
- `sub-agents.ts` — Sub-agent types (3.8K)
- `orchestrate-sub-agents.ts` — Sub-agent execution (16.7K)
- `db.ts` — SQLDatabase reference

---

## Plan: 7 steg, ett om gangen

### STEG 1: ai/types.ts — Flytt alle interfaces og typer
**Ny fil:** `ai/types.ts`
**Flytt fra ai.ts:**
- `ChatMessage` (linje 23-26)
- `ChatRequest` (linje 29-39)
- `ChatResponse` (linje 41-55)
- `AgentThinkRequest` (linje 58-67)
- `FileContent` (linje 69-72)
- `AgentThinkResponse` (linje 74-80)
- `TaskStep` (linje 82-88)
- `CodeGenRequest` (linje 91-98)
- `CodeGenResponse` (linje 100-106)
- `GeneratedFile` (linje 108-112)
- `ReviewRequest` (linje 115-121)
- `ReviewResponse` (linje 123-131)
- `AICallOptions` interface (linje 210-215)
- `AICallResponse` interface (linje 217-227)

**I ai.ts:** Erstatt med `export type { ... } from "./types";` for alle typene som er del av endpoint-signaturer. Interne typer importeres med vanlig `import`.

**Verifisering:** `npx tsc --noEmit` + `encore run` + sjekk at chat-endepunktet svarer.

### STEG 2: ai/prompts.ts — Flytt system-prompts og pipeline
**Ny fil:** `ai/prompts.ts`
**Flytt fra ai.ts:**
- `DEFAULT_AI_NAME` konstant (linje 454)
- `BASE_RULES` konstant (linje 456-475)
- `CONTEXT_PROMPTS` objekt (linje 477-629)
- `getDirectChatPrompt()` funksjon (linje 632-694)
- `CONTEXT_TO_SKILLS_CONTEXT` mapping (linje 698-705)
- `CONTEXT_TO_TASK_PHASE` mapping (linje 707-714)
- `PipelineContext` interface (linje 716-724)
- `PipelineResult` interface (linje 726-731)
- `buildSystemPromptWithPipeline()` funksjon (linje 733-784)
- `buildSystemPromptLegacy()` funksjon (linje 786-801)
- `logSkillResults()` funksjon (linje 803-812)

**Import i prompts.ts:** `import { skills } from "~encore/clients";`

**Export:** Alle funksjoner og konstanter som ai.ts-endepunktene bruker.

**Verifisering:** `npx tsc --noEmit` + `encore run` + test at planTask og chat fungerer.

### STEG 3: ai/call.ts — Provider-kall via provider-registry (KOBLING)
**Ny fil:** `ai/call.ts`

**Denne stegen ERSTATTER de tre hardkodede provider-funksjonene med provider-registry-systemet.**

Flytt fra ai.ts og SKRIV OM:
- `wrapProviderError()` — flyttes uendret (linje 150-199)
- `stripMarkdownJson()` — flyttes uendret (linje 201-208)
- `logTokenUsage()` og `TokenUsage` — flyttes uendret (linje 434-450)
- `DEFAULT_MODEL` konstant — flyttes uendret

**Ny `callAI()` implementasjon:**
```typescript
import { resolveProviderFromModel, buildProviderRequest, transformProviderResponse, getProviderApiKey } from "./provider-registry";
import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";
import { estimateCost, getUpgradeModel } from "./router";
import type { AICallOptions, AICallResponse } from "./types";

const anthropicKey = secret("AnthropicAPIKey");

export async function callAI(options: AICallOptions): Promise<AICallResponse> {
  const providerId = resolveProviderFromModel(options.model);

  // Anthropic: bruk SDK med streaming (Sprint 6.24-krav)
  if (providerId === "anthropic") {
    return callAnthropicStreaming(options);
  }

  // Alle andre providers: bruk provider-registry med fetch()
  const providerReq = buildProviderRequest(providerId, {
    model: options.model,
    system: options.system,
    messages: options.messages,
    maxTokens: options.maxTokens,
  });

  const response = await fetch(providerReq.url, {
    method: "POST",
    headers: providerReq.headers,
    body: JSON.stringify(providerReq.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw wrapProviderError(providerId, options.model, new Error(`${response.status}: ${errorText}`));
  }

  const raw = await response.json();
  const std = transformProviderResponse(providerId, raw, options.model);

  logTokenUsage({
    inputTokens: std.inputTokens,
    outputTokens: std.outputTokens,
    cacheReadTokens: std.cacheReadTokens,
    cacheCreationTokens: std.cacheCreationTokens,
    model: options.model,
    endpoint: providerId,
  });

  return {
    content: std.content,
    tokensUsed: std.tokensUsed,
    stopReason: std.stopReason,
    modelUsed: options.model,
    inputTokens: std.inputTokens,
    outputTokens: std.outputTokens,
    cacheReadTokens: std.cacheReadTokens,
    cacheCreationTokens: std.cacheCreationTokens,
    costEstimate: estimateCost(std.inputTokens, std.outputTokens, options.model),
  };
}

// Anthropic beholder SDK + streaming (Sprint 6.24 fix)
async function callAnthropicStreaming(options: AICallOptions): Promise<AICallResponse> {
  const client = new Anthropic({ apiKey: anthropicKey() });
  // ... eksakt samme kode som nåværende callAnthropic() med streaming ...
}
```

**Hva som FJERNES fra kodebasen:**
- `callOpenAI()` — erstattes av fetch + openai-adapter
- `callMoonshot()` — erstattes av fetch + openai-adapter (moonshot bruker OpenAI-kompatibelt API)
- Hardkodet `getProvider()` med prefix-switch — erstattes av `resolveProviderFromModel()` fra provider-registry

**Hva som BEHOLDES:**
- `callAnthropicStreaming()` — Anthropic MÅ bruke SDK streaming (6.24-krav)
- `callAIWithFallback()` — uendret, kaller `callAI()` som før

**Fjern feature flag:**
I `provider-registry.ts`, fjern `MultiProviderEnabled`-sjekken. Alle registrerte providers er alltid tilgjengelige. Hvilke modeller som faktisk brukes styres av `ai_models`-tabellen i DB. Ingen modeller i DB = ikke brukt. Ferdig.

```typescript
// FØR:
export function getProvider(providerId: string): AIProviderAdapter {
  if (!isMultiProviderEnabled() && providerId !== "anthropic") {
    throw new Error(`Provider "${providerId}" is not available...`);
  }
  // ...
}

// ETTER:
export function getProvider(providerId: string): AIProviderAdapter {
  const provider = PROVIDER_MAP[providerId];
  if (!provider) {
    throw new Error(`Unknown provider: "${providerId}". Available: ${Object.keys(PROVIDER_MAP).join(", ")}`);
  }
  return provider;
}
```

Fjern også `isMultiProviderEnabled()`, `MultiProviderEnabled` secret-import, og `listProviderIds()`-sjekken.

**Import-oppdatering:** `ai/orchestrate-sub-agents.ts` linje 5: `import { callAIWithFallback } from "./ai"` → `import { callAIWithFallback } from "./call"`

**Verifisering:** `npx tsc --noEmit` + `encore run` + test at alle endepunkter som bruker callAIWithFallback fungerer. Test spesifikt at Anthropic-kall bruker streaming.

### STEG 4: ai/tools.ts — Provider-agnostisk tool-use loop
**Ny fil:** `ai/tools.ts`

**Flytt fra ai.ts:**
- `CHAT_TOOLS` array (linje 816-910)
- `executeToolCall()` funksjon (linje 896-1126)
- `enrichTaskWithAI()` funksjon (linje 1128-1147)
- `sanitizeRepoName()` hjelpefunksjon

**`callAnthropicWithTools` → `callWithTools` (provider-agnostisk):**

Nåværende `callAnthropicWithTools` bruker Anthropic SDK direkte. Skriv om til å bruke provider-registry for selve API-kallet, men beholde tool-loopen.

Nøkkelinnsikt: Provider-adapterene normaliserer allerede tool-use:
- `providers/anthropic.ts` transformResponse → `toolUse: [{ id, name, input }]`
- `providers/openai.ts` transformResponse → `toolUse: [{ id, name, input }]` (normalisert fra `tool_calls`)
- `providers/openrouter.ts` transformResponse → `toolUse: [{ id, name, input }]` (normalisert)
- Alle normaliserer `stopReason` til `"tool_use"` uansett provider

Så tool-loopen kan sjekke `response.stopReason === "tool_use"` og bruke `response.toolUse[]` uavhengig av provider:

```typescript
export async function callWithTools(options: ToolCallOptions): Promise<ToolCallResponse> {
  const providerId = resolveProviderFromModel(options.model);

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    // For Anthropic: bruk SDK streaming (tool-use krever det)
    // For andre: bruk provider-registry fetch
    const response = providerId === "anthropic"
      ? await callAnthropicWithToolsSDK(options, messages) // SDK streaming
      : await callProviderWithTools(providerId, options, messages); // fetch

    if (response.stopReason !== "tool_use") {
      return buildFinalResponse(response, allToolsUsed, lastCreatedTaskId);
    }

    // Kjør tools — identisk logikk uansett provider
    const toolResults = await executeTools(response.toolUse, options);
    messages.push(/* assistant response + tool results */);
  }
}
```

**VIKTIG:** For Anthropic beholder vi SDK-basert tool-kall MED streaming, fordi:
1. Anthropic krever streaming for kall over 10 min (Sprint 6.24)
2. Tool-use med SDK håndterer content blocks (text + tool_use) automatisk
3. Andre providers har ikke dette kravet

**Andre providers** bruker `buildProviderRequest()` → `fetch()` → `transformProviderResponse()` som allerede normaliserer tool_calls → toolUse.

Tool-result-formatet tilbake til AI varierer mellom providers:
- **Anthropic:** `{ role: "user", content: [{ type: "tool_result", tool_use_id, content }] }`
- **OpenAI/OpenRouter:** `{ role: "tool", tool_call_id, content }`

Adapteren i `providers/*.ts` bør utvides med en `formatToolResult()` metode, ELLER `callWithTools` håndterer dette med en enkel switch på providerId. Siden det bare er to formater (Anthropic vs OpenAI-kompatibelt), er en switch enklest:

```typescript
function formatToolResults(providerId: string, results: ToolResult[]): MessageContent {
  if (providerId === "anthropic") {
    return { role: "user", content: results.map(r => ({ type: "tool_result", tool_use_id: r.id, content: r.content })) };
  }
  // OpenAI-kompatibelt format (OpenAI, OpenRouter, Fireworks, Moonshot)
  return results.map(r => ({ role: "tool", tool_call_id: r.id, content: r.content }));
}
```

**Export:** `callWithTools`, `CHAT_TOOLS`, `executeToolCall`, `enrichTaskWithAI`

**Verifisering:** `npx tsc --noEmit` + `encore run` + test chat med tool-use (send "list tasks" til chat).

### STEG 5: Rydd ai.ts — fjern gammel kode, legg til imports
**I ai.ts (etter steg 1-4):**
1. Fjern ALL kode som er flyttet (linje 22-1377)
2. Legg til imports øverst:
```typescript
import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { sanitize } from "./sanitize";

// Re-export types for backward compatibility
export type {
  ChatRequest, ChatResponse, AgentThinkRequest, FileContent,
  AgentThinkResponse, TaskStep, CodeGenRequest, CodeGenResponse,
  GeneratedFile, ReviewRequest, ReviewResponse
} from "./types";

import type {
  ChatRequest, ChatResponse, AgentThinkRequest,
  AgentThinkResponse, CodeGenRequest, CodeGenResponse,
  ReviewRequest, ReviewResponse
} from "./types";

import { callAIWithFallback, stripMarkdownJson, DEFAULT_MODEL } from "./call";
import { buildSystemPromptWithPipeline, logSkillResults, BASE_RULES, CONTEXT_PROMPTS } from "./prompts";
import { callWithTools, CHAT_TOOLS, enrichTaskWithAI } from "./tools";
```
3. De 14 `export const X = api(...)` endepunktene forblir UENDRET.
4. I chat-endepunktet: erstatt `callAnthropicWithTools(` med `callWithTools(`

**Verifisering:** `npx tsc --noEmit` + `encore run` + kjør fullstendig test.

### STEG 6: Fjern MultiProviderEnabled feature flag
1. I `provider-registry.ts`: Fjern `MultiProviderEnabled` secret, `isMultiProviderEnabled()`, og alle sjekker mot den
2. I `agent/context-builder.ts` (linje 385-388): Fjern `MCPRoutingEnabled`-sjekken som blokkerer MCP tools (denne beholder vi IKKE — se Steg 3.5 i context-builder). MERK: MCPRoutingEnabled er separat fra MultiProviderEnabled. Vurder om den også bør fjernes — MCP er ikke provider-relatert, men samme prinsipp gjelder: ingen installerte servere = ingen tools. Flagget er unødvendig. **FJERN BEGGE.**
3. I `mcp/router.ts` (linje 8-17, 31, 120-124): Fjern `MCPRoutingEnabled` secret og sjekker. `startInstalledServers()` og `routeToolCall()` fungerer alltid.
4. Slett secrets fra Encore config: `MultiProviderEnabled`, `MCPRoutingEnabled`

**Verifisering:** `npx tsc --noEmit` + `encore run` + verifiser at MCP tools vises i agent context uten flag.

### STEG 7: Opprydning og dokumentasjon
1. Oppdater `CLAUDE.md`:
   - Legg til nye filer under Key Files: `ai/types.ts`, `ai/prompts.ts`, `ai/call.ts`, `ai/tools.ts`
   - Oppdater "Dynamic AI Provider & Model System" seksjonen — fjern referanse til MultiProviderEnabled
   - Oppdater MCP-seksjonen — fjern referanse til MCPRoutingEnabled
2. Oppdater `ARKITEKTUR.md` om den finnes
3. Kjør eksisterende tester: `ai/ai.test.ts`, `ai/router.test.ts`, `ai/provider-abstraction.test.ts`
4. Fjern dead code: den gamle `AIProvider` type (`"anthropic" | "openai" | "moonshot"`) i ai.ts erstattes av `resolveProviderFromModel()`

---

## Dependency-rekkefølge (viktig for å unngå sirkulære imports)

```
types.ts             ← ingen imports fra ai/
    ↓
provider-interface.ts ← (eksisterende, urørt)
    ↓
provider-registry.ts  ← importerer provider-interface.ts, providers/*.ts
    ↓
router.ts            ← importerer db.ts (eksisterende, urørt)
    ↓
call.ts              ← importerer types.ts, router.ts, provider-registry.ts
    ↓
prompts.ts           ← importerer types.ts (ingen dependency på call.ts)
    ↓
tools.ts             ← importerer types.ts, call.ts, router.ts, provider-registry.ts
    ↓
ai.ts                ← importerer types.ts, call.ts, prompts.ts, tools.ts
```

Ingen sirkulære avhengigheter. Ren DAG.

---

## Krevde import-oppdateringer

1. **`ai/orchestrate-sub-agents.ts` linje 5:** `import { callAIWithFallback } from "./ai"` → `import { callAIWithFallback } from "./call"`
2. **`ai/provider-registry.ts`:** Fjern `MultiProviderEnabled` secret + isMultiProviderEnabled()
3. **`mcp/router.ts`:** Fjern `MCPRoutingEnabled` secret + isMCPRoutingEnabled()
4. **`agent/context-builder.ts` linje 383-416:** Fjern if/else på MCPRoutingEnabled — bruk alltid "ny sti" (startInstalledServers)
5. **`agent/agent.test.ts` linje 3:** INGEN ENDRING — `planTask` forblir i ai.ts
6. **`ai/ai.test.ts`:** INGEN ENDRING — api()-endepunkter forblir i ai.ts

---

## Hva som IKKE endres i denne sprinten

1. **Ingen endring av endepunkt-signaturer** — request/response-typer er identiske
2. **Ingen endring av endpoint-paths** — `/ai/chat`, `/ai/plan` osv. er uendret
3. **Ingen endringer i andre services' kode** — chat, agent, builder, tasks, registry kaller via `~encore/clients`
4. **Anthropic SDK beholdes for streaming** — andre providers bruker fetch via provider-registry

## Rekkefølge for Claude Code

Hvert steg committes separat:
```
[Sprint 6.25] Steg 1: Flytt types til ai/types.ts
[Sprint 6.25] Steg 2: Flytt prompts til ai/prompts.ts
[Sprint 6.25] Steg 3: Koble provider-registry inn i ai/call.ts, fjern hardkodede provider-funksjoner
[Sprint 6.25] Steg 4: Provider-agnostisk tool-use loop i ai/tools.ts
[Sprint 6.25] Steg 5: Rydd ai.ts, legg til imports fra nye moduler
[Sprint 6.25] Steg 6: Fjern MultiProviderEnabled og MCPRoutingEnabled feature flags
[Sprint 6.25] Steg 7: Oppdater docs, kjør tester
```

Mellom hvert steg: `npx tsc --noEmit` MÅ passere før commit.

## Estimert tid
- Steg 1-2: Mekanisk flytt + imports. ~30 min per steg.
- Steg 3: Provider-registry kobling + Anthropic streaming-sti. ~1 time.
- Steg 4: Tool-use loop omskriving. ~1 time.
- Steg 5: Opprydding. ~20 min.
- Steg 6: Feature flag fjerning. ~30 min.
- Steg 7: Docs + testing. ~30 min.
- **Total: ~4.5 timer**

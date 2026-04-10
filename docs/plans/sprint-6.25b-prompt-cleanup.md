# Sprint 6.25b — Prompt Cleanup

## Prinsipp
- **English** for all system prompts, reasoning instructions, tool descriptions — this is what the AI model uses to think
- **Norwegian** only as an explicit output instruction: "Respond to the user in Norwegian"
- **No role assignments** ("Du er en senior arkitekt") — the skills system handles specialization
- **No fake identity** — the agent is "TheFold", not "Jørgen André"
- User-facing error messages (call.ts) can stay Norwegian — these go to the frontend, not to the AI

## Scope — 4 files, ~25 changes

---

### Fil 1: `ai/prompts.ts` (367 linjer → ~350)

**Endring 1.1 — Fjern DEFAULT_AI_NAME**
```
Linje 8: export const DEFAULT_AI_NAME = "Jørgen André";
→ export const DEFAULT_AI_NAME = "TheFold";
```

**Endring 1.2 — confidence_assessment til engelsk (linje 126-182)**
Hele prompten er norsk. Konverter til engelsk. Fjern rolletildeling.
```
Før:  "Du vurderer din egen evne til a fullfare en oppgave. Svar ALLTID pa norsk."
Etter: "You are assessing your ability to complete a task. Evaluate in context of the repository."
```
Behold JSON-formatet og poengskalaen, men instruksjoner på engelsk.
Fjern "Svar ALLTID pa norsk" — confidence assessment er intern JSON, ingen bruker ser det.

**Endring 1.3 — getDirectChatPrompt() til engelsk (linje 186-247)**
Dette er den store. 62 linjer norsk. Konverter til engelsk med norsk output-instruks.
```
Før:  "Du er ${aiName} — en autonom AI-utviklingsagent bygget med Encore.ts..."
Etter: "You are ${aiName}, an autonomous AI development agent built with Encore.ts..."
```
Legg til én output-linje: `"IMPORTANT: Always respond to the user in Norwegian (norsk). All your messages to the user must be in Norwegian."`

Alle de norske reglene ("Svar ALLTID på norsk", "Bruk ALDRI emojier", etc.) → konverter til engelske instruksjoner:
- "ALDRI bruk **stjerner**" → "Never use markdown formatting — no bold, headers, bullets. Write natural Norwegian prose."
- "Vis ALDRI Task ID" → "Never show Task IDs/UUIDs to the user"
- "Etter create_task: oppsummer..." → "After create_task: summarize in 1-2 sentences, ask if the user wants to start"

Fjern service-listen (17 services) — dette er unødvendig kontekst som spiser tokens. Agenten har tilgang til koden, den trenger ikke en liste.

**Endring 1.4 — Fjern rolletildelinger fra CONTEXT_PROMPTS**
```
agent_planning: "You are planning..." → allerede OK (engelsk, ingen rolle)
agent_coding: "You are generating production code." → OK, men fjern "You are" 
  → "Generate production code. Return ONLY the complete file content."
agent_review: "You are reviewing code you just wrote." → 
  → "Review the code that was just generated. Be honest and critical."
project_decomposition: "You are an experienced technical architect" →
  → "Decompose this project request into atomic, independently executable tasks."
```
Disse er milde — "You are planning" er mer en oppgavebeskrivelse enn en rolle. Men "experienced technical architect" er en unødvendig rolle.

---

### Fil 2: `ai/ai.ts` — Inline prompts (5 steder)

**Endring 2.1 — generateFile system prompt (linje 1172-1174)**
```
Før:  "Du er en kode-generator. Returner KUN filinnholdet uten markdown-blokker..."
Etter: "Generate the requested file. Return ONLY the file content — no markdown blocks, no explanations, no comments about what you're doing. Just raw code."
```
Fjern `Oppgave:` label (norsk) → `Task:`.

**Endring 2.2 — fixFile system prompt (linje 1271)**
```
Før:  "Du er en feilfikser. Du får en fil med TypeScript-feil..."
Etter: "Fix the TypeScript errors in this file. Return the CORRECTED file, complete, without markdown blocks or explanations. Just raw code."
```

**Endring 2.3 — callForExtraction system prompt (linje 1336-1365)**
```
Før:  "Du er en kode-analytiker som identifiserer gjenbrukbare komponenter."
Etter: "Analyze the provided files and identify up to 3 reusable, self-contained components."
```
Hele prompten til engelsk — kriterier, kategorier, JSON-format.

**Endring 2.4 — reviewProject prompt (linje 330-388)**
```
Før:  systemPrompt: "Du er en senior arkitekt som reviewer et komplett prosjekt..."
Etter: "Review this complete project built by an AI agent. Provide a holistic assessment — not per-file, but the project as a whole. Focus on: architecture, code quality, security, testability, maintainability. Respond with valid JSON only."
```
Norske section headers i user prompt:
- "## Alle filer" → "## All Files"
- "## Faser og oppgaver" → "## Phases and Tasks"
- "## Prosjektbeskrivelse" → "## Project Description"
- "## Kostnad" → "## Cost"
- "linjer" → "lines"
- "Filer vist som sammendrag" → "Files shown as summary (token limit)"
- Review-instruksene (linje 372-380) → engelsk

**Endring 2.5 — Repo context injection (linje 48-55)**
```
Før:  "Du jobber i repoet: ${req.repoName}..."
Etter: "You are working in the repository: ${req.repoName}. When the user refers to 'the repo', 'the project', or 'the code', they mean this specific repository."
```
Hele blokken (global-modus, repo-bytte, repo-kontekst) til engelsk.
`"--- REPO-KONTEKST ---"` → `"--- REPOSITORY CONTEXT ---"`

---

### Fil 3: `ai/tools.ts` — Tool descriptions (linje 18-84)

**Endring 3.1 — CHAT_TOOLS descriptions til engelsk**
Tool descriptions brukes av AI-modellen for å velge riktig verktøy. Norsk her er direkte skadelig.
```
create_task:  "Create a new development task..." 
start_task:   "Start a task — the agent begins working..."
list_tasks:   "List tasks for a repository..."
read_file:    "Read a specific file from the repository..."
search_code:  "Search for relevant files in the repository..."
```
Property descriptions inne i input_schema også til engelsk.

**Endring 3.2 — Tool execution error messages**
Feilmeldinger i executeToolCall() som returneres til brukeren via chat → disse KAN forbli norske, men bør flyttes til en konstant-blokk øverst for konsistens. Valgfritt i denne sprinten.

---

### Fil 4: `ai/call.ts` — Error messages (linje 25-74)

**Endring 4.1 — Beholdes som de er**
`wrapProviderError()` returnerer feilmeldinger til frontend/bruker. Disse er allerede korrekt norske user-facing strings. Ikke endre.

---

## Oppsummering av endringer

| Fil | Hva | Linjer | Risiko |
|-----|-----|--------|--------|
| prompts.ts | confidence_assessment → EN, getDirectChatPrompt → EN, fjern Jørgen André, fjern service-liste | ~120 | Lav — kun intern prompt |
| ai.ts | 5 inline prompts → EN, section headers → EN, repo context → EN | ~80 | Lav — ingen kontraktendring |
| tools.ts | CHAT_TOOLS descriptions → EN | ~30 | Lav — tool names uendret |
| call.ts | Ingen endring | 0 | Ingen |

**Total: ~230 linjer endret, 0 kontraktendringer, 0 nye filer**

## Rekkefølge
1. prompts.ts — mest innvirkning, konverter alt
2. ai.ts — inline prompts + section headers  
3. tools.ts — tool descriptions

## Verifisering
- `npx tsc --noEmit` — ingen typefeil (kun string-endringer)
- Manuell test: send en chatmelding, verifiser at AI svarer på norsk men tenker på engelsk
- Verifiser at confidence_assessment returnerer gyldig JSON
- Verifiser at generateFile/fixFile returnerer ren kode uten markdown

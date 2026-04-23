# TheFold Tool-Registry

Dette er den modulære tool-arkitekturen for TheFold. Alle verktøy som AI-en kan kalle (i chat eller agent-modus) er definert her.

## Slik legger du til et nytt verktøy

### Steg 1: Kopier malen

```bash
cp ai/tools/TEMPLATE.ts ai/tools/<kategori>/<verktøy-navn>.ts
```

### Steg 2: Fyll inn metadata + handler

Åpne den nye filen og fyll inn:
- `name` — snake_case unik ID (f.eks. `delete_task`)
- `description` — kort, AI-vennlig beskrivelse
- `category` — én av: task, code, project, review, memory, brain, component, meta
- `inputSchema` — Zod-skjema for input-validering
- `handler` — selve funksjonen som utfører jobben
- `surfaces` — chat, agent, eller begge
- `costHint` — low/medium/high
- `maxCallsPerSession` (valgfritt) — hindrer loop

### Steg 3: Registrer i index.ts

Legg til én linje i `ai/tools/index.ts`:

```ts
import { deleteTaskTool } from "./task/delete-task";

export const toolRegistry = new ToolRegistry([
  // ... eksisterende ...
  deleteTaskTool,
]);
```

### Steg 4: Test

```bash
encore test --include "ai/tools/**"
```

## Kategorier

| Kategori | Når bruk | Eksempler |
|---|---|---|
| `task` | CRUD-operasjoner på oppgaver | create_task, start_task |
| `code` | Lese/søke kildekode | read_file, search_code |
| `project` | Prosjektplan-håndtering | execute_project_plan |
| `review` | Code-review-flyt | respond_to_review |
| `memory` | Aktiv lagring/henting av kunnskap | recall_memory, save_insight |
| `brain` | Mental hygiene | sleep_now, consolidate_memories |
| `component` | Komponent-bibliotek | use_component, save_component |
| `meta` | AI-self-reflection / pause | request_human_clarification |

## Surface-deling

- **Chat-overflate** — verktøy AI bruker i samtale med bruker. Bruker er på andre siden, så vær konservativ.
- **Agent-overflate** — verktøy AI bruker i autonom task-eksekvering. Tryggere å gi mer makt.

Sjekk `types.ts` for hele kontrakten.

## Rate-limiting

Sett `maxCallsPerSession: N` på verktøy som kan misbrukes i loop. F.eks. `save_insight` har maks 3 per session.

## MCP-tools

MCP-server-tools registreres dynamisk ved oppstart via `toolRegistry.registerMcpTools(...)` og fjernes ved nedstenging. De har samme Tool-interface som vanlige tools.

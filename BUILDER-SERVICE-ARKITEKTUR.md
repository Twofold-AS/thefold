# TheFold — Builder Service: Arkitektur & Implementeringsplan

> **Dato:** 14. februar 2026
> **Status:** Ny tjeneste — TheFold sine "hender"
> **Prioritet:** KRITISK — Uten dette er TheFold kun en planlegger, ikke en utvikler

---

## Problemet

TheFold har hjerne (AI), øyne (GitHub/Linear), hukommelse (Memory), kvalitetskontroll (Sandbox), erfaring (Skills) — men **ingen hender**. Agent-loopen i dag gjør dette i steg 6:

```
// agent.ts STEP 6 — Utfør plan i sandbox
for (const step of plan.steps) {
  if (step.action === 'create' || step.action === 'modify') {
    await sandbox.writeFile({ sandboxId, filePath: step.filePath, content: step.content });
  }
}
```

Dette er **ekstremt primitivt**. AI-en genererer *hele filinnholdet i ett kall* og skriver det blindt. Det er som å be en arkitekt tegne et helt hus på én serviett og bygge det uten å se opp.

### Hva mangler:

1. **Prosjektinitialisering** — Kan ikke opprette nye prosjekter (`npm init`, `npx create-next-app`, etc.)
2. **Dependency management** — Kan ikke installere pakker intelligently
3. **Fil-for-fil generering med kontekst** — Genererer alt i ett kall i stedet for fil-for-fil med kontekst fra foregående filer
4. **Iterativ bygging** — Kan ikke bygge → teste → justere → bygge videre
5. **Refactoring** — Kan ikke gjøre targeted edits, bare overskrive hele filer
6. **Multi-file koordinering** — Forstår ikke at endring i A krever endring i B
7. **Kommandokjøring** — Begrenset til sandbox whitelist (npm, npx, node, cat, ls, find)

---

## Løsningen: `builder`-service

En ny Encore.ts-tjeneste som orkestrerer **alt som handler om å faktisk skrive kode**. Builder bruker eksisterende tjenester — den er limet mellom hjernen og hendene.

### Arkitektur-posisjon

```
                    ┌─────────────┐
                    │    agent     │  ← Hjernen (bestemmer HVA)
                    │ Meta-reason  │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │   builder    │  ← Hendene (utfører HVORDAN)
                    │ Orchestrator │
                    │ File-by-file │
                    │ Iterative    │
                    └──┬───┬───┬───┘
                       │   │   │
              ┌────────┘   │   └────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │    ai    │ │  sandbox  │ │  github   │
        │ Generate │ │ Validate  │ │ Read/Push │
        └──────────┘ └──────────┘ └──────────┘
```

Agent sier **"bygg en REST API med disse endepunktene"** → Builder oversetter dette til en sekvens av konkrete handlinger.

---

## Builder Service — Detaljert Design

### Database: `builder_jobs` (PostgreSQL)

```sql
CREATE TABLE builder_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,                    -- Linear task ID
  sandbox_id TEXT,                          -- Aktiv sandbox
  status TEXT DEFAULT 'pending',            -- pending, planning, building, validating, complete, failed
  
  -- Plan fra agent
  plan JSONB NOT NULL,                      -- Strukturert plan fra ai.planTask()
  
  -- Bygging
  build_strategy TEXT DEFAULT 'sequential', -- sequential, scaffold_first, dependency_order
  current_phase TEXT,                       -- init, scaffold, dependencies, implement, integrate, validate
  current_step INT DEFAULT 0,              -- Nåværende steg i plan
  total_steps INT DEFAULT 0,
  
  -- Fil-tracking
  files_written JSONB DEFAULT '[]',         -- [{path, status, attempts, errors}]
  files_validated JSONB DEFAULT '[]',       -- [{path, valid, errors}]
  
  -- Iterasjoner
  build_iterations INT DEFAULT 0,           -- Antall build→validate→fix sykluser
  max_iterations INT DEFAULT 10,            -- Maks iterasjoner
  
  -- Kontekst
  context_window JSONB DEFAULT '{}',        -- Akkumulert kontekst fra ferdige filer
  dependency_graph JSONB DEFAULT '{}',      -- Fil-avhengigheter
  
  -- Kostnader
  total_tokens_used INT DEFAULT 0,
  total_cost_usd DECIMAL DEFAULT 0.0,
  
  -- Tidsporing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE build_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES builder_jobs(id),
  step_number INT NOT NULL,
  phase TEXT NOT NULL,                       -- init, scaffold, dependencies, implement, integrate, validate
  action TEXT NOT NULL,                      -- create_file, modify_file, run_command, install_dep, validate_file
  file_path TEXT,
  
  -- AI-generering
  prompt_context JSONB,                      -- Hva AI fikk som kontekst for denne filen
  ai_model TEXT,                             -- Hvilken modell som genererte
  tokens_used INT DEFAULT 0,
  
  -- Resultat
  status TEXT DEFAULT 'pending',             -- pending, running, success, failed, skipped
  content TEXT,                              -- Generert innhold
  output TEXT,                               -- Kommando-output
  error TEXT,                                -- Feilmelding
  
  -- Validering
  validation_result JSONB,                   -- Resultat fra incremental validation
  fix_attempts INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Endepunkter

| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /builder/start | Intern | Start byggejobb fra agent-plan |
| POST | /builder/status | Intern | Sjekk status på jobb |
| POST | /builder/cancel | Intern | Avbryt pågående jobb |
| GET | /builder/job | Ja | Hent jobb-detaljer (frontend) |
| GET | /builder/jobs | Ja | Liste jobber (frontend) |
| POST | /builder/retry-step | Intern | Retry et feilet steg |

### Byggefaser

Builder kjører en strukturert pipeline:

```
Phase 1: INIT
├── Analyser plan → beregn dependency graph
├── Velg build_strategy basert på oppgavetype
└── Opprett/klargjør sandbox

Phase 2: SCAFFOLD (kun for nye prosjekter)
├── Kjør init-kommandoer (npm init, create-next-app, etc.)
├── Opprett mappestruktur
└── Generer config-filer (tsconfig, eslint, package.json)

Phase 3: DEPENDENCIES
├── Identifiser nødvendige pakker fra plan
├── npm install (batch, ikke én og én)
└── Verifiser at alle deps er tilgjengelig

Phase 4: IMPLEMENT (kjerne — fil-for-fil)
├── Sorter filer etter dependency graph
├── For hver fil:
│   ├── Bygg prompt med:
│   │   ├── Oppgavebeskrivelse (fra plan)
│   │   ├── Prosjektstruktur (fra sandbox)
│   │   ├── Relevante ferdige filer (context_window)
│   │   ├── Skills (fra pipeline)
│   │   ├── Memory (relevante patterns)
│   │   └── Docs (fra Context7)
│   ├── Generer filinnhold via AI
│   ├── Skriv til sandbox
│   ├── Valider inkrementelt
│   ├── Hvis feil → fix-loop (maks 3)
│   └── Legg til i context_window for neste fil
└── Rapport: hvilke filer ok, hvilke feilet

Phase 5: INTEGRATE
├── Full validering (tsc + lint + tests)
├── Hvis feil → identifiser hvilke filer som trenger endring
├── Fix berørte filer (med kontekst fra feilmeldinger)
└── Re-valider (maks 3 iterasjoner)

Phase 6: FINALIZE
├── Review eget arbeid (ai.reviewCode)
├── Generer dokumentasjon/README endringer
└── Rapport klar for agent → PR
```

### Kjernelogikk: Fil-for-fil med kontekst

Det viktigste konseptet: **Hver fil genereres med kunnskap om alle ferdige filer.**

```typescript
// Pseudo-kode for implement-fasen
async function implementPhase(job: BuilderJob): Promise<void> {
  const sortedFiles = topologicalSort(job.plan.steps, job.dependencyGraph);
  const contextWindow: Map<string, string> = new Map();
  
  for (const fileStep of sortedFiles) {
    // 1. Bygg kontekst fra ferdige filer
    const relevantContext = getRelevantContext(fileStep, contextWindow, job.dependencyGraph);
    
    // 2. Hent skills og memory
    const skills = await skills.resolve({ context: fileStep.filePath, taskDescription: job.plan.description });
    const patterns = await memory.searchPatterns({ query: fileStep.description, repo: job.plan.repo });
    
    // 3. Generer fil med full kontekst
    const generated = await ai.generateFile({
      task: job.plan.description,
      fileSpec: fileStep,
      existingFiles: relevantContext,      // ← Ferdige filer som denne avhenger av
      projectStructure: job.scaffoldResult,
      skills: skills.selected,
      patterns: patterns,
      model: job.selectedModel
    });
    
    // 4. Skriv og valider
    await sandbox.writeFile({ sandboxId: job.sandboxId, filePath: fileStep.filePath, content: generated.content });
    const validation = await sandbox.validateIncremental({ sandboxId: job.sandboxId, filePath: fileStep.filePath });
    
    // 5. Fix-loop
    if (!validation.valid) {
      const fixed = await fixFile(job, fileStep, generated.content, validation.errors, 0);
      if (!fixed) {
        job.files_written.push({ path: fileStep.filePath, status: 'failed', errors: validation.errors });
        continue;
      }
    }
    
    // 6. Legg til i context window for neste fil
    contextWindow.set(fileStep.filePath, generated.content);
    job.files_written.push({ path: fileStep.filePath, status: 'success' });
  }
}
```

### Dependency Graph

Builder analyserer planen og bygger en dependency graph:

```typescript
// Eksempel: En Next.js API route avhenger av types og utils
{
  "src/types/user.ts": [],                           // Ingen avhengigheter → bygges først
  "src/lib/db.ts": ["src/types/user.ts"],             // Avhenger av types
  "src/api/users/route.ts": ["src/types/user.ts", "src/lib/db.ts"],  // Avhenger av begge
  "src/app/users/page.tsx": ["src/types/user.ts", "src/api/users/route.ts"]
}
```

AI-en bruker dette for å:
1. Bygge filer i riktig rekkefølge
2. Inkludere riktig kontekst per fil
3. Forstå ripple-effects ved feil

### Build Strategies

| Strategi | Når | Beskrivelse |
|----------|-----|-------------|
| `sequential` | Enkle oppgaver, få filer | Bygg fil-for-fil i plan-rekkefølge |
| `scaffold_first` | Nye prosjekter | Init → config → types → lib → features → tests |
| `dependency_order` | Komplekse endringer | Topologisk sortering basert på imports |

### Ny AI-endepunkt: `ai.generateFile`

Builder trenger et nytt AI-endepunkt optimalisert for fil-generering:

```typescript
// ai/ai.ts — nytt endepunkt
export const generateFile = api(
  { expose: false },
  async (params: {
    task: string;                    // Overordnet oppgavebeskrivelse
    fileSpec: {                      // Spesifikk fil-spesifikasjon
      filePath: string;
      description: string;
      action: 'create' | 'modify';
      existingContent?: string;      // For modify
    };
    existingFiles: Record<string, string>;  // Kontekst fra ferdige filer
    projectStructure: string[];      // Mappestruktur
    skills: SkillFragment[];
    patterns: CodePattern[];
    model?: string;
  }): Promise<{
    content: string;
    tokensUsed: number;
    modelUsed: string;
    costUsd: number;
  }> => {
    // System prompt med skills
    // User prompt med fil-spesifikk kontekst
    // Returnerer KUN filinnholdet (ingen markdown, ingen forklaring)
  }
);
```

### Integrasjon med Agent-loopen

Agent-loopen endres minimalt. STEP 6 erstattes:

```typescript
// FØR (nåværende agent.ts STEP 6):
for (const step of plan.steps) {
  await sandbox.writeFile({ sandboxId, filePath: step.filePath, content: step.content });
}

// ETTER (ny agent.ts STEP 6):
const buildResult = await builder.start({
  taskId: ctx.taskId,
  sandboxId: ctx.sandboxId,
  plan: plan,
  repo: ctx.repo,
  model: ctx.selectedModel
});

// Builder håndterer ALT: fil-for-fil generering, validering, fixing, kontekst
// Agent venter på resultat og håndterer failures som før
```

---

## Oppdatert Tjenestediagram

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   gateway    │  │   frontend   │  │    chat      │
│ Auth (HMAC)  │  │  Next.js 15  │  │ PostgreSQL   │
│ Bearer token │  │  Dashboard   │  │ Pub/Sub      │
└──────┬───────┘  └──────────────┘  └──────┬───────┘
       │                                    │
┌──────┴───────┐  ┌─────────────┐  ┌───────┴──────┐
│    users     │  │     ai      │  │    agent     │
│ OTP auth     │  │ Claude API  │  │ Autonomous   │
│ Preferences  │  │ Multi-model │  │ Meta-reason  │
└──────────────┘  │ Prompt cache│  │ Diagnosis    │
                  └──────┬──────┘  └──────┬───────┘
                         │                │
                  ┌──────┴──────┐  ┌──────┴───────┐
                  │   builder   │  │   linear     │
                  │ Orchestrate │  │ Task sync    │
                  │ File-by-file│  │ Cron         │
                  │ Iterate     │  └──────────────┘
                  └──┬───┬──┬──┘
                     │   │  │
┌──────────────┐  ┌──┴───┘  └──┐  ┌──────────────┐
│   github     │  │  sandbox   │  │   memory     │
│ Repo ops     │  │ Validation │  │ pgvector     │
│ PR creation  │  │ Pipeline   │  │ Decay + code │
└──────────────┘  └────────────┘  └──────────────┘

┌──────────────┐  ┌─────────────┐  ┌──────────────┐
│   skills     │  │   monitor   │  │    cache     │
│ Pipeline     │  │ Health check│  │ PostgreSQL   │
│ Resolve +    │  │ Cron (flag) │  │ Key-value    │
│ Exec + Log   │  │             │  │              │
└──────────────┘  └─────────────┘  └──────────────┘

┌──────────────┐
│    docs      │
│ Context7     │
│ MCP lookup   │
└──────────────┘
```

### Oppdaterte Service-avhengigheter

```
chat → ai, memory, agent (via pub/sub)
agent → ai, builder, github, linear, memory, sandbox, users   ← builder lagt til
builder → ai, sandbox, github, memory, skills, cache           ← NY
ai → skills (for prompt enrichment)
memory → cache (for embedding caching)
github → cache (for repo structure caching)
monitor → sandbox (for running checks)
```

---

## Frontend: Build Progress

Ny komponent for dashboard som viser live byggeprogress:

```
/repo/[name]/builds          — Liste over builder-jobber
/repo/[name]/builds/[jobId]  — Detaljer for en jobb

Viser:
├── Fase-indikator (init → scaffold → deps → implement → integrate → finalize)
├── Fil-liste med status per fil (✅ ✴️ ❌ ⏳)
├── Live log fra nåværende steg
├── Token/kostnads-tracker
├── Dependency graph visualisering
└── Mulighet til å pause/avbryte
```

---

## Sammendrag: Hva Builder Gir TheFold

| Før (uten builder) | Etter (med builder) |
|---------------------|---------------------|
| AI genererer alle filer i ett kall | Fil-for-fil med kontekst fra ferdige filer |
| Blind skriving til sandbox | Skriv → valider → fiks → neste |
| Kan ikke lage nye prosjekter | Full scaffold (npm init, create-next-app, etc.) |
| Ingen dependency management | Smart npm install med pakke-analyse |
| Overskriver hele filer | Targeted edits med eksisterende innhold |
| Ingen forståelse av fil-relasjoner | Dependency graph med topologisk sortering |
| Maks ~5 filer per oppgave | Skalerer til prosjekter med 50+ filer |
| Agent gjør alt i én loop | Agent planlegger, Builder utfører |

**TheFold er ikke lenger bare en planlegger — den er en fullverdig autonom utvikler.**

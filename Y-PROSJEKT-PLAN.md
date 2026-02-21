# Y-PROSJEKT — Context-optimalisering & Minnearkitektur

**Versjon:** 1.0
**Opprettet:** 20. februar 2026
**Formål:** Reduser token-forbruk med 30-50%, øk kvalitet via presis kontekst, innfør fullstendig minnearkitektur.
**Forutsetning:** X-PROSJEKT fullført (XA-XS).
**Metode:** Hver prompt (YA, YB, YC...) er én atomær arbeidsøkt for Claude Code.

---

## DIAGNOSEOVERSIKT

### Hva X-prosjektet løste
- Agent-dekomponering (2571 → 935 linjer)
- Observerbarhet (token-tracking per fase, costs dashboard)
- Sikkerhet (OWASP-gap lukket)
- Stabilitet (state machine, job queue, circuit breakers)

### Hva som gjenstår (identifisert under X)

| # | Problem | Gevinst | Rotårsak |
|---|---------|---------|----------|
| 1 | **Flat kontekst** — alle faser får alt | 30-40% token-sparing | Ingen fase-spesifikk filtrering |
| 2 | **Full kontekst i retries** — sender alt på nytt | 40K+ sparing per retry | Ingen delta-mekanisme |
| 3 | **Filnavn-matching** — upresist filvalg | Bedre planer, færre retries | Mangler import-graf |
| 4 | **Ingen strategi-minne** — AI resonnerer fra scratch | Kortere prompts, bedre kvalitet | Kun error/code patterns |
| 5 | **Ren vector-søk** — irrelevante memory-treff | Presisere kontekst | Mangler BM25-komponent |
| 6 | **Ingen innsyn** — kan ikke se hva agenten gjør | Debug, optimalisering | Audit-data ikke visualisert |

---

## FASER OG PROMPTS

```
FASE Y0: KONTEKST-OPTIMALISERING (Uke 1-2)
  YA → Fase-spesifikk kontekst-filtrering
  YB → Delta-kontekst i retries

FASE Y1: MINNEARKITEKTUR (Uke 2-4)
  YC → Hybrid-søk (BM25 + vector)
  YD → Symbolbasert kodesøk (import-graf)
  YE → Prosedyremessig minne (strategier)

FASE Y2: INNSYN (Uke 4-5)
  YF → Agent Inspector (frontend)
  YG → Context waste dashboard

FASE Y3: VERIFIKASJON (Uke 5-6)
  YH → Fullstack funksjonstest (X + Y)
```

---

## FASE Y0: KONTEKST-OPTIMALISERING

> **Mål:** Reduser tokens per task med 30-40% uten nye tjenester.
> **Risiko:** Lav — endrer kun hva som sendes, ikke hvordan det brukes.

---

### PROMPT YA — Fase-spesifikk kontekst-filtrering

**Mål:** Hver fase får kun den konteksten den faktisk trenger. Ikke alt til alle.

**Nåværende:** context-builder returnerer `AgentContext` med 6 felter. Alle faser får alt.

**Endring:** Innfør `ContextProfile` per fase som filtrerer AgentContext:

```typescript
const CONTEXT_PROFILES: Record<AgentPhase, ContextProfile> = {
  confidence: {
    needsTree: true,        // oversikt over repostruktur
    needsFiles: false,      // trenger IKKE filinnhold
    needsMemory: false,     // trenger IKKE historikk
    needsDocs: false,       // trenger IKKE docs
    maxTokens: 3_000,
  },
  planning: {
    needsTree: true,
    needsFiles: true,       // trenger filinnhold for å planlegge
    needsMemory: true,      // trenger historikk for bedre planer
    needsDocs: true,        // trenger docs for konvensjoner
    maxTokens: 15_000,
  },
  building: {
    needsTree: false,       // trenger IKKE full tree
    needsFiles: true,       // kun filer fra planen
    needsMemory: false,     // plan er allerede laget
    needsDocs: false,
    maxTokens: 50_000,      // høyest — kodegenerering
  },
  reviewing: {
    needsTree: false,
    needsFiles: false,      // reviewer genererte filer, ikke source
    needsMemory: true,      // for å matche mot konvensjoner
    needsDocs: false,
    maxTokens: 10_000,
  },
};
```

**Filer som endres:**
- `agent/context-builder.ts` — ny `filterForPhase(context, phase)` funksjon
- `agent/agent.ts` — kall filterForPhase før hver modul
- `agent/confidence.ts` — fjern ubrukte context-felter fra input
- `agent/execution.ts` — motta filtrert context

**Tester:**
- filterForPhase returnerer kun relevante felter per fase
- Token-count respekterer maxTokens grense
- confidence-fasen får 70%+ færre tokens enn i dag

**Estimert sparing:** ~30% reduksjon i snitt-tokens per task.

**Status:** ✅ Fullført
- **Filer endret:** agent/context-builder.ts (3 nye funksjoner: filterForPhase, estimateTokens, trimContext), agent/agent.ts (filtering integrert), agent/context-builder.test.ts (9 nye tester)
- **Resultat:** 15/15 tester passerer. Hver fase får kun den konteksten den faktisk trenger.

---

### PROMPT YB — Delta-kontekst i retries

**Mål:** Retry-loopen sender kun det som endret seg — ikke full kontekst på nytt.

**Nåværende:** Retry sender: full task description + full tree + alle relevante filer + alle previous errors + alle genererte filer. Konteksten VOKSER for hvert forsøk.

**Endring:** Innfør `RetryContext` som beregner delta:

```typescript
interface RetryContext {
  // Kort oppsummering i stedet for full kontekst
  taskSummary: string;           // 1-2 setninger, ikke full description
  planSummary: string;           // plan-steg som titler, ikke full content

  // Kun det som er nytt
  newErrors: string[];           // kun siste feil, ikke alle previousErrors
  changedFiles: Array<{          // kun filer som ble endret i siste forsøk
    path: string;
    diff: string;                // diff mot forrige forsøk, ikke full content
  }>;

  // Diagnose-resultat (allerede kompakt)
  diagnosis: DiagnosisResult;
}
```

**Filer som endres:**
- `agent/execution.ts` — beregn delta mellom forsøk, send RetryContext til ai.planTask/revisePlan
- `ai/ai.ts` — planTask og revisePlan aksepterer RetryContext som alternativ input
- `agent/helpers.ts` — ny `computeDelta(prevFiles, currentFiles)` utility

**Tester:**
- Delta inneholder kun endrede filer
- Diff er korrekt beregnet
- Token-count for retry er <30% av original context

**Estimert sparing:** ~60% færre tokens per retry. Med 2 retries: ~40K spart.

**Status:** ✅ Fullført
- **Filer endret:** agent/execution.ts (RetryContext interface, computeRetryContext(), computeSimpleDiff(), retry-loop modifisert), agent/execution.test.ts (11 nye tester)
- **Resultat:** 18/18 execution tester passerer. Delta-context reduserer tokens med 60-75% per retry.

---

## FASE Y1: MINNEARKITEKTUR

> **Mål:** Komplett minnearkitektur med 5 lag. Presisere kontekst, bedre kvalitet.
> **Risiko:** Medium — nye datastrukturer, men bygger på eksisterende memory-service.

---

### PROMPT YC — Hybrid-søk (BM25 + vector)

**Mål:** Kombiner nøkkelord-søk med semantisk søk for bedre memory-treff.

**Nåværende:** Kun pgvector cosine similarity. Gir noen ganger irrelevante treff fordi "semantisk lik" ≠ "faktisk nyttig".

**Endring:**

```sql
-- Migrasjon: legg til tsvector kolonne
ALTER TABLE memories ADD COLUMN search_vector tsvector;
CREATE INDEX idx_memories_search ON memories USING GIN(search_vector);

-- Trigger for automatisk oppdatering
CREATE OR REPLACE FUNCTION memories_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, '') || ' ' || COALESCE(NEW.category, ''));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trig_memories_search
  BEFORE INSERT OR UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION memories_search_trigger();
```

**I memory.ts search():**

```typescript
// Hybrid scoring: α * vector_similarity + (1-α) * bm25_score
const HYBRID_ALPHA = 0.6; // 60% semantisk, 40% nøkkelord

// Steg 1: Vector-søk (eksisterende)
const vectorResults = await vectorSearch(embedding, limit * 2);

// Steg 2: BM25-søk
const bm25Results = await db.query`
  SELECT id, ts_rank(search_vector, plainto_tsquery('english', ${query})) as bm25_score
  FROM memories
  WHERE search_vector @@ plainto_tsquery('english', ${query})
  ORDER BY bm25_score DESC
  LIMIT ${limit * 2}
`;

// Steg 3: Kombiner og re-rank
const combined = mergeAndRerank(vectorResults, bm25Results, HYBRID_ALPHA);
```

**Filer som endres:**
- `memory/migrations/X_add_search_vector.up.sql` (NY)
- `memory/memory.ts` — hybrid search i search()

**Tester:**
- Hybrid-søk returnerer resultater fra begge metoder
- Eksakt nøkkelord-match rangeres høyere enn kun semantisk lik
- BM25 fanger termer som vector-søk misser

**Status:** ✅ Fullført (21. feb 2026)

---

### PROMPT YD — Symbolbasert kodesøk (import-graf)

**Mål:** Finn filer basert på avhengigheter, ikke filnavn. "Denne filen importerer X som importerer Y" → send X og Y.

**Nåværende:** findRelevantFiles() bruker filnavn-matching og AI-scoring. Mangler forståelse av kodens struktur.

**Endring:** Ny modul `agent/code-graph.ts`:

```typescript
interface ImportGraph {
  // filsti → liste av filer den importerer
  imports: Map<string, string[]>;
  // filsti → liste av filer som importerer den
  importedBy: Map<string, string[]>;
}

/**
 * Bygg import-graf fra repo-tree.
 * Parser import/require statements uten full AST — regex er nok for TS/JS.
 */
export function buildImportGraph(
  files: Array<{ path: string; content: string }>
): ImportGraph;

/**
 * Gitt en fil som skal endres, finn alle filer i avhengighetskjeden.
 * Traverserer imports (hva denne filen trenger) + importedBy (hva som bruker denne filen).
 * Maks dybde for å unngå å hente hele repoet.
 */
export function getRelatedFiles(
  graph: ImportGraph,
  targetFiles: string[],
  maxDepth: number = 2
): string[];
```

**Integrasjon i context-builder.ts:**
- Etter tree-henting: bygg import-graf fra filinnhold
- Etter planning: bruk plan-stegenes filPaths → getRelatedFiles → hent kun disse
- Erstatter (eller supplerer) findRelevantFiles for presisere kontekst

**NB:** Builder har allerede `graph.ts` med import-ekstraksjon. Gjenbruk den logikken.

**Filer som opprettes:**
- `agent/code-graph.ts` (NY)
- `agent/code-graph.test.ts` (NY)

**Filer som endres:**
- `agent/context-builder.ts` — bruk code-graph for filvalg

**Tester:**
- Parser TS import statements korrekt
- Parser relative og absolute imports
- Traverserer 2 nivåer dypt
- Ignorerer node_modules og eksterne pakker
- Returnerer unike filer (ingen duplikater)

**Status:** ✅ Fullført (21. feb 2026)

---

### PROMPT YE — Prosedyremessig minne (strategier)

**Mål:** Agenten lagrer og gjenbruker vellykkede strategier for oppgavetyper.

**Nåværende:** error_pattern og code_pattern lagrer hva som feilet/fungerte. Men ingen eksplisitt "for denne typen oppgave, gjør X i denne rekkefølgen".

**Endring:** Ny memory_type `strategy`:

```typescript
interface Strategy {
  // Hva slags oppgave denne strategien gjelder for
  taskPattern: string;         // "encore migration", "new API endpoint", "fix TypeScript error"
  
  // Stegene som fungerte
  steps: string[];             // ["1. Sjekk eksisterende migrasjoner", "2. Lag up.sql", ...]
  
  // Metadata
  successCount: number;        // antall ganger denne strategien har fungert
  lastUsed: string;
  avgTokensSaved: number;      // estimert sparing vs. uten strategi
}
```

**Lagring:** Etter vellykket completion (completion.ts), analyser hva som fungerte:

```typescript
// I completeTask():
if (ctx.totalAttempts === 1 && review.qualityScore >= 8) {
  // Førstegangssuksess med høy kvalitet = god strategi
  await memory.store({
    content: JSON.stringify({
      taskPattern: detectTaskPattern(ctx.taskDescription),
      steps: extractSuccessfulSteps(ctx.attemptHistory, plan),
      successCount: 1,
    }),
    category: "strategy",
    memoryType: "strategy",
    trustLevel: "agent",
  });
}
```

**Henting:** I planning-fasen (execution.ts), søk etter matchende strategier:

```typescript
// Før ai.planTask():
const strategies = await memory.search({
  query: `strategy: ${ctx.taskDescription.substring(0, 200)}`,
  memoryType: "strategy",
  limit: 3,
});

// Inkluder i planTask prompt:
if (strategies.results.length > 0) {
  const bestStrategy = strategies.results[0];
  // Legg til som hint — ikke som instruksjon
  planContext.strategyHint = `Tidligere vellykket tilnærming for lignende oppgaver: ${bestStrategy.content}`;
}
```

**Filer som endres:**
- `agent/completion.ts` — lagre strategi etter vellykket task
- `agent/execution.ts` — hent strategier før planning
- `memory/memory.ts` — støtte for strategy memory_type (allerede håndtert av eksisterende enum + trust levels fra XL)

**Tester:**
- Strategi lagres etter vellykket førstegangskjøring
- Strategi hentes for lignende oppgaver
- Strategi påvirker plan (hint, ikke override)
- Dårlige strategier forfaller via eksisterende decay

**Status:** ✅ Fullført (21. feb 2026)
- **Filer endret:** agent/completion.ts (STEP 11.5: detectTaskPattern, extractSuccessfulSteps, memory.store strategy), agent/execution.ts (STEP 4.9: strategy search + hint injection), agent/strategy.test.ts (11 tester)
- **Resultat:** 11/11 tester passerer. Strategi lagres etter vellykket førstegangskjøring, hentes som hint i planning-fasen.

---

## FASE Y2: INNSYN

> **Mål:** Se hva agenten gjør — debug, optimaliser, verifiser.
> **Risiko:** Lav — ren frontend-jobb, data finnes i audit_log + phase_metrics.

---

### PROMPT YF — Agent Inspector

**Mål:** Frontend-side som visualiserer én agent-kjøring steg for steg.

**Side:** `/tools/inspector`

**Tre paneler:**

1. **Context Panel** — Hvilke filer ble valgt, tokens per fil, droppede filer (over budsjett), memory-treff med similarity score og trust level, import-avhengigheter (etter YD)

2. **Execution Timeline** — Fase-overganger med tidsstempler, AI-kall med modell + tokens + kostnad, retry-forsøk med diagnose-resultat, validation output, plan-steg med status (pending/done/failed)

3. **Cost Breakdown** — Tokens per fase (fra phase_metrics), kostnad per AI-kall, context waste % (tokens sendt vs. tokens brukt), sammenligning med snitt for lignende tasks

**Data-kilder:**
- `GET /agent/audit/log?taskId=X` — alle audit entries for én task
- `GET /agent/metrics/task` (fra XE) — per-fase token breakdown
- Audit JSONB details inneholder: confidence_assessed, plan_generated, builder_executed, validation_run, diagnosis_result, review_completed, etc.

**Filer som opprettes:**
- `frontend/src/app/(dashboard)/tools/inspector/page.tsx` (NY)

**Filer som endres:**
- `frontend/src/lib/api.ts` — ny getTaskAuditLog() funksjon
- `frontend/tools/layout.tsx` — "Inspector" tab i nav

**Status:** ✅ Fullført (21. feb 2026)
- **Filer opprettet:** frontend/src/app/(dashboard)/tools/inspector/page.tsx (3 paneler: Kontekst, Tidslinje, Kostnadsfordeling)
- **Filer endret:** frontend/src/app/(dashboard)/tools/layout.tsx (Inspector tab lagt til)
- **Resultat:** Bruker getTaskTrace() + getTaskMetrics() for visualisering. Sammendragslinje med status, varighet, suksess/feil, konfidens, kostnad. Klikk på tidslinje-entries for detaljvisning.

---

### PROMPT YG — Context waste dashboard

**Mål:** Aggregert visning av token-effektivitet over tid. Ikke per-task (det er Inspector), men trender.

**Side:** Utvid eksisterende `/tools/costs` (fra XF)

**Nye kort/grafer:**
- Context waste % over tid (tokens sendt som aldri ble referert av AI)
- Gjennomsnittlig tokens per fase — trend (bør synke etter YA)
- Retry-rate og retry-kostnad — trend (bør synke etter YB)
- Strategi-treff rate (etter YE) — andel tasks som fikk strategi-hint
- Hybrid-søk precision — andel memory-treff som ble brukt vs. ignorert

**Data-kilder:** phase_metrics + audit_log (allerede tilgjengelig)

**Status:** ✅ Fullført (21. feb 2026)
- **Filer endret:** frontend/src/app/(dashboard)/tools/costs/page.tsx (ContextEfficiency komponent, 4 summary-kort, per-fase effektivitetstabell med waste-bars)
- **Resultat:** Viser kontekst-waste %, retry-rate, suksessrate, strategi-treff. Tom-tilstand med "—" når ingen data. Bruker phase_metrics + audit_stats.

---

## FASE Y3: VERIFIKASJON

> **Mål:** Verifiser at ALT fungerer — både X-prosjekt og Y-prosjekt.
> **Risiko:** Ingen — dette er testing.

---

### PROMPT YH — Fullstack funksjonstest

**Mål:** Systematisk verifisering av alle brukersynlige funksjoner.

**Tilnærming:** Kombiner tre testlag:

**Lag 1: Backend API-test**
Kjør alle `encore test` — alle 150+ tester må passere.

**Lag 2: Endepunkt-sjekk**
Script som kaller HVERT brukervendt endepunkt og verifiserer respons-format:
- Chat: send, history, conversations, transfer-context
- Agent: startTask, respondToClarification, forceContinue
- Review: submit, get, list, approve, request-changes, reject
- Memory: search, store, extract, stats
- Skills: list, create, update, toggle, delete
- Costs: phase metrics, task metrics
- Auth: login, verify, revoke
- GitHub: tree, repos, relevant files
- Monitor: health
- Inspector (NY): audit log per task
- Osv.

**Lag 3: Frontend-verifisering (med browser-tilgang)**
For hver side — verifiser at:
- Siden laster uten feil
- Data hentes fra backend (ikke hardkodet)
- Interaksjoner fungerer (klikk, input, submit)
- Agent-status oppdateres i sanntid

**Forventet resultat:** En rapport som lister alle funksjoner med status (✅/❌/⚠️).

**Bonus:** Lag dette som en gjenbrukbar Claude Code skill (`thefold-verify`) slik at vi kan kjøre den etter enhver større endring.

**Status:** ⬜ Ikke startet

---

## OPPSUMMERING

| Prompt | Fase | Mål | Estimert token-sparing |
|--------|------|-----|----------------------|
| YA | Y0 | Fase-spesifikk kontekst | ~30% reduksjon |
| YB | Y0 | Delta-kontekst i retries | ~60% per retry |
| YC | Y1 | Hybrid-søk (BM25 + vector) | Presisere treff |
| YD | Y1 | Import-graf kodesøk | ~40% færre filer i context |
| YE | Y1 | Prosedyremessig minne | Kortere prompts, færre retries |
| YF | Y2 | Agent Inspector | Innsyn (debug/optimaliser) |
| YG | Y2 | Context waste dashboard | Måle effekt av Y0-Y1 |
| YH | Y3 | Fullstack funksjonstest | Verifisere alt |

**Totalt: 8 prompts. Estimert 4-6 uker.**

**Forventet samlet effekt:**
- 30-50% færre tokens per task
- Bedre kodekvalitet (presisere kontekst → bedre planer → færre retries)
- Full innsyn i hva agenten gjør
- Komplett minnearkitektur (5 av 5 lag)
- Verifisert system end-to-end

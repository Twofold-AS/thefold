# TheFold — Masterplan: Komplett utviklingsveikart

> **Versjon:** 1.0 — 2. mars 2026
> **Formål:** Samlet plan som dekker alle utviklingsfaser fra nåværende tilstand til 100% autonom hjerne.
> **Målgruppe:** LLM-reviewer som skal verifisere planen mot eksisterende kodebase.
> **Struktur:** Del A (Sprint 6 — Stabilisering), Del B (Sprint 7–14 — Implementeringsplan), Del C (Sprint 15–25 — Oppgraderingsplan)

---

## Nåværende tilstand — Hva som allerede finnes

Før vi bygger noe nytt, er det kritisk å forstå hva som eksisterer. TheFold har 16+ Encore.ts mikrotjenester og et Next.js 15 frontend. Her er en komplett oversikt over eksisterende infrastruktur som planens sprinter MÅ bygge på — ikke duplisere.

### Eksisterende tjenester

| Tjeneste | Status | Nøkkelfunksjonalitet |
|----------|--------|---------------------|
| `gateway` | 🟢 Aktiv | Auth (Bearer + HMAC), OTP via Resend, token revokering |
| `chat` | 🟢 Aktiv | PostgreSQL-backed meldinger, Pub/Sub, tool-use (5 verktøy), fil-opplasting, prosjektdeteksjon |
| `ai` | 🟢 Aktiv | Multi-provider orkestresjon, DB-drevet modellsystem, prompt caching, diagnose, sub-agenter (6 roller) |
| `agent` | 🟢 Aktiv | 12-stegs autonom utførelsesloop, meta-reasoning, persistent job queue, fase-metrics, dekomponert i moduler |
| `tasks` | 🟢 Aktiv | CRUD, Linear sync, AI planlegging, Pub/Sub events, soft-delete |
| `builder` | 🟢 Aktiv | 6 faser (init→scaffold→deps→implement→integrate→finalize), avhengighetsgraf, Kahn's algoritme, fix-loop |
| `github` | 🟢 Aktiv | Repo-operasjoner via GitHub App, kontekstvindu, PR-opprettelse |
| `sandbox` | 🟢 Aktiv | Dual-mode (filesystem/Docker), validerings-pipeline (tsc+lint+tests), snapshot cache |
| `linear` | 🟢 Aktiv | 5-min polling cron, GraphQL, 7 status-mappinger |
| `memory` | 🟢 Aktiv | Hybrid søk (60% pgvector + 40% BM25/tsvector), temporal decay, code patterns, konsolidering, trust levels |
| `skills` | 🟢 Aktiv | Pipeline engine (resolve→pre-run→post-run→log), kategorier, scope-filter, caching (5min TTL) |
| `registry` | 🟢 Aktiv | Komponentmarkedsplass grunnmur, healing pipeline, fredag 03:00 cron |
| `templates` | 🟢 Aktiv | 5 pre-seeded scaffolds, variabel-substitusjon |
| `mcp` | 🟢 Aktiv | MCP server registry med agent tool awareness |
| `integrations` | 🟢 Aktiv | Slack/Discord toveis via Pub/Sub |
| `monitor` | 🟢 Aktiv | Health checks (4 typer), feature-flagget daglig cron |
| `docs` | 🟢 Aktiv | Context7 MCP for biblioteksdokumentasjon |
| `cache` | 🟢 Aktiv | PostgreSQL key-value, 4 namespaces (embedding/repo/plan/skills) |

### Eksisterende database-tabeller som er relevante for planen

**memory.memories** — Har allerede: `memory_type` (6 typer: general, skill, task, session, error_pattern, decision, strategy), `embedding` (vector(512)), `relevance_score` (decay), `ttl_days`, `pinned`, `consolidated_from`, `superseded_by`, `source_repo`, `tags`, `content_hash` (SHA-256), `trust_level` (user/agent/system), `search_vector` (tsvector med GIN-indeks). Bruker Voyage AI for embeddings (512 dim).

**memory.code_patterns** — Har allerede: `pattern_type`, `problem_description`, `solution_description`, `files_affected`, `code_before/after`, `times_reused`, `confidence_score`, `problem_embedding` (vector(512)), `solution_embedding` (vector(512), UBRUKT i søk), `component_id` (FK til registry), `tags`.

**agent.agent_jobs** — Har allerede: UUID PK, 6 statuser, checkpoint JSONB, cost/tokens tracking, findResumableJobs(), expireOldJobs().

**agent.agent_phase_metrics** — Har allerede: per-fase token/cost/duration tracking, aggregerte summaries, task breakdown.

**builder.builder_jobs + build_steps** — Har allerede: plan JSONB, strategi, phases, cost tracking, avhengighetsgraf.

**skills.skills** — Har allerede: `category`, `tags`, `scope`, `priority`, `confidence_score`, `total_uses`, `last_used_at`. MERK: marketplace-kolonner (marketplace_id, version, author_id, depends_on, conflicts_with) er FJERNET i migrasjon 8.

**monitor.health_checks** — Har allerede: 4 check-typer implementert. `health_rules`-tabellen eksisterer men brukes ALDRI i kode.

### Eksisterende agent-loop (12 steg)

```
STEP 1:   Opprinnelse (Linear/chat/tasks)
STEP 2:   GitHub tree + filhenting (context-builder.ts)
STEP 3:   Memory search + docs lookup
STEP 3.5: MCP installed tools
STEP 4:   Confidence assessment + complexity
STEP 4.5: Modellvalg (auto/manuell via router.ts)
STEP 4.9: Strategy hints fra memory (YE)
STEP 5:   Planlegging (ai.planTask())
STEP 5.5: Sub-agenter (valgfritt, kompleksitet >= 5)
STEP 6:   Building (builder.start() med 6 faser)
STEP 7:   Validering + diagnose + retry (maks 5 forsøk)
STEP 8:   Review gate (alltid) — bruker godkjenner/avslår
STEP 9:   PR-opprettelse via GitHub
STEP 10:  Linear-oppdatering
STEP 11:  Memory lagring (fire-and-forget)
STEP 11.5: Procedural memory / strategy (YE)
STEP 12:  Sandbox destroy + sluttrapport
```

### Eksisterende grunnmur som KAN aktiveres (ikke nybygg)

| Grunnmur | Hvor | Status | Aktivering |
|----------|------|--------|------------|
| `health_rules` tabell | monitor/migrations | 🔴 Aldri brukt | Implementer terskellogikk |
| `solution_embedding` | memory/code_patterns | 🔴 Aldri brukt i søk | Implementer solution-similarity search |
| `bugs_prevented` | memory/code_patterns | 🔴 Aldri inkrementert | Implementer telling |
| Auto-resume etter krasj | agent/agent_jobs | 🔴 Bevisst utelatt | Krever full context-rebuild |
| Skill-hierarki | skills (parent_skill_id FJERNET) | ❌ Kolonner fjernet | Krever ny migrasjon |
| Registry auto-extraction | registry/extractor.ts | 🟡 Stub | Implementer AI-ekstraksjon |

### VIKTIG: Embedding-dimensjoner

Hele systemet bruker **Voyage AI med 512-dimensjons embeddings**. Implementeringsplanen spesifiserer `vector(1536)` for knowledge-tabellen — dette er en **FEIL** som må korrigeres til `vector(512)` for konsistens med resten av systemet, MED MINDRE man planlegger å bytte embedding-provider for knowledge spesifikt. Reviewer bør verifisere dette mot `memory/migrations/1_create_tables.up.sql` som bruker `vector(512)`.

---

## DEL A — Sprint 6: Stabilisering (bugs + sikkerhet)

### Forutsetninger fra Sprint 4-plan

Sprint 4 identifiserte 28 bugs i 7 grupper (A–G). Sprint 6 bygger videre og fullstabiliserer plattformen.

### 6.1 Backend-fikser som MÅ være på plass

| Fix | Eksisterende kode å endre | Detaljer |
|-----|---------------------------|---------|
| listRepos henter fra GitHub App org | `github/github.ts` — listRepos() eksisterer, bruker allerede `listRepos("Twofold-AS")` | Verifiser at den IKKE returnerer brukerens personlige repos |
| Ghost-routing default false | `chat/chat.ts` eller frontend state | Ghost mode skal være opt-in, ikke default |
| listProviders cache + indekser | `ai/providers.ts` — 5 CRUD endpoints eksisterer; `ai/db.ts` har SQLDatabase("ai") | Legg til caching via `cache` service (som skills allerede gjør med 5min TTL) |
| Tier fjernet fra modellvalg | `ai/router.ts` — har allerede tag-based selection | Verifiser at `selectOptimalModel()` bruker tags, IKKE tier. MERK: `ai/sub-agents.ts` har `BudgetMode` som type alias men ignorerer den |
| 8 sikkerhetsfikser | Se OWASP-rapport og GRUNNMUR-STATUS | IDOR-fix 🟢, sanitization 🟢, trust_level 🟢 — verifiser at alt er aktivt |
| Frontend uten kritiske bugs | Sprint 4 bugs A–G | Se Sprint 4-plan for komplett liste |

### 6.2 Referanser til eksisterende kode

- `ai/router.ts` — allerede implementert: `selectOptimalModel()`, `getUpgradeModel()`, tag-based selection, tier-based upgrade, DB-backed model cache
- `ai/providers.ts` — 5 endpoints: listProviders, getProvider, saveProvider, saveModel, deleteModel
- `cache/cache.ts` — har namespace-basert invalidering, hourly cleanup cron, hit rate stats
- `skills/engine.ts` — har allerede `hashResolveInput()` som hasher taskType+repo+labels+files (IKKE task-tekst)

### 6.3 Leveransekriterier for Sprint 6

Sprint 6 er FULLFØRT når:
1. `listRepos()` returnerer kun org-repos
2. Ghost mode er off by default
3. Provider-listing har caching
4. Modellvalg bruker tags, ikke tier
5. Alle OWASP-fikser er verifisert aktive
6. Frontend funksjonell uten kritiske bugs
7. Alle 490+ eksisterende tester passerer

---

## DEL B — Sprint 7–14: Implementeringsplan (69% → ~85%)

### Sprint 7 — Knowledge-systemet (grunnmuren for læring)

**Mål:** TheFold begynner å lære fra fullførte oppgaver.

**VIKTIG: Forholdet til eksisterende memory-service.** Memory-service har allerede `memories`-tabell med `memory_type` (6 typer), embeddings, decay-scoring, konsolidering, og code_patterns. Knowledge-systemet er en NY, separat tabell — ikke en utvidelse av memories. Forskjellen: memories er rå observasjoner ("dette skjedde"), knowledge er destillerte regler ("dette bør alltid gjøres"). De to systemene komplementerer hverandre.

#### 7.1 Knowledge-tabell

Ny migrasjon i `memory/migrations/` (NESTE ledige nummer — sjekk eksisterende migrasjoner, siste er 7_add_search_vector):

```sql
CREATE TABLE knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  category TEXT NOT NULL,
  context TEXT,
  source_task_id UUID,
  source_model TEXT,
  source_quality_score INT,
  embedding vector(512),  -- ⚠️ KORRIGERT fra 1536 → 512 for konsistens med memories-tabellen
  confidence FLOAT DEFAULT 0.5,
  times_applied INT DEFAULT 0,
  times_helped INT DEFAULT 0,
  times_hurt INT DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_embedding ON knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_knowledge_category ON knowledge (category);
CREATE INDEX idx_knowledge_status_confidence ON knowledge (status, confidence);
```

**Reviewer-notat:** Verifiser at `vector(512)` matcher Voyage AI embedding-dimensjonene i `memory/memory.ts`. Sjekk også `ivfflat` WITH (lists = 50) parameter — memories bruker samme.

#### 7.2 maybeDistill() — auto-destillering

Ny funksjon i `agent/completion.ts`, kalles etter STEP 11.5 (etter procedural memory lagring) og før STEP 12 (sandbox destroy).

**EKSISTERENDE KODE SOM BERØRES:**
- `agent/completion.ts` — `completeTask()` funksjonen, etter memory.store-blokken
- `memory/memory.ts` — nye endpoints (se 7.5)
- `ai/ai.ts` — trenger IKKE ny funksjon; bruk eksisterende `callAnthropicRaw()` eller lignende med billigste modell

**Trigger-betingelser:**
- qualityScore >= 7 (fra review-handler.ts `ReviewResult`)
- Oppgaven hadde minst 1 retry ELLER produserte filer med ny pattern
- Oppgaven er ikke triviell (< 100 tokens output)

**Input til AI (billigste modell — Haiku via `getModelForRole("researcher")` fra sub-agents.ts):**
- Oppgavebeskrivelse (maks 200 tokens)
- Feil som oppsto og fixes (fra `ctx.attemptHistory`)
- Filtyper og patterns (maks 200 tokens)

**Output:** 0-3 regler med category og context.

**Deduplication:** Embed regel via Voyage AI (bruk eksisterende embedding-logikk fra memory.store), sjekk duplikat (cosine > 0.85 mot eksisterende knowledge). Duplikat → styrk eksisterende (confidence += 0.1). Ny → lagre med confidence 0.5.

#### 7.3 Knowledge-injection i skills/engine.ts

**EKSISTERENDE KODE SOM BERØRES:**
- `skills/engine.ts` — `resolve()` funksjonen. Denne har allerede: scope filter → routing match → token budget → build prompt
- Caching: `hashResolveInput()` hasher taskType+repo+labels+files — knowledge-injection MÅ inkluderes i hash-input for korrekt cache-invalidering

**Implementering:**
1. Etter eksisterende skills-matching i `resolve()`
2. Embed oppgavebeskrivelsen (bruk cachet embedding fra cache-service, key: `emb:{sha256}`)
3. Kall nytt memory-endpoint: pgvector-søk mot knowledge-tabellen WHERE status = 'active' AND confidence > 0.4
4. Ta topp 5 resultater
5. Bygg `## Learned Knowledge` seksjon, injiser etter `## Active Skills` i prompt
6. Returner knowledge-IDer i ResolveResponse for feedback-tracking
7. OPPDATER `hashResolveInput()` til å inkludere en knowledge-versjonsnøkkel (f.eks. siste updated_at fra knowledge-tabellen)

#### 7.4 Feedback-loop

I `skills/engine.ts` `executePostRun()` — denne eksisterer allerede og kjører quality review + auto-logging:
- Etter kvalitetssjekk av AI-output
- Output OK (ingen issues) → `UPDATE knowledge SET times_helped = times_helped + 1 WHERE id = ANY($ids)`
- Output har problemer → `UPDATE knowledge SET times_hurt = times_hurt + 1 WHERE id = ANY($ids)`
- Oppdater confidence: `confidence = times_helped::float / GREATEST(times_helped + times_hurt, 1)`

**MERK:** Knowledge-IDer må flytes gjennom fra resolve() → pre-run → post-run. Sjekk at `ResolveResponse` og `PostRunInput` har plass til dette.

#### 7.5 Memory-service endepunkter

Nye endepunkter i `memory/memory.ts` (har allerede: store, search, extract, consolidate, cleanup, stats, searchPatterns, storePattern):

| Endpoint | Expose | Auth | Beskrivelse |
|----------|--------|------|-------------|
| `POST /memory/knowledge/store` | false | Nei | Lagre destillert knowledge |
| `POST /memory/knowledge/search` | false | Nei | pgvector-søk for injection |
| `POST /memory/knowledge/feedback` | false | Nei | Oppdater times_helped/hurt |
| `GET /memory/knowledge/list` | true | Ja | For frontend-visning |
| `GET /memory/knowledge/stats` | true | Ja | Aggregert statistikk |

**Reviewer-notat:** Verifiser at memory-service sin `SQLDatabase("memory")` allerede inkluderer knowledge-tabellen etter migrasjonen kjøres. Encore.ts kjører migrasjoner automatisk ved oppstart.

#### Leveranse Sprint 7
- TheFold destillerer automatisk 0-3 regler per fullført oppgave
- Regler injiseres i alle fremtidige AI-kall via semantisk matching
- Feedback-loop oppdaterer confidence basert på resultat
- Estimert: 50+ knowledge-regler etter 30 oppgaver

---

### Sprint 8 — Søvn-systemet (selv-evaluering)

**Mål:** TheFold evaluerer og forbedrer seg selv ukentlig.

**EKSISTERENDE LIGNENDE SYSTEMER:**
- `monitor/monitor.ts` — har allerede daglig cron (03:00), health checks for repos
- `registry/registry.ts` — har allerede ukentlig healing cron (fredag 03:00)
- `memory/memory.ts` — har allerede cleanup-cron som sletter basert på TTL og decay

Søvn-systemet er NYTT og komplementerer disse — det handler om knowledge-vedlikehold, ikke repo-helse eller memory-cleanup.

#### 8.1 sleep_logs-tabell

Ny migrasjon i `agent/migrations/` (sjekk siste migrasjon — agent har allerede migrasjoner 1-8+):

```sql
CREATE TABLE sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  knowledge_reviewed INT DEFAULT 0,
  knowledge_archived INT DEFAULT 0,
  knowledge_promoted INT DEFAULT 0,
  knowledge_merged INT DEFAULT 0,
  scheduled_tasks_run INT DEFAULT 0,
  cost_usd FLOAT DEFAULT 0,
  tokens_used INT DEFAULT 0,
  report JSONB,
  status TEXT DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 8.2 Søvn-cron

Ny CronJob i `agent/sleep.ts` (NY fil):

```
Schedule: "0 3 * * 0" (søndag kl 03:00 UTC)
```

**KOLLISJONSSJEKK:** Monitor har daglig cron kl 03:00, registry har fredag kl 03:00. Søndag kl 03:00 kolliderer IKKE.

**5 steg:**

1. **Arkivering** — Ren DB-operasjon, ingen AI-kall:
   - `WHERE confidence < 0.3 AND last_applied_at < NOW() - INTERVAL '30 days' AND status = 'active'`
   - Sett status = 'archived'

2. **Review av tvilsomme** — Maks 20 regler per søvn:
   - `WHERE confidence BETWEEN 0.3 AND 0.5 AND times_applied > 5 AND status = 'active'`
   - Send til AI (Haiku via `getModelForRole("reviewer")`): "Vurder disse reglene."
   - Kostnad: ~$0.005

3. **Promotering** — Ren DB-operasjon:
   - `WHERE confidence > 0.8 AND times_applied > 10 AND status = 'active'`
   - Sett status = 'promoted'

4. **Merging** — AI-assistert:
   - Finn par med embedding cosine similarity > 0.9
   - Send til AI (Haiku): "Slå sammen til én bedre regel."
   - Kostnad: ~$0.005

5. **Rapport** — Lagre i sleep_logs, send chat-notifikasjon via Pub/Sub (bruk eksisterende `chat` service sin message-lagring med `message_type: 'agent_report'`)

#### 8.3 Frontend: /tools/knowledge

Ny side i frontend dashboard. **EKSISTERENDE PATTERNS Å FØLGE:**
- `/tools/skills/page.tsx` — grid med slide-over, toggle, create/edit
- `/tools/costs/page.tsx` — periodvelger, summary-kort, tabeller

Innhold: Liste over all knowledge med confidence, kategori, status. Filter: active/promoted/archived. Søk. Vis siste søvn-rapport. Manuell arkiver/aktiver.

#### Leveranse Sprint 8
- Ukentlig søvn-syklus som rydder, forbedrer, og promoterer knowledge
- Frontend-visning av TheFolds lærte kunnskap
- Estimert søvn-kostnad: ~$0.01/uke

---

### Sprint 9 — Prosjektmanifest (helhetlig prosjektforståelse)

**Mål:** TheFold forstår hele prosjektet, ikke bare filvinduet.

**EKSISTERENDE RELATERT KODE:**
- `agent/context-builder.ts` — NY fil fra dekomponering (Prompt XG), har `buildContext()` med STEP 2+3+3.5 logikk
- `github/github.ts` — `getTree()` og `getFileContents()` eksisterer
- `cache/cache.ts` — `repo:{owner}/{repo}:{branch}` cache eksisterer (1h TTL)

#### 9.1 project_manifests-tabell

Ny migrasjon i `memory/migrations/`:

```sql
CREATE TABLE project_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  summary TEXT,
  tech_stack TEXT[],
  services JSONB DEFAULT '[]',
  data_models JSONB DEFAULT '[]',
  contracts JSONB DEFAULT '[]',
  conventions TEXT,
  known_pitfalls TEXT,
  file_count INT,
  last_analyzed_at TIMESTAMPTZ,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_owner, repo_name)
);
```

#### 9.2 Auto-generering

Ny fil `agent/manifest.ts` ELLER utvidelse av `agent/context-builder.ts`:

**getOrCreateManifest(owner, repo):**
1. Sjekk DB: finnes manifest? Bruk `cache` service for hot-path (cache-key: `manifest:{owner}/{repo}`)
2. Hvis ja og < 24 timer: returner
3. Hvis nei eller gammel: generer/oppdater

**Generering:** Identifiser nøkkelfiler via `github.getTree()` (allerede i context-builder), filtrer: package.json, tsconfig.json, encore.app, *service*, types, config. Send til AI (Haiku). Lagre.

**Oppdatering (etter fullført oppgave):** I `agent/completion.ts` etter STEP 12 — send manifestet + endrede filer til AI for inkrementell oppdatering.

#### 9.3 Injection i agent-loop

I `agent/context-builder.ts` `buildContext()`:
- Hent manifest for dette repoet
- Injiser som `## Project Architecture` i konteksten
- PLASERING: Før filinnhold, etter memory — manifestet gir kontekst for å forstå filene

**MERK:** `buildContext()` har allerede token-trimming med prioriteter: conventions → deps → files → memory → docs (maks 30K tokens). Manifest bør ha HØYERE prioritet enn memory og docs (500-800 tokens).

I `agent/orchestrator.ts` `curateContext()`:
- Samme injection for alle oppgaver i et prosjekt
- Manifestet oppdateres mellom faser

#### 9.4 Endepunkter

| Endpoint | Expose | Auth | Beskrivelse |
|----------|--------|------|-------------|
| `POST /memory/manifest/get` | false | Nei | Hent eller generer manifest |
| `POST /memory/manifest/update` | false | Nei | Inkrementell oppdatering |
| `GET /memory/manifest/view` | true | Ja | Frontend-visning |
| `POST /memory/manifest/edit` | true | Ja | Manuell redigering |

#### Leveranse Sprint 9
- TheFold forstår hele prosjektarkitekturen, alltid
- Manifestet oppdateres automatisk etter hver oppgave
- Kontekst for hver AI-kall inkluderer systemforståelse (500-800 tokens)

---

### Sprint 10 — Kontraktbasert dekomponering

**Mål:** Store prosjekter dekomponeres med eksplisitte kontrakter mellom faser.

**EKSISTERENDE RELATERT KODE:**
- `agent/orchestrator.ts` — har allerede `executeProject()`, `curateContext()`, shared sandbox, collectOnly mode
- `tasks/tasks.ts` — har `project_tasks` tabell (verifiser eksisterende kolonner)
- `ai/ai.ts` — har `decomposeProject()` og `reviseProjectPhase()`

#### 10.1 Utvidelse av project_tasks

**REVIEWER: Sjekk først om `project_tasks` allerede har disse kolonnene.** Migrasjon i `agent/migrations/`:

```sql
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS input_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS output_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS contracts_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS actual_output JSONB;
```

#### 10.2 Oppdater ai.decomposeProject()

I `ai/ai.ts` — prompt-endring i eksisterende funksjon. IKKE ny funksjon:
- Utvid system-prompten til å generere input/output-kontrakter per oppgave
- Kontrakt-format: JSON array av strenger som beskriver forventninger

#### 10.3 Kontraktverifisering i orchestrator

I `agent/orchestrator.ts` `executeProject()`:
- Etter hver fullført oppgave: verifiser output-kontraktene
- Sammenlign `output_contracts` med `actual_output`
- Send til AI (Haiku): "Ble disse kontraktene oppfylt?" (~500 tokens)
- Flagg avvik i `verification_notes`

#### 10.4 Frontend: Prosjekt-visning med kontrakter

Utvid eksisterende prosjekt-status-visning med kontraktdata per fase. Grønn/rød indikator. Manuell godkjenning.

#### Leveranse Sprint 10
- Store prosjekter har eksplisitte kontrakter mellom faser
- 80% reduksjon i feil der fase N bygger på noe fase N-1 aldri leverte

---

### Sprint 11 — Scheduled tasks (TheFold som proaktiv assistent)

**Mål:** TheFold utfører oppgaver på planlagte tidspunkter.

**EKSISTERENDE CRON-JOBS:**
| Cron | Service | Schedule | Formål |
|------|---------|----------|--------|
| check-thefold-tasks | linear | Hvert 5. minutt | Synk Linear oppgaver |
| daily-health-check | monitor | 0 3 * * * | Repo health checks |
| weekly-maintenance | registry | Fredag 03:00 | Healing pipeline |
| agent-jobs-cleanup | agent | Hvert 6. time | Cleanup expired jobs |
| hourly-cleanup | cache | Hvert 60. minutt | Slett utløpte cache entries |
| memory cleanup | memory | (implicit via decay) | TTL-basert sletting |

Scheduled tasks er et GENERISK system som lar brukeren opprette egne planlagte oppgaver — forskjellig fra de hardkodede cron-jobbene ovenfor.

#### 11.1 scheduled_tasks-tabell

Ny migrasjon i `agent/migrations/`:

```sql
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL,        -- notify, review, analyze, build, benchmark
  schedule_type TEXT NOT NULL,    -- once, cron
  run_at TIMESTAMPTZ,
  cron_expression TEXT,
  run_in_sleep BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  last_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL
);

CREATE INDEX idx_scheduled_next_run ON scheduled_tasks (next_run_at)
  WHERE status = 'active';
```

#### 11.2 Task-typer

5 typer:
- **notify:** Ingen AI. Send chat-melding. $0.
- **review:** Hent filer, AI code review. ~$0.07.
- **analyze:** Metrics rapport. ~$0.003. **MERK: Bruk eksisterende monitor.runCheck() for health-delen.**
- **build:** Opprett task i tasks-service, start agent. Full agent-loop-kostnad.
- **benchmark:** Se Sprint 12. ~$0.10.

#### 11.3 Cron-runner

Ny CronJob i `agent/scheduled.ts`: `*/15 * * * *` (hvert 15. minutt). Kjør alle due tasks. For `run_in_sleep = true`: hopp over — kjøres av søvn-systemet (Sprint 8).

#### 11.4 Endepunkter

| Endpoint | Expose | Auth | Beskrivelse |
|----------|--------|------|-------------|
| `POST /agent/scheduled/create` | true | Ja | Opprett scheduled task |
| `POST /agent/scheduled/update` | true | Ja | Oppdater |
| `POST /agent/scheduled/delete` | true | Ja | Slett |
| `GET /agent/scheduled/list` | true | Ja | Liste |
| `POST /agent/scheduled/run-due` | false | Nei | Intern cron |

#### 11.5 Frontend: /tools/scheduled

Ny side. Pattern: følg `/tools/skills` layout.

#### Leveranse Sprint 11
- TheFold kjører oppgaver på planlagte tider
- 5 task-typer
- Ingen automatisk token-bruk uten brukerens kontroll

---

### Sprint 12 — Modell-benchmarks (informert modellvalg)

**Mål:** Sammenligne modeller på spesifikke oppgaver.

**EKSISTERENDE RELATERT KODE:**
- `ai/router.ts` — `selectOptimalModel()` bruker allerede tags og tier for modellvalg
- `ai/providers.ts` — har provider/model CRUD med DB-backing
- `ai/sub-agents.ts` — har `getModelForRole()` med hardkodede mappinger

#### 12.1 model_benchmarks-tabell

Ny migrasjon i `ai/migrations/`:

```sql
CREATE TABLE model_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  models TEXT[] NOT NULL,
  task_description TEXT NOT NULL,
  task_category TEXT,
  run_mode TEXT DEFAULT 'manual',
  scheduled_at TIMESTAMPTZ,
  results JSONB,
  winner TEXT,
  summary TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

#### 12.2 Benchmark-logikk

Ny fil `ai/benchmarks.ts`:
1. Kjør oppgaven gjennom alle valgte modeller med identisk prompt (skills + knowledge inkludert)
2. Mål: tokens, kostnad, varighet, output-lengde
3. AI-dommer (billigste modell) evaluerer outputs: kvalitet 0-100
4. Lagre resultater, beregn vinner

**KOBLING TIL EKSISTERENDE:** Bruk `ai.callAnthropicRaw()` eller tilsvarende for hvert modell-kall. Bruk `skills.resolve()` for å bygge prompt (slik at benchmark tester med reelle prompts).

#### 12.3-12.4 Endepunkter + Frontend

4 endpoints (create, run, list, get) + `/tools/benchmarks` side.

#### Leveranse Sprint 12
- Modell-sammenligning med ett klikk
- Kan kjøres i søvn-syklusen

---

### Sprint 13 — Persistent dependency graph + diff-basert kontekst

**Mål:** TheFold ser endringer, ikke hele prosjektet på nytt.

**EKSISTERENDE RELATERT KODE:**
- `builder/graph.ts` — har allerede `analyzeDependencies()`, `extractImports()`, `resolveImport()`, topologisk sortering
- `github/github.ts` — `getTree()` returnerer fil-liste
- `cache/cache.ts` — `repo:{owner}/{repo}:{branch}` med 1h TTL

**VIKTIG:** Builder sin dependency graph er PER-BYGGE-JOB (ephemeral). Sprint 13 gjør den PERSISTENT på prosjektnivå.

#### 13.1 project_dependency_graph-tabell

```sql
CREATE TABLE project_dependency_graph (
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  graph JSONB NOT NULL,           -- gjenbruk format fra builder/graph.ts
  file_count INT,
  edge_count INT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (repo_owner, repo_name)
);
```

**Plassering:** `memory/migrations/` (nær manifestet).

#### 13.2 Inkrementell oppdatering

Etter fullført oppgave i `agent/completion.ts`: oppdater kun endrede filer i grafen. Gjenbruk `analyzeDependencies()` fra `builder/graph.ts` men med `import` fra Encore service-to-service kall.

#### 13.3 Diff-basert kontekst

Ny kolonne i project_manifests:
```sql
ALTER TABLE project_manifests ADD COLUMN IF NOT EXISTS file_hashes JSONB DEFAULT '{}';
```

I `agent/context-builder.ts`: sammenlign file hashes med forrige kjøring. Send kun endrede filer.

#### 13.4 Token-effekt

Estimert 40-60% reduksjon. Ikke 84% — vi henter fra GitHub, ikke frontend.

#### Leveranse Sprint 13
- Import-graf lagret persistent
- Diff-basert filvalg: ~40-60% token-besparelse
- Kombinert med knowledge + manifest: ~35% færre tokens enn baseline

---

### Sprint 14 — Selv-evaluering under arbeid

**Mål:** TheFold stopper seg selv midt i arbeid hvis noe ikke stemmer.

**EKSISTERENDE RELATERT KODE:**
- `builder/phases.ts` — har `implement`-fasen med per-fil generering og fix-loop
- `agent/execution.ts` — har `executePlan()` med STEP 5-7
- Prosjektmanifest fra Sprint 9

#### 14.1 Manifest-validering i build-loop

I `builder/phases.ts` implement-fasen:
- Etter hver generert fil: sjekk konsistens med manifestet
- Ny import som ikke matcher manifestets services → logg advarsel
- Bryter conventions → pause og re-generér

#### 14.2 Plan-validering mot manifest

I `agent/execution.ts` etter `planTask()`:
- Sammenlign planens filer med manifestets dependency graph
- Fanger manglende avhengigheter
- ~200 tokens (Haiku)

#### 14.3 Intra-task confidence

Ny sjekk mellom STEP 6 (build) og STEP 7 (validate):
- Rask selvevaluering: "Matcher dette planen?"
- ~500 tokens

#### Leveranse Sprint 14
- TheFold fanger feil under arbeid
- Manifest-validering forhindrer inkonsistente endringer
- 30% reduksjon i retries

---

## DEL C — Sprint 15–25: Oppgraderingsplan (85% → ~99%)

### Sprint 15–16: Fase 1 — Basalgangliene (Automatiserte vaner)

**Prioritet: Høy. Effekt: Stor token-besparelse.**

**EKSISTERENDE RELATERT KODE:**
- `chat/chat.ts` — auto-routing allerede gjøres med AI-klassifisering
- `ai/router.ts` — `selectOptimalModel()` velger modell per oppgave
- `skills/engine.ts` — resolve() gjør skill-matching

#### 15.1 Routing patterns-tabell

Ny migrasjon i `ai/migrations/`:

```sql
CREATE TABLE routing_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_hash TEXT NOT NULL UNIQUE,
  task_keywords TEXT[],
  file_patterns TEXT[],
  label_patterns TEXT[],
  specialist TEXT NOT NULL,
  model_recommendation TEXT,
  confidence FLOAT DEFAULT 0.5,
  hit_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Oppbygging:** Etter fullført oppgave i `agent/completion.ts` — utled og lagre routing pattern fra oppgavedata.

**Matching:** Før AI-klassifisering i chat: keyword overlap + file pattern match. Confidence > 0.8 og hit_count > 5 → bruk pattern direkte (0 tokens).

#### 15.2 Task type profiles

```sql
CREATE TABLE task_type_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL UNIQUE,
  typical_files TEXT[],
  typical_model TEXT,
  typical_complexity FLOAT,
  common_pitfalls TEXT[],
  average_tokens INT,
  average_retries FLOAT,
  sample_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Bygges automatisk fra knowledge + routing patterns. For kjente oppgavetyper: hopp over mye planlegging.

**Effekt:** 70-80% av requests rutes uten AI-kall etter 4-8 uker.

---

### Sprint 17–19: Fase 2 — Autonome nervesystemet (Proaktivitet)

**EKSISTERENDE RELATERT KODE:**
- `monitor/monitor.ts` — har allerede `dependency_audit`, `test_coverage`, `code_quality`, `doc_freshness`
- `monitor/health_checks` tabell — fungerer
- `monitor/health_rules` tabell — EKSISTERER men UBRUKT

**VIKTIG:** Proaktiv scan bør GJENBRUKE monitor-service, IKKE reimplementere. `runCheck()` endpoint eksisterer allerede.

#### 17.1 Proaktiv problemdeteksjon

Ny CronJob: `"0 7 * * 1-5"` (hverdager kl 07:00).

Implementering: Kall `monitor.runCheck()` for alle aktive repos, PLUSS knowledge-basert sjekk av nylig endrede filer. ~$0.01 per scan. Konfigurerbar per bruker.

#### 17.2 Selv-reparering

Når scan finner noe fikserbart:
1. Opprett scheduled task (Sprint 11) med type "build"
2. Send chat-notifikasjon: "Skal jeg fikse dette?"
3. Bruker godkjenner → agent kjører
4. Bruker avslår → lagre i knowledge

#### 17.3 Selv-forbedring

Under søvn (utvidet Sprint 8):
- Sammenlign approaches for samme task_type
- Generer ny knowledge: "Strategi A er bedre enn B for denne typen"

#### 18.1 Aktivering av health_rules

**GRUNNMUR SOM ALLEREDE FINNES:** `health_rules` tabellen i monitor har kolonner: id, check_type, threshold (JSONB), enabled, notify. DEN ER ALDRI BRUKT. Sprint 18 AKTIVERER denne eksisterende grunnmuren i stedet for å bygge nytt.

---

### Sprint 20–21: Fase 3 — Hippocampus (Dyp hukommelse)

**EKSISTERENDE RELATERT KODE:**
- `memory/memory.ts` — har allerede `consolidate()` endpoint
- `memory.consolidated_from` — kolonnen eksisterer og BRUKES i consolidate
- `memory.superseded_by` — kolonnen eksisterer og BRUKES

#### 20.1 Tematisk konsolidering

Under søvn (utvidelse av Sprint 8):
1. Grupper knowledge etter category
2. For > 20 regler: send til AI
3. Konsolider til 5-7 overordnede prinsipper
4. Lagre som "meta-knowledge" med høyere confidence
5. Individuelle regler lenkes via eksisterende `superseded_by` pattern

**Effekt:** 70% færre prompt-tokens for knowledge-injeksjon.

#### 20.2 Episodisk minne

Ny minnetype: `episode` (legges til de eksisterende 6 typene i `memory_type`).

**EKSISTERENDE KODE:** `memory.store()` aksepterer allerede `memoryType` parameter. Ingen ny tabell — bruk eksisterende `memories` med `memory_type = 'episode'`.

Oppbygging: Etter fullførte prosjekter i `agent/orchestrator.ts` (ikke enkelt-oppgaver). Generer episode-summary fra alle fasers resultater.

---

### Sprint 22–23: Fase 4+5 — Synscortex + Amygdala

#### Synscortex: Cross-project mønstergjenkjenning

**EKSISTERENDE RELATERT KODE:**
- `registry/registry.ts` — har `used_by_repos` og `find-for-task`
- `memory/code_patterns` — har `source_repo` for cross-repo patterns

Utvid `find-for-task` til å bruke knowledge fra alle prosjekter. Ny tabell for endringslogg:

```sql
CREATE TABLE repo_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  files_changed TEXT[],
  change_type TEXT,
  task_id UUID,
  summary TEXT
);
```

#### Amygdala: Anomali-deteksjon

**EKSISTERENDE RELATERT KODE:**
- `agent/agent_phase_metrics` — har allerede per-fase cost/token data
- `monitor/health_rules` — UBRUKT tabell som kan utvides

Nye tabeller:

```sql
CREATE TABLE anomaly_baselines (
  metric TEXT PRIMARY KEY,
  mean FLOAT,
  stddev FLOAT,
  sample_count INT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT,
  expected_value FLOAT,
  actual_value FLOAT,
  deviation_sigmas FLOAT,
  severity TEXT,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Deteksjon: Etter hvert AI-kall, sjekk mot baseline. 3 sigma → alert. Critical → pause agent.

**KOBLING:** Bygg baselines fra `agent_phase_metrics` data som allerede samles inn.

---

### Sprint 24–25: Fase 6+7 — Prefrontal cortex + Resterende systemer

#### Alternativ-vurdering (kompleksitet >= 8)

Generer 2-3 planer med ulike strategier. Bruk eksisterende `ai.planTask()` 2-3 ganger med ulike system-prompter. ~$0.03 ekstra per oppgave.

#### Refleksjon etter feil

Etter maks retries nådd: generer post-mortem, lagre som knowledge. **MERK:** `ctx.attemptHistory` i agent allerede logger alle forsøk med feil.

#### Auto-resume etter krasj (Hjernestammen)

**EKSISTERENDE GRUNNMUR:** `agent_jobs` har checkpoints, `findResumableJobs()` eksisterer. Mangler: full context-rebuild fra checkpoint. `startTask()` må sjekke for uferdig job.

#### Parallel builds (Lillehjernen)

For uavhengige filer (ingen imports mellom dem): `Promise.allSettled()` i builder. **EKSISTERENDE:** `builder/graph.ts` kan allerede identifisere uavhengige filer via topologisk sortering.

#### Adaptive modellvalg (Motorisk cortex)

Logg modell + oppgavetype + kvalitetsscore etter hvert AI-kall. **EKSISTERENDE:** `agent_phase_metrics` logger allerede cost/tokens per fase. Utvid med kvalitetsscore. Bruk i `selectOptimalModel()`.

---

## Samlet tidslinje

```
Sprint 6:       Bugs + sikkerhet                           → Stabil plattform
Sprint 7:       Knowledge-system                           → TheFold begynner å lære
Sprint 8:       Søvn-system                                → TheFold vedlikeholder seg selv
Sprint 9:       Prosjektmanifest                           → TheFold forstår helheten
Sprint 10:      Kontraktbasert dekomponering               → Store prosjekter uten glemming
Sprint 11:      Scheduled tasks                            → TheFold som proaktiv assistent
Sprint 12:      Modell-benchmarks                          → Informert modellvalg
Sprint 13:      Diff-basert kontekst + dependency graf     → 40-60% token-besparelse
Sprint 14:      Selv-evaluering under arbeid               → Tettere feedback-loop
Sprint 15-16:   Basalganglier (routing + task profiles)    → 85% → 88% (0-token routing)
Sprint 17-19:   Proaktivitet + selv-reparering             → 88% → 92%
Sprint 20-21:   Dyp hukommelse (konsolidering + episoder)  → 92% → 94%
Sprint 22-23:   Syn + Sikkerhet (cross-project + anomali)  → 94% → 97%
Sprint 24-25:   Avansert (alt-planer + auto-resume)        → 97% → 99%
```

---

## Sjekkliste for LLM-reviewer

Denne seksjonen er spesifikt for den LLM-en som skal gjennomgå planen mot kodebasen.

### Kritiske verifikasjoner

1. **Embedding-dimensjoner:** Verifiser at ALL ny kode bruker `vector(512)` — IKKE `vector(1536)`. Sjekk `memory/migrations/1_create_tables.up.sql` for bekreftelse.

2. **Migrasjonsnummerering:** Sjekk siste eksisterende migrasjonsnummer i hver service:
   - `memory/migrations/` — siste er `7_add_search_vector.up.sql`
   - `agent/migrations/` — sjekk alle (minst 8+)
   - `ai/migrations/` — sjekk eksisterende
   - `skills/migrations/` — siste er `8_cleanup_unused_columns.up.sql`
   - `builder/migrations/` — sjekk eksisterende

3. **Kolonner som er FJERNET:** Skills-tabellen har MISTET: marketplace_id, marketplace_downloads, marketplace_rating, version, author_id, depends_on, conflicts_with, parent_skill_id, composable, output_schema, execution_phase, token_budget_max (migrasjon 8). Planen MÅ IKKE referere til disse som eksisterende.

4. **Cron-kollisjoner:** Verifiser at nye cron-jobber ikke overlapper med eksisterende:
   - Monitor: daglig kl 03:00
   - Registry: fredag kl 03:00
   - Linear: hvert 5. minutt
   - Agent cleanup: hvert 6. time
   - Cache cleanup: hvert 60. minutt
   - Ny søvn: søndag kl 03:00 ✓
   - Ny scheduled runner: hvert 15. minutt ✓
   - Ny proaktiv scan: hverdager kl 07:00 ✓

5. **Service-grenser i Encore.ts:** Tjenester kan IKKE importere direkte fra hverandre. All kommunikasjon er via `~encore/clients`. Verifiser at nye funksjoner respekterer dette.

6. **Feature flags:** Nye features bør ha feature flags (Encore secrets) for gradvis aktivering, slik som monitor bruker `MonitorEnabled` og agent bruker `AgentPersistentJobs`.

7. **Eksisterende endpoints som kan gjenbrukes:**
   - `memory.search()` — hybrid søk finnes, ny knowledge-search er SEPARAT tabell
   - `memory.store()` — aksepterer allerede `memoryType`, kan bruke for episodes
   - `memory.consolidate()` — fungerer for eksisterende memories
   - `monitor.runCheck()` — kan gjenbrukes for proaktiv scan
   - `registry.findForTask()` — kan utvides for cross-project
   - `cache.getOrSet()` — bruk for manifest-caching

8. **Procedural memory (YE):** Agent har allerede STEP 11.5 som lagrer strategy-minner. Knowledge-systemet (Sprint 7) er KOMPLEMENTÆRT — destillerer regler, ikke strategier.

9. **Trust levels:** Memory-service har `trust_level` (user/agent/system). Nye knowledge-entries bør settes til `trust_level: 'agent'`.

10. **Content hash:** Memory har SHA-256 content_hash for integritet (ASI06). Knowledge-tabellen bør ha tilsvarende.

### Potensielle problemer å undersøke

- Er `project_tasks` en separat tabell eller del av `tasks`? Verifiser i `agent/migrations/`.
- Har `agent/orchestrator.ts` allerede `curateContext()`? Planen antar det.
- Er `callAnthropicRaw()` den rette funksjonen for enkle AI-kall, eller finnes noe bedre?
- Sjekk om `builder/graph.ts` sin `analyzeDependencies()` er eksportert og kan brukes fra andre tjenester via Encore service calls.
- Verifiser at frontend routing i Next.js 15 følger app-directory mønsteret som eksisterende sider bruker.

---

## Avhengighetsmatrise mellom sprinter

```
Sprint 6  →  Ingen avhengigheter (standalone stabilisering)
Sprint 7  →  Avhenger av Sprint 6 (stabil plattform)
Sprint 8  →  Avhenger av Sprint 7 (knowledge-tabell å vedlikeholde)
Sprint 9  →  Avhenger av Sprint 6 (agent-loop stabil)
Sprint 10 →  Avhenger av Sprint 9 (manifest for kontraktverifisering)
Sprint 11 →  Avhenger av Sprint 6 (stabil agent)
Sprint 12 →  Avhenger av Sprint 6 (stabil AI-system)
Sprint 13 →  Avhenger av Sprint 9 (manifest med file_hashes)
Sprint 14 →  Avhenger av Sprint 9 + Sprint 13 (manifest + dependency graf)
Sprint 15 →  Avhenger av Sprint 7 (knowledge for routing learning)
Sprint 17 →  Avhenger av Sprint 8 + Sprint 11 (søvn + scheduled tasks)
Sprint 20 →  Avhenger av Sprint 7 + Sprint 8 (knowledge + søvn)
Sprint 22 →  Avhenger av Sprint 9 + Sprint 13 (manifest + dep graf)
Sprint 24 →  Avhenger av Sprint 7-14 (alt fra implementeringsplanen)
```

**Parallelliserbare sprinter:**
- Sprint 9 og Sprint 11 kan kjøres parallelt
- Sprint 12 kan kjøres parallelt med Sprint 10
- Sprint 7 og Sprint 9 kan IKKE kjøres parallelt (begge endrer agent-loop)

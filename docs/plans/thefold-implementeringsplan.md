# TheFold 2.0 — Implementeringsplan: Fra nåværende system til fullverdig hjerne

> Denne planen tar TheFold fra dagens 69% hjerne til ~85% over 8 sprinter.
> Hver sprint er designet til å være selvstendig leverbar — systemet fungerer bedre etter hver sprint.
> Sprint 6 (bugs + sikkerhet) må fullføres først. Denne planen starter på Sprint 7.

---

## Forutsetninger

Sprint 6 er fullført:
- listRepos henter fra GitHub App org (ikke brukerens personlige repos)
- Ghost-routing default false
- listProviders har cache + indekser
- Tier fjernet fra modellvalg (tags i stedet)
- Alle 8 sikkerhetsfikser på plass
- Frontend fungerer uten kritiske bugs

---

## Sprint 7 — Knowledge-systemet (grunnmuren for læring)

**Mål:** TheFold begynner å lære fra fullførte oppgaver.

### 7.1 Knowledge-tabell

Ny migrasjon i `memory/migrations/`:

```sql
CREATE TABLE knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  category TEXT NOT NULL,
  context TEXT,
  source_task_id UUID,
  source_model TEXT,
  source_quality_score INT,
  embedding vector(1536),
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
  USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_knowledge_category ON knowledge (category);
CREATE INDEX idx_knowledge_status_confidence ON knowledge (status, confidence);
```

### 7.2 maybeDistill() — auto-destillering

Ny funksjon i `agent/completion.ts`, kalles etter STEP 12 (etter memory.store og før sandbox.destroy):

Trigger-betingelser:
- qualityScore >= 7
- Oppgaven hadde minst 1 retry ELLER produserte filer med ny pattern
- Oppgaven er ikke triviell (< 100 tokens output)

Input til AI (billigste modell):
- Oppgavebeskrivelse (maks 200 tokens)
- Feil som oppsto og fixes (maks 300 tokens)
- Filtyper og patterns (maks 200 tokens)

Output: 0-3 regler med category og context.

Før lagring: embed regel via Voyage AI, sjekk duplikat (cosine > 0.85 mot eksisterende). Duplikat → styrk eksisterende (confidence += 0.1). Ny → lagre med confidence 0.5.

### 7.3 Knowledge-injection i skills/engine.ts

Utvid `resolve()`:
1. Etter eksisterende skills-matching
2. Embed oppgavebeskrivelsen (eller bruk cachet embedding fra context)
3. pgvector-søk mot knowledge-tabellen: `WHERE status = 'active' AND confidence > 0.4`
4. Ta topp 5 resultater
5. Bygg `## Learned Knowledge` seksjon, injiser etter `## Active Skills`
6. Returner knowledge-IDer i ResolveResponse for feedback-tracking

### 7.4 Feedback-loop

I `skills/engine.ts` executePostRun():
- Etter kvalitetssjekk av AI-output
- Output OK (ingen issues) → `UPDATE knowledge SET times_helped = times_helped + 1 WHERE id = ANY($ids)`
- Output har problemer → `UPDATE knowledge SET times_hurt = times_hurt + 1 WHERE id = ANY($ids)`
- Oppdater confidence: `confidence = times_helped::float / GREATEST(times_helped + times_hurt, 1)`

### 7.5 Memory-service endepunkter

Nye endepunkter i `memory/memory.ts`:
- `POST /memory/knowledge/store` (intern) — lagre destillert knowledge
- `POST /memory/knowledge/search` (intern) — pgvector-søk for injection
- `POST /memory/knowledge/feedback` (intern) — oppdater times_helped/hurt
- `GET /memory/knowledge/list` (auth) — for frontend-visning
- `GET /memory/knowledge/stats` (auth) — aggregert statistikk

### Leveranse Sprint 7
- TheFold destillerer automatisk 0-3 regler per fullført oppgave
- Regler injiseres i alle fremtidige AI-kall via semantisk matching
- Feedback-loop oppdaterer confidence basert på resultat
- Estimert: 50+ knowledge-regler etter 30 oppgaver

---

## Sprint 8 — Søvn-systemet (selv-evaluering)

**Mål:** TheFold evaluerer og forbedrer seg selv ukentlig.

### 8.1 sleep_logs-tabell

Ny migrasjon i `agent/migrations/`:

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

### 8.2 Søvn-cron

Ny CronJob i `agent/sleep.ts`:

```
Schedule: "0 3 * * 0" (søndag kl 03:00 UTC)
```

**Steg 1: Arkivering**
- `WHERE confidence < 0.3 AND last_applied_at < NOW() - INTERVAL '30 days' AND status = 'active'`
- Sett status = 'archived'
- Ingen AI-kall, bare DB-operasjon

**Steg 2: Review av tvilsomme**
- `WHERE confidence BETWEEN 0.3 AND 0.5 AND times_applied > 5 AND status = 'active'`
- Maks 20 regler per søvn
- Send til AI (Haiku): "Vurder disse reglene. For hver: behold, forbedre tekst, eller slett."
- Anvend resultat

**Steg 3: Promotering**
- `WHERE confidence > 0.8 AND times_applied > 10 AND status = 'active'`
- Sett status = 'promoted'
- Promoterte regler vises i dashboard som "sterk kunnskap"

**Steg 4: Merging**
- Finn par med embedding cosine similarity > 0.9
- Send til AI (Haiku): "Slå sammen til én bedre regel."
- Erstatt begge med merged versjon

**Steg 5: Skriv rapport**
- Lagre i sleep_logs med full rapport-JSONB
- Send chat-notifikasjon med oppsummering

### 8.3 Frontend: /tools/knowledge

Ny side i frontend dashboard:
- Liste over all knowledge med confidence, kategori, status
- Filter: active/promoted/archived
- Søk i regler
- Vis siste søvn-rapport
- Manuell: arkiver/aktiver knowledge

### Leveranse Sprint 8
- Ukentlig søvn-syklus som rydder, forbedrer, og promoterer knowledge
- Frontend-visning av TheFolds lærte kunnskap
- Estimert søvn-kostnad: ~$0.01/uke

---

## Sprint 9 — Prosjektmanifest (helhetlig prosjektforståelse)

**Mål:** TheFold forstår hele prosjektet, ikke bare filvinduet.

### 9.1 project_manifests-tabell

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

### 9.2 Auto-generering

I `agent/context-builder.ts` (eller ny fil `agent/manifest.ts`):

**getOrCreateManifest(owner, repo):**
1. Sjekk DB: finnes manifest for dette repoet?
2. Hvis ja og < 24 timer gammelt: returner
3. Hvis nei eller > 24 timer: generer/oppdater

**Generering (første gang):**
- Les filtre fra GitHub (allerede tilgjengelig)
- Identifiser nøkkelfiler: package.json, tsconfig.json, encore.app, filer med "service" i navn, types-filer, config-filer
- Send til AI (Haiku): "Beskriv denne arkitekturen kompakt. Services, datamodeller, kontrakter mellom dem."
- Lagre i DB

**Oppdatering (etter fullført oppgave):**
- Send manifestet + endrede filer til AI (Haiku): "Oppdater manifestet basert på disse endringene."
- Inkrementell — ikke re-analyser hele prosjektet

### 9.3 Injection i agent-loop

I `agent/context-builder.ts` setupCuratedContext():
- Hent manifest for dette repoet
- Injiser som `## Project Architecture` i konteksten
- Før filinnhold, etter memory — manifestet gir kontekst for å forstå filene

I `agent/orchestrator.ts` curateContext():
- Samme injection for alle oppgaver i et prosjekt
- Manifestet oppdateres mellom faser (etter reviseProjectPhase)

### 9.4 Endepunkter

- `POST /memory/manifest/get` (intern) — hent eller generer manifest
- `POST /memory/manifest/update` (intern) — inkrementell oppdatering
- `GET /memory/manifest/view` (auth) — for frontend-visning
- `POST /memory/manifest/edit` (auth) — manuell redigering

### Leveranse Sprint 9
- TheFold forstår hele prosjektarkitekturen, alltid
- Manifestet oppdateres automatisk etter hver oppgave
- Kontekst for hver AI-kall inkluderer systemforståelse (500-800 tokens)
- Du kan lese og redigere manifestet

---

## Sprint 10 — Kontraktbasert dekomponering (ingen glemming mellom faser)

**Mål:** Store prosjekter dekomponeres med eksplisitte kontrakter mellom faser.

### 10.1 Utvidelse av project_tasks

Ny migrasjon i `agent/migrations/`:

```sql
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS input_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS output_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS contracts_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS actual_output JSONB;
```

### 10.2 Oppdater ai.decomposeProject()

I `ai/ai.ts`:
- Prompt-endring: AI skal generere input/output-kontrakter per oppgave
- "For hver oppgave: definer hva den forventer (input-kontrakt) og hva den lover å levere (output-kontrakt)"
- Kontrakt-format: `["User-modell får nytt felt: stripeCustomerId (TEXT)", "Ny endpoint: POST /users/connect-stripe"]`

### 10.3 Kontraktverifisering i orchestrator

I `agent/orchestrator.ts` executeProject():
- Etter hver fullført oppgave: verifiser output-kontraktene
- Sammenlign `output_contracts` med `actual_output` (filer som ble produsert)
- Send til AI (Haiku): "Ble disse kontraktene oppfylt?" (500 tokens)
- Hvis nei: flagg avviket i `verification_notes`, vurder om neste fase skal starte

Før neste fase:
- Injiser forrige fases output-kontrakter + verification i neste fases kontekst
- AI-en vet nøyaktig hva som ble levert og hva den kan bygge videre på

### 10.4 Frontend: Prosjekt-visning med kontrakter

Utvid eksisterende prosjekt-status-visning:
- Vis kontrakter per fase (hva forventes, hva ble levert)
- Grønn/rød indikator på kontraktverifisering
- Mulighet til å manuelt godkjenne/avvise kontraktbrudd

### Leveranse Sprint 10
- Store prosjekter har eksplisitte kontrakter mellom faser
- Automatisk verifisering fanger avvik før de forplanter seg
- Estimert: 80% reduksjon i feil der fase N bygger på noe fase N-1 aldri leverte

---

## Sprint 11 — Scheduled tasks (TheFold som proaktiv assistent)

**Mål:** TheFold utfører oppgaver på planlagte tidspunkter.

### 11.1 scheduled_tasks-tabell

Ny migrasjon i `agent/migrations/`:

```sql
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
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

### 11.2 Task-typer

5 typer med ulik kjøre-logikk:

**notify:** Ingen AI. Send chat-melding direkte. Kostnad: $0.
**review:** Hent filer fra repo, send til AI for code review. Send resultat som chat-notifikasjon. Kostnad: ~$0.07.
**analyze:** Hent metrics (test-coverage, deps, kompleksitet), generer rapport. Kostnad: ~$0.003.
**build:** Opprett task i tasks-service, start agent. Full agent-loop-kostnad.
**benchmark:** Kjør modell-benchmark (se Sprint 12). Kostnad: ~$0.10.

### 11.3 Cron-runner

Ny CronJob i `agent/scheduled.ts`:

```
Schedule: "*/15 * * * *" (hvert 15. minutt)
```

Kjør alle scheduled tasks der `next_run_at <= NOW() AND status = 'active'`. Etter kjøring: oppdater `last_run_at`, `run_count`, beregn `next_run_at` fra `cron_expression`.

For `run_in_sleep = true`: hopp over i cron-runner, kjøres av søvn-systemet i stedet.

### 11.4 Endepunkter

- `POST /agent/scheduled/create` (auth)
- `POST /agent/scheduled/update` (auth)
- `POST /agent/scheduled/delete` (auth)
- `GET /agent/scheduled/list` (auth)
- `POST /agent/scheduled/run-due` (intern, cron)

### 11.5 Frontend: /tools/scheduled

- Liste over aktive scheduled tasks med neste kjøring
- Opprett ny (velg type, tid/cron, konfigurasjon)
- Historikk med resultater
- Pause/resume/slett

### Leveranse Sprint 11
- TheFold kjører oppgaver på planlagte tider
- 5 task-typer dekker review, analyse, notifikasjoner, bygging, benchmarks
- Du kontrollerer alt — ingen automatisk token-bruk

---

## Sprint 12 — Modell-benchmarks (informert modellvalg)

**Mål:** Du kan sammenligne modeller på spesifikke oppgaver.

### 12.1 model_benchmarks-tabell

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

### 12.2 Benchmark-logikk

I `ai/benchmarks.ts`:

1. Kjør oppgaven gjennom alle valgte modeller med identisk prompt (skills + knowledge inkludert)
2. Mål: tokens brukt, kostnad, varighet, output-lengde
3. AI-dommer (billigste modell) evaluerer alle outputs: kvalitet 0-100, følger instruksjoner, idiomatisk kode
4. Lagre resultater, beregn vinner

### 12.3 Endepunkter

- `POST /ai/benchmarks/create` (auth)
- `POST /ai/benchmarks/run` (auth)
- `GET /ai/benchmarks/list` (auth)
- `GET /ai/benchmarks/get` (auth)

### 12.4 Frontend: /tools/benchmarks

- Opprett: velg modeller, skriv oppgave
- Liste med vinner-indikasjon
- Detalj: side-by-side outputs med score

### Leveranse Sprint 12
- Du kan teste "Kimi vs Sonnet på backend-oppsett" med ett klikk
- Resultater lagres og informerer fremtidige modellvalg
- Kan kjøres i søvn-syklusen for å unngå dagstid-bruk

---

## Sprint 13 — Persistent dependency graph + diff-basert kontekst

**Mål:** TheFold ser endringer, ikke hele prosjektet på nytt hver gang.

### 13.1 project_dependency_graph-tabell

```sql
CREATE TABLE project_dependency_graph (
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  graph JSONB NOT NULL,
  file_count INT,
  edge_count INT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (repo_owner, repo_name)
);
```

### 13.2 Inkrementell oppdatering

Etter fullført oppgave: oppdater kun endrede filer i grafen. Ikke re-analyser hele prosjektet.

### 13.3 Diff-basert kontekst

Ny kolonne i project_manifests:
```sql
ALTER TABLE project_manifests ADD COLUMN IF NOT EXISTS file_hashes JSONB DEFAULT '{}';
```

I context-builder: sammenlign file hashes med forrige kjøring. Send kun endrede filer til AI.

### 13.4 Token-effekt

Estimert 40-60% reduksjon i kontekst-tokens for oppgaver i kjente prosjekter. Ikke 84% som AI Brain-planen estimerte (den antok frontend sender filer — vi henter fra GitHub).

### Leveranse Sprint 13
- Import-graf lagret persistent, oppdatert inkrementelt
- Diff-basert filvalg reduserer kontekst med 40-60%
- Kombinert med knowledge og manifest: agent-oppgaver bruker ~35% færre tokens enn baseline

---

## Sprint 14 — Selv-evaluering under arbeid (tettere feedback-loop)

**Mål:** TheFold stopper seg selv midt i arbeid hvis noe ikke stemmer.

### 14.1 Manifest-validering i build-loop

I `builder/phases.ts` implement-fasen:
- Etter hver generert fil: sjekk om filen er konsistent med prosjektmanifestet
- Hvis ny import som ikke matcher manifestets services → logg advarsel
- Hvis fil bryter med manifestets conventions → pause og re-generér

### 14.2 Plan-validering mot manifest

I `agent/execution.ts` etter planTask():
- Sammenlign planens filer med manifestets dependency graph
- Fanger: "planen endrer UserService men nevner ikke OrderService som avhenger av den"
- Kostnad: ~200 tokens (Haiku sammenligner plan-JSON med manifest)

### 14.3 Intra-task confidence

Ny sjekk mellom STEP 6 (build) og STEP 7 (validate):
- Før validering: rask selvevaluering av generert kode
- "Matcher dette planen? Har jeg glemt noe?"
- Kostnad: ~500 tokens

### Leveranse Sprint 14
- TheFold fanger feil under arbeid, ikke bare etter validering
- Manifest-validering forhindrer inkonsistente endringer
- Estimert: 30% reduksjon i retries (feil fanges tidligere)

---

## Samlet tidslinje

```
Sprint 6:  Bugs + sikkerhet (nåværende)          → Stabil plattform
Sprint 7:  Knowledge-system                       → TheFold begynner å lære
Sprint 8:  Søvn-system                            → TheFold vedlikeholder seg selv
Sprint 9:  Prosjektmanifest                       → TheFold forstår helheten
Sprint 10: Kontraktbasert dekomponering           → Store prosjekter uten glemming
Sprint 11: Scheduled tasks                        → TheFold som proaktiv assistent
Sprint 12: Modell-benchmarks                      → Informert modellvalg
Sprint 13: Diff-basert kontekst + dependency graf → 40-60% token-besparelse
Sprint 14: Selv-evaluering under arbeid           → Tettere feedback-loop
```

Etter Sprint 14: TheFold er en fullverdig hjerne som lærer, forstår hele prosjekter, dekomponerer med kontrakter, evaluerer seg selv, og blir billigere over tid. Estimert hjerne-dekning: ~85%.

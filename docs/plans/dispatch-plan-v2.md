# TheFold — Dispatch Kjøreplan v2.0

> **Erstatter:** dispatch-plan.md, Forbedringsplan, Implementeringsplan, Oppgraderingsplan
> **Dato:** 10. april 2026
> **Bruk:** Send «Kjør D1», «Kjør D5» osv. fra telefon. Claude leser denne filen og relevante kodefiler automatisk.

---

## Fullført

- Sprint 6.25 — ai.ts restrukturering + multi-provider (7 commits)
- Sprint 6.25b — Prompt cleanup, alle system prompts til engelsk (3 commits)
- Sprint 7 D1–D8 — Agent tool-use arkitektur (19 tools, 5 kategorier, merged via PR #3)

---

## Sprint 8 — Kritiske Fikser + Aktivering

Mål: Fiks kompileringsfeil, aktiver tool-loop, test. Før alt nytt.

### D1: Fiks kompileringsfeil i agent.ts

*Ufullstendig getTaskTrace() metode rundt linje 994 mangler lukkende klammer. Bryter hele builden.*

1. Les `agent/agent.ts`, finn `getTaskTrace()` metoden
2. Fiks manglende lukke-klammer (sannsynligvis 1–2 manglende `}`)
3. Kjør: `npx tsc --noEmit` for å verifisere

**Commit:** `fix: complete getTaskTrace method in agent.ts`

---

### D2: Fiks context-builder.test.ts encoding

*Filen har 550+ null bytes appendet som gir TypeScript-feil.*

1. Les `context-builder.test.ts`, fjern alle null bytes fra slutten av filen
2. Kjør: `npx tsc --noEmit` for å verifisere

**Commit:** `fix: remove null bytes from context-builder.test.ts`

---

### D3: Fiks search_skills til å bruke skills.resolve()

*search_skills i agent-tool-executor.ts kaller skills.listSkills() i stedet for skills.resolve(). Misser routing-rule-basert filtrering.*

**Avhenger av:** D1

Endre `agent/agent-tool-executor.ts`:
- Endre `search_skills` case til å kalle `skills.resolve()` med context-mapping
- Map `input.context` til `taskType` parameter
- Returner matchede skills med `promptFragment` (trimmet til 2000 tokens per skill)
- Fiks `activate_skill`: etter toggle, returner full `promptFragment` så AI-en kan bruke den direkte i neste iterasjon

**Commit:** `fix: use skills.resolve() in search_skills agent tool`

---

### D4: Aktiver AgentToolLoopEnabled + test

*Sett feature flag til true. Test med en enkel oppgave.*

**Avhenger av:** D1, D2, D3

1. I `.secrets.local.cue`: sett `AgentToolLoopEnabled: "true"`
2. Start `encore run`, opprett en enkel oppgave via chat (f.eks. «fix typo in README»)
3. Verifiser agent bruker tools: `repo_get_tree` → `repo_read_file` → `repo_write_file` → `build_validate`
4. Fiks eventuelle runtime-feil som dukker opp
5. Kjør `npx tsc --noEmit` — null feil

**Commit:** `feat: enable agent tool loop (AgentToolLoopEnabled = true)`

---

### D5: Komplett typecheck — null feil

*Kjør full tsc --noEmit og fiks ALLE gjenværende TypeScript-feil.*

**Avhenger av:** D1, D2

1. Kjør: `npx tsc --noEmit 2>&1 | head -100`
2. Fiks alle feil systematisk. Vanlige issues: manglende imports, type-mismatches mellom services, ubrukte variabler (fjern eller prefix med `_`)
3. Kjør `tsc --noEmit` igjen. Null feil = ferdig

**Commit:** `fix: resolve all TypeScript compilation errors`

---

## Sprint 9 — Mikro-Beslutninger (Hjerne-modus)

Kilde: Forbedringsplan Fase 1. Hopp over full AI-pipeline for enkle oppgaver.

### D6: Decision Cache + migrasjon

*Opprett agent/decision-cache.ts med CachedDecision interface og DB-tabell.*

**Nye filer:**
- `agent/decision-cache.ts` (~150 linjer)
  - `CachedDecision` interface: pattern, patternRegex, confidence, strategy (`fast_path` | `standard` | `careful`), skipConfidence, skipComplexity, preferredModel, planTemplate, successCount, failureCount
  - `matchDecision(taskDescription)`: sjekk regex + embedding similarity mot cache
  - `updateDecisionCache(pattern, success)`: juster confidence basert på resultat
- `agent/migrations/X_create_decision_cache.up.sql`
  - `decision_cache` tabell: id UUID PK, pattern TEXT, pattern_regex TEXT, confidence FLOAT, strategy TEXT, skip_confidence BOOLEAN, skip_complexity BOOLEAN, preferred_model TEXT, plan_template JSONB, success_count INT, failure_count INT, embedding vector(512), created_at, updated_at

**Commit:** `feat: add decision cache for micro-decisions (Sprint 9 D6)`

---

### D7: Pattern Matcher

*Hardkodede regex-mønstre for vanlige oppgavetyper.*

**Ny fil:** `agent/pattern-matcher.ts` (~100 linjer)
- `TASK_PATTERNS` array med regex + strategi-mapping:
  - typo/spelling/rename → `fast_path`, haiku, skip confidence+complexity+plan
  - add/missing import → `fast_path`, haiku, skip confidence+complexity
  - update version/dep → `fast_path`, haiku, skip confidence
  - migration/schema → `standard`, sonnet, skip confidence
  - new feature/component → `careful`, sonnet/opus, skip nothing
- `matchPattern(taskDescription)`: returnerer `PatternMatch | null`

**Commit:** `feat: add pattern matcher for task classification (Sprint 9 D7)`

---

### D8: Koble mikro-beslutninger til agent-loop

*Legg til fast-path sjekk i agent.ts mellom context og confidence.*

**Avhenger av:** D6, D7

Endre `agent/agent.ts` — etter `buildContext()`, før `assessAndRoute()`:
1. `matchPattern(taskDescription)` → PatternMatch
2. `matchDecision(taskDescription)` → CachedDecision
3. Hvis match.confidence > 0.85 → FAST PATH: hopp over AI confidence + complexity
4. Bruk cached model/plan direkte
5. Ved feil → fallback til standard pipeline, oppdater cache

Endre `agent/completion.ts` — etter oppgave:
- Fast-path suksess → øk pattern confidence
- Fast-path feil → reduser confidence
- Standard-path triviell (<30s, <1000 tokens) → opprett ny fast-path entry

**Commit:** `feat: wire micro-decisions into agent loop (Sprint 9 D8)`

---

## Sprint 10 — Smart Retry + Token Policy

Kilde: Forbedringsplan Fase 3. Stopp håpløse retries tidlig.

### D9: Retry Productivity Tracking + Early Termination

*Track fremgang per retry-forsøk. Stopp når retries ikke gjør progress.*

Endre `agent/types.ts` — legg til `RetryProductivity` i `AttemptRecord`:
```typescript
interface RetryProductivity {
  attemptNumber: number;
  filesChanged: number;
  validationErrorsFixed: number;
  newErrorsIntroduced: number;
  outputTokens: number;
}
```

Endre `agent/execution.ts`:
- Track `RetryProductivity` for hvert forsøk
- Etter 3+ forsøk, stopp hvis siste 2:
  - Fikset 0 feil, ELLER
  - Introduserte flere feil enn de fikset, ELLER
  - Endret < 2 filer OG < 1000 output tokens
- Eskaler til `impossible_task` i stedet for å bruke siste forsøk

**Commit:** `feat: add retry productivity tracking with early termination`

---

### D10: Token Policy Enforcement

*Oppgrader token-policy fra logging-only til soft enforcement.*

Endre `agent/token-policy.ts`:
- 80% av budsjett → logg warning
- 100% → hint til AI om kortere output (inject i neste prompt)
- 150% → hard-stop fasen, gå videre til neste
- Ny funksjon: `enforcePolicy(phase, tokensUsed)` → `'continue' | 'warn' | 'stop'`

Endre `agent/execution.ts` — kall `enforcePolicy()` etter hvert AI-kall i retry-loopen.

**Commit:** `feat: enforce token policy with soft limits`

---

## Sprint 11 — Dream Mode (Søvn + Minnekonsolidering)

Kilde: Forbedringsplan Fase 2 + Implementeringsplan Sprint 8. TheFold vedlikeholder seg selv.

### D11: Dream Engine + migrasjon

*Opprett memory/dream.ts med CronJob og 5 konsolideringsfaser.*

**Ny fil:** `memory/dream.ts` (~250 linjer)

CronJob: schedule `"0 3 * * 0"` (søndag kl 03:00 UTC)

4 gates før kjøring:
1. **Tidsgate:** `last_dream_at` i `memory_meta` tabell, < 24t → skip
2. **Aktivitetsgate:** < 3 fullførte oppgaver siden sist → skip
3. **Advisory lock:** `pg_try_advisory_lock(42424242)`
4. **Kvalitetssjekk** etter konsolidering

5 faser:
1. **SCAN:** Finn minneklynger (similarity > 0.7, gruppert per repo+type)
2. **ANALYZE:** For hver klynge, identifiser kjerneinnsikt via AI (Haiku)
3. **MERGE:** Opprett nytt raffinert minne, marker originaler som `superseded`
4. **META:** Generer meta-observasjoner på tvers av oppgaver
5. **PRUNE:** Fjern minner som er både lav-relevans OG superseded

**Ny migrasjon:** `memory/migrations/X_add_dream_meta.up.sql`
```sql
CREATE TABLE memory_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Commit:** `feat: add dream mode engine with 5 consolidation phases`

---

### D12: AI Consolidation endpoint + Dream output types

*Nytt AI-endpoint for minnekonsolidering + tre output-typer.*

**Avhenger av:** D11

Endre `ai/ai.ts` — nytt endpoint `consolidateMemories`:
- Input: 3+ lignende minner
- Output: Én raffinert innsikt (ikke konkatenering)
- Modell: haiku (billigst, tilstrekkelig for oppsummering)

Dream-motoren genererer tre typer output:
- **Konsoliderte minner:** Sammenslåtte klynger
- **Strategi-minner:** Generaliserte mønstre fra suksessfulle oppgaver
- **Anti-patterns:** Fra mislykkede oppgaver — hva man IKKE skal gjøre

Endre `memory/memory.ts` — eksporter interne søk-funksjoner dream-motoren trenger.

**Commit:** `feat: add AI consolidation endpoint for dream mode`

---

## Sprint 12 — Knowledge System

Kilde: Implementeringsplan Sprint 7 + Masterplan. TheFold lærer regler fra fullførte oppgaver.

### D13: Knowledge-tabell + endpoints

*Opprett knowledge-tabell i memory-service med CRUD endpoints.*

**Ny migrasjon:** `memory/migrations/X_create_knowledge.up.sql`
```sql
CREATE TABLE knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  category TEXT NOT NULL,
  context TEXT,
  source_task_id UUID,
  source_model TEXT,
  embedding vector(512),  -- VIKTIG: 512, IKKE 1536, for konsistens med memories
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

Endre `memory/memory.ts` — 5 nye endpoints:
| Endpoint | Expose | Auth |
|----------|--------|------|
| `POST /memory/knowledge/store` | false | Nei |
| `POST /memory/knowledge/search` | false | Nei |
| `POST /memory/knowledge/feedback` | false | Nei |
| `GET /memory/knowledge/list` | true | Ja |
| `GET /memory/knowledge/stats` | true | Ja |

**Commit:** `feat: add knowledge table and endpoints`

---

### D14: maybeDistill() + Knowledge Injection

*Auto-destiller regler fra fullførte oppgaver. Inject i skills pipeline.*

**Avhenger av:** D13

Endre `agent/completion.ts` — ny funksjon `maybeDistill()`:
- Trigger: `qualityScore >= 7` OG (retries > 0 ELLER ny pattern)
- Input til AI (Haiku): oppgavebeskrivelse + feil + filtyper
- Output: 0-3 regler med category og context
- Dedup: cosine > 0.85 mot eksisterende → styrk, ellers lagre ny
- Kalles etter `memory.store`, før `sandbox.destroy`

Endre `skills/engine.ts` — utvid `resolve()`:
- Etter skills-matching: pgvector-søk mot knowledge `WHERE status='active' AND confidence>0.4`
- Topp 5 resultater injisert som `## Learned Knowledge`
- Oppdater `hashResolveInput()` for cache-invalidering

Endre `skills/engine.ts` — `executePostRun()` feedback-loop:
- OK output → `times_helped++`, problemer → `times_hurt++`

**Commit:** `feat: add knowledge distillation and injection pipeline`

---

## Sprint 13 — Sikkerhet

Kilde: Forbedringsplan Fase 4. Permissions, immutable audit, file scanner.

### D15: Permission Layer + Immutable Audit

*Tre-lags permission-system og immutable audit log.*

**Nye filer:**
- `agent/permissions.ts` (~200 linjer)
  - Tier 1: Statisk risiko-kart per action — O(1) lookup
  - Tier 2: DB-baserte policy-regler — konfigurerbar
  - Tier 3: Human-in-the-loop for destruktive operasjoner
  - Risikonivå: `read` (alltid), `write` (regel-sjekket), `destructive` (godkjenning)
  - Erstatter spredt `validateAgentScope()`
- `agent/migrations/X_create_permission_rules.up.sql`
- `agent/migrations/X_immutable_audit.up.sql`
  - DB-trigger: `BEFORE UPDATE OR DELETE ON agent_audit_log → RAISE EXCEPTION`

Endre `agent/helpers.ts` — erstatt `validateAgentScope` med `checkPermission`.
Endre `agent/completion.ts` — wrap PR-operasjoner i permission check.

**Commit:** `feat: add permission layer and immutable audit log`

---

### D16: File Scanner for AI-generert kode

*Skann genererte filer FØR skriving til sandbox.*

**Ny fil:** `sandbox/file-scanner.ts` (~100 linjer)

Skanner for:
- `process.env` bruk (bryter Encore.ts-regler)
- Hardkodede API-nøkler (regex-mønstre)
- `eval()`, `child_process`, `exec()` imports
- SQL `DROP TABLE` uten `IF EXISTS`

Returnerer: `{ safe: boolean, warnings: string[] }`

Endre `sandbox/sandbox.ts` — kall file-scanner i `writeFile()`.

**Commit:** `feat: add file scanner for AI-generated code`

---

## Sprint 14 — Kontekstkompresjon + Hooks

Kilde: Forbedringsplan Fase 5+6. Unified trimming + phase-end hooks.

### D17: Unified Context Strategy + summarizeFile()

*Erstatt enkel trim-logikk med deklarativ strategi.*

Endre `agent/context-builder.ts`:
```typescript
interface ContextStrategy {
  trigger: { type: 'tokens'; threshold: number };
  retain: { type: 'priority_weighted'; maxTokens: number };
  compress: {
    files: 'signatures_only' | 'full' | 'drop';
    memory: 'recent_5' | 'full' | 'drop';
    docs: 'relevant' | 'full' | 'drop';
    tree: 'summarize' | 'full' | 'drop';
  };
}
```

- `compressContext(context, strategy)` — erstatter `trimContext()`
- `summarizeFile(content)`: reduser til exports/interfaces/function-signaturer

Endre `agent/orchestrator.ts` — erstatt custom trimming med shared `compressContext()`.

Estimert 30% token-reduksjon for store kontekster.

**Commit:** `feat: add unified context compression with declarative strategy`

---

### D18: Phase-End Hooks

*Sentraliser fire-and-forget logikk fra completion.ts.*

**Ny fil:** `agent/hooks.ts` (~120 linjer)
- `registerHook(phase, callback)` og `runHooks(phase, context)`
- Default hooks:
  - `after:building` → ekstraher kode-patterns fra genererte filer
  - `after:completed` → lagre minne, strategi, oppdater decision cache
  - `after:failed` → lagre error pattern, sjekk lignende feil i minne
  - `after:reviewing` → (reservert for fremtid)

Endre `agent/completion.ts` — erstatt inline logikk med `runHooks()`.
Endre `agent/execution.ts` — kall `runHooks('building')` etter builder ferdig.

**Commit:** `feat: add phase-end hooks system`

---

## Sprint 15 — Prosjektmanifest

Kilde: Implementeringsplan Sprint 9 + Masterplan. TheFold forstår hele prosjektarkitekturen.

### D19: Manifest-tabell + auto-generering

*project_manifests tabell + getOrCreateManifest() funksjon.*

**Ny migrasjon:** `memory/migrations/X_create_manifests.up.sql`
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

**Ny fil:** `agent/manifest.ts` (~150 linjer)
- `getOrCreateManifest(owner, repo)`: sjekk DB/cache → generer via AI (Haiku) → lagre
- `updateManifest(owner, repo, changedFiles)`: inkrementell oppdatering

4 endpoints i `memory/memory.ts`:
- `POST /memory/manifest/get`, `/update` (intern)
- `GET /memory/manifest/view`, `POST /edit` (auth)

**Commit:** `feat: add project manifest system`

---

### D20: Manifest injection i agent-loop

*Inject manifest som ## Project Architecture i kontekst.*

**Avhenger av:** D19

Endre `agent/context-builder.ts` — `buildContext()`:
- Hent manifest via `getOrCreateManifest()`
- Inject som `## Project Architecture` — før filer, etter memory
- Prioritet: høyere enn memory/docs (500-800 tokens)

Endre `agent/orchestrator.ts` — `curateContext()`:
- Samme injection for alle oppgaver i prosjekt

Endre `agent/completion.ts` — etter fullført oppgave:
- Kall `updateManifest()` med endrede filer

**Commit:** `feat: inject project manifest into agent context`

---

## Sprint 16 — Søvn-system (Ukentlig Selv-evaluering)

Kilde: Implementeringsplan Sprint 8. Bygger på Dream Mode (D11-D12) og Knowledge (D13-D14).

### D21: Sleep Logs + Søvn-cron

*Ukentlig søvn-syklus som rydder, forbedrer og promoterer knowledge.*

**Avhenger av:** D13, D14

**Ny migrasjon:** `agent/migrations/X_create_sleep_logs.up.sql`
```sql
CREATE TABLE sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  knowledge_reviewed INT DEFAULT 0,
  knowledge_archived INT DEFAULT 0,
  knowledge_promoted INT DEFAULT 0,
  knowledge_merged INT DEFAULT 0,
  cost_usd FLOAT DEFAULT 0,
  tokens_used INT DEFAULT 0,
  report JSONB,
  status TEXT DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Ny fil:** `agent/sleep.ts` (~200 linjer)
- CronJob: `"0 3 * * 0"` (søndag 03:00 UTC) — kolliderer IKKE med monitor/registry
- Steg 1: **Arkivering** — confidence < 0.3 AND inactive 30d → archived
- Steg 2: **Review** — confidence 0.3-0.5, maks 20 regler, AI (Haiku) vurderer
- Steg 3: **Promotering** — confidence > 0.8 AND times_applied > 10 → promoted
- Steg 4: **Merging** — cosine similarity > 0.9 par → AI merger
- Steg 5: **Rapport** — lagre i sleep_logs, send chat-notifikasjon

Estimert kostnad: ~$0.01/uke.

**Commit:** `feat: add weekly sleep system for knowledge maintenance`

---

## Sprint 17 — Basalganglier (Automatiserte Vaner)

Kilde: Oppgraderingsplan Fase 1. 0-token routing for kjente oppgavetyper.

### D22: Routing Patterns + Task Type Profiles

*Automatisk routing uten AI-kall for kjente mønstre.*

**Avhenger av:** D8

**Ny migrasjon:** `agent/migrations/X_create_routing_patterns.up.sql`
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

**Ny fil:** `agent/routing-patterns.ts` (~200 linjer)
- `recordRoutingPattern(task, result)`: lagre etter fullført oppgave
- `matchRoutingPattern(message)`: keyword overlap + file pattern match
- Hvis confidence > 0.8 og hit_count > 5: bruk direkte (0 tokens)

Endre `chat/chat.ts` — sjekk routing patterns før AI auto-routing.
Endre `agent/completion.ts` — kall `recordRoutingPattern()` etter oppgave.

Effekt: 70-80% av requests rutes uten AI-kall etter 4-8 uker.

**Commit:** `feat: add automated routing patterns for 0-token task routing`

---

## Sprint 18 — Kontraktbasert Dekomponering

Kilde: Implementeringsplan Sprint 10. Eksplisitte kontrakter mellom prosjektfaser.

### D23: Kontrakter i project_tasks + verifisering

*Input/output-kontrakter per oppgave med automatisk verifisering.*

**Ny migrasjon:** `agent/migrations/X_add_contracts.up.sql`
```sql
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS input_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS output_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS contracts_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS actual_output JSONB;
```

Endre `ai/ai.ts` — `decomposeProject()` prompt-endring:
- AI genererer input/output-kontrakter per oppgave

Endre `agent/orchestrator.ts` — `executeProject()`:
- Etter hver oppgave: verifiser output-kontrakter mot actual_output (Haiku, ~500 tokens)
- Før neste fase: inject forrige fases kontrakter + verification i kontekst

Estimert: 80% reduksjon i fase-avhengighetsfeil.

**Commit:** `feat: add contract-based project decomposition with verification`

---

## Sprint 19+ — Avansert (Langsiktig)

Disse er større features fra Oppgraderingsplan Fase 2-7. Hver kan brytes ned i sub-dispatches når de er aktuelle.

### D24: Anomali-deteksjon (Amygdala)

*Statistisk anomali-deteksjon med baselines og alerts.*

Nye filer: `agent/anomaly.ts` + migrasjon
- `anomaly_baselines`: metric, mean, stddev, sample_count
- `anomaly_alerts`: metric, expected/actual_value, deviation_sigmas, severity
- Etter hvert AI-kall: sjekk tokens > 3σ, feilrate > 3σ, kostnad > 2σ
- Info → dashboard, Warning → chat, Critical → pause agent

**Commit:** `feat: add anomaly detection with statistical baselines`

---

### D25: Proaktiv scanning (Autonome nervesystemet)

*Periodisk repo-scanning med varsler.*

**Avhenger av:** D13

Ny fil: `agent/proactive-scan.ts`
- CronJob: hverdager 07:00
- Scanner: pnpm audit, utdaterte deps, test-dekning, knowledge pitfalls
- Output: chat-notifikasjon kun ved funn (ingen spam)
- Konfigurerbar: repos, terskler, on/off

**Commit:** `feat: add proactive repository scanning`

---

### D26: Episodisk minne (Hippocampus)

*Sammenhengende historier fra prosjekter, ikke bare enkelt-fakta.*

**Avhenger av:** D21

- Ny minnetype `episode` i memory-service
- Etter fullførte prosjekter (orchestrator): generer episode-summary
- Episoder er mer verdifulle enn fakta for komplekse oppgaver
- Tematisk konsolidering: 20+ regler → 5-7 meta-prinsipper (70% færre tokens)

**Commit:** `feat: add episodic memory and thematic consolidation`

---

### D27: Diff-basert kontekst (Persistent dependency graph)

*Send kun endrede filer til AI. 40-60% token-besparelse.*

**Avhenger av:** D19

Ny migrasjon: `memory/migrations/X_create_dependency_graph.up.sql`
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

ALTER TABLE project_manifests
  ADD COLUMN IF NOT EXISTS file_hashes JSONB DEFAULT '{}';
```

Endre `agent/context-builder.ts` — sammenlign file hashes, send kun diff.
Inkrementell oppdatering etter fullført oppgave.

**Commit:** `feat: add persistent dependency graph with diff-based context`

---

### D28: Alternativ-vurdering (Prefrontal cortex)

*For komplekse oppgaver: generer 2-3 alternative planer.*

Endre `agent/execution.ts` — for complexity >= 8:
- Kjør `ai.planTask()` 2-3 ganger med ulike strategier
- AI-evaluator (Haiku) velger mest robust plan
- Eller: presenter alternativene til bruker i review

Post-mortem etter feil: generer leksjon, lagre som knowledge.

**Commit:** `feat: add multi-plan generation for complex tasks`

---

### D29: Auto-resume + Parallel builds

*Hjernestamme: gjenoppta etter krasj. Lillehjernen: parallelle builds.*

Endre `agent/agent.ts` — `startTask()` sjekker `findResumableJobs()`:
- Hvis uferdig job finnes: fortsett fra checkpoint, ikke start på nytt
- Graceful shutdown: skriv checkpoint ved terminering

Endre `builder/phases.ts` — implement-fasen:
- For uavhengige filer (ingen imports mellom): `Promise.allSettled`
- Estimert 30-50% raskere builds

**Commit:** `feat: add crash resume and parallel builds`

---

## Sprint 20 — Opprydding

### D30: Fjern gammel hardkodet agent-flyt

*Når tool-loopen er verifisert stabil: fjern legacy.*

**Avhenger av:** D4

- Fjern den gamle `executePlan`-flyten fra `execution.ts`
- Fjern `buildContext`, `assessAndRoute`, legacy 12-step flow
- Behold `handleReview` og `completeTask` som tools
- Fjern `AgentToolLoopEnabled` feature flag (alltid on)
- Oppdater CLAUDE.md med ny arkitektur

**Commit:** `chore: remove legacy hardcoded agent flow`

---

### D31: Mappestruktur + opprydding

*Flytt dokumenter, fjern sensitive filer.*

- Flytt til `docs/`: ARKITEKTUR.md, GRUNNMUR-STATUS.md, sprint-planer
- Flytt til `docs/references/`: kode-react-bits.md, prompt.md
- Fjern: `thefold-github-app.pem` (bruk `secret()` i stedet)
- Fjern: `thefold-app.jsx` (78KB dump-fil)
- IKKE flytt services — Encore.ts krever dem på root

**Commit:** `chore: reorganize docs and remove sensitive files`

---

### D32: Konsolider og arkiver gamle planfiler

*Denne planen erstatter 4 separate filer.*

- Arkiver til `docs/plans/archive/`:
  - `dispatch-plan.md` (gammel D1-D8)
  - `TheFold-Forbedringsplan.md`
  - `thefold-implementeringsplan.md`
  - `thefold-oppgraderingsplan.md`
- Behold: `thefold-masterplan.md` som referanse
- Oppdater CLAUDE.md med referanse til denne nye planen

**Commit:** `chore: archive legacy plan files, reference new dispatch plan`

---

## Avhengigheter

### Uavhengige (kan kjøres når som helst)

D1, D2, D6, D7, D9, D10, D11, D13, D15, D16, D17, D23, D24, D28, D29, D31

### Avhengighetskjeder

- D1 → D3 → D4 (kritisk sti: fiks → skills → aktiver)
- D6 + D7 → D8 → D22 (micro-decisions → routing patterns)
- D11 → D12 (dream engine → AI consolidation)
- D13 → D14 → D21 (knowledge → distillation → sleep system)
- D19 → D20 (manifest → injection)
- D19 → D27 (manifest → diff-basert kontekst)
- D13 → D25 (knowledge → proactive scan)
- D21 → D26 (sleep → episodic memory)
- D4 → D30 (aktiver tool loop → fjern legacy)

### Anbefalt kjørerekkefølge

1. **D1 + D2** (parallelt) — kritiske fikser
2. **D3 + D5** (parallelt) — skills fix + typecheck
3. **D4** — aktiver tool loop
4. **D6 + D7** (parallelt) — micro-decisions
5. **D8** — koble micro-decisions
6. **D9 + D10** (parallelt) — smart retry
7. **D11 + D13** (parallelt) — dream + knowledge
8. **D12 + D14** (parallelt) — AI consolidation + distillation
9. **D15 + D16** (parallelt) — sikkerhet
10. **D17 + D18** (parallelt) — kontekst + hooks
11. **D19 → D20** — manifest
12. **D21** — søvn-system
13. **D22-D29** — avansert (etter behov)
14. **D30-D32** — opprydding

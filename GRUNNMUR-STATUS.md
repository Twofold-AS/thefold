# TheFold — Grunnmur-status og aktiveringsplan

> Sist oppdatert: 14. februar 2026
> Formål: Oversikt over alt som er bygget inn i arkitekturen, hva som er aktivt,
> hva som er stubbet, og hva som trengs for å aktivere hver feature.

---

## Statusforklaring
- 🟢 AKTIV — Fungerer i produksjon/dev, fullt implementert
- 🟡 STUBBET — Kode eksisterer, grunnmur på plass, men returnerer dummy/passthrough
- 🔴 GRUNNMUR — Kun database-felter og/eller interfaces, ingen implementering ennå
- ⚪ PLANLAGT — Nevnt i planer men ingen kode skrevet

---

## 1. Memory-service

### Database-felter — memories

| Kolonne | Type | Status | Brukes av | Aktivering |
|---------|------|--------|-----------|------------|
| id | UUID PK | 🟢 | Alle queries | — |
| content | TEXT | 🟢 | store, search, consolidate | — |
| category | VARCHAR(50) | 🟢 | store, search, stats | — |
| conversation_id | VARCHAR(255) | 🟢 | store (fra extract) | — |
| linear_task_id | VARCHAR(255) | 🟢 | store | — |
| embedding | vector(512) | 🟢 | search (cosine similarity) | — |
| created_at | TIMESTAMPTZ | 🟢 | decay-beregning, cleanup, stats | — |
| memory_type | TEXT | 🟢 | search-filter, stats, store | 6 typer: general, skill, task, session, error_pattern, decision |
| parent_memory_id | UUID FK | 🔴 | Ingen kode refererer | Implementer hierarkisk kontekst-traversering i search |
| last_accessed_at | TIMESTAMPTZ | 🟢 | Oppdateres i search, brukes i cleanup | — |
| access_count | INT | 🟢 | Inkrementeres i search, brukes i scoring | — |
| relevance_score | DECIMAL | 🟢 | Decay-scoring i search, filtert i stats | — |
| ttl_days | INT | 🟢 | cleanup (sletter basert på TTL) | Default 90 dager |
| pinned | BOOLEAN | 🟢 | cleanup-filter, consolidate setter true | — |
| consolidated_from | UUID[] | 🟢 | Settes i consolidate | — |
| superseded_by | UUID FK | 🟢 | Filtreres ut i de fleste queries | — |
| source_repo | TEXT | 🟢 | search-filter, consolidate | — |
| source_task_id | TEXT | 🔴 | Lagres i INSERT, aldri brukt i queries | Legg til filter i search |
| tags | TEXT[] | 🟢 | search-filter (in-memory), consolidate | Flytt til SQL GIN-filter for ytelse |

### Database-felter — code_patterns

| Kolonne | Type | Status | Brukes av | Aktivering |
|---------|------|--------|-----------|------------|
| id | UUID PK | 🟢 | storePattern, searchPatterns | — |
| pattern_type | TEXT | 🟢 | searchPatterns filter | bug_fix, optimization, refactoring, new_feature |
| source_repo | TEXT | 🟢 | storePattern, searchPatterns filter | — |
| source_task_id | TEXT | 🟢 | storePattern | — |
| problem_description | TEXT | 🟢 | storePattern, returnert i resultater | — |
| solution_description | TEXT | 🟢 | storePattern, returnert i resultater | — |
| files_affected | TEXT[] | 🟢 | storePattern, returnert | — |
| code_before | TEXT | 🟢 | storePattern | — |
| code_after | TEXT | 🟢 | storePattern | — |
| bugs_prevented | INT | 🔴 | Aldri inkrementert eller lest | Inkrementer når pattern forhindrer kjent feil |
| times_reused | INT | 🟢 | Inkrementeres i searchPatterns | — |
| confidence_score | DECIMAL | 🟢 | Returnert i resultater | — |
| problem_embedding | vector(512) | 🟢 | Vector-søk i searchPatterns | — |
| solution_embedding | vector(512) | 🔴 | Genereres ved insert, aldri brukt i søk | Implementer solution-similarity search |
| component_id | UUID | 🔴 | Aldri referert | Fremtidig marketplace-kobling |
| tags | TEXT[] | 🟢 | Returnert i resultater | — |

### Endepunkter

| Endepunkt | Status | Beskrivelse | Hva mangler |
|-----------|--------|-------------|-------------|
| POST /memory/store | 🟢 | Lagrer minne med embedding, alle felter | — |
| POST /memory/search | 🟢 | Semantic søk med full decay-scoring (similarity × temporal_decay × access_boost) | Tag-filtering skjer in-memory, bør flyttes til SQL |
| POST /memory/extract | 🟢 | Auto-ekstraher fra samtaler, hardkodet memory_type='session' | — |
| POST /memory/consolidate | 🟢 | Slår sammen 2+ minner, setter superseded_by, hardkodet memory_type='decision' + pinned=true | — |
| POST /memory/cleanup | 🟢 | Sletter utløpte minner basert på TTL, pinned, last_accessed_at | — |
| GET /memory/stats | 🟢 | Totalt, per type, avg relevance, utløper snart | — |
| POST /memory/store-pattern | 🟢 | Lagrer code pattern med begge embeddings | — |
| POST /memory/search-patterns | 🟢 | Søker på problem_embedding, inkrementerer times_reused | Bruker ikke solution_embedding |

### Cron-jobs

| Cron | Status | Schedule | Hva den gjør | Aktivering |
|------|--------|----------|--------------|------------|
| memory-cleanup | 🟢 | 0 4 * * * (daglig 04:00) | Sletter minner hvor ttl_days>0 AND pinned=false AND last_accessed_at < NOW()-ttl_days | — |

### Hva trengs for full aktivering
1. Bruk `parent_memory_id` for hierarkisk kontekst-navigering i search
2. Bruk `solution_embedding` i searchPatterns for å finne lignende løsninger
3. Inkrementer `bugs_prevented` når et pattern matcher og forhindrer feil
4. Flytt tag-filtering fra in-memory JavaScript til SQL GIN-indeks for ytelse
5. Gjør `memory_type` og `pinned` konfigurerbart i consolidate (i stedet for hardkodet)

---

## 2. Agent-service

### Meta-reasoning typer (agent/types.ts)

| Type | Status | Brukes i | Aktivering |
|------|--------|----------|------------|
| DiagnosisResult | 🟢 | diagnoseFailure → agent loop STEP 8 | — |
| AgentExecutionContext | 🟢 | Hele agent-loopen som `ctx` | — |
| AttemptRecord | 🟢 | STEP 6+8: pushes til ctx.attemptHistory | — |
| ErrorPattern | 🟢 | STEP 5.5: hentes fra memory, brukes i re-planning | — |

### Agent-loop flyten

| Steg | Status | Beskrivelse | Hva mangler |
|------|--------|-------------|-------------|
| 1. Hent task fra Linear | 🟢 | `linear.getTask()` via auditedStep | — |
| 2. Les prosjekt-tre | 🟢 | `github.getTree()` + `findRelevantFiles()` | — |
| 2.5. Smart fillesing | 🟢 | Context windowing: <100→full, 100-500→chunks, >500→start+slutt | — |
| 3. Samle kontekst | 🟢 | `memory.search()` (10 resultater) + `docs.lookupForTask()` | — |
| 4. Confidence assessment | 🟢 | `ai.assessConfidence()` → <60: stopp, <75: foreslå oppdeling, ≥75: fortsett | — |
| 4.5. Modellvalg | 🟢 | `ai.assessComplexity()` → `selectOptimalModel()` | — |
| 5. Lag plan | 🟢 | `ai.planTask()` → strukturert JSON (description, action, filePath, content) | — |
| 5.5. Hent error patterns | 🟢 | `memory.search()` med memoryType='error_pattern' | — |
| 6. Utfør plan i sandbox | 🟢 | `sandbox.create/writeFile/deleteFile/runCommand` per plan-steg | — |
| 6.1. Inkrementell validering | 🟢 | `sandbox.validateIncremental()` per .ts/.tsx fil, maks 2 fix-retries | — |
| 7. Full validering | 🟢 | `sandbox.validate()` (tsc + eslint + tests) | — |
| 8. Diagnostiser feil | 🟢 | `ai.diagnoseFailure()` → 5 strategier | — |
| 8a. bad_plan | 🟢 | `ai.revisePlan()` (maks 2 revisjoner) | — |
| 8b. implementation_error | 🟢 | Retry plan med feilkontekst | — |
| 8c. missing_context | 🟢 | Hent mer fra memory, retry | — |
| 8d. impossible_task | 🟢 | Eskaler til bruker, blokker i Linear | — |
| 8e. environment_error | 🟢 | Vent 30s, retry | — |
| 9. Review eget arbeid | 🟢 | `ai.reviewCode()` → dokumentasjon, kvalitetsscore, concerns | — |
| 10. Opprett PR | 🟢 | `github.createPR()` med branch + commit + PR | — |
| 11. Oppdater Linear | 🟢 | `linear.updateTask()` med PR-lenke og review | State-oppdatering ufullstendig |
| 12. Lagre læring | 🟢 | `memory.store()` for decisions + error patterns med TTL og tags | — |
| 13. Cleanup og rapport | 🟢 | `sandbox.destroy()`, audit, cost-rapport i chat | — |

### Retry-logikk

| Parameter | Verdi | Beskrivelse |
|-----------|-------|-------------|
| MAX_RETRIES | 5 | Hovedloop-grense |
| MAX_PLAN_REVISIONS | 2 | Maks plan-revisjoner ved bad_plan |
| MAX_FILE_FIX_RETRIES | 2 | Maks fix-retries per fil (inkrementell validering) |

### Endepunkter

| Endepunkt | Status | Expose | Auth | Beskrivelse |
|-----------|--------|--------|------|-------------|
| POST /agent/start | 🟢 | false | Nei | Start task asynkront (fire-and-forget) |
| POST /agent/check | 🟢 | true | Ja | Sjekk pending Linear-tasks, auto-start |
| POST /agent/audit/list | 🟢 | true | Ja | Liste audit-logg med filtrering + paginering |
| POST /agent/audit/trace | 🟢 | true | Ja | Full trace for en task med summary |
| POST /agent/audit/stats | 🟢 | true | Ja | Statistikk (success rate, action counts, failures) |

### Hva trengs for full aktivering
1. Agent-loopen er **fullt implementert** — alle 13 steg fungerer
2. `linear.updateTask()` trenger riktig state-mapping for team-spesifikke Linear-states
3. Vurder persistent job queue i stedet for fire-and-forget (prosess-krasj mister pågående arbeid)
4. Legg til cron-job for automatisk oppstart (i stedet for manuell polling via /agent/check)

---

## 3. AI-service

### Endepunkter

| Endepunkt | Status | Expose | Auth | Brukes av | Pipeline | logSkillResults |
|-----------|--------|--------|------|-----------|----------|-----------------|
| POST /ai/chat | 🟢 | false | Nei | chat-service | ✅ | ✅ |
| POST /ai/plan | 🟢 | false | Nei | agent STEP 5 | ✅ | ✅ |
| POST /ai/review | 🟢 | false | Nei | agent STEP 9 | ✅ | ✅ |
| POST /ai/assess-complexity | 🟢 | false | Nei | agent STEP 4.5 | ❌ (bruker BASE_RULES) | ❌ |
| POST /ai/diagnose | 🟢 | false | Nei | agent STEP 8 | ✅ | ❌ mangler |
| POST /ai/revise-plan | 🟢 | false | Nei | agent STEP 8a | ✅ | ❌ mangler |
| POST /ai/assess-confidence | 🟢 | false | Nei | agent STEP 4 | ✅ | ❌ mangler |
| GET /ai/models | 🟢 | true | Ja | frontend settings | — | — |
| POST /ai/estimate-cost | 🟢 | true | Ja | frontend settings | — | — |

### Prompt caching

| Feature | Status | Beskrivelse | Aktivering |
|---------|--------|-------------|------------|
| cache_control på system prompt | 🟢 | `cache_control: { type: "ephemeral" }` på system-blokk | Kun Anthropic |
| cache_control på OpenAI | 🔴 | Ikke støttet av provider | Vent på OpenAI-støtte |
| cache_control på Moonshot | 🔴 | Ikke støttet av provider | Vent på Moonshot-støtte |
| Token tracking/logging | 🟢 | Logger cache_read og cache_creation tokens | — |

### Modellregister (7 modeller)

| Modell | Provider | Tier | Input $/1M | Output $/1M | Context |
|--------|----------|------|------------|-------------|---------|
| moonshot-v1-32k | Moonshot | 1 | $0.24 | $0.24 | 32K |
| moonshot-v1-128k | Moonshot | 1 | $0.30 | $0.30 | 128K |
| gpt-4o-mini | OpenAI | 1 | $0.15 | $0.60 | 128K |
| claude-haiku-4-5 | Anthropic | 2 | $0.80 | $4.00 | 200K |
| claude-sonnet-4-5 | Anthropic | 3 | $3.00 | $15.00 | 200K |
| gpt-4o | OpenAI | 3 | $2.50 | $10.00 | 128K |
| claude-opus-4-5 | Anthropic | 5 | $15.00 | $75.00 | 200K |

### callAIWithFallback

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Auto-oppgradering ved feil | 🟢 | Maks 2 retries, oppgraderer tier (haiku→sonnet→opus) |
| Cost tracking | 🟢 | Alle responses inkluderer modelUsed og costUsd |
| Multi-provider | 🟢 | Anthropic, OpenAI, Moonshot — detektert ved modell-ID |

### Hva trengs for full aktivering
1. Legg til `logSkillResults()` i diagnoseFailure, revisePlan, assessConfidence
2. La assessComplexity bruke buildSystemPromptWithPipeline i stedet for BASE_RULES
3. Oppdater modellregister med Claude 4.6 når tilgjengelig

---

## 4. Sandbox-service

### Validation pipeline

| Steg | Status | Enabled | Beskrivelse | Aktivering |
|------|--------|---------|-------------|------------|
| typecheck | 🟢 | true | `npx tsc --noEmit` | — |
| lint | 🟢 | true | `npx eslint . --no-error-on-unmatched-pattern` | — |
| test | 🟢 | true | `npm test --if-present` | — |
| snapshot | 🟡 | false | Returnerer "not yet enabled" warning | Implementer snapshot-sammenligning |
| performance | 🟡 | false | Returnerer "not yet enabled" warning | Implementer performance benchmarks |

### Endepunkter

| Endepunkt | Status | Beskrivelse |
|-----------|--------|-------------|
| POST /sandbox/create | 🟢 | Kloner repo (shallow, --depth 1), npm install --ignore-scripts |
| POST /sandbox/write | 🟢 | Skriv fil med path traversal-beskyttelse |
| POST /sandbox/delete-file | 🟢 | Slett fil med path traversal-beskyttelse |
| POST /sandbox/run | 🟢 | Kjør kommando (whitelist: npm, npx, node, cat, ls, find) |
| POST /sandbox/validate | 🟢 | Full pipeline (typecheck + lint + test) |
| POST /sandbox/validate-incremental | 🟢 | Per-fil TypeScript-validering med grep-filter |
| POST /sandbox/destroy | 🟢 | Fjern sandbox-katalog |

### Sikkerhet

| Tiltak | Status | Beskrivelse |
|--------|--------|-------------|
| Path traversal-beskyttelse | 🟢 | Sjekker `..` og `/` i sandbox-ID, `path.resolve` validering i write/delete |
| Kommando-whitelist | 🟢 | Kun npm, npx, node, cat, ls, find tillatt |
| Buffer-grenser | 🟢 | stdout/stderr: 50KB, validate: 100KB, incremental: 10KB |
| Timeout | 🟢 | Clone/install: 120s, kommandoer: 30s |
| Docker-isolering | 🔴 | Bruker filsystem (/tmp/thefold-sandboxes/), ikke Docker | Migrer til Docker for prod |

### Hva trengs for full aktivering
1. Implementer snapshot-sammenligning (pipeline steg 4)
2. Implementer performance benchmarks (pipeline steg 5)
3. Migrer til Docker-containere for full isolering i produksjon
4. Legg til resource quotas (CPU/minne-grenser)

---

## 5. Skills-service

### Database-felter (37 kolonner totalt)

| Kolonne | Type | Status | Brukes av | Aktivering |
|---------|------|--------|-----------|------------|
| id | UUID PK | 🟢 | Alle queries | — |
| name | TEXT | 🟢 | CRUD, resolve | — |
| description | TEXT | 🟢 | CRUD | — |
| prompt_fragment | TEXT | 🟢 | CRUD, resolve, getActiveSkills | — |
| applies_to | TEXT[] | 🟢 | CRUD, listSkills filter | — |
| scope | TEXT | 🟢 | CRUD, resolve filter | global, repo:X, user:X |
| enabled | BOOLEAN | 🟢 | CRUD, resolve filter | — |
| created_by | UUID | 🟢 | CRUD | — |
| created_at | TIMESTAMPTZ | 🟢 | CRUD | — |
| updated_at | TIMESTAMPTZ | 🟢 | CRUD | — |
| version | TEXT | 🔴 | Seeded '1.0.0', aldri brukt i queries | Implementer versjonshåndtering |
| marketplace_id | TEXT | 🔴 | Aldri referert | Fremtidig marketplace |
| marketplace_downloads | INT | 🔴 | Aldri referert | Fremtidig marketplace |
| marketplace_rating | DECIMAL | 🔴 | Aldri referert | Fremtidig marketplace |
| author_id | UUID | 🔴 | Seeded, aldri brukt i queries | Koble til users-service |
| tags | TEXT[] | 🔴 | Seeded, aldri brukt i queries | Legg til filter i listSkills |
| category | TEXT | 🔴 | Seeded, aldri brukt i queries | Legg til filter i listSkills |
| depends_on | UUID[] | 🟢 | resolve: dependency resolution | — |
| conflicts_with | UUID[] | 🟢 | resolve: conflict handling | — |
| execution_phase | TEXT | 🟢 | resolve: fase-gruppering | pre_run, inject, post_run |
| priority | INT | 🟢 | resolve: sortering | Lavere = kjøres først |
| token_estimate | INT | 🟢 | resolve: token-budsjett | — |
| token_budget_max | INT | 🔴 | Aldri sjekket i resolve | Implementer per-skill budsjettgrense |
| routing_rules | JSONB | 🟢 | resolve: matchesRoutingRules() | keywords, file_patterns, labels |
| parent_skill_id | UUID FK | 🔴 | Aldri referert | Implementer skill-hierarki |
| composable | BOOLEAN | 🔴 | Aldri referert | Implementer kompositt-skills |
| output_schema | JSONB | 🔴 | Aldri referert | Validér pre/post-run output mot schema |
| success_count | INT | 🟢 | logResult inkrementerer | — |
| failure_count | INT | 🟢 | logResult inkrementerer | — |
| avg_token_cost | DECIMAL | 🟢 | logResult beregner rullende snitt | — |
| confidence_score | DECIMAL | 🟢 | logResult beregner success/(success+failure) | — |
| last_used_at | TIMESTAMPTZ | 🟢 | logResult setter NOW() | — |
| total_uses | INT | 🟢 | logResult inkrementerer | — |

### Endepunkter

| Endepunkt | Status | Expose | Auth | Beskrivelse |
|-----------|--------|--------|------|-------------|
| POST /skills/list | 🟢 | true | Ja | Liste skills med context/enabled filter |
| POST /skills/get | 🟢 | true | Ja | Hent enkelt skill |
| POST /skills/create | 🟢 | true | Ja | Opprett med validering |
| POST /skills/update | 🟢 | true | Ja | Oppdater (delvis) |
| POST /skills/toggle | 🟢 | true | Ja | Aktiver/deaktiver |
| POST /skills/delete | 🟢 | true | Ja | Hard delete |
| POST /skills/active | 🟢 | false | Nei | Intern: aktive skills for AI |
| POST /skills/preview-prompt | 🟢 | true | Ja | Forhåndsvis system-prompt |
| POST /skills/resolve | 🟢 | false | Nei | Pipeline: automatisk routing + dependencies + konflikter + token-budsjett |
| POST /skills/execute-pre-run | 🟡 | false | Nei | **STUBBET** — returnerer alltid approved: true |
| POST /skills/execute-post-run | 🟡 | false | Nei | **STUBBET** — returnerer alltid approved: true |
| POST /skills/log-result | 🟢 | false | Nei | Oppdater success/failure, confidence, token-cost |

### Pipeline engine (skills/engine.ts)

| Funksjon | Status | Beskrivelse | Aktivering |
|----------|--------|-------------|------------|
| resolve | 🟢 | Scope-filter, routing-matching, dependency-resolution, conflict-handling, token-budsjett | — |
| executePreRun | 🟡 | Returnerer `{approved: true}` for alle skills | Implementer faktisk pre-run logikk (input-validering, context-berikelse) |
| executePostRun | 🟡 | Returnerer `{approved: true}` for alle skills | Implementer faktisk post-run logikk (quality review, security scan) |
| logResult | 🟢 | Success/failure tracking, confidence_score, avg_token_cost | — |

### Automatisk routing

| Feature | Status | Beskrivelse | Aktivering |
|---------|--------|-------------|------------|
| Keyword matching | 🟢 | Case-insensitive substring-match mot task | — |
| File pattern matching | 🟢 | Glob-matching (*.ts, *.tsx) mot filnavn | — |
| Label matching | 🟢 | Case-insensitive match mot task labels | — |
| Dependency resolution | 🟢 | Inkluderer avhengige skills automatisk | — |
| Conflict handling | 🟢 | Ekskluderer lavere-priority konflikter | — |
| Token budget (global) | 🟢 | Skipper skills som overskrider totalTokenBudget | — |
| Token budget (per skill) | 🔴 | token_budget_max finnes men sjekkes aldri | Legg til i resolve |

### Fremtidige features

| Feature | Grunnmur | Status | Aktivering |
|---------|----------|--------|------------|
| Skill-hierarki | parent_skill_id kolonne | 🔴 | Implementer parent/child traversering |
| Skill-komposisjon | composable kolonne | 🔴 | Implementer kompositt-kjøring |
| Pre-run validering | execution_phase='pre_run' + executePreRun | 🟡 | Implementer faktisk logikk i stedet for passthrough |
| Post-run review | execution_phase='post_run' + executePostRun | 🟡 | Implementer faktisk logikk i stedet for passthrough |
| Skill versjonering | version kolonne | 🔴 | Implementer versjonskontroll og rollback |
| Marketplace | marketplace_id, downloads, rating | 🔴 | Bygge marketplace-service |
| Token-budsjett per skill | token_budget_max kolonne | 🔴 | Sjekke i resolve() |
| Confidence scoring | confidence_score kolonne | 🟢 | Fungerer via logResult |
| Usage logging | total_uses, last_used_at | 🟢 | Fungerer via logResult |
| Output schema validering | output_schema kolonne | 🔴 | Validér output mot JSON Schema i pre/post-run |
| Skill bundles/packages | — | ⚪ | Trenger ny tabell |
| RBAC | — | ⚪ | Trenger ny tabell |
| Skill A/B testing | — | ⚪ | Trenger ny tabell |
| Canary rollout | — | ⚪ | Trenger versjoneringslogikk |
| Skill-signering | — | ⚪ | Trenger krypto-lag |
| Prompt injection detection | — | ⚪ | Trenger eget endepunkt |

### Hva trengs for full aktivering
1. **executePreRun:** Implementer input-validering og context-berikelse (erstatt passthrough)
2. **executePostRun:** Implementer quality review og security scan (erstatt passthrough)
3. Bruk `category` og `tags` i listSkills-filter (backend — frontend sender allerede)
4. Sjekk `token_budget_max` per skill i resolve()
5. Validér output mot `output_schema` i pre/post-run
6. Implementer skill-hierarki via `parent_skill_id`
7. Tester for engine-funksjoner (resolve, routing, token-budsjett) — 0 tester i dag

---

## 6. Monitor-service

### Database-tabeller

**health_checks:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| repo | TEXT | 🟢 |
| check_type | TEXT | 🟢 |
| status | TEXT | 🟢 (pass/warn/fail) |
| details | JSONB | 🟢 |
| created_at | TIMESTAMPTZ | 🟢 |

**health_rules:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🔴 |
| check_type | TEXT | 🔴 |
| threshold | JSONB | 🔴 |
| enabled | BOOLEAN | 🔴 |
| notify | BOOLEAN | 🔴 |
| created_at | TIMESTAMPTZ | 🔴 |

> health_rules-tabellen eksisterer i skjema men brukes aldri i kode.

### Endepunkter

| Endepunkt | Status | Expose | Auth | Beskrivelse |
|-----------|--------|--------|------|-------------|
| POST /monitor/run-check | 🟢 | true | Ja | Kjør health checks for et repo |
| GET /monitor/health | 🟢 | true | Ja | Siste status for alle repos |
| POST /monitor/history | 🟢 | true | Ja | Historikk for et repo (paginert) |
| POST /monitor/daily-check | 🟡 | false | Nei | **HARDKODET DISABLED** — returnerer alltid `ran: false` |

### Health checks implementert

| Check | Status | Beskrivelse | Aktivering |
|-------|--------|-------------|------------|
| dependency_audit | 🟢 | `npm audit --json`, teller high/critical | — |
| test_coverage | 🟢 | `npm test --coverage`, ekstraher prosent | — |
| code_quality | 🟡 | Stub — returnerer "not implemented" | Implementer (f.eks. ESLint score) |
| doc_freshness | 🟡 | Stub — returnerer "not implemented" | Implementer (sjekk README dato) |

### Cron-jobs

| Cron | Status | Schedule | Feature-flag | Aktivering |
|------|--------|----------|-------------|------------|
| daily-health-check | 🟡 | 0 3 * * * | MonitorEnabled secret (hardkodet disabled) | Fjern hardkodet disable, sjekk secret-verdi |

### Hva trengs for full aktivering
1. Fjern hardkodet `disabled` i runDailyChecks, faktisk sjekk MonitorEnabled secret
2. Implementer code_quality og doc_freshness checks
3. Bruk health_rules-tabellen for konfigurerbare terskler og notifikasjoner
4. Legg til alerting ved gjentatte failures

---

## 7. Gateway/Auth

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| HMAC-SHA256 token-signering | 🟢 | Base64(payload).HMAC-SHA256(payload) |
| 7-dagers token-utløp | 🟢 | Hardkodet i payload |
| AuthData (userID, email, role) | 🟢 | Returnert til alle auth: true endpoints |
| createToken (intern) | 🟢 | Kalles av users-service etter OTP |
| Token-revokering | 🔴 | Ingen revoked_tokens-tabell, token gyldig til utløp | Legg til revokerings-sjekk |
| CORS-konfigurasjon | 🔴 | Bruker Encore defaults | Konfigurer explicit i encore.app |

---

## 8. Chat-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Send/motta meldinger | 🟢 | POST /chat/send med user/assistant roller |
| Historikk med paginering | 🟢 | POST /chat/history med cursor |
| Samtaleliste | 🟢 | GET /chat/conversations |
| Context transfer | 🟢 | POST /chat/transfer-context (AI-oppsummering med fallback) |
| Conversation ownership (OWASP A01) | 🟢 | conversations.owner_email, verifisert i alle endpoints |
| Agent reports via Pub/Sub | 🟢 | agentReports topic → store-agent-report subscription |
| SkillIds i meldingsmetadata | 🟢 | Lagres i user message metadata |
| Direct chat (chatOnly) | 🟢 | Kaller ai.chat() direkte |
| Agent-trigger (linearTaskId) | 🟢 | Kaller agent.startTask() |

---

## 9. Andre tjenester

### Cache-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Embedding-cache (90d TTL) | 🟢 | `emb:{sha256}` → vector |
| Repo-structure-cache (1h TTL) | 🟢 | `repo:{owner}/{repo}:{branch}` |
| AI-plan-cache (24h TTL) | 🟢 | `plan:{sha256(task+repo)}` |
| Statistikk | 🟢 | Hit rate, per-namespace counts |
| Hourly cleanup cron | 🟢 | Sletter utløpte entries |
| Invalidering | 🟢 | Per key eller namespace |

### Docs-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Context7 lookup | 🟢 | HTTP fallback til context7.com |
| lookupForTask | 🟢 | Ekstraherer deps fra task, henter docs (maks 3 deps + Encore.ts) |
| Graceful degradation | 🟢 | Returnerer tom array ved feil (10s timeout) |

### Linear-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| getAssignedTasks | 🟢 | GraphQL, filter: "thefold" label |
| getTask | 🟢 | Enkelt-task lookup |
| updateTask | 🟡 | Returnerer success men state-oppdatering ufullstendig | Trenger team-spesifikk state-mapping |
| 5-min polling cron | 🟢 | check-thefold-tasks |

### GitHub-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| getTree (cached) | 🟢 | 1h cache via cache-service |
| getFile | 🟢 | Full filinnhold |
| getFileMetadata | 🟢 | Linjetall og størrelse |
| getFileChunk | 🟢 | Linje-basert chunking, 1-basert, maks 500 linjer |
| findRelevantFiles | 🟢 | Keyword-scoring av filnavn |
| createPR | 🟢 | Branch → blobs → tree → commit → PR |

### Users-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| OTP request (rate limited) | 🟢 | 5/time, 6-sifret, SHA256 hash, 5 min utløp |
| OTP verify | 🟢 | 3 forsøk, anti-enumerering |
| Profil (me, updateProfile) | 🟢 | Navn, avatarfarge |
| Preferences (JSONB) | 🟢 | modelMode, avatarColor |
| Login audit | 🟢 | email, success, user_agent |

---

## 10. Frontend

### Sider og status

| Side | Status | Koblet til backend | Hva mangler |
|------|--------|-------------------|-------------|
| /login | 🟢 | Ja (requestOtp, verifyOtp) | Suspense boundary for useSearchParams |
| /home | 🟢 | Delvis (getTasks) | Stats, recent activity og token usage er hardkodet |
| /chat | 🟢 | Ja (full chat, skills, models, transfer) | — |
| /skills | 🟢 | Ja (full CRUD, pipeline, resolve) | — |
| /settings | 🟢 | Ja (profil, modeller, preferences) | — |
| /settings/security | 🟢 | Ja (audit log, stats) | — |
| /environments | 🟡 | Nei (bruker hardkodet repo-context) | Koble til GitHub backend |
| /secrets | 🟡 | Nei (statisk hardkodet liste) | Koble til secrets API |
| /repo/[name]/chat | 🟢 | Ja (repo-chat, skills, models) | — |
| /repo/[name]/overview | 🟡 | Nei | Koble til GitHub/monitor backend |
| /repo/[name]/tasks | 🟡 | Nei | Koble til Linear backend |
| /repo/[name]/memory | 🟡 | Nei | Koble til memory backend |
| /repo/[name]/code | 🟡 | Nei | Koble til GitHub backend |
| /repo/[name]/flow | 🟡 | Nei | Implementer pipeline-visualisering |
| /repo/[name]/metrics | 🟡 | Nei | Koble til audit/cost backend |
| /repo/[name]/cost | 🟡 | Nei | Koble til cost-tracking backend |
| /repo/[name]/deploys | 🟡 | Nei | Implementer deploy-tracking |
| /repo/[name]/infra | 🟡 | Nei | Koble til infra backend |
| /repo/[name]/configuration | 🟡 | Nei | Koble til settings backend |

### Komponenter

| Komponent | Status | Beskrivelse |
|-----------|--------|-------------|
| ModelSelector | 🟢 | Auto/manuell modus, dropdown med alle modeller og kostnader |
| SkillsSelector | 🟢 | Multi-select, category-farger, phase-ikoner, token-budsjett, "Auto"-knapp |
| MessageSkillBadges | 🟢 | Viser skills brukt i en melding |
| ChatToolsMenu | 🟢 | Floating menu: create skill, create task, transfer |
| InlineSkillForm | 🟢 | Rask skill-oppretting fra chat |
| LivePreview | 🟡 | Placeholder for sandbox-preview | Koble til sandbox |
| Sidebar | 🟢 | Navigasjon, repo-dropdown, brukerprofil |

### Kontekst-providere

| Provider | Status | Beskrivelse |
|----------|--------|-------------|
| PreferencesProvider | 🟢 | Henter /users/me, gir usePreferences() og useUser() hooks |
| RepoProvider | 🟡 | Hardkodede repos, useRepoContext() | Koble til GitHub backend |

---

## Aktiveringsplan: Prioritert rekkefølge

### Fase 1: Kjernefunksjonalitet (nødvendig for MVP)
1. **linear.updateTask() state-mapping** — Agent kan ikke fullføre loop uten riktig Linear-oppdatering
2. **Fjern hardkodet MonitorEnabled disable** — Aktiver daglig health check
3. **Token-revokering ved logout** — Sikkerhet (OWASP A07)
4. **CORS-konfigurasjon** — Eksplisitt i encore.app for produksjon

### Fase 2: Kvalitetsforbedring
1. **executePreRun implementering** — Input-validering, security scan før AI-kall
2. **executePostRun implementering** — Quality review, security scan etter AI-kall
3. **logSkillResults i 3 manglende endpoints** — diagnoseFailure, revisePlan, assessConfidence
4. **Backend-filter for category/tags i listSkills** — Frontend sender allerede, backend ignorerer
5. **Koble /home til ekte stats** — Fjern hardkodede tall
6. **Koble /environments til GitHub** — Vis ekte repo-status
7. **Docker-isolering for sandbox** — Fjern filsystem-avhengighet

### Fase 3: Avanserte features
1. **Skill-hierarki** (parent_skill_id) — Skill-trær for komplekse instruksjoner
2. **Per-skill token-budsjett** (token_budget_max) — Finkornig kontroll
3. **Output schema validering** — Strukturert output fra pre/post-run
4. **Snapshot-sammenligning i sandbox** — Før/etter code diff
5. **Performance benchmarks i sandbox** — Kjøretids-testing
6. **solution_embedding i searchPatterns** — Finn lignende løsninger, ikke bare problemer
7. **Koble repo sub-pages** — /tasks, /memory, /code, /metrics, /cost

### Fase 4: Enterprise/Marketplace
1. **Skill versjonering** — Rollback, changelog
2. **Skill marketplace** — marketplace_id, downloads, rating
3. **Skill-signering** — Verifiser prompt-integritet
4. **Prompt injection detection** — Sikkerhet for marketplace-skills
5. **RBAC** — Rolle-basert skill-tilgang
6. **A/B testing** — Sammenlign skill-varianter
7. **health_rules** — Konfigurerbare terskler og notifikasjoner

---

## Oppsummering

| Kategori | Antall |
|----------|--------|
| 🟢 AKTIVE features | 87 |
| 🟡 STUBBEDE features | 18 |
| 🔴 GRUNNMUR features | 22 |
| ⚪ PLANLAGTE features | 7 |

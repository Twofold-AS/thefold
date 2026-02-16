# TheFold — Grunnmur-status og aktiveringsplan

> Sist oppdatert: 16. februar 2026 (Agent dual-source task lookup + tool-use forbedringer)
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
| relevance_score | DECIMAL | 🟢 | Decay-scoring i search, oppdatert av decay-cron, filtrert i stats | Importance-basert initialisering + eksponentiell decay |
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
| component_id | UUID | 🟢 | storePattern (valgfri parameter) | Kobling til registry/components |
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
| POST /memory/decay | 🟢 | Manuell decay trigger, beregner importance + decayed relevance for alle minner, sletter utgåtte | — |
| POST /memory/decay-cron | 🟢 | Intern cron-endpoint for daglig decay-kjøring | — |

### Cron-jobs

| Cron | Status | Schedule | Hva den gjør | Aktivering |
|------|--------|----------|--------------|------------|
| memory-cleanup | 🟢 | 0 4 * * * (daglig 04:00) | Sletter minner hvor ttl_days>0 AND pinned=false AND last_accessed_at < NOW()-ttl_days | — |
| memory-decay | 🟢 | 0 3 * * * (daglig 03:00) | Beregner decayed relevance for alle minner, oppdaterer relevance_score, sletter minner med score<0.05 og alder>ttl_days | — |

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
| 1. Hent task (dual-source) | 🟢 | Prøver `tasks.getTaskInternal()` først, fallback til `linear.getTask()`. Lokal task → setter `ctx.thefoldTaskId`, oppdaterer status til `in_progress` | — |
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
| 9.5. Review gate | 🟢 | `submitReviewInternal()` → lagrer review, notifiserer chat, returnerer pending_review | skipReview=true for å hoppe over |
| 10. Opprett PR | 🟢 | `github.createPR()` med branch + commit + PR (kun skipReview-path) | — |
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

### Project Orchestrator (Steg 3.4)

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| project_plans tabell | 🟢 | UUID PK, conversation_id, user_request, status, phases, conventions, cost tracking |
| project_tasks tabell | 🟢 | UUID PK, FK til project_plans, phase/task_order, depends_on UUID[], context_hints TEXT[] |
| Indekser | 🟢 | idx_project_tasks_project, idx_project_tasks_status, idx_project_tasks_phase |
| ProjectPlan type | 🟢 | Full type i agent/types.ts med phases, conventions, cost tracking |
| ProjectPhase type | 🟢 | phase, name, description, tasks[] |
| ProjectTask type | 🟢 | Alle felter inkl. dependsOn, outputFiles, outputTypes, contextHints |
| CuratedContext type | 🟢 | relevantFiles, dependencyOutputs, memoryContext, docsContext, conventions |
| DecomposeProjectRequest/Response | 🟢 | Input/output for ai.decomposeProject |
| ai.decomposeProject | 🟢 | Bryter ned store forespørsler til atomære tasks i faser |
| Project Conventions skill | 🟢 | Seed skill med priority=1, applies_to=['planning','coding','review'] |
| Orchestrator loop (executeProject) | 🟢 | Fase-basert kjøring, avhengighetssjekk, feilhåndtering, gjenopptagelse etter krasj |
| Fase-revisjon (reviseProjectPhase) | 🟢 | AI-drevet re-planlegging mellom faser: reviderer descriptions, skipper tasks, legger til nye |
| Context Curator (curateContext) | 🟢 | Intelligent kontekstvalg per sub-task: avhengigheter → memory → GitHub → docs → token-trimming |
| executeTask med curatedContext | 🟢 | Bakoverkompatibel dual-path: kuratert eller standard kontekstsamling |
| Chat-deteksjon | 🟢 | Heuristikker for å oppdage prosjektforespørsler vs enkle tasks |
| POST /agent/project/start | 🟢 | Start prosjektkjøring asynkront |
| POST /agent/project/status | 🟢 | Hent plan + alle tasks med status |
| POST /agent/project/pause | 🟢 | Pause prosjekt (stopper ikke pågående task) |
| POST /agent/project/resume | 🟢 | Gjenoppta pauset prosjekt |
| POST /agent/project/store | 🟢 | Lagre dekomponert prosjektplan (fra chat) |

### Code Reviews (Steg 3.2)

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| code_reviews tabell | 🟢 | UUID PK, files_changed JSONB, ai_review JSONB, status, feedback |
| Review gate i agent loop | 🟢 | STEP 8.5: submitReviewInternal → pending_review → bruker godkjenner |
| CodeReview type | 🟢 | Full type med ReviewFile, AIReviewData interfaces |
| pending_review status | 🟢 | Ny status på ProjectTask, pauser prosjekt |
| POST /agent/review/submit | 🟢 | Intern: lagre review + notifiser chat |
| POST /agent/review/get | 🟢 | Hent full review med filer |
| POST /agent/review/list | 🟢 | Liste reviews med statusfilter |
| POST /agent/review/approve | 🟢 | Godkjenn → opprett PR → destroy sandbox |
| POST /agent/review/request-changes | 🟢 | Be om endringer → re-kjør agent med feedback |
| POST /agent/review/reject | 🟢 | Avvis → destroy sandbox |
| /review side | 🟢 | Liste med statusfilter-tabs |
| /review/[id] side | 🟢 | Detaljer, filvisning, handlingsknapper |

### Hva trengs for full aktivering
1. Agent-loopen er **fullt implementert** — alle 13 steg fungerer
2. ~~`linear.updateTask()` trenger riktig state-mapping~~ ✅ State-mapping via getWorkflowStates() + issueUpdate mutation
3. Vurder persistent job queue i stedet for fire-and-forget (prosess-krasj mister pågående arbeid)
4. Legg til cron-job for automatisk oppstart (i stedet for manuell polling via /agent/check)

---

## 3. AI-service

### Database-tabeller

**ai_providers:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| name | TEXT NOT NULL UNIQUE | 🟢 |
| api_key_secret_name | TEXT | 🟢 |
| enabled | BOOLEAN | 🟢 |
| created_at | TIMESTAMPTZ | 🟢 |

**ai_models:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| provider_id | UUID FK | 🟢 |
| model_id | TEXT NOT NULL UNIQUE | 🟢 |
| display_name | TEXT | 🟢 |
| tier | INT | 🟢 |
| input_cost_per_million | DECIMAL | 🟢 |
| output_cost_per_million | DECIMAL | 🟢 |
| context_window | INT | 🟢 |
| tags | TEXT[] | 🟢 |
| enabled | BOOLEAN | 🟢 |
| created_at | TIMESTAMPTZ | 🟢 |

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
| POST /ai/decompose-project | 🟢 | false | Nei | Project Orchestrator | ✅ | ✅ |
| POST /ai/revise-project-phase | 🟢 | false | Nei | Orchestrator fase-revisjon | ❌ (bruker Haiku direkte) | ❌ |
| GET /ai/providers | 🟢 | true | Ja | frontend settings/models | — | — |
| POST /ai/providers/save | 🟢 | true | Ja | frontend settings/models | — | — |
| POST /ai/models/save | 🟢 | true | Ja | frontend settings/models | — | — |
| POST /ai/models/toggle | 🟢 | true | Ja | frontend settings/models | — | — |
| POST /ai/models/delete | 🟢 | true | Ja | frontend settings/models | — | — |
| POST /ai/estimate-cost | 🟢 | true | Ja | frontend settings | — | — |

### Tool-use / Function Calling

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Tool definitions | 🟢 | 5 tools: create_task, start_task, list_tasks, read_file, search_code |
| callAnthropicWithTools | 🟢 | Two-call flow: send med tools → handle tool_use → execute → final response |
| executeToolCall | 🟢 | Dispatcher til ekte services (tasks, github) basert på tool-navn |
| System prompt tool instructions | 🟢 | Oppdatert system prompt med verktoy-instruksjoner |
| create_task source: "chat" | 🟢 | Tasks opprettet fra chat bruker `source: "chat"` i stedet for `"manual"` |
| create_task AI-berikelse | 🟢 | `enrichTaskWithAI()` fire-and-forget: estimerer complexity + tokens etter opprettelse |
| start_task verifisering | 🟢 | Verifiserer task eksisterer via `tasks.getTaskInternal()`, setter `in_progress`, `blocked` ved feil |
| conversationId-propagering | 🟢 | `conversationId` flyter fra chat → start_task → agent |

### Prompt caching

| Feature | Status | Beskrivelse | Aktivering |
|---------|--------|-------------|------------|
| cache_control på system prompt | 🟢 | `cache_control: { type: "ephemeral" }` på system-blokk | Kun Anthropic |
| cache_control på OpenAI | 🔴 | Ikke støttet av provider | Vent på OpenAI-støtte |
| cache_control på Moonshot | 🔴 | Ikke støttet av provider | Vent på Moonshot-støtte |
| Token tracking/logging | 🟢 | ChatResponse returnerer usage { inputTokens, outputTokens, totalTokens }, logs cache_read/cache_creation | — |
| Truncation detection | 🟢 | Oppdager stop_reason="max_tokens", appender info-melding til bruker | — |

### Dynamic Provider & Model System (NY — 16. feb 2026)

**Konsept:** Modeller og providers er nå helt DB-drevet med full CRUD via frontend.

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| ai_providers tabell | 🟢 | 4 pre-seeded providers: Anthropic, OpenAI, Moonshot, Google |
| ai_models tabell | 🟢 | 9 pre-seeded modeller med tier, kostnader, context, tags |
| GET /ai/providers | 🟢 | Liste providers med nested models array |
| POST /ai/providers/save | 🟢 | Opprett/oppdater provider |
| POST /ai/models/save | 🟢 | Opprett/oppdater modell |
| POST /ai/models/toggle | 🟢 | Aktiver/deaktiver modell |
| POST /ai/models/delete | 🟢 | Slett modell |
| Frontend /settings/models | 🟢 | Full CRUD for providers + modeller, expand/collapse, modal forms |
| Frontend /tools/ai-models | 🟢 | Provider-grupperte modeller |
| Frontend ModelSelector | 🟢 | Grupperte modeller per provider |
| Router cache (60s TTL) | 🟢 | DB-backed cache med fallback-modeller ved cold start |
| Tag-based selection | 🟢 | selectOptimalModel støtter tag-filtrering (chat, coding, analysis, planning) |
| Tier-based upgrade | 🟢 | Fallback oppgraderer tier med provider affinity |

**Pre-seeded data:**
- **Providers (4):** Anthropic, OpenAI, Moonshot, Google
- **Models (9):**
  - Tier 1: moonshot-v1-32k, moonshot-v1-128k, gpt-4o-mini, gemini-2.0-flash
  - Tier 2: claude-haiku-4-5
  - Tier 3: claude-sonnet-4-5, gpt-4o
  - Tier 5: claude-opus-4-5, gemini-2.0-pro

### callAIWithFallback

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Auto-oppgradering ved feil | 🟢 | Maks 2 retries, oppgraderer tier (haiku→sonnet→opus) |
| Cost tracking | 🟢 | Alle responses inkluderer modelUsed og costUsd |
| Multi-provider | 🟢 | Anthropic, OpenAI, Moonshot — detektert ved modell-ID |

### Hva trengs for full aktivering
1. ~~Legg til `logSkillResults()` i diagnoseFailure, revisePlan, assessConfidence~~ ✅ Ferdig
2. La assessComplexity bruke buildSystemPromptWithPipeline i stedet for BASE_RULES
3. ~~Dynamisk modellregister~~ ✅ DB-drevet med full CRUD frontend

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
| POST /sandbox/destroy | 🟢 | Fjern sandbox (katalog eller Docker-container) |
| POST /sandbox/cleanup | 🟢 | Intern: rydde opp gamle Docker-containere |

### Sikkerhet

| Tiltak | Status | Beskrivelse |
|--------|--------|-------------|
| Path traversal-beskyttelse | 🟢 | Sjekker `..` og `/` i sandbox-ID, `path.resolve` validering i write/delete |
| Kommando-whitelist | 🟢 | Kun npm, npx, node, cat, ls, find tillatt |
| Buffer-grenser | 🟢 | stdout/stderr: 50KB, validate: 100KB, incremental: 10KB |
| Timeout | 🟢 | Clone/install: 120s, kommandoer: 30s |
| Docker-isolering | 🟢 | Dual-modus: SandboxMode secret ("docker"/"filesystem"), Docker med --network=none --read-only --memory=512m --cpus=0.5 | — |
| Cleanup cron | 🟢 | Hvert 30. minutt: fjern Docker-containere eldre enn 30 min | — |

### Hva trengs for full aktivering
1. Implementer snapshot-sammenligning (pipeline steg 4)
2. Implementer performance benchmarks (pipeline steg 5)

---

## 5. Skills-service

### Database-felter (38 kolonner totalt)

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
| task_phase | TEXT | 🟢 | resolve filter med taskType | all, planning, coding, debugging, reviewing |

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
| POST /skills/execute-pre-run | 🟢 | false | Nei | Input-validering (task, userId) + context-berikelse |
| POST /skills/execute-post-run | 🟢 | false | Nei | Quality review (tomhet, lengde, placeholders, inability) + auto-logging |
| POST /skills/log-result | 🟢 | false | Nei | Oppdater success/failure, confidence, token-cost |

### Pipeline engine (skills/engine.ts)

| Funksjon | Status | Beskrivelse | Aktivering |
|----------|--------|-------------|------------|
| resolve | 🟢 | Forenklet: scope-filter → task_phase filter (når taskType spesifisert) → routing-match → token-budsjett → bygg prompt | — |
| executePreRun | 🟢 | Input-validering (task, userId) + context-berikelse (skill metadata) | — |
| executePostRun | 🟢 | Quality review (tomhet, lengde, placeholders, inability-mønstre) + auto-logging | — |
| logResult | 🟢 | Success/failure tracking, confidence_score, avg_token_cost | — |

### Automatisk routing

| Feature | Status | Beskrivelse | Aktivering |
|---------|--------|-------------|------------|
| Keyword matching | 🟢 | Case-insensitive substring-match mot task | — |
| File pattern matching | 🟢 | Glob-matching (*.ts, *.tsx) mot filnavn | — |
| Label matching | 🟢 | Case-insensitive match mot task labels | — |
| ~~Dependency resolution~~ | — | Fjernet i skills-forenkling (resolve forenklet) | — |
| ~~Conflict handling~~ | — | Fjernet i skills-forenkling (resolve forenklet) | — |
| Token budget (global) | 🟢 | Skipper skills som overskrider totalTokenBudget | — |
| Token budget (per skill) | 🔴 | token_budget_max finnes men sjekkes aldri | Legg til i resolve |
| Dynamic scope dropdown | 🟢 | Frontend scope-velger populert fra listRepos("Twofold-AS") API | — |
| Migration 6: deaktiver generiske skills | 🟢 | Norwegian Docs, Test Coverage, Project Conventions disabled | — |

### Skills-forenkling (prompt.md)

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| resolve() forenklet | 🟢 | Fjernet depends_on, conflicts_with, fase-gruppering — nå: scope filter → routing match → token budget → build prompt |
| skills/page.tsx forenklet | 🟢 | Fjernet pipeline viz, categories, phases, confidence bars — beholdt: grid + toggle + slide-over + create/edit |
| Dynamic scope dropdown | 🟢 | Scope-velger populert fra listRepos("Twofold-AS") API |
| Migration 6 | 🟢 | Deaktiverer 3 generiske seeded skills (Norwegian Docs, Test Coverage, Project Conventions) |

### Fremtidige features

| Feature | Grunnmur | Status | Aktivering |
|---------|----------|--------|------------|
| Skill-hierarki | parent_skill_id kolonne | 🔴 | Implementer parent/child traversering |
| Skill-komposisjon | composable kolonne | 🔴 | Implementer kompositt-kjøring |
| Pre-run validering | execution_phase='pre_run' + executePreRun | 🟢 | Input-validering + context-berikelse implementert |
| Post-run review | execution_phase='post_run' + executePostRun | 🟢 | Quality review + auto-logging implementert |
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
1. ~~**executePreRun:** Implementer input-validering og context-berikelse~~ ✅ Ferdig
2. ~~**executePostRun:** Implementer quality review og security scan~~ ✅ Ferdig
3. Bruk `category` og `tags` i listSkills-filter (backend — frontend sender allerede)
4. Sjekk `token_budget_max` per skill i resolve()
5. Validér output mot `output_schema` i pre/post-run
6. Implementer skill-hierarki via `parent_skill_id`
7. ~~Tester for engine-funksjoner~~ ✅ 11 tester i engine.test.ts

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
| POST /monitor/daily-check | 🟢 | false | Nei | Feature-flagget via MonitorEnabled secret, kjører alle repos |

### Health checks implementert

| Check | Status | Beskrivelse | Aktivering |
|-------|--------|-------------|------------|
| dependency_audit | 🟢 | `npm audit --json`, teller high/critical | — |
| test_coverage | 🟢 | `npm test --coverage`, ekstraher prosent | — |
| code_quality | 🟢 | ESLint JSON-output, teller errors/warnings | — |
| doc_freshness | 🟢 | Sjekker README/CHANGELOG, package.json description | — |

### Cron-jobs

| Cron | Status | Schedule | Feature-flag | Aktivering |
|------|--------|----------|-------------|------------|
| daily-health-check | 🟢 | 0 3 * * * | MonitorEnabled secret | Sett MonitorEnabled="true" for å aktivere |

### Hva trengs for full aktivering
1. ~~Fjern hardkodet `disabled` i runDailyChecks~~ ✅ Sjekker nå MonitorEnabled secret
2. ~~Implementer code_quality og doc_freshness checks~~ ✅ ESLint + doc-sjekk implementert
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
| Token-revokering | 🟢 | revoked_tokens-tabell, SHA256-hash, sjekk i auth handler, cleanup cron |
| Secrets status API | 🟢 | GET /gateway/secrets-status — sjekker 7 secrets (configured true/false) |
| CORS-konfigurasjon | 🟢 | Eksplisitt global_cors i encore.app (localhost:3000/4000 + prod) |

---

## 8. Chat-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Send/motta meldinger | 🟢 | POST /chat/send med user/assistant roller |
| Historikk med paginering | 🟢 | POST /chat/history med cursor |
| Samtaleliste | 🟢 | GET /chat/conversations |
| Context transfer | 🟢 | POST /chat/transfer-context (AI-oppsummering med fallback) |
| Conversation ownership (OWASP A01) | 🟢 | conversations.owner_email, verifisert i alle endpoints |
| Agent reports via Pub/Sub | 🟢 | agentReports topic → store-agent-report subscription (agent_report/agent_status filtreres ut i frontend rendering) |
| Build progress via Pub/Sub | 🟢 | buildProgress topic → chat-build-progress subscription |
| Task events via Pub/Sub | 🟢 | taskEvents topic → chat-task-events subscription |
| SkillIds i meldingsmetadata | 🟢 | Lagres i user message metadata |
| Direct chat (chatOnly) | 🟢 | Kaller ai.chat() direkte |
| Agent-trigger (linearTaskId) | 🟢 | Kaller agent.startTask() |
| Agent-synlighet (agent_status) | 🟢 | Progress-meldinger under AI-kall, agent_status messageType, updateMessageContent/updateMessageType |
| Smart polling (frontend) | 🟢 | idle/waiting/cooldown — ingen polling med mindre AI jobber |
| Optimistisk bruker-rendering | 🟢 | Brukerens melding vises umiddelbart uten å vente på server |
| AgentStatus i chat | 🟢 | agent_status JSON-meldinger rendret som collapsible progress-panel |
| Async sendMessage | 🟢 | Backend returnerer umiddelbart, AI prosesserer asynkront med fire-and-forget |
| withTimeout på eksterne kall | 🟢 | Memory 5s, AI 60s, graceful fallback |
| cancelGeneration | 🟢 | POST /chat/cancel, in-memory cancellation set, checkpoint-sjekker mellom steg |
| Stopp-knapp (frontend) | 🟢 | Under TheFold tenker-indikator, kaller cancelChatGeneration, resetter pollMode |
| TheFold tenker redesign | 🟢 | TF-ikon med brand-shimmer, agent-pulse, agent-dots, stopp-knapp |
| Brand shimmer sidebar | 🟢 | brand-shimmer CSS-klasse på "TheFold" tekst i sidebar |
| AI system prompt (norsk) | 🟢 | direct_chat prompt konversasjonelt, ingen kode-dumping, norsk |
| DB: agent_status + updated_at | 🟢 | Migrasjon 3: agent_status i CHECK, updated_at kolonne for heartbeat |
| Heartbeat-system | 🟢 | processAIResponse oppdaterer updated_at hvert 10s, frontend sjekker 30s timeout |
| Try/catch per steg | 🟢 | Skills, memory, AI har egne try/catch — aldri evig "Tenker" |
| Intent-baserte steg | 🟢 | detectMessageIntent(): repo_review/task_request/question/general → ulike steg |
| AgentStatus tab+boks | 🟢 | Tab (fase) + boks (tittel + steg), Feilet/Ferdig states, error-melding |
| Send→Stopp sirkel | 🟢 | Rund knapp: pil opp (send) ↔ firkant (stopp) basert på isWaitingForAI |
| Heartbeat-lost UI | 🟢 | "Mistet kontakt med TheFold" etter 30s uten heartbeat |
| TF-ikon fjernet | 🟢 | Ingen TF-boks i AgentStatus eller tenker-indikator |
| Samtale-tittel fra bruker | 🟢 | Første USER-melding som tittel, filtrerer bort agent_status JSON |
| Tenker-indikator deduplisert | 🟢 | "TheFold tenker..." kun vist før første agent_status — ingen dobbel visning |
| Fase-ikoner i AgentStatus | 🟢 | Spinner (default), forstørrelsesglass (Analyserer), wrench (Bygger), check/X (Ferdig/Feilet) |
| Emoji-forbud i AI-svar | 🟢 | direct_chat system prompt forbyr alle emojier, kun ren tekst + markdown |
| AI name preference (backend) | 🟢 | aiName i preferences JSONB, leses i chat/chat.ts processAIResponse, sendes til ai.ts system prompt (default "Jørgen André") |
| AI name i system prompt | 🟢 | getDirectChatPrompt aksepterer aiName parameter, AI identifiserer seg med konfigurerbart navn |
| ChatMessage markdown-parser | 🟢 | Kodeblokker, overskrifter, lister, bold/italic/inline-kode i assistant-meldinger |
| CodeBlock komponent | 🟢 | Collapsible kodeblokker med filnavn, språk-badge, kopier-knapp, linjenumre |
| TheFold identitet i system prompt | 🟢 | AI vet at den ER TheFold, kjenner alle 17 services, svarer på norsk, ingen emojier |
| Repo-kontekst i chat | 🟢 | repoName sendes fra repo-chat frontend → chat backend → ai.chat system prompt. AI vet hvilket repo den ser på |
| GitHub fil-kontekst i chat | 🟢 | processAIResponse henter filtre (getTree), relevante filer (findRelevantFiles), innhold (getFile, topp 5 filer à 200 linjer). repoContext injiseres i system prompt med anti-hallusinering |
| Chat input-boks restructurert | 🟢 | + ikon (borderless 32px), textarea, send-knapp — horisontal rad. minHeight 56px, maxHeight 150px |
| Bredere chat-meldinger | 🟢 | Container max-w-4xl, bruker-meldinger max-w-[70%], AI-meldinger max-w-[85%], padding px-4 |
| Tomt repo handling | 🟢 | Hvis repoContext er tom etter GitHub-kall, AI får eksplisitt beskjed om at repoet er tomt — ingen hallusinering |
| Memory-prioritering over hallusinering | 🟢 | System prompt: minner kan komme fra andre repoer, fil-kontekst er sannheten, minner er hint |
| Skills UUID[] fix | 🟢 | depends_on::text[] og conflicts_with::text[] cast i resolve() — fikser "unsupported type: UuidArray" |
| Tool-use / Function Calling | 🟢 | 5 tools (create_task, start_task, list_tasks, read_file, search_code) i ai/ai.ts, callAnthropicWithTools two-call flow, executeToolCall dispatcher. create_task: source="chat" + AI-berikelse (complexity/tokens). start_task: verifiserer task, setter in_progress/blocked |
| Dynamic AgentStatus | 🟢 | processAIResponse bygger steg dynamisk basert på intent-deteksjon, conditional memory search, bedre fasenavn (Forbereder/Analyserer/Planlegger/Bygger/Reviewer/Utforer) |
| Animated PhaseIcons | 🟢 | Per-fase SVG-ikoner med CSS-animasjoner (grid-blink, forstorrelsesglass-pulse, clipboard, lightning-swing, eye, gear-spin) |
| File Upload | 🟢 | chat_files tabell (migrasjon 4), POST /chat/upload (500KB grense), frontend fil-velger via + meny |
| File Download | 🟢 | CodeBlock nedlastingsknapp for navngitte kodeblokker |
| Chat source field | 🟢 | source-kolonne i messages-tabell, SendRequest.source ("web"\|"slack"\|"discord"\|"api") |
| Token usage tracking | 🟢 | ChatResponse returnerer usage { inputTokens, outputTokens, totalTokens }, metadata JSONB i messages |
| Token metadata display | 🟢 | Frontend viser token info, modell, kostnad under AI-meldinger |
| Truncation handling | 🟢 | processAIResponse oppdager truncation, appender melding til bruker |
| Repo activity logging | 🟢 | repo_activity tabell (chat, tool_use, ai_response events), logRepoActivity() helper |
| Repo activity endpoint | 🟢 | GET /chat/activity/:repoName — henter repo-spesifikke events |
| Activity page integration | 🟢 | /repo/[name]/activity henter repo_activity events + audit + tasks + builder |
| Kostnads-dashboard (backend) | 🟢 | GET /chat/costs — aggregerer today/week/month/perModel/dailyTrend fra messages metadata |
| Kostnads-dashboard (frontend) | 🟢 | /settings/costs — 3 kostnadskort, per-modell-tabell, 14-dagers CSS-bar-chart |
| Budget alert | 🟢 | processAIResponse: $5/dag terskel, console.warn ved overskridelse |

### Sikkerhet & Bugfiks (februar 2026)

#### FIX 1: Cost Safety (.toFixed() wrapping) 🟢
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Number() wrapping for .toFixed() | 🟢 | Alle .toFixed() og .toLocaleString() kall i frontend/src/app/(dashboard)/settings/costs/page.tsx nå wrapped med Number() for å handtere null/string-verdier fra SQL |
| SQL cost-datatyper sikker | 🟢 | costs.totalCostUsd, costs.avgCostPerMessage, costs.costByModel returner DECIMAL/safe-verdier |
| Frontend type-sikkerhet | 🟢 | Prevents "toFixed is not a function" crashes når SQL returnerer null |

#### FIX 2: Soft Delete for Tasks 🟢
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| POST /tasks/soft-delete | 🟢 | Ny backend-endepunkt — slett task med is_deleted=true, lagrer deleted_at timestamp |
| POST /tasks/restore | 🟢 | Gjenopprett soft-deleted task — sett is_deleted=false |
| POST /tasks/permanent-delete | 🟢 | Permanent sletting for archived tasks |
| Frontend delete-knapp per task-kort | 🟢 | "Slett"-handling, bekreftelses-modal |
| "Slettet"-seksjon i tasks-liste | 🟢 | Filter for is_deleted=true, viser tasks slettet <5 minutter |
| Restore-knapp per slettet task | 🟢 | Gjenopprett slettede tasks |
| Auto-permanent-delete cron | 🟢 | Task-slettet >5 minutter → permanent delete fra DB |
| Backend queries filtrerer is_deleted | 🟢 | Alle listTasks queries utelater soft-deleted tasks som standard (WHERE is_deleted=false) |
| "deleted" i TaskStatus union | 🟢 | Lagt til "deleted" i TaskStatus type, `AND status != 'deleted'` i alle 9 listTasks-grener, getStats filtrerer deleted |
| GET /tasks/deleted/:repoName | 🟢 | Ny listDeleted endpoint for frontend — henter soft-deleted tasks per repo |
| pushToLinear deleted mapping | 🟢 | `deleted: "Cancelled"` i statusToLinearState |
| Frontend listDeletedTasks | 🟢 | Frontend henter deleted tasks via listDeletedTasks(repoName) ved sideinnlasting, full softDelete→listDeleted→restore→permanentDelete flyt verifisert |

#### FIX 3: Agent Report duplikater i chat 🟢
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| agent_report/agent_status filtrering | 🟢 | `.filter(m => m.messageType !== "agent_report" && m.messageType !== "agent_status")` i begge chat-sider (chat/page.tsx + repo/[name]/chat/page.tsx) |
| Dead code fjernet | 🟢 | tryParseAgentStatus funksjon, AgentStatus import, isAgentReport variabel fjernet fra begge chat-sider |
| hasAgentStatus beholdt | 🟢 | Brukes fortsatt for "tenker..." spinner-logikk |

#### FIX 4: Repo Persistence via localStorage 🟢
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| localStorage repo-lagring | 🟢 | Selected repo nå persistert i localStorage via repo-context.tsx |
| RepoProvider oppdatert | 🟢 | Leser localStorage["selectedRepo"] på mount, fallback til første repo |
| Navigation-opprettholding | 🟢 | Navigasjon til /settings, /home, /skills — repo-valg forblir samme når man returnerer til /repo/[name] |
| getSelectedRepo() hook | 🟢 | Frontend hook returnerer persistert repo eller fallback |
| Synk med backend | 🟢 | RepoProvider henter repos via listRepos API, synker valg med localStorage |

---

## 9. Andre tjenester

### Cache-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Embedding-cache (90d TTL) | 🟢 | `emb:{sha256}` → vector |
| Repo-structure-cache (1h TTL) | 🟢 | `repo:{owner}/{repo}:{branch}` |
| AI-plan-cache (24h TTL) | 🟢 | `plan:{sha256(task+repo)}` |
| Skills-cache | 🔴 | Ingen skills caching — skills hentes direkte fra DB hver gang |
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
| updateTask | 🟢 | State-mapping via getWorkflowStates() + issueUpdate mutation | 7 statuser: backlog→Backlog, planned→Todo, in_progress→In Progress, in_review→In Review, done→Done, blocked→Cancelled, deleted→Cancelled |
| 5-min polling cron | 🟢 | check-thefold-tasks |

### Builder-service (NY — Steg 4.2)

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| builder_jobs tabell | 🟢 | UUID PK, task_id, sandbox_id, plan JSONB, strategy, phases, cost tracking |
| build_steps tabell | 🟢 | UUID PK, FK til builder_jobs (CASCADE), phase, action, content, validation_result JSONB |
| Indekser | 🟢 | idx_jobs_task, idx_jobs_status, idx_steps_job, idx_steps_status |
| BuilderJob type | 🟢 | Full type med contextWindow, dependencyGraph, filesWritten |
| BuildPlan/BuildPlanStep | 🟢 | Planstruktur fra ai.planTask() |
| BuildResult type | 🟢 | Resultat med filesChanged, tokens, cost, errors |
| BuildProgressEvent | 🟢 | Pub/Sub event for live-oppdateringer |
| Dependency graph | 🟢 | analyzeDependencies, extractImports, resolveImport |
| Topologisk sortering | 🟢 | Kahn's algoritme med syklusdeteksjon |
| getRelevantContext | 🟢 | Rekursiv avhengighetssamling fra context window |
| initPhase | 🟢 | Analysér plan, velg strategi, sett dependency graph |
| selectStrategy | 🟢 | scaffold_first / dependency_order / sequential |
| scaffoldPhase | 🟢 | Kjør init-kommandoer (npm init etc.) |
| dependenciesPhase | 🟢 | Installer npm-pakker (eksplisitt + auto-detektert) |
| implementPhase | 🟢 | Fil-for-fil: generér → skriv → valider → fiks (maks 3) |
| integratePhase | 🟢 | Full sandbox.validate → identifiser feilende filer → fiks → re-valider (maks 3) |
| finalizePhase | 🟢 | Samle alle filer → returner BuildResult |
| build-progress Topic | 🟢 | Pub/Sub for fase/steg-hendelser |
| POST /builder/start | 🟢 | Intern: opprett jobb, kjør executeBuild |
| POST /builder/status | 🟢 | Intern: hent jobb + steg |
| POST /builder/cancel | 🟢 | Intern: avbryt jobb |
| GET /builder/job | 🟢 | Auth: hent jobb (frontend) |
| POST /builder/jobs | 🟢 | Auth: liste jobber med filter |
| ai.generateFile | 🟢 | Generer enkeltfil med kontekst og skills pipeline |
| ai.fixFile | 🟢 | Fiks TypeScript-feil med full kontekst |
| Agent STEP 6 integrasjon | 🟢 | builder.start() erstatter blind file-writing loop |

### Tasks-service (NY — Steg 4.1)

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| tasks-tabell | 🟢 | 24 kolonner, 5 indekser, 4 sources, 7 statuser (inkl. deleted) |
| createTask | 🟢 | POST /tasks/create, auth, full validering |
| updateTask | 🟢 | POST /tasks/update, individuelle felt-oppdateringer |
| deleteTask | 🟢 | POST /tasks/delete |
| getTask | 🟢 | GET /tasks/get + intern getTaskInternal |
| listTasks | 🟢 | POST /tasks/list, 6 filtre (repo, status, source, labels, priority, assignedTo), filtrerer ut deleted tasks i alle 9 query-grener |
| listDeleted | 🟢 | GET /tasks/deleted/:repoName — henter soft-deleted tasks for et repo |
| syncLinear | 🟢 | Pull fra Linear, create/update lokalt, oppdater linear_synced_at |
| pushToLinear | 🟢 | Push TheFold-status tilbake til Linear (inkl. deleted→Cancelled mapping) |
| planOrder | 🟢 | AI-basert prioritering via ai.planTaskOrder (Haiku) |
| getStats | 🟢 | Totalt, per status, per source, per repo (filtrerer ut deleted tasks) |
| updateTaskStatus | 🟢 | Intern — agent oppdaterer status, reviewId, prUrl |
| cancelTask | 🟢 | POST /tasks/cancel (exposed, auth) — stopper pågående task, in-memory `cancelledTasks` Set |
| isCancelled | 🟢 | Intern endpoint — agent poller denne mellom steg (4 sjekkpunkter) |
| task-events Pub/Sub | 🟢 | 5 typer: created, updated, deleted, completed, failed |
| Agent-integrasjon | 🟢 | STEP 1 dual-source: prøver tasks-service først (`getTaskInternal`), fallback til Linear. Lokal task → `thefoldTaskId` settes automatisk, status → `in_progress`. `checkCancelled()` helper poller `tasks.isCancelled()` mellom steg, destroyer sandbox ved cancel |

### GitHub-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| getTree (cached) | 🟢 | 1h cache via cache-service |
| getFile | 🟢 | Full filinnhold |
| getFileMetadata | 🟢 | Linjetall og størrelse |
| getFileChunk | 🟢 | Linje-basert chunking, 1-basert, maks 500 linjer |
| findRelevantFiles | 🟢 | Keyword-scoring av filnavn |
| createPR | 🟢 | Branch → blobs → tree → commit → PR |
| listRepos | 🟢 | Liste org-repos (sortert push-dato, filtrert ikke-arkiverte) |

### Users-service

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| OTP request (rate limited) | 🟢 | 5/time, 6-sifret, SHA256 hash, 5 min utløp |
| OTP verify | 🟢 | 3 forsøk, anti-enumerering |
| Profil (me, updateProfile) | 🟢 | Navn, avatarfarge |
| Preferences (JSONB) | 🟢 | modelMode, avatarColor, aiName |
| Login audit | 🟢 | email, success, user_agent |

---

## 10. Frontend

### Sider og status

| Side | Status | Koblet til backend | Hva mangler |
|------|--------|-------------------|-------------|
| /settings/costs | 🟢 | Ja (getCostSummary) — 3 kostnadskort, per-modell-tabell, 14-dagers CSS-bar-chart | — |
| /login | 🟢 | Ja (requestOtp, verifyOtp) | Suspense boundary for useSearchParams |
| /home | 🟢 | Ja (getTasks, getCacheStats, getMemoryStats, getAuditStats, listAuditLog, listRepos, getMonitorHealth) | — |
| /chat | 🟢 | Ja (full chat, skills, models, transfer) | — |
| /skills | 🟢 | Ja (full CRUD, pipeline, resolve) | — |
| /settings | 🟢 | Ja (profil, preferanser med backend-sync, debug med ekte health checks) | — |
| /settings/security | 🟢 | Ja (audit log, stats) | — |
| /environments | 🟢 | Ja (listRepos fra GitHub-service) | — |
| /review | 🟢 | Ja (listReviews med statusfilter) | — |
| /review/[id] | 🟢 | Ja (getReview, approveReview, requestChanges, rejectReview) | — |
| /tools (layout + redirect) | 🟢 | — (horisontal tab-navigasjon) | — |
| /tools/ai-models | 🟢 | Ja (listModels, getMe, updateModelMode) | — |
| /tools/builder | 🟢 | Ja (listBuilderJobs, 5s polling for aktive jobber) | — |
| /tools/tasks | 🟢 | Ja (listTheFoldTasks, getTaskStats, syncLinearTasks) | — |
| /tools/memory | 🟢 | Ja (searchMemories, storeMemory, getMemoryStats, listRepos) | — |
| /tools/mcp | 🟢 | Ja (listMCPServers, install/uninstall) | Konfigurasjon UI for envVars/config |
| /tools/observability | 🟢 | Ja (getMonitorHealth, getAuditStats, listAuditLog) | — |
| /tools/secrets | 🟢 | Ja (getSecretsStatus, configured/mangler-badges) | — |
| /tools/templates | 🟢 | Ja (listTemplates, useTemplate, category filter, slide-over, InstallModal med repo-dropdown + variabel-inputs) | — |
| /marketplace | 🟢 | Ja (listComponents, searchComponents, category filter) | — |
| /marketplace/[id] | 🟢 | Ja (getComponent, useComponent, getHealingStatus, file browser) | — |
| /tools/integrations | 🟢 | Ja (listIntegrations, saveIntegration, deleteIntegration) | — |
| /repo/[name]/chat | 🟢 | Ja (repo-chat, skills, models) | — |
| /repo/[name]/overview | 🟢 | Ja (per-page header "Oversikt" med helse-indikator, shortcuts-kort 2x2 grid: Chat/Oppgaver/Aktivitet/Reviews) | — |
| /repo/[name]/tasks | 🟢 | Ja (per-page header "Oppgaver" med "Ny oppgave"/"Synk fra Linear" actions, Kanban med TheFold task engine) | — |
| /repo/[name]/reviews | 🟢 | Ja (repo-filtrert reviews med statusfilter) | — |
| /repo/[name]/activity | 🟢 | Ja (tidslinje: audit, tasks, builder — server-side repo-filtrering, gruppert per dag) | — |

### Komponenter

| Komponent | Status | Beskrivelse |
|-----------|--------|-------------|
| ModelSelector | 🟢 | Auto/manuell modus, dropdown med alle modeller og kostnader |
| SkillsSelector | 🟢 | Multi-select, category-farger, phase-ikoner, token-budsjett, "Auto"-knapp |
| MessageSkillBadges | 🟢 | Viser skills brukt i en melding |
| ChatToolsMenu | 🟢 | Floating menu: create skill, create task, transfer |
| InlineSkillForm | 🟢 | Rask skill-oppretting fra chat |
| LivePreview | 🟡 | Placeholder for sandbox-preview | Koble til sandbox |
| AgentStatus | 🟢 | Collapsible tab+boks, fase-spesifikke ikoner (spinner/forstørrelsesglass/wrench/check/X), agent-animasjoner |
| CodeBlock | 🟢 | Collapsible kodeblokk, filnavn-header, språk-badge, kopier-knapp, linjenumre, firkantede kanter |
| ChatMessage | 🟢 | Markdown-parser for assistant-meldinger: kodeblokker, overskrifter, lister, bold/italic/inline-kode |
| PageHeaderBar | 🟢 | Forenklet: fjernet cells/tabs prop, lagt til subtitle prop — brukes av alle repo-sider med per-page titler og actions |
| Sidebar | 🟢 | Navigasjon (Home/Chat/Environments/Marketplace | Repo | Skills/Tools | Settings), repo-dropdown, brukerprofil |

### Skeleton Loading System

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| .skeleton CSS-animasjon | 🟢 | Shimmer-animasjon i globals.css for loading-tilstander |
| 17 loading.tsx filer | 🟢 | Next.js Suspense skeletons for alle dashboard-sider: home, chat, environments, marketplace, marketplace/[id], skills, settings, settings/costs, settings/security, review, review/[id], tools, repo/[name]/overview, repo/[name]/chat, repo/[name]/tasks, repo/[name]/reviews, repo/[name]/activity |
| Sidebar prefetch | 🟢 | `prefetch={true}` på alle sidebar Link-komponenter for raskere navigasjon |
| Tools tab prefetch | 🟢 | `prefetch={true}` på alle Tools layout tab-lenker |

### Template Install Modal

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| InstallModal komponent | 🟢 | Dark backdrop (rgba(0,0,0,0.6)), repo-dropdown fra listRepos(), variabel-inputs, square corners |
| Font-audit templates | 🟢 | Korrigert font-klasser gjennom hele templates-siden |

### AI Name Preference (Frontend)

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Settings AI-assistent seksjon | 🟢 | Navn-input i Preferanser tab med auto-genererte initialer-preview |
| UserPreferencesContext | 🟢 | Eksporterer aiName + aiInitials derivert fra preferences |
| Chat aiName-integrasjon | 🟢 | Begge chat-sider bruker aiName/aiInitials fra context for avatar, "tenker"-indikator, heartbeat-lost melding |
| Default AI-navn | 🟢 | Endret fra "TheFold"/"TF" til "Jørgen André"/"JA" |

### Design System (UI/UX Overhaul)

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Flat design | 🟢 | Alle border-radius: 0 (unntatt chat-bobler, avatarer, status-dots, toggles) |
| Solid borders | 🟢 | Alle dashed → solid gjennom hele frontenden |
| Filled buttons | 🟢 | .btn-primary: filled med inverted farger, .btn-secondary/danger: transparent med solid border |
| Font stack | 🟢 | ABC Diatype Plus (display), Ivar Text (brand), Inter 400/500 (UI) |
| Tab system | 🟢 | .tab / .tab-active CSS-klasser, brukt i Tools + Skills |
| Dropdown system | 🟢 | .dropdown-menu / .dropdown-item CSS-klasser |
| Agent-animasjoner | 🟢 | agent-pulse, agent-spinner, agent-check-in, agent-typing, message-enter |
| deleteConversation | 🟢 | POST /chat/delete med ownership-verifisering, trash-ikon per samtale |
| Sidebar restructure | 🟢 | Ny navigasjonsrekkefølge med separatorer og bottom-pinned Settings |
| Global header | 🟢 | PageHeader med dynamisk tittel, 80px minHeight |
| Chat layout | 🟢 | 280px samtale-panel med borderceller, 280px title-celle, toggle i chat-area, 80px header, overfør til repo |

### Kontekst-providere

| Provider | Status | Beskrivelse |
|----------|--------|-------------|
| PreferencesProvider | 🟢 | Henter /users/me, gir usePreferences(), useUser(), aiName og aiInitials hooks |
| RepoProvider | 🟢 | Henter repos fra listRepos("Twofold-AS") med fallback | — |

---

## 12. MCP-service (Model Context Protocol)

### Database-tabeller

**mcp_servers:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| name | TEXT NOT NULL UNIQUE | 🟢 |
| description | TEXT | 🟢 |
| command | TEXT NOT NULL | 🟢 |
| args | TEXT[] | 🟢 |
| env_vars | JSONB | 🟢 |
| status | TEXT | 🟢 (available/installed/error) |
| category | TEXT | 🟢 (general/code/data/docs/ai) |
| config | JSONB | 🟢 |
| installed_at | TIMESTAMPTZ | 🟢 |
| created_at | TIMESTAMPTZ | 🟢 |
| updated_at | TIMESTAMPTZ | 🟢 |

### Pre-seeded servere

| Server | Category | Default status |
|--------|----------|----------------|
| filesystem | code | available |
| github | code | available |
| postgres | data | available |
| context7 | docs | installed |
| brave-search | general | available |
| puppeteer | general | available |

### Endepunkter

| Endepunkt | Status | Expose | Auth | Beskrivelse |
|-----------|--------|--------|------|-------------|
| GET /mcp/list | 🟢 | true | Ja | Alle servere med status |
| GET /mcp/get | 🟢 | true | Ja | Enkelt server med ID |
| POST /mcp/install | 🟢 | true | Ja | Marker som installert, lagre config |
| POST /mcp/uninstall | 🟢 | true | Ja | Marker som available |
| POST /mcp/configure | 🟢 | true | Ja | Oppdater envVars/config |
| GET /mcp/installed | 🟢 | false | Nei | Kun installerte (for agent) |

### Agent-integrasjon

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Fetch installed servers | 🟢 | agent.ts STEP 3.5: mcp.installed() |
| Include in AI context | 🟢 | Lagt til i docsStrings som verktøyliste |
| Actual MCP call routing | ⚪ | Planlagt for Fase 5 |

### Frontend

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| /tools/mcp side | 🟢 | Dynamisk fra API (listMCPServers) |
| Install/uninstall knapper | 🟢 | Fungerer via API |
| Konfigurasjon UI | ⚪ | Fremtidig: envVars/config editor |

### Hva trengs for full aktivering
1. Implementer faktisk MCP-kall routing i agent (Fase 5)
2. Konfigurasjon UI for envVars og config
3. Helsestatus-sjekk for installerte servere
4. Legg til flere MCP-servere (Sentry, Slack, etc.)

---

## 12c. Integrations-service (External Webhooks)

### Database-tabeller

**integration_configs:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| service | TEXT NOT NULL | 🟢 |
| config | JSONB NOT NULL | 🟢 |
| enabled | BOOLEAN | 🟢 |
| created_at | TIMESTAMPTZ | 🟢 |
| updated_at | TIMESTAMPTZ | 🟢 |

### Endepunkter

| Endepunkt | Status | Expose | Auth | Beskrivelse |
|-----------|--------|--------|------|-------------|
| GET /integrations/list | 🟢 | true | Ja | Liste alle konfigurasjoner |
| POST /integrations/save | 🟢 | true | Ja | Lagre/oppdater konfigurasjon |
| POST /integrations/delete | 🟢 | true | Ja | Slett konfigurasjon |
| POST /integrations/slack-webhook | 🟢 | true | Nei | Motta Slack-webhook |
| POST /integrations/discord-webhook | 🟢 | true | Nei | Motta Discord-webhook |

### Frontend

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| /tools/integrations side | 🟢 | Slack + Discord config-skjemaer |
| Webhook URL-konfigurasjon | 🟢 | Lagre/slette webhook-URL per tjeneste |

---

## 12b. Sub-agenter (Multi-Agent AI Orkestrering)

### Filer
| Fil | Status | Beskrivelse |
|-----|--------|-------------|
| `ai/sub-agents.ts` | 🟢 | Typer, roller, modell-mapping (6 roller, 3 budsjettmodi) |
| `ai/orchestrate-sub-agents.ts` | 🟢 | Planlegging, parallell kjøring, resultat-merging, kostnadsestimat |
| `ai/sub-agents.test.ts` | 🟢 | ~15 tester (roller, planlegging, merging, kostnad) |

### Funksjonalitet
| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Role-to-model mapping | 🟢 | 6 roller x 3 budsjettmodi (balanced/quality_first/aggressive_save) |
| Complexity-based planning | 🟢 | <5: ingen, 5-7: impl+test, 8-9: team, 10: full team |
| Parallel execution | 🟢 | Promise.allSettled med dependency graph |
| Result merging | 🟢 | concatenate + ai_merge (Haiku) |
| Cost estimation endpoint | 🟢 | POST /ai/estimate-sub-agent-cost |
| Agent integration | 🟢 | Step 5.6 i agent loop, preference-styrt |
| Frontend toggle | 🟢 | /tools/ai-models med toggle + kostnadsvisning |
| Audit logging | 🟢 | sub_agent_started + sub_agent_completed events |

### Hva trengs for videre utvikling
1. Alt er aktivt — sub-agenter kjores nar `subAgentsEnabled: true` i brukerpreferanser
2. Vurder a legge til `researcher` rolle som faktisk soker memory/docs
3. A/B-testing: sammenlign kvalitet med/uten sub-agenter

---

## 13. Registry-service (Component Marketplace Grunnmur)

### Database-tabeller

**components:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| name | TEXT NOT NULL | 🟢 |
| description | TEXT | 🟢 |
| category | TEXT | 🟢 |
| version | TEXT | 🟢 |
| previous_version_id | UUID | 🟢 |
| files | JSONB NOT NULL | 🟢 |
| entry_point | TEXT | 🟢 |
| dependencies | TEXT[] | 🟢 |
| source_repo | TEXT NOT NULL | 🟢 |
| source_task_id | UUID | 🟢 |
| extracted_by | TEXT | 🟢 |
| used_by_repos | TEXT[] | 🟢 |
| times_used | INT | 🟢 |
| test_coverage | DECIMAL | 🟢 |
| validation_status | TEXT | 🟢 |
| tags | TEXT[] | 🟢 |

**healing_events:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| component_id | UUID FK | 🟢 |
| old_version | TEXT | 🟢 |
| new_version | TEXT | 🟢 |
| trigger | TEXT | 🟢 |
| severity | TEXT | 🟢 |
| affected_repos | TEXT[] | 🟢 |
| tasks_created | UUID[] | 🟢 |
| status | TEXT | 🟢 |

### Endepunkter

| Endepunkt | Status | Expose | Auth | Beskrivelse |
|-----------|--------|--------|------|-------------|
| POST /registry/register | 🟢 | false | Nei | Registrer komponent (intern) |
| GET /registry/get | 🟢 | true | Ja | Hent komponent |
| POST /registry/list | 🟢 | true | Ja | Liste med filter |
| POST /registry/search | 🟢 | true | Ja | Søk (navn, beskrivelse, tags) |
| POST /registry/use | 🟢 | false | Nei | Marker bruk (intern) |
| POST /registry/use-component | 🟢 | true | Ja | Marker bruk (frontend marketplace) |
| POST /registry/find-for-task | 🟢 | false | Nei | Finn komponenter for oppgave |
| POST /registry/trigger-healing | 🟢 | false | Nei | Trigger healing-pipeline |
| GET /registry/healing-status | 🟢 | true | Ja | Healing-status |

### Pub/Sub

| Topic | Status | Subscriber |
|-------|--------|------------|
| healing-events | 🟢 | chat/store-healing-notification |

### Features

| Feature | Status | Beskrivelse | Aktivering |
|---------|--------|-------------|------------|
| Component CRUD | 🟢 | Register, get, list, search | — |
| Use tracking | 🟢 | used_by_repos + times_used | — |
| Version chain | 🟢 | previous_version_id lenke | — |
| Healing pipeline | 🟢 | trigger-healing → tasks.createTask per repo | — |
| Healing notifications | 🟢 | Pub/Sub → chat subscriber | — |
| Auto-extraction | 🟡 | extractor.ts stub (returnerer []) | Implementer AI-basert komponentdeteksjon |
| AI component matching | 🟡 | find-for-task bruker keyword LIKE | Bruk memory.searchPatterns() for semantisk match |
| Marketplace frontend | 🟢 | /marketplace liste + /marketplace/[id] detalj | — |
| Component signering | ⚪ | Ingen kryptering | OWASP ASI04 Supply Chain |

### Hva trengs for full aktivering
1. Implementer AI-basert auto-ekstraksjon i `registry/extractor.ts`
2. Bruk `memory.searchPatterns()` for semantisk komponent-matching i `find-for-task`
3. ~~Frontend /marketplace side med komponent-browser~~ ✅ /marketplace + /marketplace/[id]
4. Komponent-signering for supply chain security (OWASP ASI04)
5. Cross-repo bug propagation via healing pipeline

---

## 14. Templates-service (Template Library)

### Database-tabeller

**templates:**
| Kolonne | Type | Status |
|---------|------|--------|
| id | UUID PK | 🟢 |
| name | TEXT NOT NULL | 🟢 |
| description | TEXT NOT NULL | 🟢 |
| category | TEXT NOT NULL | 🟢 |
| framework | TEXT | 🟢 |
| files | JSONB NOT NULL | 🟢 |
| dependencies | JSONB | 🟢 |
| variables | JSONB | 🟢 |
| use_count | INT | 🟢 |
| created_at | TIMESTAMPTZ | 🟢 |

### Pre-seeded templates

| Template | Category | Framework |
|----------|----------|-----------|
| Contact Form | form | next.js |
| User Auth (OTP) | auth | next.js |
| Stripe Payment | payment | next.js |
| REST API CRUD | api | encore.ts |
| File Upload | form | next.js |

### Endepunkter

| Endepunkt | Status | Expose | Auth | Beskrivelse |
|-----------|--------|--------|------|-------------|
| GET /templates/list | 🟢 | true | Ja | Liste med valgfri category-filter |
| GET /templates/get | 🟢 | true | Ja | Hent template med filer |
| POST /templates/use | 🟢 | true | Ja | Bruk template: inkrementer count, variabel-substitusjon |
| GET /templates/categories | 🟢 | true | Ja | Kategorier med antall |

### Features

| Feature | Status | Beskrivelse |
|---------|--------|-------------|
| Template CRUD | 🟢 | List, get, use, categories |
| Variable substitution | 🟢 | `{{VAR}}` i filinnhold og stier |
| Category filtering | 🟢 | 6 kategorier: auth, api, ui, database, payment, form |
| Use tracking | 🟢 | use_count inkrementeres |
| Frontend /tools/templates | 🟢 | Grid med slide-over detaljer |

---

## Aktiveringsplan: Prioritert rekkefølge

### Fase 1: Kjernefunksjonalitet (nødvendig for MVP)
1. ~~**linear.updateTask() state-mapping**~~ ✅ getWorkflowStates() + issueUpdate mutation
2. ~~**Fjern hardkodet MonitorEnabled disable**~~ ✅ Sjekker MonitorEnabled secret
3. ~~**Token-revokering ved logout**~~ ✅ revoked_tokens + cleanup cron
4. ~~**CORS-konfigurasjon**~~ ✅ Eksplisitt global_cors i encore.app

### Fase 2: Kvalitetsforbedring
1. **executePreRun implementering** — Input-validering, security scan før AI-kall
2. **executePostRun implementering** — Quality review, security scan etter AI-kall
3. **logSkillResults i 3 manglende endpoints** — diagnoseFailure, revisePlan, assessConfidence
4. **Backend-filter for category/tags i listSkills** — Frontend sender allerede, backend ignorerer
5. ~~**Koble /home til ekte stats**~~ ✅ 7 API-kall, alle hardkodede tall erstattet
6. ~~**Koble /environments til GitHub**~~ ✅ listRepos endepunkt + frontend koblet
7. ~~**Docker-isolering for sandbox**~~ ✅ Dual-modus (SandboxMode secret), Docker med full isolering + cleanup cron

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

## 11. E2E Tester (Steg 3.3)

### Testfil: agent/e2e.test.ts

| Test | Status | Beskrivelse | Avhengigheter |
|------|--------|-------------|---------------|
| Test 1: Enkel task-flyt | 🟡 SKIP | Full executeTask med skipReview=true | AnthropicAPIKey, GitHubToken, VoyageAPIKey |
| Test 2: Task med review-flyt | 🟡 SKIP | executeTask → pending_review → approve | AnthropicAPIKey, GitHubToken, VoyageAPIKey |
| Test 3: Prosjektdekomponering | 🟡 SKIP | ai.decomposeProject + storeProjectPlan | AnthropicAPIKey, GitHubToken |
| Test 4: Context Curator | 🟡 SKIP | curateContext med avhengigheter | GitHubToken, VoyageAPIKey |
| Test 5: Chat prosjektdeteksjon | 🟢 | Ren funksjon, 6 test-caser | Ingen |
| Test 6: Memory decay | 🟢 | Rene funksjoner, 8 test-caser | Ingen |
| Test 7: Skills pipeline | 🟢 | DB-operasjoner, 4 test-caser | Kun database |
| Review DB lifecycle | 🟢 | Full review-livssyklus i DB | Kun database |
| Project pending_review | 🟢 | pending_review status i project_tasks | Kun database |
| Audit log integration | 🟢 | Lagre og spørre audit-logg | Kun database |

**Totalt:** 25 tester (21 bestått, 4 skippet)

---

## Oppsummering

| Kategori | Antall |
|----------|--------|
| 🟢 AKTIVE features | 285+ |
| 🟡 STUBBEDE features | 2 |
| 🔴 GRUNNMUR features | 19 |
| ⚪ PLANLAGTE features | 9 |

**Nylig aktiverte (februar 2026):**
- ✅ Dynamic AI Provider & Model System — DB-drevet med full CRUD, 4 providers, 9 modeller, tag-based selection, tier-based upgrade, frontend /settings/models
- ✅ FIX 1: Cost safety — .toFixed() wrapping for NULL/string-håndtering
- ✅ FIX 2: Soft delete for tasks — 3 nye endepunkter (softDelete, restore, permanentDelete), frontend delete-knapp, "Slettet"-seksjon, auto-cleanup cron
- ✅ FIX 3: Repo persistence — localStorage repo-valg, RepoProvider oppdatert, navigation-opprettholding
- ✅ FIX 4 (Bugfiks Runde 4): "deleted" status i TaskStatus + listTasks-filtrering + listDeleted endpoint + pushToLinear mapping + getStats-filtrering
- ✅ FIX 5 (Bugfiks Runde 4): Slett-knapp på tasks — frontend listDeletedTasks koblet til backend, full softDelete→listDeleted→restore→permanentDelete flyt end-to-end
- ✅ FIX 6 (Bugfiks Runde 4): Agent report duplikater — agent_report/agent_status filtrert ut i begge chat-sider, dead code fjernet
- ✅ FIX 7 (Bugfiks Runde 5): AgentStatus box restaurert — agent_status meldinger nå synlige igjen, kun agent_report filtrert (chat rendering i begge sider)
- ✅ FIX 8 (Bugfiks Runde 5): Deleted skill injeksjon — skills.resolve() fikset til korrekt schema `{ context: SkillPipelineContext }`, deaktiverte skills som "Hilsen Jørgen" filtreres nå ut
- ✅ FIX 9 (Bugfiks Runde 5): Empty repo confidence — agent STEP 4 hopper over klaritetsspørsmål for tomme repoer (auto-setter confidence til 90)
- ✅ FIX 10 (Bugfiks Runde 5): Agent stopp/vente UI — AgentStatus redesignet med "Venter"-fase (gul ikon, questions display, reply input), "Feilet"-fase (retry/cancel buttons), både chat-sider oppdatert med onReply/onRetry/onCancel callbacks
- ✅ DEL 4 (Skills task_phase system): Ny task_phase kolonne (all/planning/coding/debugging/reviewing), migrasjon 7, skills/skills.ts + skills/engine.ts oppdatert med taskType→task_phase filtrering, ai.ts CONTEXT_TO_TASK_PHASE mapping, frontend redesign med fase-tabs + scope filter + badges
- ✅ DEL 2 item 3 (Cache investigation): cache/cache.ts cacher KUN embeddings/repo/plans — INGEN skills caching (skills hentes alltid friskt fra DB)
- ✅ DEL 3 completion (AgentStatus callbacks): Begge chat-sider wired med onReply/onRetry/onCancel callbacks, tryParseAgentStatus extraherer questions, handleAgentReply sender svar, handleAgentRetry re-sender siste melding, handleAgentCancel kaller cancelChatGeneration

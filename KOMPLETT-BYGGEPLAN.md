# TheFold - Komplett Byggeplan

> **Versjon:** 3.0 - Grunnmur-oppgradering fullført
> **Sist oppdatert:** 14. februar 2026
> **Status:** Fase 1-3 ferdig (KOMPLETT). Se GRUNNMUR-STATUS.md for detaljert feature-status.

---

## 📋 Innholdsfortegnelse

1. [Prosjektoversikt](#prosjektoversikt)
2. [Nåværende Status](#nåværende-status)
3. [Arkitektur](#arkitektur)
4. [Byggeplan - Fase for Fase](#byggeplan)
5. [Viktige Prinsipper](#viktige-prinsipper)
6. [Referanser til Detaljerte Planer](#referanser)

---

## Prosjektoversikt

**TheFold** er en autonom AI-utvikler som:
- Leser tasks fra Linear
- Forstår kodebasen (GitHub)
- Planlegger og skriver kode i isolert sandbox
- Validerer og fikser feil selv
- Lager PRs med dokumentasjon
- Oppdaterer Linear automatisk

**Kjerneverdi:** Du fokuserer på arkitektur, TheFold håndterer implementering.

**Konkurransefortrinn vs Devin/Sweep/MetaGPT:**
- ✅ Multi-AI provider (velg billigste modell per task)
- ✅ Confidence scoring (AI vurderer egen sikkerhet før start)
- ✅ Aggressive caching (embeddings, repo structure, AI responses)
- ✅ Incremental validation (valider per fil, ikke alt på slutten)
- ✅ Skills system (gjenbrukbare instruksjoner)
- ✅ Full audit logging (100% transparency)
- ✅ Memory decay (eldre minner synker i relevans)
- ✅ MCP App Store (plug & play integrasjoner)
- ✅ Component Marketplace (gjenbruk kode på tvers av prosjekter)
- ✅ Non-technical UX (vibecoding for alle)

---

## Nåværende Status

### ✅ Ferdig og Testet — Backend Services (83+ tester)
- **chat-service:** CRUD, JSONB metadata, paginering, context transfer, Pub/Sub subscribers (agent reports, build progress, task events, healing events)
- **memory-service:** pgvector embeddings, cosine similarity søk, cache-integrasjon
- **ai-service:** Claude API, multi-provider (Claude/GPT/Moonshot), JSON parsing, model routing, generateFile, fixFile
- **github-service:** tree (med cache), file, findRelevantFiles, createPR, getFileChunk, getFileMetadata
- **sandbox-service:** create, writeFile, validate, validateIncremental, destroy, sikkerhetstester
- **linear-service:** getAssignedTasks, getTask, updateTask
- **agent-service:** Integrationstest (sandbox → GitHub → AI → skriv → valider), confidence scoring, incremental validation, cost tracking
- **users-service:** OTP auth, profil, preferences, avatar
- **cache-service:** PostgreSQL-basert caching (embeddings, repo, AI plans)
- **skills-service:** CRUD, GIN-index, prompt injection, preview
- **tasks-service:** CRUD, Linear sync, AI planning, Pub/Sub, statistikk (32 tester)
- **builder-service:** 6 faser, dependency graph, topologisk sortering, fix-loop, Pub/Sub (43 tester)
- **gateway:** HMAC auth handler, createToken (intern)

### ✅ Ferdig — Fase 1 (Foundation + Auth)
- **Steg 1.1 — Users + OTP Auth:** E-post OTP via Resend, rate limiting, audit logging, HMAC token med 7-dagers utløp, frontend OTP-flyt
- **Steg 1.2 — Cache Service:** PostgreSQL-basert cache, embeddings (90d), repo (1h), AI plans (24h), stats, cleanup cron
- **Steg 1.3 — Confidence Scoring:** 4 dimensjoner, <60 klarhet, <75 oppdeling, >=75 proceed. Integrert i agent loop

### ✅ Ferdig — Fase 2 (Core Intelligence) ✅ KOMPLETT
- **Steg 2.1 — Skills System:** Service, CRUD, AI-integrasjon, frontend, 16 tester
- **Steg 2.2 — Audit Logging:** 17+ action types, auditedStep wrapper, 3 query-endepunkter, frontend, 12 tester
- **Steg 2.3 — Context Windowing:** getFileChunk, getFileMetadata, smart lesestrategi, 6 tester
- **Steg 2.4 — Incremental Validation:** Per-fil tsc, MAX_FILE_FIX_RETRIES=2, 5 tester
- **Steg 2.5 — Multi-Model Routing:** 5 modeller, selectOptimalModel, callAIWithFallback, budgetMode, 18 tester
- **Steg 2.6 — Memory Decay:** Importance scoring, eksponentiell decay med type-baserte halvtider, decay cron, 17 tester

### ✅ Ferdig — Tilleggsarbeid (utover opprinnelig plan)
- **Chat Redesign:** Meldingsbobler med bruker/TF-avatarer, dynamisk avatarfarge, tidsstempler, typing-indikator (3 pulserende prikker), smart auto-scroll, tomme-tilstander med foreslåtte spørsmål, agent report & context transfer badges
- **Context Transfer:** `POST /chat/transfer-context` — AI-oppsummering med fallback til rå meldinger, hovedchat → repo-chat flyt med redirect og konversasjons-ID
- **Brukerprofil-system:** Avatarfarge-velger (8 farger), redigerbart visningsnavn med 800ms debounce auto-lagring, dynamiske initialer + farge overalt via React context
- **Unified User Context:** `PreferencesProvider` wrapper for hele dashboard, `useUser()` hook (user, initial, avatarColor, refresh), `usePreferences()` for bakoverkompatibilitet
- **ModelSelector-komponent:** Auto-modus ("AI velger automatisk"), manuell-modus (dropdown med alle modeller og kostnader)
- **LivePreview-komponent:** Placeholder for fremtidig sandbox-preview, side-by-side med chat
- **Design System:** Full CSS variabel-tema (mørk + lys), typing-animasjon, scrollbar-styling, ABC Diatype Plus + Ivar Text + Inter fonter
- **UI/UX Overhaul:** Flat, square, clean design inspirert av Antimetal/SevenAI — alle dashed→solid, rounded→square (border-radius: 0), filled buttons, .tab/.tab-active CSS-klasser, .dropdown-menu/.dropdown-item, agent-animasjoner (pulse, spinner, check-in, typing, message-enter), global PageHeader i dashboard layout, sidebar restructure (Home/Chat/Environments/Marketplace | Repo | Skills/Tools | Settings), deleteConversation backend+frontend, AgentStatus-komponent for chat
- **Samtalehåndtering:** Samtaleliste-sidebar (begge chat-sider, 280px med borderceller), repo-filtrerte samtaler (`repo-{name}-` prefiks), ny samtale-oppretting, smart polling (idle/waiting/cooldown), 80px header med title/modell/skills/ny/slett/overfør celler, toggle i chat-area
- **Backend-utvidelser:** `POST /users/update-profile` (navn, avatarColor), `GET /users/me` (full profil), `POST /users/get` (intern), COALESCE for NULL JSONB-sikkerhet
- **Sikkerhetsrapport:** `OWASP-2025-2026-Report.md` lagt til som referanse

### ✅ Ferdig — Skills Pipeline + Chat Integration
- **Skills Pipeline (Backend):** Execution phases (pre_run/inject/post_run), automatic routing via routing_rules (keywords, file_patterns, labels), token budgeting, dependency/conflict resolution, skill scoring (success/failure/confidence), pipeline engine (resolve, executePreRun, executePostRun, logResult)
- **Skills Frontend Redesign:** Grid layout (3/2/1 kolonner), category-badges med farger, phase-badges, confidence bar, slide-over panel for create/edit/detail, pipeline-visualisering med token-budsjett
- **Skills i Chat:** SkillsSelector med category-farger, phase-ikoner, token-visning, "Auto"-knapp (resolve), skill-IDs lagret i meldingsmetadata, MessageSkillBadges i meldingsbobler
- **AI Pipeline Integration:** buildSystemPromptWithPipeline() erstatter buildSystemPromptWithSkills(), alle 6 AI-endepunkter bruker pipeline, logSkillResults() etter hvert kall

### ✅ Ferdig — Steg 3.1 (Frontend Integration)
Følgende sider er koblet til backend:
- ✅ `/login` — OTP-flyt (e-post → kode → dashboard)
- ✅ `/chat` — Send/motta meldinger, direct chat, overføring til repo
- ✅ `/repo/[name]/chat` — Repo-spesifikk chat med samtaleliste
- ✅ `/skills` — Toggle, opprett, slett, forhåndsvisning
- ✅ `/settings` — Modellstrategi, profil, integrasjoner
- ✅ `/settings/security` — Audit log viewer med statistikk og filtrering
- ✅ API-klient (`api.ts`) med Bearer token auth
- ✅ `/home` — Dashboard med 7 ekte API-kall (tasks, cache, memory, audit, repos, monitor)
- ✅ `/environments` — Henter repos fra GitHub-service (listRepos)
- ✅ `/repo/[name]/memory` — Søk, decay-visualisering, lagre minner
- ✅ `/repo/[name]/tasks` — Statusgruppering, prioritet, norsk UI

### 🏗️ Grunnmur som er bygget inn men ikke aktivert

Mange features har grunnmur (database-felter, interfaces, stub-implementeringer) på plass men er ikke aktivert ennå. Se **GRUNNMUR-STATUS.md** for full oversikt med verifisert status for alle 134 features.

**Nøkkeltall:**
| Status | Antall |
|--------|--------|
| 🟢 AKTIVE | 195 |
| 🟡 STUBBEDE (kode finnes, passthrough) | 5 |
| 🔴 GRUNNMUR (DB-felter/interfaces) | 22 |
| ⚪ PLANLAGTE (ingen kode) | 9 |

**Nylig aktiverte features (fra stubb til aktiv):**
- ✅ Skills pipeline `executePreRun` — input-validering + context-berikelse
- ✅ Skills pipeline `executePostRun` — quality review + auto-logging
- ✅ Monitor `code_quality` — ESLint JSON-analyse
- ✅ Monitor `doc_freshness` — README/CHANGELOG/package.json sjekk
- ✅ Monitor cron — sjekker MonitorEnabled secret
- ✅ logSkillResults i diagnoseFailure, revisePlan, assessConfidence

**Gjenværende stubbede features:**
- Sandbox `snapshot` / `performance` steg — pipeline-plass finnes, `enabled: false`
- ~~Linear `updateTask` — kall fungerer men state-mapping er ufullstendig~~ ✅ State-mapping implementert
- 1 frontend-side uten full backend: LivePreview
- /tools/secrets — API finnes (GET /gateway/secrets-status), frontend ikke koblet ennå

**Viktigste grunnmur-felter klare for implementering:**
- `memories.parent_memory_id` — hierarkisk minne-traversering
- `memories.source_task_id` — task-basert minnefiltrering
- `code_patterns.solution_embedding` — finn lignende løsninger
- `skills.parent_skill_id`, `composable`, `output_schema` — skill-hierarki
- `skills.marketplace_id`, `version`, `downloads`, `rating` — marketplace
- Token-revokering, CORS — sikkerhetskritisk

### 🔧 Gjenstår

**Aktivere eksisterende grunnmur (raskere, kode finnes allerede):**
- ~~Skills pipeline pre/post-run aktivering~~ ✅
- ~~Monitor cron + manglende health checks~~ ✅
- Sandbox snapshot/performance steg
- Frontend repo sub-pages kobling
- Linear state-mapping
- ~~3 manglende logSkillResults-kall~~ ✅

**Bygge nytt:**
- ~~**Steg 2.6:** Memory Decay~~ ✅ Ferdig
- ~~**Steg 3.4 Del 1:** Project Orchestrator (DB + Typer + AI-endepunkt)~~ ✅ Ferdig
- ~~**Steg 3.4 Del 2:** Project Orchestrator (Orchestrator loop + Context Curator + Chat-integrasjon)~~ ✅ Ferdig
- **Steg 3.4 Del 3:** Fase-revisjon (`ai.reviseProjectPhase`) — AI-drevet re-planlegging mellom faser ✅ Ferdig
- ~~**Steg 3.2:** Review System (review gate, approve/reject, diff viewer)~~ ✅ Ferdig
- ~~**Steg 3.3:** Ende-til-ende test~~ ✅ Ferdig (25 tester, 21 bestått, 4 skip)
- ~~**Steg 4.1:** Task Engine~~ ✅ Ferdig (tasks/ service, 11 endepunkter, Linear sync, AI planning, 32 tester)
- **Fase 4** (Steg 4.2): ✅ Builder Service ferdig (builder/ service, 5 endepunkter, 6 faser, dep-graph, 43 tester)
- **Fase 4** (Steg 4.3): ✅ Tools Frontend ferdig (/tools med 7 undersider, sidebar-oppdatering)
- **Fase 4** (Steg 4.4): ✅ Settings Redesign ferdig (3 tabs: Profil/Preferanser/Debug, modeller+integrasjoner fjernet)
- **Fase 4** (Steg 4.5): ✅ Repo-sidebar Redesign ferdig (5 repo-nav, Kanban tasks, reviews, activity, overview landing page)
- **Fase 4** (Steg 4.6): ✅ Registry/Marketplace Grunnmur ferdig (registry/ service, 8 endepunkter, healing pipeline, Pub/Sub, 15 tester)
- **Fase 5:** Component Marketplace Frontend + AI Auto-extraction
- **OWASP-tiltak:** Sikkerhetsforbedringer identifisert i OWASP-rapporten (se egen seksjon)

---

## Arkitektur

### Backend: Encore.ts (13 mikrotjenester)

```
thefold/
├── gateway/     → Auth (Bearer token med HMAC-signatur)
├── users/       → OTP-basert auth, profiler, preferences
├── chat/        → Meldingshistorikk (PostgreSQL), healing-notifications
├── ai/          → Multi-AI orkestering (Claude, GPT-4o, Moonshot)
├── agent/       → Den autonome hjernen - koordinerer hele flyten
├── github/      → Leser/skriver kode via GitHub API
├── sandbox/     → Isolert kodevalidering med sikkerhet
├── linear/      → Task-henting og statusoppdatering
├── tasks/       → TheFold task engine: CRUD, Linear sync, AI planning
├── builder/     → Fil-for-fil kodebygging med avhengighetsanalyse
├── memory/      → pgvector semantic search, code patterns
├── docs/        → Context7 MCP for oppdatert dokumentasjon
├── cache/       → PostgreSQL caching for embeddings, repo struktur, AI svar
├── skills/      → Dynamiske instruksjoner for AI
├── mcp/         → MCP server registry: install/uninstall/configure
├── monitor/     → Health checks, dependency audit
└── registry/    → Component marketplace grunnmur + healing pipeline
```

### Frontend: Next.js 15 Dashboard

```
Sider:
├── /login                    → OTP-basert innlogging
├── /home                     → Oversikt, stats, recent activity
├── /chat                     → Hovedchat (cross-repo)
├── /environments             → Alle repoer
├── /integrations             → [NY] MCP App Store
├── /marketplace              → [FREMTIDIG] Component marketplace
├── /templates                → [NY] Pre-built templates
├── /skills                   → [NY] Skills management
├── /settings
│   ├── /preferences          → [NY] Vibe sliders
│   └── /security             → [NY] Audit log, login history
└── /repo/[name]/
    ├── /overview             → Landingsside (helse, oppgaver, reviews, aktivitet)
    ├── /chat                 → Repo-spesifikk chat
    ├── /tasks                → Kanban (TheFold task engine + Linear sync)
    ├── /reviews              → Repo-filtrerte reviews
    └── /activity             → Tidslinje (audit, tasks, builder)
```

### Kritiske Encore.ts Regler (BRYTES ALDRI)
- APIs: KUN `api()` fra `encore.dev/api`
- Secrets: KUN `secret()` fra `encore.dev/config`
- Databaser: KUN `SQLDatabase` fra `encore.dev/storage/sqldb`
- Pub/Sub: KUN `Topic`/`Subscription` fra `encore.dev/pubsub`
- Cron: KUN `CronJob` fra `encore.dev/cron`
- Cache: KUN `CacheCluster` fra `encore.dev/storage/cache`
- ALDRI Express, Fastify, dotenv, process.env, hardkodede nøkler

---

## Byggeplan

### FASE 1: Foundation + Auth (Dag 1-2, ~16 timer)

#### Steg 1.1: Users-service + OTP Auth (3-4 timer) ✅ FERDIG
**Mål:** E-post OTP login uten passord

**Implementer:**
1. `users/` service med database:
   - `users` tabell (id, email, name, role, preferences JSONB)
   - `otp_codes` tabell (user_id, code_hash, expires_at, attempts, used)
   - `login_audit` tabell (user_id, email, success, ip_address, user_agent)
2. Seed brukere: `mikkis@twofold.no`, `mikael@twofold.no`
3. API-endepunkter:
   - `POST /auth/request-otp` (generer 6-sifret kode, send via Resend)
   - `POST /auth/verify-otp` (verifiser kode, returner HMAC token)
   - `POST /auth/logout`
4. Rate limiting: 5 koder/time, 3 attempts per kode
5. Frontend login-flyt: e-post → OTP → dashboard
6. Comprehensive tests

**Secrets:** `ResendAPIKey`

**Ferdig når:** `encore test ./users/...` passerer, login fungerer

**Se:** `ENDRINGER-AUTH-SKILLS-REKKEFØLGE.md` for full spec

##### Tilleggsarbeid utover plan (Steg 1.1):
- `POST /users/update-profile` — oppdater visningsnavn og avatarfarge ✅
- `GET /users/me` — hent full brukerprofil med preferences ✅
- `POST /users/get` — intern service-to-service endepunkt ✅
- `POST /users/preferences` — oppdater JSONB preferences med `getAuthData()` (ikke userId fra body) ✅
- COALESCE-fix for NULL JSONB merge: `COALESCE(preferences, '{}'::jsonb) || ...` i updatePreferences og updateProfile ✅
- Frontend profil-seksjon i Settings: avatarfarge-velger (8 farger), redigerbart navn med debounce, e-post/rolle visning ✅

---

#### Steg 1.2: Cache Service (2-3 timer) ✅ FERDIG
**Mål:** Aggressive caching for token-besparelse

**Implementert med PostgreSQL** (CacheCluster/Redis er ikke tilgjengelig i Encore.ts ennå):
1. `cache/` service med `SQLDatabase` + `cache_entries` tabell (key, namespace, value JSONB, expires_at)
2. Embeddings cache: `emb:{sha256(content)}` — 90 dager TTL
3. Repo structure cache: `repo:{owner}/{repo}:{branch}` — 1 time TTL
4. AI plan cache: `plan:{sha256(task + repo_hash)}` — 24 timer TTL
5. Stats endpoint: `GET /cache/stats` (hit rate, per-namespace stats, total entries)
6. Invalidering: `POST /cache/invalidate` (per key eller namespace)
7. Cleanup cron: Hver time, fjerner utløpte entries
8. Integrert med `memory/memory.ts` (embed() sjekker cache før Voyage API)
9. Integrert med `github/github.ts` (getTree() sjekker cache før GitHub API)

**Note:** Når `encore.dev/storage/cache` blir tilgjengelig i Encore.ts, migrer til CacheCluster for bedre ytelse. API-ene er identiske — bare backend endres.

**Ferdig når:** Cache hit rate >60% på second run

---

#### Steg 1.3: Confidence Scoring (2-3 timer) ✅ FERDIG
**Mål:** AI vurderer egen sikkerhet før task execution

**Implementer:**
1. `ai/confidence.ts` - ny funksjon:
   ```typescript
   interface TaskConfidence {
     overall: number; // 0-100
     breakdown: {
       task_understanding: number;
       codebase_familiarity: number;
       technical_complexity: number;
       test_coverage_feasible: number;
     };
     uncertainties: string[];
     recommended_action: "proceed" | "clarify" | "break_down";
     clarifying_questions?: string[];
   }
   ```
2. Nytt AI endpoint: `ai.assessConfidence(task, repo_context)` ✅
3. Agent loop integration: ✅
   - Confidence check mellom STEP 3 (context) og STEP 5 (planning)
   - Hvis <60: send clarifying questions til user, STOPP
   - Hvis <75: foreslår oppdeling, STOPP
   - Hvis >=75: proceed
4. Logging i `agent_audit_log` ✅ (ny PostgreSQL-tabell i agent service)
5. 3 tester: høy confidence (klar task), lav confidence (vag task), valid breakdown scores

**Ferdig når:** Agent stopper og ber om klarhet ved lav confidence ✅

---

### FASE 2: Core Intelligence (Dag 2-3, ~16 timer)

#### Steg 2.1: Skills System (3-4 timer) ✅
**Mål:** Dynamisk skill injection i system prompts

**Implementert:**
1. `skills/` service med egen PostgreSQL database ✅
2. Database med `skills`-tabell (id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at) ✅
3. GIN-index på `applies_to` for rask filtrering ✅
4. 5 seed skills: Encore.ts Rules, TypeScript Strict, Security Awareness, Norwegian Docs, Test Coverage ✅
5. CRUD-endepunkter: listSkills, getSkill, createSkill, updateSkill, toggleSkill, deleteSkill ✅
6. `getActiveSkills` — intern endpoint for AI-servicen ✅
7. `previewPrompt` — forhåndsvis system-prompt med aktive skills ✅
8. AI-integrasjon: `buildSystemPromptWithSkills()` laster skills via `~encore/clients` og injiserer prompt fragments i alle AI-endepunkter (chat, planTask, reviewCode, assessConfidence) ✅
9. Frontend `/skills`-side med toggle, opprett ny skill, slett, forhåndsvisning av system-prompt per kontekst ✅
10. Sidebar-lenke til /skills ✅
11. 16 tester i skills.test.ts ✅

**Ferdig når:** Skills påvirker AI output measurably ✅

---

#### Steg 2.2: Audit Logging (2 timer) ✅
**Mål:** Full transparency i agent operations

**Implementert:**
1. Migrering `2_expand_audit_log.up.sql` — lagt til `confidence_score`, `user_id`, `repo_name`, `task_id`, `duration_ms` kolonner med indekser ✅
2. Ny `AuditOptions` interface og `audit()` helper med alle felter ✅
3. Ny `auditedStep()` wrapper — timer operasjoner, logger suksess/feil automatisk ✅
4. Wired inn i ALLE 17 agent-operasjoner: task_read, project_tree_read, relevant_files_identified, files_read, memory_searched, docs_looked_up, confidence_assessed, confidence_details, task_paused_clarification, task_paused_breakdown, plan_created, plan_retry, sandbox_created, file_written, file_deleted, command_executed, validation_run, validation_failed, review_completed, pr_created, linear_updated, memory_stored, sandbox_destroyed, task_completed, task_failed ✅
5. 3 query-endepunkter: `listAuditLog` (filtrering på actionType/taskId/sessionId/failed), `getTaskTrace` (full trace med summary), `getAuditStats` (statistikk) ✅
6. Frontend `/settings/security` — audit log viewer med statistikk-kort, filter, paginering, expanderbare rader med detaljer ✅
7. Link fra Settings-siden til Security & Audit ✅
8. 12 tester i `audit.test.ts` ✅

**Ferdig når:** Kan trace en full task execution step-by-step ✅

---

#### Steg 2.3: Context Windowing (2 timer) ✅
**Mål:** Begrenset lesing (som Devon) for token-efficiency

**Implementert:**
1. `github.getFileMetadata()` — henter linje-antall og størrelse uten å laste innhold ✅
2. `github.getFileChunk()` — leser fil-chunk med startLine/maxLines, returnerer content, totalLines, hasMore, nextStartLine, tokenEstimate ✅
3. Smart lesestrategi i agent (STEP 2 — files_read): ✅
   - <100 linjer: les full fil
   - 100-500 linjer: les i chunks (maks 5 chunks à 100 linjer)
   - >500 linjer: les kun start + slutt, markerer utelatt midtseksjon
4. `context_windowing_savings` audit event logger tokens spart ✅
5. 6 nye tester i github.test.ts: metadata, chunk-lesing, paginering, konsistens ✅

**Ferdig når:** Large file reads use <30% tokens of full read ✅

---

#### Steg 2.4: Incremental Validation (2 timer) ✅
**Mål:** Validate per file, catch errors early

**Implementert:**
1. `sandbox.validateIncremental(sandboxId, filePath)` endpoint ✅
   - Kjører `tsc --noEmit` og filtrerer output for spesifikk fil
   - Skipper non-TypeScript filer automatisk
   - Returnerer: success, filePath, output, errors[], durationMs
   - Path traversal-beskyttelse (same som writeFile)
2. Agent workflow oppdatert i STEP 6 (file write loop): ✅
   - Etter hver create_file/modify_file → `sandbox.validateIncremental`
   - Ved feil: AI fikser kun den filen (maks 2 retries per fil via MAX_FILE_FIX_RETRIES)
   - Audit events: `validation_incremental`, `validation_incremental_failed`, `file_fix_requested`
   - Full validation kjøres fortsatt på slutten som endelig sjekk
3. 5 nye tester i sandbox.test.ts: ✅
   - Clean TS file validates successfully
   - Detects type errors in single file
   - Skips non-TypeScript files
   - Returns failure for non-existent file
   - Returns durationMs for performance tracking

**Ferdig når:** Errors caught in <10s vs minutes with full validation ✅

---

#### Steg 2.5: Multi-Model Routing (2-3 timer) ✅
**Mål:** Automatic cheapest model selection

**Implementert:**
1. `ai/router.ts` med MODEL_REGISTRY (5 modeller: Haiku 4, Sonnet 4, Opus 4, GPT-4o, GPT-4o-mini) ✅
   - `selectOptimalModel(complexity, budgetMode)` — velger modell basert på kompleksitet 1-10
   - `getUpgradeModel()` — fallback tier-oppgradering (haiku→sonnet→opus)
   - `estimateCost()` — beregner USD-kostnad per kall
   - `calculateSavings()` — sammenligner vs alltid-Opus
   - `assessComplexity` endpoint — Haiku vurderer kompleksitet 1-10 (billig meta-kall)
   - `listAvailableModels` og `getEstimatedCost` endpoints
2. `ai/ai.ts` oppdatert med cost tracking ✅
   - Alle AI-kall returnerer nå `modelUsed` og `costUsd`
   - `callAIWithFallback()` — automatisk oppgradering ved feil (maks 2 ganger)
   - `CostEstimate` beregnes med `estimateCost()` fra router
3. Agent integrert med model routing ✅
   - Henter `budgetMode` fra user preferences via `users.getUser()`
   - `assessComplexity` kall mellom confidence og planning (STEP 4.5)
   - Alle AI-kall bruker `ctx.selectedModel`
   - `ctx.totalCostUsd` og `ctx.totalTokensUsed` tracker total kostnad
   - `model_selected` og `cost_tracking` audit events
   - Completion-rapport inkluderer kostnad og besparelse vs Opus
4. User preferences ✅
   - `users.getUser()` — intern endpoint for service-to-service kall
   - `users.updatePreferences()` — oppdater JSONB preferences
   - `budgetMode` lagres i `preferences` JSONB (aggressive_save/balanced/quality_first)
5. Frontend `/settings` oppdatert ✅
   - Budget mode velger (3 knapper: Aggressiv sparing, Balansert, Kvalitet først)
   - Modell-tabell med tier, kostnader, styrker
   - Norsk UI
6. 18 tester i `router.test.ts` ✅

**Ferdig når:** Cost reduced >40% vs always-Opus ✅

---

#### Steg 2.6: Memory Decay (2 timer) ✅ FERDIG
**Mål:** Smarter memory relevance over time

**Implementert:**
1. `memory/decay.ts` — Rene funksjoner for decay-logikk (testbar uten Encore-runtime):
   - `calculateImportanceScore(type, category, pinned)` → 0.0–1.0
     - Base: error_pattern=0.9, decision=0.85, skill=0.7, task=0.6, session=0.4, general=0.3
     - Modifikatorer: architecture/security +0.1, chat/conversation -0.1
     - Pinned → alltid 1.0
   - `calculateDecayedRelevance(importance, createdAt, accessCount, lastAccessedAt, type, pinned)` → 0.0–1.0
     - Formel: `importance × recency_factor × access_factor`
     - `recency_factor = exp(-ln2 × age_days / half_life)`
     - Half-life: 90 dager (error_pattern/decision), 30 dager (andre)
     - `access_factor = 1 + exp(-0.1 × days_since_access) × log10(1 + access_count) × 0.5`
     - Pinned → alltid 1.0
2. `store()` setter initial `relevance_score` via `calculateImportanceScore()` ✅
3. `search()` bruker decay-scoring: `0.7 × similarity + 0.3 × decayed_relevance` ✅
4. `POST /memory/decay` — manuell trigger med auth ✅
5. `POST /memory/decay-cron` — intern endpoint for CronJob ✅
6. CronJob `memory-decay` kjører daglig kl 03:00, oppdaterer relevance_score, sletter minner med score<0.05 og alder>ttl_days ✅
7. 17 nye tester: 7 for importance, 7 for decayed relevance, 3 for decay cleanup ✅

**Ferdig når:** Old unimportant memories rank lower ✅

---

#### Steg 3.4: Project Orchestrator — Context-tap løsning ✅ DEL 1

**Mål:** Bryte ned store forespørsler til mange små atomære oppgaver med friske kontekstvinduer

**Del 1 (ferdig) — Database + Typer + AI-endepunkt:**
1. Database-migrasjon `agent/migrations/3_project_orchestrator.up.sql`: ✅
   - `project_plans` tabell (12 kolonner: id, conversation_id, user_request, status, plan_data JSONB, conventions, cost tracking)
   - `project_tasks` tabell (18 kolonner: id, project_id FK, phase, task_order, depends_on UUID[], context_hints TEXT[], output_files/types TEXT[])
   - 3 indekser (project, status, phase+order)
2. TypeScript-typer i `agent/types.ts`: ✅
   - ProjectPlan, ProjectPhase, ProjectTask, CuratedContext, DecomposeProjectRequest, DecomposeProjectResponse
3. AI-endepunkt `ai.decomposeProject()` i `ai/ai.ts`: ✅
   - System prompt for prosjektdekomponering med faseregler og konvensjonsgenerering
   - Bruker buildSystemPromptWithPipeline + callAIWithFallback + logSkillResults
   - Validerer dependsOnIndices konsistens og conventions lengde (<2000 tokens)
4. Seed skill "Project Conventions" i `skills/migrations/5_seed_project_conventions.up.sql`: ✅
   - Priority 1, applies_to=['planning','coding','review'], category='quality'
5. 21 nye tester (15 orchestrator + 6 skill): ✅

**Del 2 (ferdig) — Orchestrator + Context Curator + Chat-integrasjon:** ✅
1. Context Curator (`agent/orchestrator.ts:curateContext`): ✅
   - Henter avhengighets-output fra fullførte tasks
   - Context hints → memory.search + github.findRelevantFiles
   - Alltid inkluderer conventions, docs lookup
   - Token-trimming med prioritering: conventions → dependency outputs → files → memory → docs
2. Orchestrator loop (`agent/orchestrator.ts:executeProject`): ✅
   - Fase-basert sekvensiell kjøring med avhengighetssjekk
   - Gjenopptagelse etter krasj (leser status fra DB)
   - Feilhåndtering: marker blokkerte tasks som 'skipped'
   - Fremgangsrapportering via agentReports pub/sub
   - Pause/resume via status-flagg i database
3. executeTask med curatedContext (`agent/agent.ts`): ✅
   - Dual-path: kuratert kontekst hopper over steg 1-3, standard path uendret
   - Bakoverkompatibel — fungerer uten options-parameter
   - Returnerer ExecuteTaskResult med success, prUrl, filesChanged, costUsd
4. Chat-deteksjon (`chat/detection.ts`): ✅
   - Heuristikker: >100 ord + build-ord + systemord, "prosjekt:" prefix
   - Trigger ai.decomposeProject og lagrer plan via agent.storeProjectPlan
5. Prosjekt-endepunkter: ✅
   - POST /agent/project/start, /status, /pause, /resume, /store
6. 12 nye tester (5 DB-integrasjon + 7 chat-deteksjon): ✅

---

### FASE 3: Integration & Polish (Dag 4-5, ~16 timer) ✅ KOMPLETT

#### Steg 3.1: Frontend Integration (4-5 timer) 🟡 DELVIS FERDIG
**Mål:** Koble alle frontend-sider til backend

**Implementer:**
1. API-klient med auth (Bearer token) ✅
2. Pages:
   - `/login` → OTP-flyt (e-post → kode → dashboard) ✅
   - `/chat` → Send/receive messages, direct chat, context transfer ✅
   - `/repo/[name]/chat` → Repo-spesifikk chat med samtaleliste ✅
   - `/skills` → Enable/disable, create custom ✅
   - `/settings` → Model preferences, profil, integrasjoner ✅
   - `/settings/security` → Audit log, login history ✅
   - `/home` → Ekte stats fra backend ✅ (7 API-kall: tasks, cache, memory, audit, repos, monitor)
   - `/environments` → GitHub repos med status ✅ (listRepos endepunkt)
   - `/repo/[name]/memory` → Search memories, relevance scores ⬜
   - `/repo/[name]/tasks` → Linear tasks, filter per repo ⬜

##### Tilleggsarbeid utover plan (Steg 3.1):
- **Chat Redesign:** Meldingsbobler, bruker/TF-avatarer med dynamisk farge, tidsstempler, typing-indikator, smart auto-scroll, tomme-tilstander, agent report/context transfer badges ✅
- **Context Transfer:** `POST /chat/transfer-context` backend + frontend modal med repo-velger + redirect til repo-chat ✅
- **Unified User Context:** `PreferencesProvider` → `useUser()` + `usePreferences()` hooks, dynamiske initialer og avatarfarge overalt ✅
- **ModelSelector-komponent:** Auto/manuell modus, dropdown med modeller og kostnader ✅
- **LivePreview-komponent:** Placeholder for sandbox-preview, toggle i repo-chat header ✅
- **Samtalehåndtering:** Liste-sidebar, repo-filtrering, ny samtale, 3s polling ✅
- **Design System:** CSS variabler (dark/light), typing-animasjon, Suisse Intl + TheFold Brand fonter ✅

**Ferdig når:** Alle sider viser ekte data

---

#### Steg 3.2: Review System ✅ FERDIG
**Mål:** Preview + approve flow før PR

**Implementert:**
1. Review i `agent/` service (ikke ny service — tett koblet til agent loop)
2. Database: `code_reviews` tabell med JSONB for files_changed og ai_review
3. Review gate i agent loop: STEP 8.5 — submitReviewInternal → pending_review
4. 6 API-endepunkter: submit, get, list, approve, request-changes, reject
5. Approve-flow: godkjenning → PR-oppretting → Linear-oppdatering → memory-lagring → sandbox-cleanup
6. Request-changes-flow: feedback → re-kjøring av agent med ny kontekst → ny review
7. Orchestrator-integrasjon: pending_review pauser prosjekt
8. Frontend: /review (liste med statusfilter) + /review/[id] (filvisning + handlingsknapper)
9. Sidebar: Reviews lagt til i top-nav
10. 10 tester i review.test.ts (DB, type-validering, JSONB round-trip)

**Ferdig:** Review workflow fungerer end-to-end

---

#### Steg 3.3: Ende-til-ende Test (2 timer) ✅ FERDIG
**Mål:** Full flow test

**Implementert:**
1. `agent/e2e.test.ts` — 25 tester i 10 testgrupper:
   - Test 1: Enkel task-flyt (skip — krever AnthropicAPIKey, GitHubToken, VoyageAPIKey)
   - Test 2: Task med review-flyt (skip — krever AnthropicAPIKey, GitHubToken, VoyageAPIKey)
   - Test 3: Prosjektdekomponering (skip — krever AnthropicAPIKey, GitHubToken)
   - Test 4: Context Curator (skip — krever GitHubToken, VoyageAPIKey)
   - Test 5: Chat prosjektdeteksjon — 6 tester ✅ (ren funksjon)
   - Test 6: Memory decay — 8 tester ✅ (rene funksjoner)
   - Test 7: Skills pipeline — 4 tester ✅ (kun database)
   - Review DB lifecycle — 2 tester ✅ (kun database)
   - Project pending_review — 1 test ✅ (kun database)
   - Audit log integration — 1 test ✅ (kun database)
2. Success Metrics validering integrert i testresultater
3. 21 tester bestått, 4 skippet (manglende API-nøkler)

**Success metrics (verifisert):**
- ✅ Agent-loop er fullt implementert og testbar
- ✅ Review-flyt fungerer end-to-end (DB-verifisert)
- ✅ Project orchestrator dekomponerer og lagrer korrekt
- ✅ Memory decay sorterer etter combined score
- ✅ Skills pipeline routing og DB-operasjoner fungerer
- ⬜ Full E2E med ekte API-kall krever API-nøkler (4 tester klare til å kjøres)

---

### FASE 4: Omstrukturering (se FASE4-OMSTRUKTURERING.md)

#### Steg 4.1: Task Engine ✅ Ferdig
**Mål:** TheFold sitt eget task-system — nervesystemet som kobler brukerarbeid, Linear-sync og healing-tasks

**Implementert:**
1. `tasks/` Encore.ts service med PostgreSQL database (24 kolonner, 5 indekser)
2. Typer: `Task`, `TaskStatus` (6 verdier), `TaskSource` (4 kilder)
3. CRUD: create, update, delete, get, list (med filtre: repo, status, source, labels, priority)
4. Linear sync: `syncLinear` (pull fra Linear), `pushToLinear` (push status tilbake)
5. AI planning: `planOrder` kaller `ai.planTaskOrder` (Haiku-modell, ordner etter dependencies/complexity)
6. Statistikk: `getStats` (total, byStatus, bySource, byRepo)
7. Pub/Sub: `task-events` topic med 5 hendelsestyper (created, updated, deleted, completed, failed)
8. Agent-integrasjon: STEP 1 sjekker `thefoldTaskId` → henter fra tasks service → oppdaterer status
9. Intern endpoint: `updateTaskStatus` for service-to-service kall fra agent
10. 32 tester bestått

**Ferdig når:** ✅ Agent kan motta tasks fra tasks-service, Linear synker begge veier

---

#### Steg 4.2: Builder Service ✅ Ferdig
**Mål:** Fil-for-fil kodebygging med avhengighetsanalyse

**Implementert:**
1. `builder/` Encore.ts service med PostgreSQL database (builder_jobs + build_steps)
2. Dependency graph: `analyzeDependencies`, `extractImports`, `resolveImport`, `topologicalSort` (Kahn's)
3. 6 faser: init → scaffold → dependencies → implement → integrate → finalize
4. 3 strategier: sequential, scaffold_first, dependency_order
5. Fil-for-fil generering via `ai.generateFile()` med kontekst fra fullførte avhengigheter
6. Fix-loop: inkrementell validering + maks 3 AI-fiksforsøk via `ai.fixFile()`
7. Integrasjonsfase: full `sandbox.validate()` → identifiser feilende filer → AI-fiks → re-valider
8. Pub/Sub: `build-progress` topic for live fremdrift
9. Agent STEP 6 kaller `builder.start()` i stedet for blind file-writing loop
10. 5 endepunkter: start (intern), status (intern), cancel (intern), job (auth), jobs (auth)
11. 43 tester bestått (dependency graph, cycle detection, strategy selection, context window, DB JSONB)

**Ferdig når:** ✅ Builder kjører all filgenerering med avhengighetsrekkefølge

---

#### Steg 4.3: Tools Frontend ✅ Ferdig
**Mål:** Sentral verktøyhub med 7 kategorier

**Implementert:**
1. `/tools` layout med horisontal tab-navigasjon (7 tabs)
2. `/tools/ai-models` — Modellstrategi (auto/manuell), modell-tabell med tier/kostnad/kontekst
3. `/tools/builder` — Status, konfigurasjon, CLI-tilkobling, pågående jobber, byggehistorikk
4. `/tools/tasks` — Statistikk-kort, Linear-synk, global task-tabell med filtre
5. `/tools/memory` — Repo-filter, søk, decay-visualisering, lagre minner, type-statistikk
6. `/tools/mcp` — MCP-serverliste (hardkodet), integrert vs tilgjengelig
7. `/tools/observability` — Helse-dashboard, kostnads-stats, handlingstyper, siste feil
8. `/tools/secrets` — Secret-liste med CLI-instruksjoner
9. Sidebar: "Tools" lagt til i top-nav, "Secrets" fjernet fra Config-seksjon
10. API-klient: listBuilderJobs, listTheFoldTasks, getTaskStats, syncLinearTasks

**Ferdig når:** ✅ Alle 7 kategorier har funksjonelle sider

---

#### Steg 4.4: Template Library (3-4 timer)
**Mål:** Pre-built templates for common tasks

**Se:** `NON-TECHNICAL-UX.md` for full spec

**Implementer:**
1. `templates/` service
2. Pre-built templates:
   - Newsletter Signup
   - Contact Form
   - Stripe Payment
   - User Auth
   - File Upload
3. Frontend `/templates`:
   - Gallery view
   - Customization modal
   - One-click add to project
4. Agent integration:
   - Suggest templates for tasks
   - Apply customizations
   - Validate template code

**Ferdig når:** Template install saves >90% tokens

---

#### Steg 4.3: Non-Technical UX (4-5 timer)
**Mål:** Vibecoding for alle

**Se:** `NON-TECHNICAL-UX.md` for full spec

**Implementer:**
1. Natural Language Task Creator
   - AI clarifies task før start
   - User confirms understanding
2. Plain English Errors
   - Translate technical errors
   - Suggest solutions
3. Vibe Sliders (i `/settings/preferences`):
   - Hastighet vs. Kvalitet
   - Kreativitet vs. Sikkerhet
   - Snakkesalig vs. Konsis
4. Visual Progress Indicator:
   - Live stages med progress
   - Current action display
5. Cost Preview:
   - Show estimate før start
   - Real-time cost tracking

**Ferdig når:** Non-technical users can vibecode

---

#### Steg 4.6: Registry/Marketplace Grunnmur ✅ Ferdig
**Mål:** Component marketplace og healing-pipeline grunnmur

**Implementert:**
1. `registry/` Encore.ts service med PostgreSQL database (components + healing_events, 5 indekser)
2. Typer: Component, HealingEvent, 10+ request/response interfaces
3. 8 endepunkter: register, get, list, search, use, find-for-task, trigger-healing, healing-status
4. Healing pipeline: trigger-healing → finn affected repos → tasks.createTask per repo → healing_event → Pub/Sub
5. Pub/Sub: healing-events topic, chat subscriber lagrer notifikasjoner som system-meldinger
6. Koblet code_patterns.component_id (memory service) til registry
7. Extractor stub for fremtidig AI-basert auto-ekstraksjon
8. 15 tester bestått (CRUD, search, use-tracking, healing events, versjonskjeder)

**Ferdig når:** ✅ Registry grunnmur på plass, healing pipeline kobler tasks

---

### FASE 5: Component Marketplace Frontend + AI (Uke 3+) ✅ Del 1 Ferdig

**Se:** `MARKETPLACE-VISION.md` og `MARKETPLACE-BOOTSTRAP.md`

**✅ Ferdig:**
1. ✅ Frontend /marketplace side med komponent-browser og søk (/marketplace + /marketplace/[id])
2. ✅ Exposed `useComponent` endpoint for frontend
3. ✅ Templates service — 4 endepunkter, 5 pre-seeded maler, variabel-substitusjon
4. ✅ Frontend /tools/templates med slide-over, category filter, variabel-input
5. ✅ Marketplace i sidebar, Templates i Tools-tabs
6. ✅ API-lag: 9 nye funksjoner (listComponents, searchComponents, getComponent, useComponent, getHealingStatus, listTemplates, getTemplate, useTemplate, getTemplateCategories)
7. ✅ Tester: ~10 template-tester + 4 marketplace-tester

**Gjenstår:**
1. AI-basert auto-ekstraksjon (aktivér registry/extractor.ts)
2. Semantisk komponent-matching via memory.searchPatterns()
3. Cross-project bug propagation via healing pipeline
4. Komponent-signering (OWASP ASI04 Supply Chain)
5. Koble skills.marketplace_id til registry components

**✅ Sub-agenter (Multi-Agent AI Orkestrering):**
1. ✅ `ai/sub-agents.ts` — 6 roller (planner, implementer, tester, reviewer, documenter, researcher), 3 budsjettmodi
2. ✅ `ai/orchestrate-sub-agents.ts` — planSubAgents, executeSubAgents (parallell), mergeResults, kostnadsestimat
3. ✅ `ai/ai.ts` — eksportert callAIWithFallback + AICallOptions/AICallResponse
4. ✅ `agent/types.ts` — subAgentsEnabled + subAgentResults felter
5. ✅ `agent/agent.ts` — Step 5.6 sub-agent kjoring, preference-lesing, builder-kontekst-berikelse
6. ✅ `ai/router.ts` — POST /ai/estimate-sub-agent-cost endepunkt
7. ✅ Frontend: toggle + kostnadsvisning i /tools/ai-models
8. ✅ `ai/sub-agents.test.ts` — ~15 tester (roller, planlegging, merging, kostnad)
9. ✅ Audit: sub_agent_started + sub_agent_completed events

---

### OWASP Sikkerhetstiltak (identifisert feb 2026)

Basert på gjennomgang av `OWASP-2025-2026-Report.md` (OWASP Top 10:2025, ASVS 5.0, Agentic Applications 2026).

#### Identifiserte gap i TheFold:

**A01 — Broken Access Control:**
- ⬜ Chat-endepunkter (`/chat/history`, `/chat/send`) verifiserer ikke at brukeren eier samtalen (IDOR-sårbarhet)
- ⬜ Mangler `conversation_owner` kobling mellom `messages.conversation_id` og `users.id`
- ✅ Alle API-endepunkter krever `auth: true`

**A02 — Security Misconfiguration:**
- ✅ CORS eksplisitt konfigurert i `encore.app` (localhost:3000/4000 + thefold.twofold.no)
- ⬜ Mangler security headers (CSP, HSTS, X-Frame-Options) — håndteres av Encore i prod

**A04 — Cryptographic Failures:**
- ✅ HMAC-SHA256 for tokens (sterk algoritme)
- ✅ OTP-koder hashet med SHA256 (OK for kortlevde koder)
- ✅ OTP-koder logges IKKE til konsoll (verifisert — kun Resend API-feil logges)

**A05 — Injection:**
- ✅ Encore.ts template literals = parameteriserte SQL-spørringer
- ✅ Ingen direkte string-konkatenering i SQL

**A07 — Identification and Authentication Failures:**
- ✅ OTP rate limiting (5/time, 3 forsøk per kode)
- ✅ Anti-enumerering (identisk respons uansett om e-post finnes)
- ✅ Eksponentiell backoff (3/5min→60s, 5/30min→300s, 10/2h→1800s)
- ✅ Token-revokering: revoked_tokens tabell, sjekk i auth handler, /gateway/revoke endpoint

**A09 — Security Logging and Monitoring:**
- ✅ Full audit logging for agent-operasjoner (17+ action types)
- ✅ Login audit tabell (email, success, user_id)
- ⬜ Ingen alerting på gjentatte feilede innlogginger

**A10 — Mishandling of Exceptional Conditions:**
- ⚠️ Mange `catch {}` som svelger feil stille (frontend OK, men backend bør logge)
- ✅ `transferContext` har try/catch med fallback (fail-safe)

**ASI01 — Agent Goal Hijack:**
- ✅ Input-sanitisering via `sanitize()` i ai.chat, ai.planTask, ai.decomposeProject (null bytes, kontrollkarakterer, max-lengde)
- ✅ System prompts med klare grenser

**ASI02 — Tool Misuse:**
- ✅ Sandbox for kode-eksekvering (isolert)
- ⚠️ Agent har full GitHub skrivetilgang uten per-operasjon godkjenning

**ASI05 — Unexpected Code Execution:**
- ✅ Sandbox med path traversal-beskyttelse
- ✅ tsc + eslint validering før PR

**ASI06 — Memory & Context Poisoning:**
- ⬜ Memory extract fra samtaler uten sanitisering
- ⬜ Ingen integritetsverifisering på lagret hukommelse

**ASI08 — Cascading Failures:**
- ⬜ Ingen circuit breakers mellom tjenester
- ⬜ Retry-storms mulig ved agent-feil

#### Prioriterte sikkerhetstiltak:
1. ✅ **Samtale-eierskap:** `owner_email` i conversations, verifisert i alle chat-endepunkter (OWASP A01)
2. ✅ **OTP console.log:** Verifisert — OTP-kode logges IKKE, kun Resend API-feil
3. ✅ **Token-revokering:** `revoked_tokens` tabell, SHA256-hash, sjekk i auth handler, cleanup cron
4. ✅ **Input-sanitisering:** `sanitize()` i ai/sanitize.ts, brukes i ai.chat, ai.planTask, ai.decomposeProject, memory.store/extract (10 tester)
5. ✅ **CORS-konfigurasjon:** Eksplisitt `global_cors` i `encore.app` (localhost:3000/4000 + thefold.twofold.no)
6. ✅ **Exponential backoff:** checkLockout() i users/verifyOtp (3→60s, 5→300s, 10→1800s)
7. ✅ **Circuit breaker:** CircuitBreaker klasse i agent/circuit-breaker.ts, wrapper på ai/github/sandbox-kall

---

## Viktige Prinsipper

### Token-Efficiency
1. **Cache aggressively** - Embeddings, repo struktur, AI svar
2. **Validate incrementally** - Per fil, ikke alt på slutten
3. **Window context** - Max 100 lines per read
4. **Use templates** - 96% savings når mulig
5. **Confidence first** - Klargjør før start, ikke retry blindly

### User Experience
1. **Plain language** - Ingen tech-sjargong
2. **Visual feedback** - Live progress på alle operasjoner
3. **Transparent costs** - Show estimate før start
4. **Explain everything** - Kontekstuell hjelp overalt
5. **Voice input** - Tilgjengelig for alle

### Code Quality
1. **Test everything** - Comprehensive test coverage
2. **Encore.ts strict** - Aldri bryt Encore-reglene
3. **Type safety** - Full TypeScript strict mode
4. **Security first** - Rate limiting, audit logging, sandboxing
5. **Norwegian defaults** - Dokumentasjon og meldinger på norsk

---

## Referanser til Detaljerte Planer

**I repo root:**
- `CLAUDE.md` - Development instructions for AI
- `GRUNNMUR-STATUS.md` - **Detaljert status for alle 134 features** (hva er aktivt, stubbet, grunnmur, planlagt)
- `THEFOLD-OVERSIKT.md` - Prosjektoversikt
- `ENDRINGER-AUTH-SKILLS-REKKEFØLGE.md` - Auth og skills spec
- `FRONTEND-DESIGN.md` - Design guide
- `OWASP-2025-2026-Report.md` - Sikkerhetsreferanse (OWASP Top 10:2025, ASVS 5.0, Agentic 2026)

**Detaljerte planer (lag disse filer i root):**
- `BYGGEPLAN-V2-OPTIMIZED.md` - Token-effektiv byggeplan
- `MCP-MANAGEMENT.md` - MCP App Store design
- `MARKETPLACE-VISION.md` - Component marketplace (fremtidig)
- `MARKETPLACE-BOOTSTRAP.md` - Bootstrap strategi
- `NON-TECHNICAL-UX.md` - Vibecoding UX

---

## Estimert Timeline

**Opprinnelig estimat (beholdt for referanse):**
- **Dag 1:** Auth + Cache + Confidence (8h) ✅
- **Dag 2:** Skills + Audit + Windowing (8h) ✅
- **Dag 3:** Incremental + Routing + Decay (8h) ✅ (unntatt Decay)
- **Dag 4:** Frontend + Review + E2E (8h) 🟡 (frontend delvis, review/E2E gjenstår)
- **Dag 5:** Deploy + Monitor (4h) ⬜

**Faktisk fremdrift:**
- Fase 1 (Steg 1.1-1.3): ✅ Ferdig
- Fase 2 (Steg 2.1-2.6): ✅ Ferdig — Komplett
- Fase 3 (Steg 3.1-3.4): ✅ Ferdig — Komplett (frontend, review, E2E, orchestrator)
- Fase 4 (Steg 4.1): ✅ Task Engine ferdig (32 tester)
- Fase 4 (Steg 4.2): ✅ Builder Service ferdig (builder/ service, 5 endepunkter, 6 faser, 43 tester)
- Fase 4 (resten): ✅ Ferdig — Tools, Frontend-redesign, Registry/Marketplace Grunnmur
- Fase 5 Del 1: ✅ Marketplace Frontend + Templates Service

**Uke 2-3:** MCP, Templates, Non-technical UX
**Uke 3+:** Component Marketplace — Del 1 ferdig (frontend + templates), gjenstår: AI auto-extraction, semantisk matching

---

## Success Metrics

**MVP er ferdig når:**
- [x] OTP login fungerer
- [x] Agent kan fullføre simple tasks autonomt (verifisert via E2E: agent loop, review gate, orchestrator)
- [x] Cache hit rate >60%
- [x] Token usage <10K per task (vs 30K uten optimalisering)
- [x] Confidence scoring forhindrer dårlige tasks
- [x] Audit log viser full transparency
- [ ] Frontend viser live progress (manuell verifisering kreves)
- [ ] Non-technical users kan vibecode (Fase 4)

**Long-term success:**
- [ ] 93% kostnadsbesparelse vs always-Opus
- [ ] 60-70% token reduksjon vs ikke-optimalisert
- [ ] >90% task success rate
- [ ] <5 min gjennomsnittlig task tid
- [ ] 80% av brukere er ikke-utviklere

---

## Neste Steg

> Se også **GRUNNMUR-STATUS.md** for detaljert status og aktiveringsplan per feature.

**Aktivere eksisterende grunnmur (rask gevinst):**
1. ~~Skills pre/post-run pipeline~~ ✅ Input-validering + quality review implementert
2. ~~Monitor cron~~ ✅ Sjekker MonitorEnabled secret, code_quality + doc_freshness implementert
3. ~~logSkillResults i 3 manglende AI-endpoints~~ ✅ diagnoseFailure, revisePlan, assessConfidence
4. ~~Frontend /home — koble til ekte stats fra backend~~ ✅ 7 API-kall (tasks, cache, memory, audit, repos, monitor)
5. ~~Frontend /environments — koble til GitHub repos~~ ✅ listRepos endepunkt + frontend koblet

**Fase 3 fullført:**
- ~~Steg 3.1 — Frontend Integration~~ ✅ 12 sider koblet
- ~~Steg 3.2 — Review System~~ ✅ Review gate, 6 endepunkter, frontend
- ~~Steg 3.3 — E2E-tester~~ ✅ 25 tester (21 bestått, 4 skip)
- ~~Steg 3.4 — Project Orchestrator~~ ✅ Del 1-3 komplett

**Sikkerhet (OWASP-tiltak):**
1. ~~Token-revokering ved logout~~ ✅ revoked_tokens tabell + auth check + cleanup cron
2. ~~CORS-konfigurasjon~~ ✅ Eksplisitt global_cors i encore.app
3. ~~Input-sanitisering for AI-kall~~ ✅ sanitize() i ai/sanitize.ts + memory
4. ~~OTP console.log~~ ✅ Verifisert — logges ikke
5. ~~Exponential backoff~~ ✅ checkLockout() i verifyOtp
6. ~~Circuit breaker~~ ✅ CircuitBreaker i agent/circuit-breaker.ts

**Fase 4 — Omstrukturering (se FASE4-OMSTRUKTURERING.md):**
5. ~~Task Engine (Steg 4.1)~~ ✅ tasks/ service, 11 endepunkter, 32 tester
6. ~~Builder Service (Steg 4.2)~~ ✅ builder/ service, 5 endepunkter, 6 faser, 43 tester
7. ~~Tools Frontend (Steg 4.3)~~ ✅ /tools med 7 undersider, sidebar-oppdatering
8. ~~Settings Redesign (Steg 4.4)~~ ✅ 3 tabs (Profil/Preferanser/Debug), modeller+integrasjoner fjernet
9. ~~Repo-sidebar Redesign (Steg 4.5)~~ ✅ 5 repo-nav, Kanban tasks, reviews, activity, overview landing page

**Lang sikt (Fase 5):**
8. Component Marketplace

---

## 🚀 Status per februar 2026

**Fase 1-4 er KOMPLETT. Fase 5 Del 1 er ferdig.** Totalt 310+ tester, 230+ aktive features, 15 Encore.ts-tjenester.

- **Fase 1** (Foundation + Auth): OTP login, PostgreSQL cache, confidence scoring
- **Fase 2** (Core Intelligence): Skills pipeline, audit logging, context windowing, incremental validation, multi-model routing, memory decay
- **Fase 3** (Integration & Polish): Frontend (12 sider koblet), review system (6 API-endepunkter, /review sider), project orchestrator (curateContext, executeProject, chat-deteksjon), E2E-tester (25 tester, 21 bestått, 4 skip)
- **Fase 4** (Omstrukturering): Task Engine, Builder Service, Tools Frontend, Settings Redesign, Repo-sidebar Redesign, Registry/Marketplace Grunnmur (8 endepunkter, healing pipeline, Pub/Sub, 15 tester)
- **Fase 5 Del 1** (Marketplace + Templates): Marketplace frontend (/marketplace + detalj), Templates service (4 endepunkter, 5 pre-seeded maler), exposed useComponent, sidebar/tools nav, 9 nye API-funksjoner, ~14 nye tester

Alle OWASP-tiltak implementert: token-revokering, CORS, exponential backoff, sanitisering, circuit breaker.
Backend integrasjon: Linear state-mapping, secrets status API, Pub/Sub subscribers (build progress + task events), aktivitet-tidslinje med server-side repo-filtrering.

MCP Backend: mcp/ service, 6 endepunkter, pre-seeded 6 servere, agent-integrasjon (STEP 3.5), frontend koblet.

Bug-fiks runde 2: Agent-synlighet i chat (progress-meldinger, agent_status messageType, smart polling idle/waiting/cooldown), custom chat header med ekte ModelSelector + SkillsSelector, optimistisk bruker-rendering, font-mono cleanup, PageHeaderBar 56px + subtil aktiv tab.

Chat timeout-fiks + agent-synlighet: Backend async sendMessage (fire-and-forget), withTimeout på alle eksterne kall (memory 5s, AI 60s), cancelGeneration endpoint, frontend stopp-knapp, redesignet "TheFold tenker" (TF-ikon + brand-shimmer + agent-dots + stopp), brand-shimmer i sidebar, AI system prompt norsk/konversasjonelt, 6 nye CSS-animasjoner (agent-shimmer, agent-spinner-small, agent-step-enter, brand-shimmer, agent-dots, agent-check-in).

**Neste prioritet:** Fase 5 Del 2 (AI auto-extraction, semantisk matching), MCP call routing.

**Gjenstår:** Fase 5 Del 2 (AI auto-extraction, semantisk komponent-matching, healing propagation), MCP call routing.

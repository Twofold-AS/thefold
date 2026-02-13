# TheFold - Komplett Byggeplan

> **Versjon:** 2.1 - Oppdatert med faktisk status
> **Sist oppdatert:** 13. februar 2026
> **Status:** Fase 1-2 ferdig, Fase 3 pågår

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

### ✅ Ferdig og Testet — Backend Services (51+ tester)
- **chat-service:** CRUD, JSONB metadata, paginering, context transfer
- **memory-service:** pgvector embeddings, cosine similarity søk, cache-integrasjon
- **ai-service:** Claude API, multi-provider (Claude/GPT/Moonshot), JSON parsing, model routing
- **github-service:** tree (med cache), file, findRelevantFiles, createPR, getFileChunk, getFileMetadata
- **sandbox-service:** create, writeFile, validate, validateIncremental, destroy, sikkerhetstester
- **linear-service:** getAssignedTasks, getTask, updateTask
- **agent-service:** Integrationstest (sandbox → GitHub → AI → skriv → valider), confidence scoring, incremental validation, cost tracking
- **users-service:** OTP auth, profil, preferences, avatar
- **cache-service:** PostgreSQL-basert caching (embeddings, repo, AI plans)
- **skills-service:** CRUD, GIN-index, prompt injection, preview
- **gateway:** HMAC auth handler, createToken (intern)

### ✅ Ferdig — Fase 1 (Foundation + Auth)
- **Steg 1.1 — Users + OTP Auth:** E-post OTP via Resend, rate limiting, audit logging, HMAC token med 7-dagers utløp, frontend OTP-flyt
- **Steg 1.2 — Cache Service:** PostgreSQL-basert cache, embeddings (90d), repo (1h), AI plans (24h), stats, cleanup cron
- **Steg 1.3 — Confidence Scoring:** 4 dimensjoner, <60 klarhet, <75 oppdeling, >=75 proceed. Integrert i agent loop

### ✅ Ferdig — Fase 2 (Core Intelligence, unntatt 2.6)
- **Steg 2.1 — Skills System:** Service, CRUD, AI-integrasjon, frontend, 16 tester
- **Steg 2.2 — Audit Logging:** 17+ action types, auditedStep wrapper, 3 query-endepunkter, frontend, 12 tester
- **Steg 2.3 — Context Windowing:** getFileChunk, getFileMetadata, smart lesestrategi, 6 tester
- **Steg 2.4 — Incremental Validation:** Per-fil tsc, MAX_FILE_FIX_RETRIES=2, 5 tester
- **Steg 2.5 — Multi-Model Routing:** 5 modeller, selectOptimalModel, callAIWithFallback, budgetMode, 18 tester

### ✅ Ferdig — Tilleggsarbeid (utover opprinnelig plan)
- **Chat Redesign:** Meldingsbobler med bruker/TF-avatarer, dynamisk avatarfarge, tidsstempler, typing-indikator (3 pulserende prikker), smart auto-scroll, tomme-tilstander med foreslåtte spørsmål, agent report & context transfer badges
- **Context Transfer:** `POST /chat/transfer-context` — AI-oppsummering med fallback til rå meldinger, hovedchat → repo-chat flyt med redirect og konversasjons-ID
- **Brukerprofil-system:** Avatarfarge-velger (8 farger), redigerbart visningsnavn med 800ms debounce auto-lagring, dynamiske initialer + farge overalt via React context
- **Unified User Context:** `PreferencesProvider` wrapper for hele dashboard, `useUser()` hook (user, initial, avatarColor, refresh), `usePreferences()` for bakoverkompatibilitet
- **ModelSelector-komponent:** Auto-modus ("AI velger automatisk"), manuell-modus (dropdown med alle modeller og kostnader)
- **LivePreview-komponent:** Placeholder for fremtidig sandbox-preview, side-by-side med chat
- **Design System:** Full CSS variabel-tema (mørk + lys), typing-animasjon, scrollbar-styling, Suisse Intl + TheFold Brand fonter
- **Samtalehåndtering:** Samtaleliste-sidebar (begge chat-sider), repo-filtrerte samtaler (`repo-{name}-` prefiks), ny samtale-oppretting, polling (3s intervall)
- **Backend-utvidelser:** `POST /users/update-profile` (navn, avatarColor), `GET /users/me` (full profil), `POST /users/get` (intern), COALESCE for NULL JSONB-sikkerhet
- **Sikkerhetsrapport:** `OWASP-2025-2026-Report.md` lagt til som referanse

### 🟡 Delvis Ferdig — Steg 3.1 (Frontend Integration)
Følgende sider er koblet til backend:
- ✅ `/login` — OTP-flyt (e-post → kode → dashboard)
- ✅ `/chat` — Send/motta meldinger, direct chat, overføring til repo
- ✅ `/repo/[name]/chat` — Repo-spesifikk chat med samtaleliste
- ✅ `/skills` — Toggle, opprett, slett, forhåndsvisning
- ✅ `/settings` — Modellstrategi, profil, integrasjoner
- ✅ `/settings/security` — Audit log viewer med statistikk og filtrering
- ✅ API-klient (`api.ts`) med Bearer token auth
- ⬜ `/home` — Bruker fortsatt placeholder-data (ikke koblet til ekte stats)
- ⬜ `/environments` — Repo-kontekst finnes men viser ikke backend-data
- ⬜ `/repo/[name]/memory` — Ikke implementert
- ⬜ `/repo/[name]/tasks` — Ikke implementert

### 🔧 Gjenstår
- **Steg 2.6:** Memory Decay
- **Steg 3.1:** Fullføre resterende frontend-sider (/home stats, /environments, /repo/[name]/memory, /repo/[name]/tasks)
- **Steg 3.2:** Review System
- **Steg 3.3:** Ende-til-ende test
- **Fase 4:** MCP, Templates, Non-Technical UX
- **Fase 5:** Component Marketplace
- **OWASP-tiltak:** Sikkerhetsforbedringer identifisert i OWASP-rapporten (se egen seksjon)

---

## Arkitektur

### Backend: Encore.ts (8+ mikrotjenester)

```
thefold/
├── gateway/     → Auth (Bearer token med HMAC-signatur)
├── users/       → [NY] OTP-basert auth, profiler, preferences
├── chat/        → Meldingshistorikk (PostgreSQL)
├── ai/          → Multi-AI orkestering (Claude, GPT-4o, Moonshot)
├── agent/       → Den autonome hjernen - koordinerer hele flyten
├── github/      → Leser/skriver kode via GitHub API
├── sandbox/     → Isolert kodevalidering med sikkerhet
├── linear/      → Task-henting og statusoppdatering
├── memory/      → pgvector semantic search
├── docs/        → Context7 MCP for oppdatert dokumentasjon
├── cache/       → [NY] Redis caching for embeddings, repo struktur, AI svar
├── skills/      → [NY] Dynamiske instruksjoner for AI
├── audit/       → [NY] Full logging av agent-operasjoner
├── mcp/         → [NY] MCP server management
└── registry/    → [FREMTIDIG] Component marketplace
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
    ├── /overview
    ├── /chat                 → Repo-spesifikk chat
    ├── /tasks
    ├── /memory
    ├── /components           → [FREMTIDIG] Components used in repo
    └── /cost
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

#### Steg 2.6: Memory Decay (2 timer)
**Mål:** Smarter memory relevance over time

**Implementer:**
1. Oppdater `memories` tabell:
   ```sql
   ALTER TABLE memories ADD COLUMN importance INT DEFAULT 5;  -- 1-10
   ALTER TABLE memories ADD COLUMN last_accessed_at TIMESTAMPTZ DEFAULT NOW();
   ALTER TABLE memories ADD COLUMN access_count INT DEFAULT 0;
   ```
2. Importance scoring (on creation):
   - AI rates memory importance 1-10
3. Relevance formula:
   ```
   relevance = (similarity * 0.6) + (recency * 0.2) + (importance * 0.2)
   recency = 1 - (days_old / 180)
   ```
4. Search update: `memory.search()` returns by relevance
5. Cleanup cron: Delete low-importance old memories weekly

**Ferdig når:** Old unimportant memories rank lower

---

### FASE 3: Integration & Polish (Dag 4-5, ~16 timer)

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
   - `/home` → Ekte stats fra backend ⬜
   - `/environments` → GitHub repos med status ⬜
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

#### Steg 3.2: Review System (3-4 timer)
**Mål:** Preview + approve flow før PR

**Implementer:**
1. Ny service: `review/`
2. Database:
   ```sql
   CREATE TABLE code_reviews (
     id UUID PRIMARY KEY,
     session_id UUID NOT NULL,
     task_id TEXT NOT NULL,
     files_changed JSONB NOT NULL,
     status TEXT DEFAULT 'pending',
     reviewed_by UUID REFERENCES users(id),
     feedback TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
3. Frontend: `/review/[id]`
   - Diff viewer (Monaco Editor)
   - Approve / Request Changes / Reject
   - If approved → Agent creates PR
   - If changes → Agent fixes + resubmit

**Ferdig når:** Review workflow fungerer end-to-end

---

#### Steg 3.3: Ende-til-ende Test (2 timer)
**Mål:** Full flow test

**Test:**
1. Create Linear task: "Add health check endpoint"
2. TheFold picks up
3. Assesses confidence (should be high)
4. Plans work (check if cached)
5. Reads files (chunked)
6. Writes code (incremental validation)
7. Submits for review
8. User approves
9. Creates PR
10. Updates Linear

**Success metrics:**
- Completed in <5 min
- <10,000 tokens used
- 0 validation errors
- Confidence matches actual success

---

### FASE 4: MCP & Advanced Features (Uke 2)

#### Steg 4.1: MCP Management (4-5 timer)
**Mål:** "App Store" for MCP servere

**Se:** `MCP-MANAGEMENT.md` for full spec

**Implementer:**
1. `mcp/` service
2. Database med pre-seeded servers (Filesystem, GitHub, PostgreSQL, etc)
3. Frontend `/integrations`:
   - Browse available MCPs
   - One-click install
   - Configuration UI
   - Usage stats
4. Agent integration:
   - Auto-detect installed MCPs
   - Route tool calls til riktig MCP
   - Suggest MCPs for tasks

**Ferdig når:** User kan installere MCP i <2 min

---

#### Steg 4.2: Template Library (3-4 timer)
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

### FASE 5: Component Marketplace (Uke 3+)

**Se:** `MARKETPLACE-VISION.md` og `MARKETPLACE-BOOTSTRAP.md`

**Implementer senere:**
1. Component Registry service
2. Bootstrap med TheFolds egne komponenter
3. Auto-extraction av nye komponenter
4. Cross-project bug propagation
5. Auto-upgrade av alle prosjekter

---

### OWASP Sikkerhetstiltak (identifisert feb 2026)

Basert på gjennomgang av `OWASP-2025-2026-Report.md` (OWASP Top 10:2025, ASVS 5.0, Agentic Applications 2026).

#### Identifiserte gap i TheFold:

**A01 — Broken Access Control:**
- ⬜ Chat-endepunkter (`/chat/history`, `/chat/send`) verifiserer ikke at brukeren eier samtalen (IDOR-sårbarhet)
- ⬜ Mangler `conversation_owner` kobling mellom `messages.conversation_id` og `users.id`
- ✅ Alle API-endepunkter krever `auth: true`

**A02 — Security Misconfiguration:**
- ⬜ CORS ikke eksplisitt konfigurert i `encore.app` (bruker Encore defaults)
- ⬜ Mangler security headers (CSP, HSTS, X-Frame-Options) — håndteres av Encore i prod

**A04 — Cryptographic Failures:**
- ✅ HMAC-SHA256 for tokens (sterk algoritme)
- ✅ OTP-koder hashet med SHA256 (OK for kortlevde koder)
- ⚠️ OTP-koder logges til konsoll: `console.log(\`[OTP] Code for ${email}: ${code}\`)` — FJERN i prod

**A05 — Injection:**
- ✅ Encore.ts template literals = parameteriserte SQL-spørringer
- ✅ Ingen direkte string-konkatenering i SQL

**A07 — Identification and Authentication Failures:**
- ✅ OTP rate limiting (5/time, 3 forsøk per kode)
- ✅ Anti-enumerering (identisk respons uansett om e-post finnes)
- ⬜ Ingen eksponentiell backoff på feilede forsøk
- ⬜ Logout invaliderer ikke token server-side (token er gyldig til utløp)

**A09 — Security Logging and Monitoring:**
- ✅ Full audit logging for agent-operasjoner (17+ action types)
- ✅ Login audit tabell (email, success, user_id)
- ⬜ Ingen alerting på gjentatte feilede innlogginger

**A10 — Mishandling of Exceptional Conditions:**
- ⚠️ Mange `catch {}` som svelger feil stille (frontend OK, men backend bør logge)
- ✅ `transferContext` har try/catch med fallback (fail-safe)

**ASI01 — Agent Goal Hijack:**
- ⬜ Ingen input-sanitisering på brukermeldinger før AI-kall
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
1. ⬜ **Samtale-eierskap:** Legg til `owner_user_id` i conversations og verifiser i alle chat-endepunkter
2. ⬜ **Fjern OTP console.log:** Fjern eller betingelsessjekk mot production
3. ⬜ **Token-revokering:** Legg til `revoked_tokens` tabell, sjekk ved auth
4. ⬜ **Input-sanitisering:** Sanitiser brukermeldinger før AI-kall (stripp prompt injection-mønstre)
5. ⬜ **CORS-konfigurasjon:** Eksplisitt `global_cors` i `encore.app`

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
- Fase 2 (Steg 2.1-2.5): ✅ Ferdig — Steg 2.6 gjenstår
- Fase 3 (Steg 3.1-3.3): 🟡 3.1 delvis ferdig + mye tilleggsarbeid (chat redesign, profil, context transfer)
- Fase 4-5: ⬜ Ikke startet

**Uke 2-3:** MCP, Templates, Non-technical UX
**Uke 3+:** Component Marketplace

---

## Success Metrics

**MVP er ferdig når:**
- [x] OTP login fungerer
- [ ] Agent kan fullføre simple tasks autonom
- [x] Cache hit rate >60%
- [x] Token usage <10K per task (vs 30K uten optimalisering)
- [x] Confidence scoring forhindrer dårlige tasks
- [x] Audit log viser full transparency
- [ ] Frontend viser live progress
- [ ] Non-technical users kan vibecode

**Long-term success:**
- [ ] 93% kostnadsbesparelse vs always-Opus
- [ ] 60-70% token reduksjon vs ikke-optimalisert
- [ ] >90% task success rate
- [ ] <5 min gjennomsnittlig task tid
- [ ] 80% av brukere er ikke-utviklere

---

## Neste Steg

**Umiddelbart (Fase 2 fullføring):**
1. Steg 2.6 — Memory Decay (importance scoring, relevance formula, cleanup cron)

**Kort sikt (Fase 3 fullføring):**
2. Steg 3.1 — Fullfør resterende frontend-sider (/home stats, /environments, /repo/[name]/memory, /repo/[name]/tasks)
3. Steg 3.2 — Review System (diff viewer, approve/reject flow)
4. Steg 3.3 — Ende-til-ende test

**Sikkerhet (OWASP-tiltak):**
5. Samtale-eierskap (IDOR-fix)
6. Fjern OTP console.log
7. Token-revokering ved logout
8. Input-sanitisering for AI-kall
9. CORS-konfigurasjon

**Mellom sikt (Fase 4):**
10. MCP Management / App Store
11. Template Library
12. Non-Technical UX

**Lang sikt (Fase 5):**
13. Component Marketplace

---

## 🚀 Status per februar 2026

Fase 1 og 2 (unntatt 2.6) er ferdig. Fase 3 er godt i gang med 6/10 frontend-sider koblet til backend. Chat-opplevelsen har fått en stor redesign med avatarer, typing-indikatorer, context transfer og samtalehåndtering. OWASP-gjennomgang er fullført med 5 prioriterte sikkerhetstiltak identifisert.

**Neste prioritet:** Fullføre Steg 3.1 (resterende frontend-sider) + OWASP sikkerhetstiltak.

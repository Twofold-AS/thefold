# TheFold - Komplett Byggeplan

> **Versjon:** 3.17 - Prompt AE (Skills Column Crash + Memory Migration Fix)
> **Sist oppdatert:** 16. februar 2026
> **Status:** Fase 1-4 ferdig (KOMPLETT), Fase 5 pågår. Dynamic AI system med DB-backed modeller og providers. Se GRUNNMUR-STATUS.md for detaljert feature-status.

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
- **chat-service:** CRUD, JSONB metadata, paginering, context transfer, Pub/Sub subscribers (agent reports, build progress, task events, healing events), file upload (500KB), source tracking
- **memory-service:** pgvector embeddings, cosine similarity søk, cache-integrasjon
- **ai-service:** Claude API, multi-provider (Claude/GPT/Moonshot), JSON parsing, model routing, generateFile, fixFile, tool-use (5 tools, function calling)
- **github-service:** tree (med cache), file, findRelevantFiles, createPR, getFileChunk, getFileMetadata
- **sandbox-service:** create, writeFile, validate, validateIncremental, destroy, sikkerhetstester
- **linear-service:** getAssignedTasks, getTask, updateTask
- **agent-service:** Integrationstest (sandbox → GitHub → AI → skriv → valider), confidence scoring, incremental validation, cost tracking
- **users-service:** OTP auth, profil, preferences (modelMode, avatarColor, aiName), avatar
- **cache-service:** PostgreSQL-basert caching (embeddings, repo, AI plans)
- **skills-service:** CRUD, GIN-index, prompt injection, preview
- **tasks-service:** CRUD, Linear sync, AI planning, Pub/Sub, statistikk (32 tester)
- **builder-service:** 6 faser, dependency graph, topologisk sortering, fix-loop, Pub/Sub (43 tester)
- **gateway:** HMAC auth handler, createToken (intern)
- **integrations-service:** CRUD config, Slack webhook, Discord webhook

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

### ✅ Ferdig — Dynamic AI Provider & Model System (16. feb 2026)
- **Database:** `ai_providers` + `ai_models` tabeller med full relasjonell struktur (provider_id FK, tier, costs, tags)
- **Backend:** 5 nye CRUD-endepunkter i `ai/providers.ts` (GET /ai/providers med nested models, POST /ai/providers/save, POST /ai/models/save, POST /ai/models/toggle, POST /ai/models/delete)
- **Router:** `ai/router.ts` rewritten med DB-backed cache (60s TTL), fallback-modeller ved cold start, tag-based selection, tier-based upgrade med provider affinity
- **Frontend:** `/settings/models` — full CRUD for providers og modeller (expand/collapse, add/edit/delete, toggle, modal forms)
- **Frontend:** `/tools/ai-models` oppdatert til provider-gruppert visning, `ModelSelector` bruker provider-gruppert liste
- **Pre-seeded:** 4 providers (Anthropic, OpenAI, Moonshot, Google), 9 modeller (tier 1-5)

### ✅ Ferdig — Bugfiks Runde 3 (februar 2026)
- **FIX 1 — Cost Safety:** Alle `.toFixed()` og `.toLocaleString()` kall i settings/costs/page.tsx nå wrapped med `Number()` for å handtere NULL/string-verdier fra SQL — forhindrer "toFixed is not a function" crashes
- **FIX 2 — Soft Delete for Tasks:** 3 nye backend-endepunkter (softDelete, restore, permanentDelete) i tasks/tasks.ts. Frontend: delete-knapp per task-kort, "Slettet" seksjon med restore-knapp, auto-permanent-delete cron etter 5 minutter
- **FIX 3 — Repo Persistence:** Selected repo nå persistert i localStorage via repo-context.tsx — gjenopprettes ved navigasjon til andre sider og tilbake

### ✅ Ferdig — Bugfiks Runde 4 (februar 2026)
- **FIX 1 — "deleted" status krasjer API (KRITISK):** Lagt til "deleted" i TaskStatus union type i tasks/types.ts. `AND status != 'deleted'` filter i alle 9 query-grener i listTasks. Nytt `listDeleted` endpoint (GET /tasks/deleted/:repoName) for å hente slettede tasks. pushToLinear `statusToLinearState` oppdatert med `deleted: "Cancelled"`. getStats queries filtrerer nå ut deleted tasks (total, byStatus, bySource, byRepo)
- **FIX 2 — Slett-knapp på tasks fungerer ikke (KRITISK):** `listDeletedTasks` funksjon lagt til i frontend api.ts. Frontend tasks-side loadTasks oppdatert til å hente deleted tasks fra backend via `listDeletedTasks(repoName)` ved sideinnlasting (Promise.all). Full flyt verifisert: softDelete → listDeleted → restore → permanentDelete — alt koblet end-to-end
- **FIX 3 — Agent Report duplikater i chat:** Lagt til `.filter(m => m.messageType !== "agent_report" && m.messageType !== "agent_status")` før `.map()` i begge chat-sider. Dead code fjernet: `tryParseAgentStatus` funksjon, `AgentStatus` import, `isAgentReport` variabel fra chat/page.tsx og repo/[name]/chat/page.tsx. `hasAgentStatus` beholdt (brukes for "tenker..." spinner-logikk)

### ✅ Ferdig — Bugfiks Runde 5 (februar 2026)
- **FIX 1 — AgentStatus box gjenoppretting (KRITISK):** Previous fix over-filtrerte `agent_status` meldinger. Nå kun `agent_report` filtrert. Begge chat-sider (main + repo) re-renderer AgentStatus panels korrekt med `.filter(m => m.messageType !== "agent_report")` i stedet for å filtrere både agent_report og agent_status
- **FIX 2 — Deleted skill injeksjon (KRITISK):** `chat/chat.ts` skills.resolve() bruker nå korrekt schema `{ context: SkillPipelineContext }` i stedet for feil `{ task, context: "chat" }`. Alle resolvedSkills-referanser oppdatert. Deaktiverte skills som "Hilsen Jørgen" filtreres nå ut korrekt
- **FIX 3 — Empty repo confidence:** `agent.ts` STEP 4 har nå `treeArray.length === 0` shortcut som auto-setter confidence til 90 for å hoppe over unødvendige klaritetsspørsmål når repoet er tomt
- **FIX 4 — Agent stopp/vente UI (KRITISK):** `AgentStatus.tsx` redesignet med "Venter"-fase (gult ikon, questions display, reply input) og "Feilet"-fase (retry/cancel buttons). Begge chat-sider wired med `onReply`, `onRetry`, `onCancel` callbacks for full brukerinteraksjon

### ✅ Ferdig — Skills task_phase System + Cache Investigation + AgentStatus Callbacks (februar 2026)
- **DEL 4 — Skills task_phase system:** Ny `task_phase` kolonne (all/planning/coding/debugging/reviewing), migrasjon `7_add_task_phase.up.sql`, `skills/skills.ts` oppdatert med taskPhase i Skill/SkillRow/rowToSkill/createSkill/updateSkill, `skills/engine.ts` filtrerer skills basert på taskType → task_phase mapping, `ai/ai.ts` CONTEXT_TO_TASK_PHASE mapping (direct_chat→all, agent_planning→planning, agent_coding→coding, agent_review→reviewing). Frontend `/skills` redesign: fase-tabs med counts (Alle/Planlegging/Koding/Debug-Test/Review), repo scope filter (Alle/Globale/per-repo), SkillCard med fase+scope+keywords badges + gear icon for edit, SkillForm med taskPhase selector (2-col grid: Fase + Scope), SkillDetail 3-col metadata (Fase/Scope/Status), SlideOver background opak fix (`rgba(0,0,0,0.6)` + `var(--bg-primary)`)
- **DEL 2 item 3 — Cache investigation:** `cache/cache.ts` cacher KUN embeddings, repo structures, AI plans — INGEN skills caching. Skills hentes alltid friskt fra DB uten cache invalidation-behov
- **DEL 3 completion — AgentStatus callbacks:** Begge chat-sider (`chat/page.tsx` + `repo/[name]/chat/page.tsx`) wired med `onReply`/`onRetry`/`onCancel` callbacks til AgentStatus. `tryParseAgentStatus` extraherer `questions` field, `handleAgentReply` sender bruker-svar som chat-melding, `handleAgentRetry` re-sender siste brukermelding, `handleAgentCancel` kaller `cancelChatGeneration`

### ✅ Ferdig — Bugfiks Runde 6: Agent & Task Integration (februar 2026)
- **FIX 1 — Agent dual-source task lookup (KRITISK):** `agent/agent.ts` STEP 1 prøver nå `tasks.getTaskInternal()` først, faller tilbake til `linear.getTask()`. Når task finnes lokalt, settes `ctx.thefoldTaskId = ctx.taskId` slik at alle completion/failure/review-statusoppdateringer fungerer automatisk. Oppdaterer task-status til `in_progress` ved oppstart
- **FIX 2 — Task enrichment at creation:** `ai/ai.ts` `create_task` tool bruker nå `source: "chat"` i stedet for `"manual"`. Ny `enrichTaskWithAI()` funksjon (fire-and-forget) estimerer `estimatedComplexity` og `estimatedTokens` etter opprettelse. "chat" lagt til `TaskSource` type i `tasks/types.ts`
- **FIX 3 — start_task verification + status update:** `ai/ai.ts` `start_task` tool verifiserer nå at task eksisterer via `tasks.getTaskInternal()` før agent startes. Returnerer feil hvis task ikke finnes. Oppdaterer status til `in_progress` før start, `blocked` ved feil
- **FIX 4 — conversationId propagation:** Verifisert at `conversationId` allerede flyter korrekt fra chat til agent via `start_task` — ingen endring nødvendig

### ✅ Ferdig — Bugfiks Runde 7: Agent Repo Routing (februar 2026)
- **FIX 1 — Agent multi-repo support (KRITISK):** `agent/types.ts` `StartTaskRequest` nå accept `repoName?` og `repoOwner?` — agent bruker disse i stedet for hardkodet REPO_NAME/REPO_OWNER. Tillater agenten å jobbe med hvilket som helst repo
- **FIX 2 — Task-to-agent repo propagation:** `ai/ai.ts` `start_task` tool henter nå `task.repo` fra DB og sender den til `agent.startTask()`. Sikrer at agent jobber med korrekt repo basert på task-data
- **FIX 3 — Chat-to-agent repo routing:** `chat/chat.ts` `shouldTriggerAgent()` sender nå `req.repoName` til `agent.startTask()`. Repo-kontekst fra chat-request propagerer til agent
- **FIX 4 — Duplicate task prevention:** `create_task` tool implementerer nå duplicate-check — forhindrer opprettelse av samme task flere ganger (basert på title-match)
- **FIX 5 — thefoldTaskId default:** `startTask()` i agent setter nå `thefoldTaskId` automatisk til `req.taskId` hvis ikke angitt. Forenkler routing av opprettede tasks

### ✅ Ferdig — Cancel/Stop Task Mechanism (februar 2026)
- **Backend:** `POST /tasks/cancel` endpoint (exposed, auth) med in-memory `cancelledTasks` Set. `isCancelled` intern endpoint returnerer cancellation status for task
- **Agent:** `checkCancelled()` helper funksjon poller `tasks.isCancelled()` mellom agent-steg (4 sjekkpunkter: after context, before planning, before builder, inside retry loop). Destroyer sandbox og returnerer ved cancellation
- **Frontend:** `cancelTask` API-funksjon i api.ts. Stopp-knapp på in_progress tasks i `/repo/[name]/tasks` med optimistic UI (flytter task til backlog umiddelbart, rollback ved feil)

### ✅ Ferdig — Bugfiks Runde 8: Agent Chat Robusthet (februar 2026)
- **FIX 1 — start_task UUID-validering:** `ai/ai.ts` start_task tool validerer nå taskId-format med regex sjekk for UUID-struktur for `getTaskInternal()`, gir bedre feilmeldinger ved ugyldig input
- **FIX 2 — start_task debug-logging:** `console.log` med full input-objekt i start_task for feilsoking av tool-kall
- **FIX 3 — create_task UUID-retur:** `create_task` returnerer nå tydelig UUID med melding om at bruker skal bruke `start_task` for a starte oppgaven
- **FIX 4 — getTree try/catch i chat:** `chat/chat.ts` — alle `getTree`-kall wrappet i try/catch (2 steder: prosjektdekomponering og repo-kontekst). Forhindrer at GitHub-feil krasjer hele chat-flyten
- **FIX 5 — Pub/Sub agent_status oppdatering:** Subscription-handler i chat omskrevet til a oppdatere eksisterende `agent_status`-melding i stedet for a opprette nye `agent_report`-meldinger. Eliminerer duplikater i chatten
- **FIX 6 — parseReportToSteps helper:** Ny helper-funksjon for live AgentStatus-rendering fra agent reports i frontend
- **FIX 7 — Polling (bekreftet):** 2s polling nar agenten jobber — bekreftet at eksisterende implementasjon fungerer korrekt
- **FIX 8 — Skills selector (bekreftet):** SkillsSelector-komponent henter allerede fra listSkills API — fungerer korrekt
- **FIX 9 — Magiske fraser i tenker-tab:** Erstattet "tenker..." med unike fraser (Tryller/Glitrer/Forhekser/Hokus Pokus/Alakazam) med distinkte SVG-animasjoner, visuelt adskilt fra AgentStatus-boksen

### ✅ Ferdig — Bugfiks Runde 9: Agent Crash Resilience (februar 2026)
- **FIX 1 — Memory try/catch (Voyage 429):** Alle 5 `memory.search()`/`memory.store()` kall i `agent/agent.ts` executeTask wrappet i try/catch — Voyage API 429-feil krasjer ikke lenger agenten, agent fortsetter med tom kontekst
- **FIX 2 — Linear skip for lokale tasks:** Ny `updateLinearIfExists()` helper i agent/agent.ts — alle 3 direkte `linear.updateTask()` kall erstattet. Skipper Linear-oppdatering for tasks uten linearTaskId (lokale/chat-opprettede tasks)
- **FIX 3 — executeTask outer try/catch:** Allerede eksisterte, nå bruker `updateLinearIfExists()` + `reportSteps()` for failure-rapport slik at feil alltid kommuniseres tilbake
- **FIX 4 — reportSteps helper:** Ny funksjon for strukturert steg-rapportering via agentReports Pub/Sub med JSON-payload (`{ agent_status: { step, status, detail } }`)
- **FIX 5 — Agent reports EVERY step:** 7 `reportSteps()`-kall gjennom executeTask: start, context, planning, building, validation, review, completion/failure — full synlighet i frontend
- **FIX 6 — Pub/Sub handles structured JSON:** chat.ts subscription-handler detekterer JSON `agent_status` fra reportSteps, faller tilbake til legacy string-parsing for bakoverkompatibilitet
- **FIX 7 — Initial agent_status at start_task:** chat.ts oppretter initial "Forbereder"-status (agent_status melding) når agent task trigges — bruker ser umiddelbart at agenten er i gang
- **FIX 8 — Button-in-button fix:** `settings/models/page.tsx` outer `<button>` endret til `<div>` for å unnga HTML-validering-feil med nested interactive elements

### ✅ Ferdig — Bugfiks Runde 10: UX Polish (februar 2026)
- **FIX 1 — Emoji-fjerning i agent:** Alle emojier fjernet fra `agent/agent.ts` report()-kall (10+ emojier: planlegging, prikker, haker, advarsler, feil). Også fjernet emoji fra `chat/chat.ts` task-started melding. Agenten bruker nå ren tekst
- **FIX 2 — ActivityIcon SVG-komponent:** Ny `ActivityIcon.tsx` med 12 animerte SVG-ikoner (created, completed, failed, pr, working, chat, auth, build, task, sync, heal, cost + default). Erstatter emojier i activity-tidslinjen. Ikoner har SVG-animasjoner (opacity pulse, rotate, scale)
- **FIX 3 — AgentMode + Magic Header (BUG 5):** `tryParseAgentStatus` sjekker nå `metadata.taskId` — returnerer null for simple chat (ingen AgentStatus-boks for vanlige svar). `hasAgentStatus` filtrerer på taskId. Magic-indikator flyttet fra meldingsområdet til header-baren. Simple mode viser `{aiName} · {phrase} · tenker · {N}s`, agent mode viser bare `{phrase}`
- **FIX 4 — Thinking Timer:** Ny `thinkingSeconds` teller i begge chat-sider. Starter ved `isWaitingForAI`, teller opp sekunder, vises i header for simple mode

### ✅ Ferdig — Prompt AA: Chat UX, Task Blocking, Voyage Rate Limit (februar 2026)
- **FIX 1 — Ra JSON i chat (KRITISK):** agent_status og agent_report meldinger filtreres ut fra meldings-rendering i begge chat-sider. AgentStatus rendres separat via useMemo (lastAgentStatus + agentActive). tryParseAgentStatus og hasAgentStatus fjernet som dead code
- **FIX 2 — Tenker-indikator i chat (KRITISK):** MagicIcon + aiName + frase + sekunder vises na i chat-omradet (erstatter AI-avatar mens AI jobber). Header-indikatoren viser kun magisk frase i agent-modus (agentActive). Fjernet header-tekst for enkel modus
- **FIX 3 — Task error_message (HOY):** Ny migrasjon tasks/migrations/2_add_error_message.up.sql. updateTaskStatus tar na errorMessage parameter. Agent catch-blokk og impossible_task-diagnose sender errorMessage (maks 500 tegn). Frontend TaskCard viser feilmelding pa blokkerte tasks (rod bakgrunn)
- **FIX 4 — Duplikat-sjekk (HOY):** create_task duplikat-sjekk ignorerer na ogsa "blocked" og "failed" tasks. Disse er "dode" og skal ikke blokkere opprettelse av nye tasks med samme tittel
- **FIX 5 — Blokkerte tasks kan ikke startes (HOY):** start_task sjekker na status for blocked/done/in_progress og returnerer feilmelding. Blokkerte tasks viser ogsa errorMessage i feilmeldingen
- **FIX 6 — Voyage 429 retry (KRITISK):** embed() i memory.ts har na eksponentiell backoff (1s, 2s, 4s) med 3 retries ved 429 Too Many Requests. Alle memory-kall i agent.ts allerede wrappet i try/catch
- **FIX 7 — Task type med errorMessage (HOY):** errorMessage lagt til i Task (types.ts), TaskRow, parseTask, TheFoldTask (frontend api.ts), og alle SELECT-queries i tasks.ts

### ✅ Ferdig — Prompt AE: Skills Column Crash + Memory Migration Fix (februar 2026)
- **BUG 1 — Skills column crash:** skills/skills.ts hadde INGEN referanser til droppede kolonner — migrasjon 8 var allerede trygg
- **BUG 1 — Memory migration fix (KRITISK):** Migrasjon 4 droppet 6 kolonner, men 4 var aktivt brukt (pinned, superseded_by, ttl_days, consolidated_from). Rewritten til kun å droppe parent_memory_id + source_task_id. Fjernet sourceTaskId fra StoreRequest + 3 callsites (agent.ts, review.ts). GRUNNMUR-STATUS korrigert
- **BUG 2 — Tenker-indikator:** Verifisert i begge chat-sider — MagicIcon + aiName + phrase + timer fungerer
- **BUG 3 — Blokkert task guard:** Allerede implementert i ai/ai.ts:848-857 (blocked/done/in_progress sjekk)

### ✅ Ferdig — Prompt AD v2: UX + Arkitektur-opprydding (februar 2026)
- **FIX 1 — Tenker-indikator (KRITISK):** `sending` brukes na korrekt for MagicIcon + aiName + frase + timer. Fjernet typing dots og header-indikator for enkle svar. Begge chat-sider oppdatert
- **FIX 2 — Optimistisk brukermelding:** Allerede implementert i begge chat-sider (temp-melding vises umiddelbart)
- **FIX 3 — getTree crash (KRITISK):** 4 getTree-kall wrappet med try/catch (agent.ts x2, orchestrator.ts x1, chat.ts allerede wrappet). memory.extract allerede wrappet med .catch()
- **FIX 4 — Task-system konsolidering (KRITISK):** Orchestrator oppretter na tasks i tasks-service alongside project_tasks. Status synkes via mapProjectStatus(). thefoldTaskId settes pa AgentExecutionContext. "orchestrator" lagt til som TaskSource
- **FIX 5 — TASK_SELECT_COLUMNS (VIKTIG):** Referansekonstant lagt til i tasks.ts. Manglende error_message i listDeleted fikset
- **FIX 6 — Skills DB cleanup (VIKTIG):** Migrasjon 8: droppet 12 ubrukte kolonner (marketplace_id, marketplace_downloads, marketplace_rating, version, author_id, depends_on, conflicts_with, parent_skill_id, composable, output_schema, execution_phase, token_budget_max)
- **FIX 7 — Memory DB cleanup (MEDIUM):** Migrasjon 4: droppet 6 ubrukte kolonner (parent_memory_id, consolidated_from, superseded_by, ttl_days, pinned, source_task_id)
- **FIX 8 — Status-mapping (HOY):** TASK_STATUS konstant + mapProjectStatus() + mapToLinearState() lagt til i agent/types.ts. Brukes i orchestrator for status-synk

### ✅ Ferdig — Bugfiks Runde 11: Tool-use Robusthet (februar 2026)
- **FIX 1 — Task ID hallusinering (BUG 1 KRITISK):** Claude sender feil UUID til start_task etter create_task. Fiks: `lastCreatedTaskId` tracking i `callAnthropicWithTools` — ved start_task overskrives input.taskId med siste opprettede task-ID. Start_task tool description oppdatert med eksplisitt instruks om å bruke ID fra create_task. Debug console.log fjernet, erstattet med structured `log.info`/`log.warn`
- **FIX 2 — Skills selector tom (BUG 7):** `SkillsSelector` kalte `listSkills("chat")` men ingen skills har "chat" i `applies_to`. Fiks: kaller nå `listSkills()` uten context-filter — viser alle tilgjengelige skills

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
| 🟢 AKTIVE | 295+ |
| 🟡 STUBBEDE (kode finnes, passthrough) | 2 |
| 🔴 GRUNNMUR (DB-felter/interfaces) | 19 |
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
- ~~/tools/secrets — API finnes (GET /gateway/secrets-status), frontend ikke koblet ennå~~ ✅ Koblet

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

### Backend: Encore.ts (16 mikrotjenester)

```
thefold/
├── gateway/      → Auth (Bearer token med HMAC-signatur)
├── users/        → OTP-basert auth, profiler, preferences
├── chat/         → Meldingshistorikk (PostgreSQL), healing-notifications, fil-opplasting
├── ai/           → Multi-AI orkestering (Claude, GPT-4o, Moonshot), tool-use
├── agent/        → Den autonome hjernen - koordinerer hele flyten
├── github/       → Leser/skriver kode via GitHub API
├── sandbox/      → Isolert kodevalidering med sikkerhet
├── linear/       → Task-henting og statusoppdatering
├── tasks/        → TheFold task engine: CRUD, Linear sync, AI planning
├── builder/      → Fil-for-fil kodebygging med avhengighetsanalyse
├── memory/       → pgvector semantic search, code patterns
├── docs/         → Context7 MCP for oppdatert dokumentasjon
├── cache/        → PostgreSQL caching for embeddings, repo struktur, AI svar
├── skills/       → Dynamiske instruksjoner for AI
├── mcp/          → MCP server registry: install/uninstall/configure
├── integrations/ → Eksterne webhooks (Slack, Discord), CRUD config
├── monitor/      → Health checks, dependency audit
└── registry/     → Component marketplace grunnmur + healing pipeline
```

### Frontend: Next.js 15 Dashboard

```
Sider:
├── /login                    → OTP-basert innlogging
├── /home                     → Oversikt, stats, recent activity
├── /chat                     → Hovedchat (cross-repo)
├── /environments             → Alle repoer
├── /marketplace              → Component marketplace (browse + search)
├── /templates                → Pre-built templates
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

**✅ Chat Tool-Use / Function Calling (DEL 1):**
1. ✅ 5 tools i ai/ai.ts: create_task, start_task, list_tasks, read_file, search_code
2. ✅ executeToolCall dispatcher til ekte services (tasks, github)
3. ✅ callAnthropicWithTools two-call flow (tool_use → execute → final response)
4. ✅ System prompt oppdatert med verktoy-instruksjoner
5. ✅ Dynamic AgentStatus: processAIResponse bygger steg basert pa intent-deteksjon
6. ✅ Animated PhaseIcons: per-fase SVG-ikoner med CSS-animasjoner (grid-blink, pulse, clipboard, lightning, eye, gear)

**✅ Integrations Service (DEL 2):**
1. ✅ `integrations/` Encore.ts service med PostgreSQL database (integration_configs tabell)
2. ✅ CRUD endepunkter: list, save, delete
3. ✅ Slack webhook endpoint
4. ✅ Discord webhook endpoint
5. ✅ Frontend /tools/integrations med Slack + Discord config-skjemaer

**✅ File Upload/Download (DEL 3):**
1. ✅ chat_files tabell (migrasjon 4)
2. ✅ POST /chat/upload endpoint (500KB grense)
3. ✅ Frontend fil-velger via + meny
4. ✅ CodeBlock nedlastingsknapp for navngitte kodeblokker

**✅ Chat Source Field (DEL 4):**
1. ✅ source-kolonne i messages-tabell
2. ✅ SendRequest.source param ("web"|"slack"|"discord"|"api")

**✅ Skeleton Loading + Template Modal + AI Name Preference (UX-polish):**

*DEL 1 — Skeleton Loading System:*
1. ✅ `.skeleton` shimmer CSS-animasjon i globals.css
2. ✅ 17 `loading.tsx` filer for ALLE dashboard-sider (home, chat, environments, marketplace, marketplace/[id], skills, settings, settings/costs, settings/security, review, review/[id], tools, repo/[name]/overview, repo/[name]/chat, repo/[name]/tasks, repo/[name]/reviews, repo/[name]/activity)
3. ✅ `prefetch={true}` på alle sidebar Link-komponenter

*DEL 2 — Tools Tab Fix:*
1. ✅ Tools layout tabs med `prefetch={true}` for raskere navigasjon
2. ✅ Ingen hardkodet default-repo i tools-sider

*DEL 3 — Template Install Modal:*
1. ✅ InstallModal med dark backdrop (rgba(0,0,0,0.6)), repo-dropdown fra listRepos(), variabel-inputs, square corners
2. ✅ Font-audit: korrigert font-klasser gjennom hele templates-siden

*DEL 4 — AI Name Preference:*
1. ✅ Backend: aiName i preferences JSONB (ingen skjemaendring), leses i chat/chat.ts processAIResponse, sendes til ai.ts system prompt
2. ✅ ai/ai.ts: system prompt bruker konfigurerbart aiName (default "Jørgen André"), getDirectChatPrompt aksepterer aiName-parameter
3. ✅ Frontend settings: AI-assistent seksjon i Preferanser tab med navn-input + auto-genererte initialer-preview
4. ✅ UserPreferencesContext: eksporterer aiName + aiInitials derivert fra preferences
5. ✅ Begge chat-sider: bruker aiName/aiInitials fra context for avatar, "tenker"-indikator, heartbeat-lost melding
6. ✅ Default AI-navn endret fra "TheFold"/"TF" til "Jørgen André"/"JA"

**Gjenstår:**
1. AI-basert auto-ekstraksjon (aktivér registry/extractor.ts)
2. Semantisk komponent-matching via memory.searchPatterns()
3. Cross-project bug propagation via healing pipeline
4. Komponent-signering (OWASP ASI04 Supply Chain)
5. Koble skills.marketplace_id til registry components

**✅ Kostnads-dashboard + Skills-forenkling + Repo-header redesign (prompt.md):**

*DEL 1 — Kostnads-dashboard:*
1. ✅ `GET /chat/costs` endepunkt i chat/chat.ts — aggregerer today/week/month/perModel/dailyTrend fra messages metadata
2. ✅ `/settings/costs` frontend side — 3 kostnadskort, per-modell-tabell, 14-dagers CSS-bar-chart
3. ✅ Budget alert i processAIResponse — $5/dag terskel, console.warn ved overskridelse
4. ✅ `getCostSummary` + cost types lagt til i api.ts
5. ✅ "Kostnader" lenke i settings-siden

*DEL 2 — Skills-forenkling:*
1. ✅ `resolve()` i skills/engine.ts forenklet — fjernet depends_on, conflicts_with, fase-gruppering — nå: scope filter → routing match → token budget → build prompt
2. ✅ skills/page.tsx forenklet — fjernet pipeline viz, categories, phases, confidence bars — beholdt: grid + toggle + slide-over + create/edit
3. ✅ Dynamic scope dropdown populert fra listRepos("Twofold-AS") API
4. ✅ Migration 6: deaktiverer 3 generiske seeded skills (Norwegian Docs, Test Coverage, Project Conventions)

*DEL 3 — Repo-header redesign:*
1. ✅ PageHeaderBar.tsx forenklet — fjernet cells/tabs prop, lagt til subtitle prop
2. ✅ Alle 5 repo-sider bruker per-page headers (title="Oversikt"/"Oppgaver"/"Reviews"/"Aktivitet", subtitle=repo name)
3. ✅ Tasks-side: "Ny oppgave" + "Synk fra Linear" knapper flyttet til PageHeaderBar actions
4. ✅ Overview-side: helse-indikator i header actions, shortcuts-kort (2x2 grid: Chat/Oppgaver/Aktivitet/Reviews)
5. ✅ Tab-navigasjon fjernet fra alle repo-sider

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

**✅ Token-sporing og Truncation Handling:**
1. ✅ `ai/ai.ts` — ChatResponse type med `usage: { inputTokens, outputTokens, totalTokens }`, `truncated: boolean`
2. ✅ Alle AI-providere (Anthropic, OpenAI, Moonshot) propagerer usage data gjennom chat endpoint
3. ✅ `chat/chat.ts` — processAIResponse håndterer truncation (oppdager stop_reason="max_tokens"), appender melding til bruker
4. ✅ Token-metadata (model, tokens, cost, stopReason, truncated, toolsUsed) lagret i messages.metadata JSONB
5. ✅ Frontend viser token-info (model, tokens, kostnad) under AI-meldinger i begge chat-sider
6. ✅ max_tokens allerede satt til 8192 (ingen endring nødvendig)
7. ✅ PRICING allerede i router.ts MODEL_REGISTRY (ingen endring nødvendig)

**✅ Repo Activity Logging:**
1. ✅ Ny `repo_activity` tabell (chat/migrations/5_add_repo_activity.up.sql)
2. ✅ `logRepoActivity()` helper logger chat, tool_use, ai_response events
3. ✅ `GET /chat/activity/:repoName` endpoint returnerer aktiviteter
4. ✅ Activity-siden (/repo/[name]/activity) henter repo_activity events sammen med eksisterende audit/task/builder events
5. ✅ `getRepoActivity()` lagt til frontend api.ts
6. ✅ Server-side repo-filtrering for ytelse

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

**Fase 1-4 er KOMPLETT. Fase 5 Del 1 er ferdig.** Totalt 310+ tester, 290+ aktive features, 16 Encore.ts-tjenester.

**Dynamic AI Provider & Model System (16. feb):**
- ✅ DB-drevet modellregister: 2 nye tabeller (ai_providers, ai_models), 9 pre-seeded modeller
- ✅ Full CRUD frontend: /settings/models med expand/collapse, add/edit/delete, toggle
- ✅ Router oppdatert: DB-backed cache (60s TTL), tag-based selection, tier-based upgrade med provider affinity
- ✅ 5 nye backend-endepunkter: GET /ai/providers, POST /ai/providers/save, POST /ai/models/save, POST /ai/models/toggle, POST /ai/models/delete

**Bugfiks Runde 3 (16. feb):**
- ✅ Cost safety: `.toFixed()` wrapping for NULL-håndtering
- ✅ Soft delete tasks: 3 nye backend-endepunkter, frontend UI, auto-cleanup cron
- ✅ Repo persistence: localStorage-integration via RepoProvider

**Bugfiks Runde 4 (16. feb):**
- ✅ "deleted" status krasjer API: TaskStatus union + listTasks-filtrering + listDeleted endpoint + pushToLinear mapping + getStats-filtrering
- ✅ Slett-knapp på tasks: frontend listDeletedTasks koblet til backend, full end-to-end flyt
- ✅ Agent report duplikater: agent_report/agent_status filtrert ut i chat rendering, dead code fjernet

**Bugfiks Runde 5 (16. feb):**
- ✅ AgentStatus box restaurert: Over-filtrering fikset — kun agent_report filtreres nå, agent_status vises korrekt i begge chat-sider
- ✅ Deleted skill injeksjon stoppet: skills.resolve() bruker korrekt schema, deaktiverte skills filtreres ut
- ✅ Empty repo confidence: Auto-setter confidence til 90 for tomme repoer, skipper unødvendige spørsmål
- ✅ Agent stopp/vente UI: AgentStatus med "Venter"-fase (questions + reply input) og "Feilet"-fase (retry/cancel buttons), full callback-wiring i begge chat-sider

**Skills task_phase System (16. feb):**
- ✅ DEL 4 — task_phase backend + frontend: Migrasjon 7 (task_phase kolonne: all/planning/coding/debugging/reviewing), skills.ts oppdatert (taskPhase i alle typer/funksjoner), engine.ts filtrerer på taskType→task_phase mapping, ai.ts CONTEXT_TO_TASK_PHASE (direct_chat→all, agent_planning→planning, agent_coding→coding, agent_review→reviewing). Frontend redesign: fase-tabs (counts), repo scope filter, SkillCard badges+gear, SkillForm 2-col grid, SkillDetail 3-col metadata, SlideOver opak fix
- ✅ DEL 2 item 3 — Cache investigation: Verifisert at cache.ts IKKE cacher skills — kun embeddings/repo/plans. Ingen cache invalidation nødvendig
- ✅ DEL 3 — AgentStatus callbacks completion: Begge chat-sider wired med onReply/onRetry/onCancel, tryParseAgentStatus extraherer questions, handleAgentReply/Retry/Cancel implementert

**Bugfiks Runde 6: Agent & Task Integration (16. feb):**
- ✅ Agent dual-source task lookup: STEP 1 prøver tasks-service først, fallback til Linear. Lokal task → thefoldTaskId settes, status → in_progress
- ✅ Task enrichment: create_task bruker source="chat", enrichTaskWithAI() estimerer complexity+tokens (fire-and-forget). "chat" lagt til TaskSource
- ✅ start_task verifisering: Verifiserer task via getTaskInternal(), setter in_progress/blocked, returnerer feil hvis task ikke finnes
- ✅ conversationId-propagering: Verifisert korrekt flyt fra chat → start_task → agent

- **Fase 1** (Foundation + Auth): OTP login, PostgreSQL cache, confidence scoring
- **Fase 2** (Core Intelligence): Skills pipeline, audit logging, context windowing, incremental validation, multi-model routing, memory decay
- **Fase 3** (Integration & Polish): Frontend (12 sider koblet), review system (6 API-endepunkter, /review sider), project orchestrator (curateContext, executeProject, chat-deteksjon), E2E-tester (25 tester, 21 bestått, 4 skip)
- **Fase 4** (Omstrukturering): Task Engine, Builder Service, Tools Frontend, Settings Redesign, Repo-sidebar Redesign, Registry/Marketplace Grunnmur (8 endepunkter, healing pipeline, Pub/Sub, 15 tester)
- **Fase 5 Del 1** (Marketplace + Templates): Marketplace frontend (/marketplace + detalj), Templates service (4 endepunkter, 5 pre-seeded maler), exposed useComponent, sidebar/tools nav, 9 nye API-funksjoner, ~14 nye tester
- **Fase 5 Del 1-4** (Chat + Integrations): Chat tool-use (5 tools, function calling), dynamic AgentStatus med animated phase icons, integrations/ service (Slack+Discord webhooks), file upload/download, chat source field, token tracking + truncation handling, repo activity logging

Alle OWASP-tiltak implementert: token-revokering, CORS, exponential backoff, sanitisering, circuit breaker.
Backend integrasjon: Linear state-mapping, secrets status API, Pub/Sub subscribers (build progress + task events), aktivitet-tidslinje med server-side repo-filtrering, token usage tracking, repo activity logging.

MCP Backend: mcp/ service, 6 endepunkter, pre-seeded 6 servere, agent-integrasjon (STEP 3.5), frontend koblet.

Chat tool-use: 5 tools (create_task, start_task, list_tasks, read_file, search_code), callAnthropicWithTools two-call flow, executeToolCall dispatcher, dynamic AgentStatus med animated phase icons.
Integrations: integrations/ service med integration_configs tabell, CRUD, Slack+Discord webhooks, frontend /tools/integrations.
File upload: chat_files tabell, POST /chat/upload (500KB), frontend fil-velger, CodeBlock download.
Chat source: source-kolonne i messages, SendRequest.source ("web"|"slack"|"discord"|"api").

Bug-fiks runde 2: Agent-synlighet i chat (progress-meldinger, agent_status messageType, smart polling idle/waiting/cooldown), custom chat header med ekte ModelSelector + SkillsSelector, optimistisk bruker-rendering, font-mono cleanup, PageHeaderBar 56px + subtil aktiv tab.

Chat timeout-fiks + agent-synlighet: Backend async sendMessage (fire-and-forget), withTimeout på alle eksterne kall (memory 5s, AI 60s), cancelGeneration endpoint, frontend stopp-knapp, redesignet "TheFold tenker" (TF-ikon + brand-shimmer + agent-dots + stopp), brand-shimmer i sidebar, AI system prompt norsk/konversasjonelt, 6 nye CSS-animasjoner (agent-shimmer, agent-spinner-small, agent-step-enter, brand-shimmer, agent-dots, agent-check-in).

DB-fiks + Heartbeat + Agent-boks: Migrasjon 3 (agent_status CHECK + updated_at), heartbeat hvert 10s i processAIResponse, try/catch per steg (skills/memory/AI), detectMessageIntent med 4 intent-typer og ulike steg, AgentStatus redesignet til tab+boks med tittel+feilmelding, send-knapp → stopp-sirkel (som Claude), heartbeat-lost UI (30s timeout), TF-ikon fjernet, updated_at i alle queries og frontend Message type.

Chat-polish: Samtale-tittel bruker første USER-melding (filtrerer bort agent_status JSON fra tittel/preview), "TheFold tenker..." deduplisert (kun vist før første agent_status ankomst), fase-spesifikke ikoner i AgentStatus tab (forstørrelsesglass for Analyserer, wrench for Bygger, spinner for Tenker/Genererer, check/X for Ferdig/Feilet), ny agent-phase-pulse CSS-animasjon.

Chat-rendering + emoji-forbud: Emoji-forbud i direct_chat system prompt (ai/ai.ts), ny CodeBlock-komponent (collapsible, filnavn, språk-badge, kopier, linjenumre), ny ChatMessage markdown-parser (kodeblokker→CodeBlock, overskrifter, lister, bold/italic/inline-kode), integrert i begge chat-sider (assistant-meldinger rendres med ChatMessage).

System prompt + repo-kontekst: Fullstendig overhaul av direct_chat system prompt — AI vet at den ER TheFold, kjenner alle 17 services, frontend-stack, regler (norsk, ingen emojier, konsis). repoName-pipeline: repo-chat sender params.name → SendRequest.repoName → processAIResponse → ai.chat → system prompt ("Du ser på repoet: X"). Hoved-chat sender IKKE repoName — AI svarer generelt.

GitHub fil-kontekst i chat: processAIResponse henter nå FAKTISK repo-innhold fra GitHub. Steg 4.5: getTree → findRelevantFiles → getFile (topp 5, 200 linjer per fil). repoContext injiseres i ai.chat system prompt med anti-hallusinering ("basér KUN på faktisk kode"). Fallback til nøkkelfiler (package.json, README, encore.app). Agent status-oppdateringer for hvert GitHub-steg.

Chat UI forbedringer: Input-boks — + ikon (borderless, 32px), textarea, send-knapp i horisontal rad med flex gap-2 items-end. Textarea: minHeight 56px, maxHeight 150px. Meldinger bredere — container max-w-4xl, bruker-meldinger 70%, AI-meldinger 85%. Scrollbar-padding px-4. Begge chat-sider (hoved + repo) oppdatert identisk.

Robusthet-fikser: (1) Tomt repo → AI får eksplisitt "repoet er TOMT" melding, ingen hallusinering. (2) Memory-prioritering — system prompt sier minner er hint, fil-kontekst er sannhet. (3) Skills UUID[] fix — depends_on::text[] cast i resolve() fikser Encore "unsupported type: UuidArray". (4) Debug console.logs fjernet.

Token-sporing + Repo Activity: ChatResponse propagerer usage data (inputTokens, outputTokens, totalTokens) fra alle AI-providere. processAIResponse detekterer truncation (stop_reason="max_tokens") og appender melding til bruker. Token-metadata (model, tokens, kostnad, stopReason, truncated, toolsUsed) lagres i messages.metadata JSONB. Frontend viser token-info under AI-meldinger. Repo activity logging via ny repo_activity tabell — logRepoActivity() helper logger chat, tool_use, ai_response events. GET /chat/activity/:repoName endpoint returnerer repo-spesifikke aktiviteter. Activity-siden koblet til både audit, tasks, builder og nye repo_activity events med server-side filtrering.

Kostnads-dashboard: GET /chat/costs endpoint, /settings/costs frontend (3 kort, per-modell-tabell, 14-dagers bar-chart), budget alert ($5/dag).
Skills-forenkling: resolve() forenklet (fjernet depends_on/conflicts_with/fase-gruppering), frontend forenklet (fjernet pipeline viz/categories/phases/confidence bars), dynamic scope dropdown, migration 6 (deaktiverer 3 generiske skills).
Repo-header redesign: PageHeaderBar forenklet (subtitle prop), per-page headers i alle 5 repo-sider, tab-navigasjon fjernet, overview shortcuts-kort (2x2 grid).

Skeleton Loading: .skeleton shimmer CSS, 17 loading.tsx filer for alle dashboard-sider, prefetch={true} på sidebar og tools-tabs.
Template Install Modal: InstallModal med dark backdrop, repo-dropdown, variabel-inputs, font-audit.
AI Name Preference: aiName i preferences JSONB, konfigurerbart AI-navn i system prompt (default "Jørgen André"), settings UI med initialer-preview, UserPreferencesContext eksporterer aiName/aiInitials, begge chat-sider oppdatert.

**Bugfiks Runde 8: Agent Chat Robusthet (16. feb):**
- ✅ start_task UUID-validering: Regex-sjekk av taskId-format for getTaskInternal(), bedre feilmeldinger
- ✅ start_task debug-logging: console.log med full input-objekt for feilsoking
- ✅ create_task UUID-retur: Tydelig UUID med melding om start_task-bruk
- ✅ getTree try/catch: Alle getTree-kall i chat.ts wrappet (prosjektdekomponering + repo-kontekst)
- ✅ Pub/Sub agent_status oppdatering: Subscription-handler omskrevet — oppdaterer eksisterende melding i stedet for duplisering
- ✅ parseReportToSteps: Ny helper for live AgentStatus-rendering fra agent reports
- ✅ Magiske fraser: "tenker..." erstattet med Tryller/Glitrer/Forhekser/Hokus Pokus/Alakazam + SVG-animasjoner

**Bugfiks Runde 9: Agent Crash Resilience (16. feb):**
- ✅ Memory try/catch: Alle 5 memory.search/memory.store-kall i executeTask wrappet i try/catch (Voyage 429-resiliens)
- ✅ updateLinearIfExists: Ny helper — skipper linear.updateTask() for lokale tasks uten linearTaskId, alle 3 direkte kall erstattet
- ✅ executeTask outer try/catch: Bruker nå updateLinearIfExists + reportSteps for failure-rapport
- ✅ reportSteps: Ny funksjon for strukturert Pub/Sub JSON (step, status, detail), 7 rapportpunkter gjennom executeTask
- ✅ Structured Pub/Sub: chat.ts detekterer JSON agent_status fra reportSteps, fallback til legacy parsing
- ✅ Initial agent_status: chat.ts oppretter "Forbereder"-status ved task-trigger — umiddelbar feedback til bruker
- ✅ Button-in-button fix: settings/models/page.tsx outer button→div

**Neste prioritet:** Fase 5 Del 2 (AI auto-extraction, semantisk matching), MCP call routing.

**Gjenstår:** Fase 5 Del 2 (AI auto-extraction, semantisk komponent-matching, healing propagation), MCP call routing.

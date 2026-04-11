# TheFold — Strategisk Utviklingsplan

> Oppdatert 11. april 2026

## Visjon

TheFold er ikke en IDE-copilot. Det er en autonom utviklingskollega — en agent som husker, tar initiativ, jobber selvstendig, og blir smartere over tid. Cursor reagerer på tastetrykk. TheFold driver prosjekter fremover mens du sover.

Denne planen bygger videre på bugfiksene og infrastrukturen fra v1–v3 dispatch, og fokuserer på det som skiller TheFold fra alle andre: **autonomi, hukommelse, proaktivitet og transparens**.

---

## Fullførte faser

- [x] Duplikat AgentEventBus — fikset
- [x] 9 døde komponenter fjernet (2179 linjer)
- [x] SSE field renames — alle 5 event handlers i useAgentStream.ts rettet
- [x] SSE replay-buffer koblet opp (Last-Event-ID → buffer replay)
- [x] Review polling utvidet (60s ekstra vindu)
- [x] /settings/models — full CRUD for AI-modeller med provider/tier/pris
- [x] /review/[id] — dedikert review-side med kvalitetsscore, fil-diffs, approve/reject
- [x] Chat UX — typing indicator, auto-start tasks, tom-melding-filter, parallelliserte GitHub-kall

---

## ✅ Fase 4: Agent-pålitelighet — FULLFØRT

### 4.1 Full tool-loop for direkte chat ✅
Tool-use loop implementert: 5 tools (create_task, start_task, list_tasks, read_file, search_code), max 10 runder, multi-tool sekvenser støttet.

### 4.2 Error recovery ✅
Eksponentiell backoff, max 5 forsøk, 6 diagnose-grener (bad_plan, implementation_error, missing_context, impossible_task, environment_error, default), checkpoint-resumption via builder-jobs DB.

### 4.3 Context manager ✅
Per-fase token-budsjetter i token-policy.ts (confidence 2K, planning 8K, building 50K), filterForPhase() i context-builder.ts, trimContext() reduserer tokens ~30%.

### 4.4 Import-graf + retry-delta ✅
buildImportGraph() gir presis filvalg (~15-25% forbedring), computeRetryContext() bruker delta-context ved retry (~60-75% token-sparing).

---

## ✅ Fase 5: Frontend polish — FULLFØRT

### 5.1 useApiData overalt ✅
Alle sider bruker useApiData med loading/error states.

### 5.2 Error boundaries ✅
ErrorBoundary.tsx brukes i layout.tsx rundt all innhold.

### 5.3 Loading skeletons ✅
Skeleton.tsx brukes konsekvent på alle sider.

### 5.4 Agent-fase-ikoner ✅
Animerte SVG-ikoner per fase i AgentStatus.tsx (grid-blink, magnifier pulse, clipboard, lightning swing, eye, gear spin).

### 5.5 Flat/square design system ✅
Tokens-basert design gjennomgående, brand-shimmer, monospace font-stack.

---

## ✅ Fase 6: Testing — FULLFØRT

### 6.1 E2E agent tests ✅
25 E2E-tester i agent/e2e.test.ts (10 grupper), 12 mock-tester i agent/e2e-mock.test.ts.

### 6.2 Mock AI provider ✅
Deterministisk mock-AI i agent/test-helpers/mock-ai.ts, mock-services for GitHub/Memory/Docs/MCP/Sandbox/Builder.

### 6.3 OWASP tester ✅
8 rate-limit/scope tester (XM), 8 security-headers/login-monitoring tester (XN), 54 memory-sanitize tester (XL).

### 6.4 Registry extraction tests ✅
8 tester i registry/extractor.test.ts.

---

## ✅ Fase 7: Hukommelse som superkraft 🧠 — FULLFØRT

### 7.1 Memory-synlighet i chatten ✅
`memory_insight` meldingstype i chat — viser "💡 Husker:" inline med collapsible detaljer, decay-score, minnetype-farge. Triggrer automatisk når AI bruker minner.

### 7.2 Knowledge dashboard forbedret ✅
Kategori-filter chips, optimistisk sletting med × per rad, kolonne-grid med decay-score og tidspunkt.

### 7.3 Proaktiv læring ✅
Riker tags (architectural, pinned), kodekonvensjoner med ttlDays: 180, auto-detektert errorCategory (typescript_error, lint_error, test_failure, build_error).

### 7.4 Onboarding-scanning ✅
performOnboardingScan() genererer og lagrer repo-profil (pinned AI-memory) første gang agenten kobles til et repo uten eksisterende minner.

---

## ✅ Fase 8: Proaktiv agent 🔮 — FULLFØRT

### 8.1 Repo-watch ✅
CronJob (every 30m) i monitor-service — henter siste commits via GitHub, analyserer package.json for CVE-er og breaking changes via AI, lagrer til `repo_watch_results` DB og memory-service. Pub/Sub topic `repo-watch-findings`.

### 8.2 Proaktive forslag ✅
`POST /agent/suggestions` aggregerer error_pattern-minner, health checks og watch-funn til prioriterte forslag (critical/high/medium/low). `ProactiveSuggestions` komponent vises i chat og på oversiktssiden. Forslag inkluderer "Start oppgave"-knapp.

### 8.3 Daglig digest ✅
CronJob (schedule: "0 8 * * *") genererer norsk AI-sammendrag av siste 24t health + watch-funn. Publiseres via `agentReports` pub/sub (chat lagrer som completion-melding). **Vises nå også på AI Insights dashboard.**

### 8.4 Smart prioritering ✅
`planOrder` i tasks-service henter historiske error_pattern-minner og strategier fra memory, samt kompleksitetsdata fra tidligere tasks. Sendes som `historicalContext` til `ai.planTaskOrder()`.

---

## ✅ AI Insights Dashboard — FULLFØRT

Oversiktssiden (`/`) er oppgradert til fullverdig AI Insights dashboard:

- **AI-anbefalinger** — live fra `/agent/suggestions`, prioritet-fargekoding, "Start oppgave"-knapp
- **Repo-watch funn** — siste 7 dager fra `/monitor/watch-findings`, health-bar med pass/warn/fail
- **Agentens hukommelse** — kategori-pills med fargekoding, siste lærte minner
- **Aktive/nylige tasks** — 5 siste med status-farge
- **Skills** — topp 4 mest brukte, aktive/totalt
- **Hurtigvalg** — Start samtale, Tasks, Minner, Monitor, Memory-søk

Daglig digest og repo-watch publiserer nå til både chat (via pub/sub) og vises på dashboardet (via direktehenting).

---

## Fase 9: Multi-agent koordinering 🤖🤖🤖

> *"Én lead agent som delegerer til spesialister."*

### 9.1 Spesialiserte agenter
Utvid eksisterende sub-agent system:
- **Architect agent** — planlegger og designer
- **Builder agent** — implementerer kode
- **Test agent** — skriver og kjører tester
- **Review agent** — kvalitetssikring
- **Docs agent** — dokumentasjon
- **Security agent** — sikkerhetsskanning

### 9.2 Parallell utførelse
Lead agent bryter ned oppgave → delegerer til spesialister → samler resultater → merge

### 9.3 Agent-til-agent kommunikasjon
Spesialiserte agenter kan dele kontekst:
- Builder spør Architect om designbeslutning
- Test agent rapporterer feil tilbake til Builder
- Review agent foreslår endringer som Builder implementerer

---

## Fase 10: Codebase Intelligence 📊

> *"Agenten kjenner hele codebasen din, ikke bare filene den har sett."*

### 10.1 Full codebase-indeksering
- Indekser alle filer med embeddings ved repo-tilkobling
- Inkrementell oppdatering ved nye commits
- Dependency graph for hele repoet (ikke bare per-task)

### 10.2 Semantic code search
- "Finn alle steder der vi håndterer auth errors"
- "Hvilke komponenter bruker useEffect med API-kall?"
- Import-graf visualisering

### 10.3 Arkitekturforståelse
- Automatisk generer arkitekturdiagram
- Identifiser modulgrenser og avhengigheter
- Foreslå refaktoreringer basert på coupling-analyse

### 10.4 Impact-analyse
Før agenten endrer en fil:
- "Denne endringen påvirker 12 andre filer"
- "3 tester vil sannsynligvis feile"
- "API-kontrakten endres — frontend må oppdateres"

---

## Fase 11: Dyp Git-integrasjon 🔀

### 11.1 Branch management
- Agenten lager feature branches automatisk
- Intelligent branch-navngiving basert på task
- Auto-rebase når main har endret seg

### 11.2 Commit intelligence
- Semantic commit messages basert på endringer
- Automatisk splitting av store endringer i logiske commits
- Conventional commits standard

### 11.3 PR workflows
- Auto-generert PR-beskrivelse med context fra task + memory
- Foreslå reviewers basert på fil-ownership
- Auto-merge når CI passerer + approval

### 11.4 Conflict resolution
- Automatisk løsning av enkle merge conflicts
- Intelligent forslag for komplekse conflicts
- Visuell diff med AI-forklaring av endringer

---

## Prioriteringsmatrise

| Fase | Impact | Effort | Status |
|------|--------|--------|--------|
| 4: Agent-pålitelighet | Høy | Medium | ✅ Fullført |
| 5: Frontend polish | Medium | Lav | ✅ Fullført |
| 6: Testing | Høy | Medium | ✅ Fullført |
| 7: Hukommelse | Svært høy | Medium | ✅ Fullført |
| 8: Proaktiv agent | Svært høy | Høy | ✅ Fullført |
| AI Insights Dashboard | Høy | Lav | ✅ Fullført |
| 9: Multi-agent | Høy | Høy | 🟠 Neste |
| 10: Codebase intelligence | Høy | Høy | 🟡 Senere |
| 11: Dyp Git | Medium | Medium | 🟡 Senere |

---

## Hva gjør TheFold bedre enn Cursor?

| Egenskap | Cursor | TheFold |
|----------|--------|---------|
| Inline code completion | ✅ Kjerne-feature | ❌ Ikke relevant (ikke IDE) |
| Autonom task-utførelse | ❌ Reagerer på bruker | ✅ Kjører selvstendig |
| Persistent hukommelse | ❌ Kun per-sesjon | ✅ Vokser over tid |
| Proaktive forslag | ❌ Venter på input | ✅ Bygd og live |
| Multi-agent | ❌ Én modell | ✅ Sub-agent system |
| Code review | ❌ | ✅ Full review pipeline |
| Task management | ❌ | ✅ Linear + egen task engine |
| Repo-overvåking | ❌ | ✅ Repo-watch (every 30m) |
| Daglig digest | ❌ | ✅ AI-generert norsk sammendrag |
| AI Insights Dashboard | ❌ | ✅ Live oversikt over alt agenten vet |
| Multi-provider AI | Begrenset | ✅ 4 providers, 9+ modeller |
| Sandbox-isolasjon | ❌ | ✅ Docker + filesystem |

TheFold vinner ikke ved å kopiere Cursor. TheFold vinner ved å være den kollegaen du alltid har ønsket deg — en som husker alt, jobber mens du sover, og blir bedre for hver oppgave.

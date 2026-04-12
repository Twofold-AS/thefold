# TheFold — Forbedringsplan v3 FINAL

> 12. april 2026. Siste gjennomgang før implementering.
> Huginn (samarbeid) + Muninn (autonom). Odins ravner.

---

## Del 0: Kritiske funn fra siste audit

### 🔴 Kritisk bug: getSuggestions() kaller endpoint som ikke finnes

Frontend-funksjonen `getSuggestions()` kaller `POST /agent/suggestions` — men dette endpointet FINNES IKKE i noen backend-tjeneste. Dashboard bruker denne aktivt for AI-anbefalinger.

**Fiks:** Opprett `POST /agent/suggestions` (exposed, auth) i agent-tjenesten, eller flytt til AI-tjenesten.

### 🔴 Hele tjenester som mangler i planen

| Tjeneste | Status | I v3-plan? | Handling |
|----------|--------|-----------|---------|
| **Templates** | 4 eksponerte endpoints, full DB, 5 forhåndsseedede maler | ❌ IKKE NEVNT | Må inn i Huginn + Innstillinger |
| **Web (Firecrawl)** | Fungerende scraping, helse-endpoint | ❌ IKKE NEVNT | Eksponeres som verktøy i Huginn |
| **Docs (Context7)** | 2 interne endpoints, brukes av agent | ❌ IKKE NEVNT | Synliggjøres i Hukommelse |
| **Cache** | 7 endpoints, full statistikk | ❌ IKKE NEVNT | Statistikk i System-tab |

### 🔴 Backend-systemer som mangler i planen

| System | Hva det gjør | I v3-plan? | Handling |
|--------|-------------|-----------|---------|
| **Agent Sleep** | Ukentlig konsolidering (parallelt med Dreams), `POST /agent/sleep/run` + `GET /agent/sleep/logs` | ❌ | Slå sammen med Drømmer-konseptet |
| **Proactive Scan** | Automatisk repo-skanning for problemer, cron | ❌ | Inn i Oversikt + Monitor |
| **Daily Digest** | Daglig oppsummering via monitor | ❌ | Inn i Oversikt / varsler |
| **Repo Watch** | Aktiv overvåking av repo-endringer, cron | Delvis (watch-findings) | Fullstendig i Monitor/System |
| **Webhooks** | Register/list/delete for gateway webhooks | ❌ | Inn i Innstillinger → Integrasjoner |
| **Knowledge mgmt** | archive, promote, merge-duplicates, feedback | ❌ | Inn i Hukommelse → Kunnskap-tab |
| **Project orchestrator** | start/status/pause/resume for fleroppgave-prosjekter | ❌ | Inn i Oppgaver → Prosjekter |
| **Security audit** | Login-rapport, suspekt aktivitet | ❌ | Inn i Innstillinger → System |

### 🟡 Frontend API-funksjoner som finnes men ikke er i planen

| Funksjon | Backend-endpoint | Brukes i dag? | I v3-plan? |
|----------|-----------------|--------------|-----------|
| `listAuditLog()` | `POST /agent/audit/list` | Nei | ❌ |
| `getTaskTrace()` | `POST /agent/audit/trace` | Nei | ❌ |
| `getAuditStats()` | `POST /agent/audit/stats` | Ja (dashboard) | Delvis |
| `listDeletedTasks()` | `GET /tasks/deleted/:repo` | Nei | ❌ |
| `restoreTask()` | `POST /tasks/restore` | Nei | ❌ |
| `permanentDeleteTask()` | `POST /tasks/permanent-delete` | Nei | ❌ |
| `syncTaskToLinear()` | `POST /tasks/push-to-linear` | Nei | ❌ |
| `cancelTask()` | `POST /tasks/cancel` | Nei | ❌ |
| `getRepoTree()` | `POST /github/tree` | Nei (intern) | ❌ |
| `getCacheStats()` | `GET /cache/stats` | Nei | ❌ |
| `listTemplates()` | `GET /templates/list` | Nei | ❌ |
| `useTemplateApi()` | `POST /templates/use` | Nei | ❌ |
| `getTemplateCategories()` | `GET /templates/categories` | Nei | ❌ |
| `respondToClarification()` | `POST /agent/respond` | Ja (chat) | ❌ |
| `estimateCost()` | `POST /ai/estimate-cost` | Nei | Delvis (Muninn) |
| `useComponentApi()` | `POST /registry/use-component` | Nei | ❌ |

### 🟡 15 Cron-jobber — kun 7 nevnt i planen

| Cron | Tjeneste | Schedule | I v3-plan? |
|------|----------|----------|-----------|
| cleanup-revoked-tokens | gateway | Daglig | ❌ |
| sandbox-cleanup | sandbox | Hvert 30. min | ✅ |
| weekly-maintenance | registry | Fredag 03:00 | Delvis |
| daily-health-check | monitor | Daglig 03:00 | ✅ |
| repo-watch | monitor | Daglig | ❌ |
| daily-digest | monitor | Daglig | ❌ |
| memory-cleanup | memory | Daglig 04:00 | ✅ |
| memory-decay | memory | Daglig 03:00 | ✅ |
| memory-dream-engine | memory | Søn 03:00 | ✅ |
| check-thefold-tasks | linear | Hvert 5. min | ❌ |
| weekly-sleep | agent | Ukentlig | ❌ |
| cleanup-rate-limits | agent | Daglig 03:00 | ✅ |
| proactive-scan | agent | Daglig | ❌ |
| agent-jobs-cleanup | agent | Daglig | ❌ |
| cache-cleanup | cache | Hver time | ❌ |

### 🟡 DB-tabeller uten lesende endpoints

| Tabell | Tjeneste | Innhold | Bør eksponeres? |
|--------|----------|---------|----------------|
| `sleep_logs` | agent | Sleep-cycle logg | Ja → Drømmer-siden |
| `anomaly_log` | agent | Anomali-deteksjon | Ja → System/sikkerhet |
| `permission_rules` | agent | Regel-baserte tillatelser | Nei (fremtidig) |
| `routing_patterns` | agent | Rutingsmønstre | Nei (fremtidig) |
| `immutable_audit_table` | agent | Uforanderlig revisjon | Ja → Audit-logg |
| `webhooks` | gateway | Webhook-konfig | Ja → Integrasjoner |

---

## Del 1: Oppdatert sidestruktur (7 sider, komplett)

```
1. Oversikt              — statuskort, reviews, aktivitet, drøm, helse, AI-forslag, hurtigstart
2. Huginn                — samarbeidsmodus med templates, web-scraping, repo-kontekst
3. Muninn (BETA)         — autonom med sikkerhetsnivåer, rapport, self-review
4. Oppgaver              — tasks + prosjekter + reviews + papirkurv + prosjekt-orkestrator
5. Drømmer               — drøm-journal + sleep-logs + innsikter + konstellasjoner + motor
6. Hukommelse            — minner + mønstre + skills + kunnskap + kodeindeks + manifester
7. Innstillinger         — profil + AI + integrasjoner + webhooks + MCP + komponenter + templates + system
```

---

## Del 2: Endringer per side vs. v3-OPPDATERT

### Side 1: Oversikt — tillegg

**Nye elementer:**

| Element | API-kall | Begrunnelse |
|---------|----------|-------------|
| Cache-statistikk (treff-rate) | `GET /cache/stats` | Viser systemhelse |
| Proactive scan-resultater | `GET /monitor/watch-findings` | Allerede delvis inne, men koble til proactive-scan |
| Audit stats | `POST /agent/audit/stats` | Suksessrate + feilfordeling |
| Daily digest-oppsummering | `POST /monitor/daily-digest` (trenger eksponering) | Dagens sammendrag |
| Stale jobs-varsel | `POST /agent/jobs/check-stale` | Vis om noen jobber har hengt seg |

**Fiks getSuggestions:**
Opprett `POST /agent/suggestions` i backend. Input: `{repoName?, limit}`. Output: `{suggestions: [{title, description, actionType, actionTarget}]}`. Logikk: basert på ventende tasks, feilmønstre fra memory, monitor-findings, stale jobs.

### Side 2: Huginn — tillegg

**Templates-integrasjon (NY):**
```
┌─ 📋 Bruk mal ────────────────────────────────────── [✕] ──┐
│                                                             │
│  [Alle]  [auth]  [api]  [ui]  [database]  [payment]  [form]│
│                                                             │
│  ┌─ Contact Form ────────────────────────────────────────┐ │
│  │ Kontaktskjema med validering og e-postutsending       │ │
│  │ 3 filer · 2 avhengigheter · brukt 4x                 │ │
│  │ [Bruk mal →]                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ User Auth (OTP) ────────────────────────────────────┐  │
│  │ Komplett OTP-autentisering med Resend                 │  │
│  │ 5 filer · 3 avhengigheter · brukt 2x                 │  │
│  │ [Bruk mal →]                                          │  │
│  └────────────────────────────────────────────────────────┘  │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

Tilgjengelig via Cmd+K → `/mal` eller egen knapp i topplinje.

| Handling | API-kall |
|----------|----------|
| Liste maler | `GET /templates/list` med `{category?}` |
| Bruk mal | `POST /templates/use` med `{templateId, variables}` |
| Kategorier | `GET /templates/categories` |

Når bruker velger "Bruk mal": pre-fyller chat med malbeskrivelse + variabler, agent bruker malfilene som startpunkt.

**Web-scraping verktøy (NY):**

Nytt chat-tool tilgjengelig for agenten:

| Tool | API-kall | Hva den gjør |
|------|----------|-------------|
| `scrape_url` | `POST /web/scrape` | Scraper URL til markdown, brukes som kontekst |

Bruker skriver f.eks: "Se på designet til stripe.com/docs og lag noe lignende" → agent scraper URL → bruker som kontekst.

**Clarification-respons (mangler i v3):**

Når agent stiller spørsmål (status: "waiting", question feltet satt):
```
┌─ ❓ Agent trenger avklaring ──────────────────────────────┐
│                                                            │
│  "Skal toggle-komponenten lagre preferanse i localStorage  │
│   eller bruke en server-side cookie?"                      │
│                                                            │
│  [Svar her...]                          [Send svar]       │
└────────────────────────────────────────────────────────────┘
```

API: `POST /agent/respond` med `{taskId, response}` — allerede implementert, mangler bare i planen.

**Docs-oppslag (NY):**

Nytt chat-tool:

| Tool | API-kall | Hva den gjør |
|------|----------|-------------|
| `lookup_docs` | `POST /docs/lookup` | Slår opp bibliotekdocs via Context7 |

Agent bruker dette automatisk når den trenger docs for et bibliotek den jobber med. Vises som ToolCallCard i chatten.

### Side 3: Muninn — tillegg

**Prosjekt-orkestrator (NY — kritisk manglende):**

Muninn er perfekt for prosjekt-orkestrering. Når bruker gir en stor oppgave:

```
┌─ 🏗️ Prosjekt-modus ──────────────────────────────────────┐
│                                                            │
│  Muninn har dekomponert oppgaven til 5 deloppgaver:       │
│                                                            │
│  Fase 1:                                                   │
│  ✅ #1 Sett opp database-schema (ferdig, 45s, $0.02)     │
│  ⏳ #2 Implementer API-endpoints (bygger, 60%)            │
│                                                            │
│  Fase 2 (venter på fase 1):                               │
│  ○  #3 Frontend-komponenter                               │
│  ○  #4 Integrasjonstester                                 │
│                                                            │
│  Fase 3:                                                   │
│  ○  #5 Dokumentasjon + PR                                 │
│                                                            │
│  Total: 2/5 ferdig · $0.04 brukt · ~3 min gjenstår       │
│                                                            │
│  [⏸ Pause] [▶ Fortsett] [⏹ Avbryt]                      │
└────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Start prosjekt | `POST /agent/project/start` |
| Status | `POST /agent/project/status` |
| Pause | `POST /agent/project/pause` |
| Fortsett | `POST /agent/project/resume` |
| Lagre plan | `POST /agent/project/store` |

Hele prosjekt-orkestratoren eksisterer allerede i backend (`agent/orchestrator.ts`) med faser, avhengigheter, shared sandbox, og aggregert review. Den mangler bare frontend.

### Side 4: Oppgaver — tillegg

**Ny tab: Papirkurv (soft-delete systemet):**

```
[Alle oppgaver]  [Prosjekter]  [Reviews]  [Linear]  [🗑 Papirkurv]
```

```
┌─ 🗑 Slettede oppgaver ────────────────────────────────────┐
│                                                            │
│  Repo: [Alle ▼]                                           │
│                                                            │
│  #43 Test refactor    api-server   slettet 3 dager siden  │
│  [Gjenopprett] [Slett permanent]                          │
│                                                            │
│  #38 Old migration    webapp       slettet 7 dager siden  │
│  [Gjenopprett] [Slett permanent]                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Liste slettede | `GET /tasks/deleted/:repoName` |
| Gjenopprett | `POST /tasks/restore` med `{taskId}` |
| Permanent slett | `POST /tasks/permanent-delete` med `{taskId}` |

**Oppgave-handlinger som mangler:**

| Handling | API-kall | Hvor |
|----------|----------|------|
| Avbryt task | `POST /tasks/cancel` med `{taskId}` | Detalj-panel, ved status in_progress |
| Push til Linear | `POST /tasks/push-to-linear` med `{taskId}` | Detalj-panel, "Sync til Linear" knapp |
| Plan rekkefølge | `POST /tasks/plan-order` med `{taskIds}` | Prosjekter-tab, "AI sortér" knapp |

**Prosjekter-tab — prosjekt-orkestrator:**

Vis aktive prosjekter med faseinndeling:

| Handling | API-kall |
|----------|----------|
| Prosjekt-status | `POST /agent/project/status` |
| Pause prosjekt | `POST /agent/project/pause` |
| Gjenoppta prosjekt | `POST /agent/project/resume` |

### Side 5: Drømmer — tillegg

**Agent Sleep-systemet (slå sammen med Dreams):**

Backend har TO konsolideringssystemer som gjør lignende ting:
1. `memory/dream.ts` — Memory dream engine (søndager 03:00)
2. `agent/sleep.ts` — Agent sleep cycle (ukentlig)

Sleep-systemet gjør:
- Konsoliderer agent-erfaringer
- Lagrer i `sleep_logs` tabell
- Har eget `GET /agent/sleep/logs` endpoint

**Anbefaling:** Vis sleep-logs SAMMEN med dream-journal. De er to aspekter av samme konsept — TheFolds underbevissthet.

```
[Drøm-journal]  [Sleep-logg]  [Innsikter]  [Konstellasjoner]  [Motor]
```

**Sleep-logg tab:**

| Element | API-kall |
|---------|----------|
| Sleep-logg | `GET /agent/sleep/logs` |
| Trigger sleep | `POST /agent/sleep/run` |

### Side 6: Hukommelse — tillegg

**Ny tab: Kunnskap (knowledge management):**

Backend har avansert kunnskaps-system som IKKE er i noen side:

```
[Minner]  [Mønstre]  [Skills]  [Kunnskap]  [Kodeindeks]  [Manifester]
```

**Kunnskap-tab:**

```
┌─ Kunnskap — lærte regler ──────────────────────────────────┐
│                                                            │
│  🔍 [Søk i regler...           ]                          │
│                                                            │
│  Stats: 67 aktive | 12 arkivert | snitt konfidanse: 0.74  │
│                                                            │
│  ┌─ "Bruk alltid strict mode i TypeScript" ──── 0.92 ──┐ │
│  │ Kategori: coding · Kontekst: typescript              │ │
│  │ Brukt: 23x · Hjulpet: 20x · Skadet: 1x              │ │
│  │ Status: aktiv (promoted)                              │ │
│  │ [👍 Hjulpet] [👎 Skadet] [📦 Arkiver]               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ "CSS custom properties for temaing" ────── 0.67 ────┐ │
│  │ ...                                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
│  Vedlikehold:                                              │
│  [🔄 Slå sammen duplikater] [📦 Arkiver gamle] [⬆ Promotér]│
└────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Liste regler | `GET /memory/knowledge/list` |
| Søk | `POST /memory/knowledge/search` med `{query}` |
| Stats | `GET /memory/knowledge/stats` |
| Feedback | `POST /memory/knowledge/feedback` med `{ruleId, helped: bool}` |
| Arkiver | `POST /memory/knowledge/archive` |
| Promotér | `POST /memory/knowledge/promote` |
| Slå sammen | `POST /memory/knowledge/merge-duplicates` |

**Manifester-tab (NY):**

Prosjekt-manifester viser TheFolds forståelse av hvert repo:

```
┌─ Manifester ───────────────────────────────────────────────┐
│                                                            │
│  ┌─ thefold-dev/webapp ──── v3 ── 1247 filer ───────────┐│
│  │                                                        ││
│  │  Sammendrag: "Next.js frontend med Tailwind,           ││
│  │  Encore.ts backend-kall, SSE-streaming..."             ││
│  │                                                        ││
│  │  Tech stack: Next.js, React, TypeScript, Tailwind     ││
│  │  Tjenester: frontend, gateway, chat, ai               ││
│  │  Konvensjoner: "Bruk T.* tokens for alle farger"      ││
│  │  Kjente fallgruver: "SSE reconnect krever manuell..."  ││
│  │                                                        ││
│  │  Avhengighetsgraf: 247 noder, 1834 kanter             ││
│  │  [Se graf →]  [Oppdater manifest 🔄]  [Rediger ✏️]    ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Se manifest | `GET /memory/manifest/view` med `{repoOwner, repoName}` |
| Rediger | `POST /memory/manifest/edit` med `{repoOwner, repoName, ...felter}` |
| Hent graf | `POST /memory/graph/get` med `{repoOwner, repoName}` |
| Oppdater | `POST /memory/manifest/update` med `{repoOwner, repoName}` |

### Side 7: Innstillinger — tillegg

**Integrasjoner-tab — webhooks (NY):**

```
┌─ Webhooks ─────────────────────────────────────────────────┐
│                                                            │
│  [+ Registrer webhook]                                     │
│                                                            │
│  ┌─ task.completed → https://hooks.slack.com/... ────────┐│
│  │ Registrert: 5. apr · Siste kall: 14:23 · Status: 🟢 ││
│  │ [Test] [Slett]                                        ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Registrer | `POST /gateway/webhooks/register` |
| Liste | `GET /gateway/webhooks` |
| Slett | `POST /gateway/webhooks/delete` |

**System-tab — nye elementer:**

```
┌─ Sikkerhet ────────────────────────────────────────────────┐
│                                                            │
│  Login-rapport (siste 24t):                               │
│  Innloggingsforsøk: 3 (0 mislykket)                      │
│  Mistenkte kontoer: 0                                      │
│  Rate limits utløst: 0                                     │
│                                                            │
│  Secrets-status:                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ AnthropicApiKey      🟢 Satt                         │ │
│  │ OpenAIAPIKey         🟢 Satt                         │ │
│  │ GitHubToken          🟢 Satt                         │ │
│  │ FirecrawlApiKey      🔴 Mangler                      │ │
│  │ OpenRouterApiKey     🔴 Mangler                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Audit-logg (siste 50):                                    │
│  [Vis full audit-logg →]                                   │
└────────────────────────────────────────────────────────────┘

┌─ Cache ────────────────────────────────────────────────────┐
│                                                            │
│  Embeddings: 1,247 entries · 89% hit rate · 90d TTL       │
│  Repo-struktur: 3 entries · 94% hit rate · 1h TTL         │
│  AI-planer: 12 entries · 45% hit rate · 24h TTL           │
│  Skills-resolve: 6 entries · 78% hit rate · 5m TTL        │
│                                                            │
│  [Tøm cache]  [Se full statistikk]                        │
└────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Login-rapport | `GET /users/security/login-report` |
| Secrets-status | `GET /gateway/secrets-status` |
| Audit-logg | `POST /agent/audit/list` |
| Audit-trace | `POST /agent/audit/trace` med `{taskId}` |
| Cache-stats | `GET /cache/stats` |
| Tøm cache | `POST /cache/invalidate` (trenger eksponering) |

**Ny tab: Templates (NY):**

```
[Profil]  [AI-modeller]  [Integrasjoner]  [MCP]  [Kompon.]  [Maler]  [System]
```

```
┌─ Maler ────────────────────────────────────────────────────┐
│                                                            │
│  Forhåndsdefinerte kodemaler. Brukes av Huginn under       │
│  oppgaveutføring som startpunkt.                           │
│                                                            │
│  [auth]  [api]  [ui]  [database]  [payment]  [form]      │
│                                                            │
│  ┌─ Contact Form ── ui, form ── 3 filer ── brukt 4x ──┐ │
│  │ Kontaktskjema med validering og e-postutsending      │ │
│  │ Variabler: {{APP_NAME}}, {{EMAIL_TO}}                │ │
│  │ Avhengigheter: react-hook-form, zod                  │ │
│  │ [Forhåndsvis filer]  [Rediger]                       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ User Auth (OTP) ── auth ── 5 filer ── brukt 2x ───┐ │
│  │ ...                                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| Liste | `GET /templates/list` med `{category?}` |
| Hent | `GET /templates/get` med `{templateId}` |
| Bruk | `POST /templates/use` med `{templateId, variables}` |
| Kategorier | `GET /templates/categories` |

---

## Del 3: Komplett liste over nye backend-endpoints

| # | Endpoint | Service | Formål | Prioritet |
|---|----------|---------|--------|-----------|
| 1 | `POST /agent/suggestions` | agent | AI-anbefalinger for dashboard (MANGLER!) | Sprint 1 🔴 |
| 2 | `POST /monitor/trigger` | monitor | Manuell helsesjekk-trigger | Sprint 1 |
| 3 | `POST /skills/update` | skills | Oppdater skill (finnes allerede!) | Sprint 2 |
| 4 | `DELETE /skills/delete` | skills | Slett skill (finnes allerede!) | Sprint 2 |
| 5 | `GET /memory/dream-history` | memory | Drøm-kjøringer med statistikk | Sprint 4 |
| 6 | `GET /memory/code-index-status` | memory | Indekseringsstatus per repo | Sprint 4 |
| 7 | `POST /tasks/archive` | tasks | Bulk-arkiver | Sprint 2 |
| 8 | `GET /agent/circuit-breaker-status` | agent | CB-status | Sprint 6 |
| 9 | Eksponere `POST /cache/invalidate` | cache | Cache-tømming fra UI | Sprint 6 |
| 10 | Eksponere `POST /memory/dream` | memory | Allerede intern, trenger expose: true | Sprint 1 |
| 11 | Eksponere `POST /monitor/daily-digest` | monitor | Digest fra UI | Sprint 6 |

**Merk:** Mange endpunkter som planen nevnte som "nye" finnes allerede i backend (skills update/delete, memory dream, etc.). De trenger bare kobles til frontend.

---

## Del 4: Komplett cron-oversikt for System-tab

| # | Cron | Service | Schedule | Manuell trigger |
|---|------|---------|----------|----------------|
| 1 | daily-health-check | monitor | `0 3 * * *` (05:00 CEST) | `POST /monitor/run-check` |
| 2 | repo-watch | monitor | Daglig | Ny: `POST /monitor/repo-watch` (eksponere) |
| 3 | daily-digest | monitor | Daglig | Ny: `POST /monitor/daily-digest` (eksponere) |
| 4 | memory-dream-engine | memory | `0 3 * * 0` (søn 05:00 CEST) | `POST /memory/dream` (eksponere) |
| 5 | memory-decay | memory | `0 3 * * *` (05:00 CEST) | `POST /memory/decay` ✅ |
| 6 | memory-cleanup | memory | `0 4 * * *` (06:00 CEST) | `POST /memory/cleanup` (eksponere) |
| 7 | weekly-sleep | agent | Ukentlig | `POST /agent/sleep/run` (eksponere) |
| 8 | proactive-scan | agent | Daglig | `POST /agent/proactive-scan/run` (eksponere) |
| 9 | agent-jobs-cleanup | agent | Daglig | `POST /agent/jobs/cleanup` (eksponere) |
| 10 | cleanup-rate-limits | agent | `0 3 * * *` (05:00 CEST) | `POST /agent/cleanup-rate-limits` (eksponere) |
| 11 | cleanup-revoked-tokens | gateway | Daglig | Ingen (automatisk) |
| 12 | sandbox-cleanup | sandbox | Hvert 30. min | `POST /sandbox/cleanup` (eksponere) |
| 13 | weekly-maintenance | registry | Fredag 03:00 | `POST /registry/maintenance/run` ✅ |
| 14 | check-thefold-tasks | linear | Hvert 5. min | `POST /tasks/sync-linear` ✅ |
| 15 | cache-cleanup | cache | Hver time | `POST /cache/cleanup` (eksponere) |

---

## Del 5: Oppdatert sprint-plan

### Sprint 1 — Kritiske bugs + manglende endpoint (~8t)
- ✅ Fiks review dobbelt-klikk
- ✅ Fiks notifications rå JSON
- ✅ Fiks skills appliesTo
- ✅ Fiks cron-jobs + `POST /monitor/trigger`
- ✅ Fiks zombie jobs
- ✅ Fiks import-graf cycles
- ✅ Fiks AI retry backoff
- 🆕 Opprett `POST /agent/suggestions` (manglende endpoint!)
- 🆕 Eksponere `POST /memory/dream` (for manuell trigger)

### Sprint 2 — Sidestruktur (~13t)
- Ny sidebar med 7 items (Oversikt, Huginn, Muninn, Oppgaver, Drømmer, Hukommelse, Innstillinger)
- Oversikt med alle widgets + hurtigstart + cache-stats + daily-digest
- Oppgaver med 5 tabs (alle, prosjekter, reviews, linear, papirkurv)
- Innstillinger med 7 tabs (profil, AI, integrasjoner/webhooks, MCP, komponenter, maler, system)
- System-tab med alle 15 crons + sikkerhet + cache + audit-logg
- Hukommelse med 6 tabs (minner, mønstre, skills, kunnskap, kodeindeks, manifester)

### Sprint 3 — Huginn (~16t)
- Alt fra v3-OPPDATERT + templates-integrasjon + web-scraping tool
- Clarification-respons UI (`POST /agent/respond`)
- Docs-oppslag tool (`POST /docs/lookup`)
- Alle 32 bevarede funksjoner

### Sprint 4 — Drømmer + Hukommelse (~11t)
- Drømmer med 5 tabs (journal, sleep-logg, innsikter, konstellasjoner, motor)
- Sleep-logs integrert med dreams
- Knowledge management (archive, promote, merge, feedback)
- Manifester-tab med avhengighetsgraf
- Dream history endpoint

### Sprint 5 — Muninn BETA (~12t)
- Alt fra v3-OPPDATERT
- Prosjekt-orkestrator UI (start/status/pause/resume)
- Fler-oppgave dekomponering med fasevisning
- Shared sandbox-visning

### Sprint 6 — Polish (~8t)
- Chain-of-thought, nye tools, a11y
- Circuit breaker status
- Cache management UI
- Responsivt design
- Error boundaries

**Total: ~68 timer (9-10 arbeidsdager)**

---

## Del 6: Komplett diff vs. v3-OPPDATERT

### Lagt til i denne versjonen

| # | Endring | Begrunnelse |
|---|---------|-------------|
| 1 | `POST /agent/suggestions` mangler i backend — kritisk bug | Dashboard AI-forslag kaller dette men det finnes ikke |
| 2 | Templates-tjeneste inn i Huginn + Innstillinger | Helt tjeneste som ikke var i planen |
| 3 | Web-scraping som chat-tool i Huginn | Firecrawl-tjeneste eksisterer men var usynlig |
| 4 | Docs-oppslag som chat-tool i Huginn | Context7-tjeneste eksisterer men var usynlig |
| 5 | Agent Sleep slått sammen med Drømmer | To parallelle konsoliderings-systemer bør vises sammen |
| 6 | Prosjekt-orkestrator i Muninn | Hel orkestrerings-motor som ikke var i planen |
| 7 | Papirkurv-tab i Oppgaver | Soft-delete + restore + permanent-delete eksisterer |
| 8 | Push-til-Linear i Oppgaver | Toveis sync finnes men var enveis i planen |
| 9 | Cancel-task i Oppgaver | Endpoint finnes men var ikke i planen |
| 10 | Kunnskap-tab i Hukommelse | 7 knowledge-endpoints uten UI |
| 11 | Manifester-tab i Hukommelse | Prosjekt-manifester + avhengighetsgrafer uten UI |
| 12 | Webhooks i Innstillinger | Gateway webhook-system uten UI |
| 13 | Secrets-status i System | Viser hvilke API-nøkler som er konfigurert |
| 14 | Audit-logg i System | Full audit-trail uten UI |
| 15 | Cache-statistikk i System | Cache-tjeneste uten UI |
| 16 | Templates-tab i Innstillinger | Template-bibliotek uten UI |
| 17 | Alle 15 cron-jobber i System | Kun 7 av 15 var nevnt |
| 18 | Clarification-respons i Huginn | respondToClarification() finnes men var ikke i plan |
| 19 | AI plan-order i Oppgaver | AI-sortering av oppgaverekkefølge |
| 20 | Proactive scan + daily digest i Oversikt | To cron-systemer uten synlighet |

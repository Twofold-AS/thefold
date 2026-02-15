# TheFold — Fase 4: Omstrukturering & Nye Systemer

> **Versjon:** 4.0
> **Dato:** 14. februar 2026
> **Status:** Plan — erstatter gammel Fase 4 (MCP & Advanced Features)
> **Forutsetning:** Fase 1-3 er KOMPLETT (204+ tester, 127+ features, 9 tjenester)

---

## Hvorfor denne omstruktureringen?

TheFold har hjerne, øyne, hukommelse og kvalitetskontroll — men **ingen hender**. I tillegg er dashboardet bygget med for mange knapper som aldri ble implementert, Settings blander profil med AI-config, og Linear er hardkodet som eneste task-kilde.

Denne planen fikser alt dette i én sammenhengende omstrukturering.

### Kjerneendringer:
1. **Builder Service** — TheFold sine hender (fil-for-fil kodebygging)
2. **Tools-system** — Samlingsplass for alle verktøy TheFold bruker
3. **Task Engine** — TheFold sin egen task-manager med Linear som integrasjon
4. **Repo-sidebar redesign** — Kun relevante knapper
5. **Settings redesign** — Profil, debug, preferanser (ikke AI-config)
6. **Marketplace + Healing** — Tasks som nervesystem mellom komponenter og repos

---

## Navigasjonsstruktur: Før vs. Etter

### SIDEBAR — Før (nåværende)

```
TOP NAV:
  Home
  Environments
  Skills
  Review
  Settings (profil + AI-modeller + integrasjoner)
  Settings/Security
  Chat

REPO (når valgt):
  Repo Nav:
    Overview, Deploys, Infra, Code, Flow, Configuration, Chat
  Observability:
    Metrics, Cost, Memory, Tasks
```

**Problemer:** 11 repo-knapper der 8 er "Coming soon". Settings blander profil med AI. Memory og Tasks er gjemt under repo. Ingen Tools-konsept.

### SIDEBAR — Etter (ny)

```
TOP NAV:
  Home                    — Dashboard, stats, recent activity
  Environments            — Alle repos
  Chat                    — Hovedchat (cross-repo)
  Skills                  — Skills management (instruksjoner til AI)
  Tools                   — [NY] Alle verktøy TheFold bruker
  Review                  — PRs som venter godkjenning
  Settings                — [REDESIGNET] Profil, debug, preferanser

REPO (når valgt):
  Overview                — Helse, siste aktivitet, aktive tasks, siste PRs
  Chat                    — Repo-spesifikk chat
  Tasks                   — [NY] Egen task-manager med labels, Linear-synk
  Reviews                 — PRs for dette repoet
  Activity                — [NY] Tidslinje over alt TheFold har gjort
```

**Fjernet fra repo:** Deploys, Infra, Code, Flow, Configuration, Metrics, Cost, Memory (7 sider som aldri fungerte → erstattet av Activity + flyttet til Tools)

---

## Tools-systemet (`/tools`)

### Konsept

Tools er en samlingsplass for **alt TheFold bruker som verktøy**. Horisontal meny øverst der du velger kategori, innholdet under endres basert på valg.

### Layout

```
/tools
┌─────────────────────────────────────────────────────┐
│  [AI Models]  [Builder]  [Tasks]  [Memory]  [MCP]   │
│  [Observability]  [Secrets]                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  (Innhold basert på valgt kategori)                  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Kategorier

#### 1. AI Models (`/tools/ai-models`)
**Flyttes fra:** `/settings` (modellstrategi-seksjonen)
**Innhold:**
- Liste over alle tilgjengelige modeller (Claude, GPT, Moonshot)
- Enable/disable per modell
- Auto vs. manuell modus
- Kostnad per modell (input/output per 1M tokens)
- Provider-status (tilkoblet/frakoblet)
- API-nøkkel status (konfigurert/mangler)

**Fjernet:** "Best for"-badges og andre unødvendige dekorasjoner. Ren, funksjonell liste.

#### 2. Builder (`/tools/builder`)
**Helt nytt.** Se [Builder Service](#builder-service) under.
**Innhold:**
- Builder-status (aktiv/inaktiv)
- Konfigurasjon: max iterasjoner, sandbox-timeout, build strategy (sequential/scaffold_first/dependency_order)
- CLI-tilkobling: sist tilkoblet, tilkoblingshistorikk, sikkerhetsinfo
- Pågående byggejobber med live progress
- Byggehistorikk

#### 3. Tasks (`/tools/tasks`)
**Helt nytt.** Se [Task Engine](#task-engine) under.
**Innhold:**
- Globalt task-overblikk (alle repos)
- Task-kilder: manuelt opprettet, Linear-synk, auto-generert (healing)
- Linear-integrasjon: tilkoblingsstatus, synkroniseringsknapp, label-filter
- Task-statistikk

#### 4. Memory (`/tools/memory`)
**Flyttes fra:** `/repo/[name]/memory`
**Innhold:**
- Global memory-oversikt (alle repos)
- Repo-filter dropdown
- Søk, decay-visualisering, lagre minner (som før)
- Memory-statistikk: totalt, per type, per repo

#### 5. MCP (`/tools/mcp`)
**Erstatter:** Gammel `/integrations` som aldri ble bygget
**Innhold:**
- Installerte MCP-servere med status
- Tilgjengelige MCP-servere (browse/installer)
- Konfigurasjon per MCP
- Bruksstatistikk

#### 6. Observability (`/tools/observability`)
**Samler:** Det som var Metrics + Cost + Monitor
**Innhold:**
- Helse-dashboard: alle repos med status (pass/warn/fail)
- Kostnads-dashboard: token-forbruk per modell, per repo, per dag
- Feil-oversikt: siste feil, hyppigste feil, trender
- Alerting-konfigurasjon (fremtidig)

#### 7. Secrets (`/tools/secrets`)
**Flyttes fra:** `/secrets` (som var hardkodet)
**Innhold:**
- API-nøkler status (konfigurert/mangler) — IKKE vis nøklene, kun status
- Instruksjoner for å sette secrets via Encore
- Hvilke tjenester som trenger hvilke secrets

---

## Settings Redesign (`/settings`)

### Før (nåværende)
- Profil (navn, avatar)
- Modellstrategi (auto/manuell, modellvalg) ← **flyttes til Tools**
- Integrasjoner ← **flyttes til Tools**
- `/settings/security` — Audit log

### Etter (ny)

```
/settings
├── Profile              — Navn, avatar, e-post
├── Preferences          — Tema (dark/light), språk, notifikasjoner
├── Debug                — [NY] Logs, feilsøking, system-info
└── Security             — Audit log, sessions, login-historikk (som før)
```

**Debug-seksjonen:**
- System-status: alle Encore-tjenester med status
- Siste feil fra agent-loopen
- Cache-statistikk (hit rate, størrelse)
- Database-status
- Versjonsinformasjon

---

## Task Engine

### Konsept

TheFold får sin egen task-manager. Tasks er **nervesystemet** som kobler alt sammen: brukerens arbeid, Linear-synk, og auto-genererte healing-tasks fra marketplace.

### Task-kilder

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Manuell    │     │  Linear.app  │     │   Healing    │
│  (dashboard) │     │   (synk)     │     │  (auto)      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────┬───────┘────────────────────┘
                    ▼
            ┌──────────────┐
            │  Task Engine │
            │  (TheFold)   │
            └──────┬───────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │ Repo A │ │ Repo B │ │ Repo C │
    └────────┘ └────────┘ └────────┘
```

### Database: `tasks` (ny service eller utvidelse av agent)

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identifikasjon
  title TEXT NOT NULL,
  description TEXT,
  repo TEXT,                                -- Kan være NULL for cross-repo tasks
  
  -- Status
  status TEXT DEFAULT 'backlog',            -- backlog, planned, in_progress, in_review, done, blocked
  priority INT DEFAULT 3,                   -- 1=urgent, 2=high, 3=normal, 4=low
  
  -- Organisering  
  labels TEXT[] DEFAULT '{}',
  phase TEXT,                               -- Hvilken fase av et prosjekt
  depends_on UUID[] DEFAULT '{}',           -- Task-avhengigheter
  
  -- Kilde
  source TEXT DEFAULT 'manual',             -- manual, linear, healing, marketplace
  linear_task_id TEXT,                      -- Kobling til Linear (NULL for manuelle)
  linear_synced_at TIMESTAMPTZ,
  healing_source_id UUID,                   -- Kobling til marketplace-komponent som trigget healing
  
  -- Planlegging (TheFold sin prioritering)
  estimated_complexity INT,                 -- 1-5, satt av AI
  estimated_tokens INT,
  planned_order INT,                        -- TheFold sin foreslåtte rekkefølge
  
  -- Utførelse
  assigned_to TEXT DEFAULT 'thefold',       -- thefold, human, pending
  build_job_id UUID,                        -- Kobling til builder_jobs
  pr_url TEXT,
  review_id UUID,                           -- Kobling til code_reviews
  
  -- Metadata
  created_by TEXT,                          -- user_id eller 'system'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_repo ON tasks(repo);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_source ON tasks(source);
CREATE INDEX idx_tasks_linear ON tasks(linear_task_id);
```

### Linear-synk

**Ikke en AI-jobb, ren kode:**
- Synkroniseringsknapp i `/tools/tasks` → henter tasks fra Linear med spesifikke labels
- Oppretter/oppdaterer tasks i TheFold sin database
- Toveis: TheFold pusher status tilbake til Linear (som i dag)
- Kan konfigureres med hvilke labels som synkes

### Task-planlegging (TheFold sin intelligens)

TheFold analyserer alle tasks og foreslår rekkefølge basert på:
1. **Avhengigheter** (depends_on)
2. **Grunnmur først** — types → lib → features → tests
3. **Kompleksitet** — enkle oppgaver først for momentum
4. **Healing-prioritet** — sikkerhetsfeil > bugs > oppgraderinger

Frontend i `/repo/[name]/tasks`:
- Opprett tasks med tittel, beskrivelse, labels, prioritet
- Se TheFold sin foreslåtte rekkefølge
- Hent fra Linear med label-filter
- Drag-and-drop omorganisering
- Status-kolonner (Kanban-stil)

### Healing via Tasks

Når marketplace oppdager at en komponent er oppdatert:
1. Finn alle repos som bruker komponenten
2. Opprett tasks med `source: 'healing'` for hvert repo
3. TheFold prioriterer healing-tasks basert på alvorlighet
4. Builder utfører oppgraderingen
5. Review-gate for godkjenning

---

## Builder Service

Se `BUILDER-SERVICE-ARKITEKTUR.md` for full teknisk design.

### Integrasjon med Tools

Under `/tools/builder`:
- **Status:** Aktiv/inaktiv, pågående jobber
- **Konfigurasjon:**
  - Max iterasjoner (default: 10)
  - Sandbox timeout (default: 120s)
  - Build strategy: sequential / scaffold_first / dependency_order
  - Fil-for-fil vs. batch mode
- **CLI-tilkobling:**
  - Status: "Sist tilkoblet: aldri" / "Sist tilkoblet: 5 min siden"
  - Tilkoblingshistorikk
  - Sikkerhetsinfo: token-basert auth, OWASP ASI03-kompatibel
  - Instruksjoner for å installere TheFold CLI
- **Byggehistorikk:** Siste jobber med status, filer, kostnader

### CLI (fremtidig)

TheFold CLI bruker samme backend-infrastruktur:
- Autentiserer med HMAC-token mot gateway
- Sender oppgaver til builder-service
- Mottar progress via SSE/WebSocket
- Sandbox kjører lokalt eller remote (konfigurerbart)

**Sikkerhet (OWASP):**
- CLI-tokens er kortlevde (1 time, fornybar)
- Kun builder-service tilgjengelig via CLI (ikke admin-endepunkter)
- Alle CLI-handlinger logges i audit
- IP-whitelist konfigurerbar

---

## Repo-sidebar Redesign

### Ny struktur

```
[Repo: thefold]  ▾

  Overview        — Helse, siste aktivitet, aktive tasks, siste PRs
  Chat            — Snakk med TheFold om dette repoet
  Tasks           — Task-manager med labels, Linear-synk, healing
  Reviews         — PRs som venter godkjenning (filtrert fra global)
  Activity        — Tidslinje: commits, PRs, builds, healing-events
```

### Hva som fjernes og hvorfor

| Fjernes | Grunn | Erstattes av |
|---------|-------|--------------|
| Deploys | Aldri implementert, CI/CD-ansvar | Activity-tidslinjen |
| Infra | Aldri implementert, for vagt | Tools → Observability |
| Code | GitHub er bedre for kode-browsing | Overview viser filstruktur |
| Flow | Aldri implementert | Activity-tidslinjen |
| Configuration | Aldri implementert | Tools-nivå konfig |
| Metrics | Aldri implementert | Tools → Observability |
| Cost | Aldri implementert | Tools → Observability |
| Memory | Flyttes til Tools | Tools → Memory (med repo-filter) |

### Activity-siden (`/repo/[name]/activity`)

Tidslinje som viser alt TheFold har gjort for dette repoet:

```
┌─ 14. feb 2026 ────────────────────────────────┐
│ 🔧 15:32  Builder: Opprettet auth-service      │
│            3 filer, 2 iterasjoner, $0.12        │
│ ✅ 15:28  Review: PR #42 godkjent              │
│ 🔄 14:15  Healing: Oppdatert zod v3.24 → v3.25│
│ 📋 13:00  Task: "Implementer login" startet    │
│ 🔍 12:45  Linear-synk: 3 nye tasks importert   │
└─────────────────────────────────────────────────┘
```

---

## Implementeringsplan — Rekkefølge

### Steg 4.1: Task Engine (Backend) — 4-5 timer
**Prioritet: HØYEST** — Tasks er nervesystemet

1. Database-migrering: `tasks`-tabell
2. Tasks-service med CRUD-endepunkter
3. Linear-synk: ren kode, synkroniseringsknapp (ikke AI)
4. Task-planlegging: AI vurderer rekkefølge basert på avhengigheter
5. Tester

### Steg 4.2: Builder Service (Backend) — 6-8 timer
**Prioritet: HØYEST** — TheFold sine hender

Se `BUILDER-SERVICE-ARKITEKTUR.md` og `BUILDER-SERVICE-PROMPT.md`

1. Database-migrering: `builder_jobs` + `build_steps`
2. Builder-service med faser: init → scaffold → deps → implement → integrate → finalize
3. Fil-for-fil generering med kontekst-vindu
4. Dependency graph og topologisk sortering
5. Nytt AI-endepunkt: `ai.generateFile`
6. Oppdater agent-loop (STEP 6 → builder.start)
7. Pub/Sub for progress
8. Tester

### Steg 4.3: Tools Frontend — 4-5 timer
**Prioritet: HØY**

1. `/tools` layout med horisontal meny
2. AI Models-kategori (flytt fra settings)
3. Builder-kategori med konfigurasjon og status
4. Tasks-kategori med global oversikt
5. Memory-kategori (flytt fra repo, legg til repo-filter)
6. MCP-kategori (grunnleggende)
7. Observability-kategori (grunnleggende)
8. Secrets-kategori (nøkkelstatus)

### Steg 4.4: Settings Redesign — 2 timer
**Prioritet: MEDIUM**

1. Fjern modellstrategi fra settings
2. Legg til Debug-seksjon
3. Rydd opp Preferences
4. Behold Security som er

### Steg 4.5: Repo-sidebar Redesign — 3-4 timer
**Prioritet: MEDIUM**

1. Ny sidebar-struktur: Overview, Chat, Tasks, Reviews, Activity
2. Fjern alle "Coming soon"-sider
3. Tasks-side med opprett, labels, Linear-synk, Kanban
4. Reviews-side (filtrert fra global /review)
5. Activity-tidslinje

### Steg 4.6: Marketplace + Healing Grunnmur — 4-5 timer
**Prioritet: MEDIUM-LAV** (kan vente, men tasks er klare)

1. Component registry: database for komponenter
2. Auto-ekstraher komponenter fra ferdigbygget kode
3. Healing-pipeline: komponent oppdatert → finn berørte repos → opprett tasks
4. Healing-tasks vises i repo Tasks med `source: 'healing'`

---

## Oppdatert Backend-arkitektur

```
thefold/
├── gateway/     → Auth (Bearer token med HMAC-signatur)
├── users/       → OTP-basert auth, profiler, preferences
├── chat/        → Meldingshistorikk (PostgreSQL)
├── ai/          → Multi-AI orkestering (Claude, GPT-4o, Moonshot)
├── agent/       → Den autonome hjernen - koordinerer hele flyten
├── builder/     → [NY] TheFold sine hender - fil-for-fil kodebygging
├── tasks/       → [NY] Egen task-manager med Linear-synk og healing
├── github/      → Leser/skriver kode via GitHub API
├── sandbox/     → Isolert kodevalidering med sikkerhet
├── linear/      → [ENDRET] Synk-kilde, ikke lenger primær task-manager
├── memory/      → pgvector semantic search
├── docs/        → Context7 MCP for oppdatert dokumentasjon
├── cache/       → PostgreSQL caching
├── skills/      → Dynamiske instruksjoner for AI
├── monitor/     → Health checks (brukes av Tools → Observability)
├── mcp/         → [NY] MCP server management
└── registry/    → [NY] Component marketplace + healing
```

### Oppdatert Frontend-struktur

```
Sider:
├── /login                    → OTP-basert innlogging
├── /home                     → Oversikt, stats, recent activity
├── /chat                     → Hovedchat (cross-repo)
├── /environments             → Alle repoer
├── /skills                   → Skills management
├── /tools                    → [NY] Verktøysamling
│   ├── /tools/ai-models      → AI-modeller (flytt fra settings)
│   ├── /tools/builder        → Builder-konfig, status, CLI
│   ├── /tools/tasks          → Global task-oversikt, Linear-synk
│   ├── /tools/memory         → Memory med repo-filter (flytt fra repo)
│   ├── /tools/mcp            → MCP-servere
│   ├── /tools/observability  → Helse, kostnader, feil
│   └── /tools/secrets        → API-nøkkel status
├── /review                   → Global review-liste
├── /settings                 → [REDESIGNET]
│   ├── /settings/profile     → Profil
│   ├── /settings/preferences → Tema, språk
│   ├── /settings/debug       → [NY] System-status, logs
│   └── /settings/security    → Audit, sessions
└── /repo/[name]/             → [REDESIGNET]
    ├── /overview             → Helse, aktivitet, tasks, PRs
    ├── /chat                 → Repo-spesifikk chat
    ├── /tasks                → [NY] Task-manager per repo
    ├── /reviews              → PRs for dette repoet
    └── /activity             → [NY] Tidslinje
```

### Sider som FJERNES

| Side | Status | Grunn |
|------|--------|-------|
| `/repo/[name]/deploys` | 🟡 Coming soon | Erstattes av Activity |
| `/repo/[name]/infra` | 🟡 Coming soon | Erstattes av Tools → Observability |
| `/repo/[name]/code` | 🟡 Coming soon | GitHub er bedre |
| `/repo/[name]/flow` | 🟡 Coming soon | Erstattes av Activity |
| `/repo/[name]/configuration` | 🟡 Coming soon | Flyttes til Tools |
| `/repo/[name]/metrics` | 🟡 Coming soon | Flyttes til Tools → Observability |
| `/repo/[name]/cost` | 🟡 Coming soon | Flyttes til Tools → Observability |
| `/repo/[name]/memory` | 🟢 Fungerer | Flyttes til Tools → Memory |
| `/secrets` | 🟡 Hardkodet | Flyttes til Tools → Secrets |

---

## Service-avhengigheter (oppdatert)

```
chat → ai, memory, agent (via pub/sub)
agent → ai, builder, tasks, github, linear, memory, sandbox, users
builder → ai, sandbox, github, memory, skills, cache
tasks → linear (synk), registry (healing)
registry → tasks (oppretter healing-tasks), memory (komponent-patterns)
ai → skills (for prompt enrichment)
memory → cache (for embedding caching)
github → cache (for repo structure caching)
monitor → sandbox (for running checks)
mcp → agent (tool routing)
```

---

## Success Metrics for Fase 4

**Fase 4 er ferdig når:**
- [ ] Builder kan bygge en enkel task fil-for-fil med validering
- [ ] Tasks kan opprettes manuelt og synkes fra Linear
- [ ] Tools-siden viser alle verktøy med horisontal meny
- [ ] Repo-sidebar har kun relevante knapper (5 i stedet for 12)
- [ ] Settings inneholder kun profil/debug/preferanser
- [ ] AI-modeller konfigureres under Tools, ikke Settings
- [ ] Memory er tilgjengelig under Tools med repo-filter
- [ ] Activity-tidslinjen viser hva TheFold har gjort per repo

**Fremtidige mål (Fase 5):**
- [ ] Marketplace inneholder 10+ komponenter
- [ ] Healing auto-genererer tasks når komponenter oppdateres
- [ ] CLI kan tilkobles og autentiseres sikkert
- [ ] TheFold kan bygge et helt prosjekt fra scratch via chat

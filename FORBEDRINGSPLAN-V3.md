# TheFold — Forbedringsplan v3: Komplett sidedesign

> 12. april 2026. Hver side, hver knapp, hvert API-kall. Drømmer som eget konsept.

---

## Del 1: Navnevalg

### Samarbeidsmodus — 4 alternativer

| Navn | Opphav | Betydning | Hvorfor det passer |
|------|--------|-----------|-------------------|
| **Fylgja** | Norrønt | Skytsånd som følger deg gjennom livet | Jobber *med* deg, aldri alene |
| **Socius** | Latin | Kompanjong, alliert | Opprinnelsen til "sosial" — to mot samme mål |
| **Huginn** | Norrønt | Odins ene ravn — betyr "tanke" | Flyr ut, samler info, rapporterer tilbake til deg |
| **Comes** | Latin | Reisefølge, ledsager | Opprinnelsen til "komité" og "comte" — en som går veien med deg |

### Autonom modus — 4 alternativer

| Navn | Opphav | Betydning | Hvorfor det passer |
|------|--------|-----------|-------------------|
| **Norn** | Norrønt | De tre skjebneveverne (Urd, Verdandi, Skuld) | Spinner tråden uten innblanding |
| **Daemon** | Gresk | Mellomvesen som handler selvstendig | I IT: bakgrunnsprosess uten brukerinteraksjon |
| **Muninn** | Norrønt | Odins andre ravn — betyr "minne/hukommelse" | Flyr ut *alene*, returnerer med kunnskap |
| **Autark** | Gresk | Selvstyrende, selvtilstrekkelig | Roten til "autarki" — fullstendig selvstendig |

### Anbefaling

**Huginn + Muninn** er den sterkeste kombinasjonen. De er et par fra samme myte, de utfyller hverandre, og betydningene er perfekte: Huginn (tanke = samarbeid, dialog) og Muninn (minne = autonom, selvstendig). Odin sender begge ut hver morgen — Huginn for å tenke sammen med verden, Muninn for å hente kunnskap alene. Odin frykter mer å miste Muninn enn Huginn — fordi uten minne er alt tapt. Det binder også direkte til TheFolds drømmesystem (Muninn = memory = dreams).

Alternativt: Fylgja + Norn (ren norrøn, kjente begreper). Eller Comes + Autark (ren gresk/latin, tydelig i moderne språk).

---

## Del 2: Sidestruktur (13 → 7 sider)

```
1. Oversikt              — actionable dashboard
2. [Huginn/Fylgja]       — samarbeidsmodus (erstatter Chat)
3. [Muninn/Norn]         — autonom modus (BETA)
4. Oppgaver              — tasks + projects sammenslått
5. Drømmer               — EGET KONSEPT: drøm-journal + innsikter + meta-kunnskap
6. Hukommelse            — minner + mønstre + skills + kodeindeks
7. Innstillinger         — profil + AI-modeller + integrasjoner + MCP + komponenter + system
```

### Hvorfor Drømmer er egen side

Drømmemotoren er TheFolds unike differensiator. Ingen annen AI-agent har dette:
- Ukentlig konsolidering av all kunnskap via 5-fase pipeline
- Klyngeanalyse som finner mønstre på tvers av prosjekter
- Meta-innsikter som krysskobler drømmer
- Temporal decay som lar viktige minner leve og uviktige dø
- Pinned-minner som aldri forglemmes

Dette fortjener sin egen plass i navigasjonen — ikke gjemt i en tab under "Hukommelse". Drømmene er TheFolds bevissthet.

### Absorberingstabell

| Nåværende side | Flyttes til | Begrunnelse |
|----------------|-------------|-------------|
| Chat | Huginn | Erstattes av samarbeidsmodus |
| Tasks | Oppgaver | Beholder, utvides med Projects |
| Projects | Oppgaver | Prosjekter = grupperte tasks, én tab |
| Memory | Hukommelse | Kjernen, men drømmer skilles ut |
| Knowledge | Hukommelse | Søk, mønstre, kodeindeks |
| Skills | Hukommelse | Skills er del av "hjernen" |
| AI (modeller) | Innstillinger | Konfigurasjon |
| Integrasjoner | Innstillinger | Konfigurasjon |
| MCP | Innstillinger | Konfigurasjon |
| Komponenter | Innstillinger | Registry + healing |
| Monitor | Oversikt | Widget på dashboard |
| Sandbox | Fjernes | Intern infrastruktur |
| Innstillinger | Innstillinger | Beholder, utvides |

---

## Del 3: Side 1 — Oversikt

### Formål
Vise hva som trenger oppmerksomhet AKKURAT NÅ. Ingen dekorasjon, bare handlingsbar data.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│  Oversikt                                          [▼ Repo]   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─ Aktive ──┐ ┌─ Review ───┐ ┌─ Siste PR ──┐ ┌─ Kostnad ──┐│
│  │  3        │ │  2 ⚡      │ │ feat/auth   │ │  $1.24     ││
│  │  oppgaver │ │  venter    │ │ 14 min ago  │ │  ↓12% uke  ││
│  └───────────┘ └────────────┘ └─────────────┘ └────────────┘│
│                                                                │
│  ┌─ Venter på deg ──────────────────────────────────────────┐ │
│  │ ⚡ Dark mode toggle      7.8/10   [Godkjenn] [Avvis]     │ │
│  │ ⚡ API rate limiter      8.2/10   [Godkjenn] [Avvis]     │ │
│  │                                                           │ │
│  │ Ingen flere ventende reviews                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─ Siste aktivitet ───────┐ ┌─ Repo-helse ────────────────┐ │
│  │ 14:23  PR opprettet     │ │ webapp     ██████████ 9/10  │ │
│  │ 14:20  Review godkjent  │ │ api-server ████████░░ 7/10  │ │
│  │ 13:45  Task startet     │ │ mobile     █████░░░░░ 5/10  │ │
│  │ 12:10  Linear synced    │ │                              │ │
│  │ 11:30  Drøm fullført    │ │ Siste sjekk: i dag 05:00   │ │
│  └──────────────────────────┘ └──────────────────────────────┘ │
│                                                                │
│  ┌─ Siste drøm ────────────────────────────────────────────┐  │
│  │ 🌙 Søn 05:00 — "Fant 3 mønstre på tvers: auth-feil     │  │
│  │    gjentar seg i 4 repos. Anbefaler felles middleware."  │  │
│  │    Klynger: 5 | Slått sammen: 12 | Meta-innsikter: 2    │  │
│  │    [Se full drøm →]                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ AI-anbefalinger ───────────────────────────────────────┐  │
│  │ 💡 "3 tasks har lignende feilmønster — vurder           │  │
│  │    konsolidering" [Vis tasks →]                          │  │
│  │ 💡 "ESLint-warnings økt 40% siste uke i webapp"         │  │
│  │    [Kjør monitor →]                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Datahenting (Backend → Frontend)

**Rad 1: Statuskort (4 stk)**

| Kort | API-kall | Felt brukt | Oppdatering |
|------|----------|------------|-------------|
| Aktive oppgaver | `GET /tasks/stats` | `byStatus.in_progress` | Hvert 30. sek |
| Venter på review | `GET /agent/review/list?status=pending` | `reviews.length` | Hvert 30. sek |
| Siste PR | `GET /tasks/list?status=done&limit=1` | `outputPrUrl`, `updatedAt` | Hvert 60. sek |
| Kostnad denne uken | `GET /ai/cost-summary` | `weeklyTotal`, `previousWeekTotal` | Hvert 5. min |

Klikk-handling:
- "Aktive oppgaver" → navigerer til `/oppgaver?status=in_progress`
- "Venter på review" → scroller ned til review-listen
- "Siste PR" → åpner PR-link i ny fane
- "Kostnad" → navigerer til `/innstillinger?tab=ai`

**Seksjon: Venter på deg**

| Felt | API-kall | Detaljer |
|------|----------|---------|
| Review-liste | `GET /agent/review/list?status=pending` | Returnerer `id, taskId, taskTitle, qualityScore, filesChanged, createdAt` |
| Godkjenn | `POST /agent/review/approve` med `{reviewId}` | Oppretter PR via GitHub, oppdaterer Linear, lagrer minner |
| Avvis | `POST /agent/review/reject` med `{reviewId, reason}` | Destroyer sandbox, logger i audit |

Knapper:
- **[Godkjenn]** — grønn knapp, bekreftelses-dialog: "Godkjenn og opprett PR?" med filantall
- **[Avvis]** — rød knapp, åpner textarea for begrunnelse, bekreftelses-dialog
- **[Endringer]** — gul knapp (vises ved hover), åpner feedback-textarea
- Kvalitetsscore vises som farget badge: grønn ≥8, gul ≥6, rød <6

**Seksjon: Siste aktivitet**

| Felt | API-kall | Detaljer |
|------|----------|---------|
| Tidslinje | `GET /tasks/list?limit=10&sort=updatedAt` | Mapper status-endringer til hendelser |
| + review events | `GET /agent/review/list?limit=5` | Godkjenninger, avvisninger |
| + agent jobs | `GET /agent/jobs?limit=5` | Start/stopp/feil-hendelser |

Visning: Vertikal tidslinje med fargede prikker (grønn = done, blå = in_progress, rød = failed, gul = pending_review).

**Seksjon: Repo-helse**

| Felt | API-kall | Detaljer |
|------|----------|---------|
| Helsesjekker | `GET /monitor/health` | Per repo: `checks[]` med type, status, detail |
| Samlet score | Beregnet frontend | (pass*10 + warn*5) / (totalChecks*10) |
| Kjør sjekk | `POST /monitor/check` med `{repo}` | Manuell trigger |

Knapper:
- **[Kjør sjekk]** — ikon-knapp (refresh) ved hver repo, spinner under kjøring
- **[Se alle →]** — lenke til full monitor-historikk (modal eller expandert view)

**Seksjon: Siste drøm**

| Felt | API-kall | Detaljer |
|------|----------|---------|
| Siste drøm-resultat | `GET /memory/stats` | `lastConsolidation` timestamp |
| Drøm-innhold | `POST /memory/search` med `{query: "", memoryType: "general", tags: ["dream-meta"]}` | Siste meta-innsikt |
| Klynge-stats | Beregnet fra drøm-logg | clustersFound, memoriesMerged, metaInsights |

Knapper:
- **[Se full drøm →]** — navigerer til `/drommer` med siste drøm-ID

**Seksjon: AI-anbefalinger**

| Felt | API-kall | Detaljer |
|------|----------|---------|
| Anbefalinger | `GET /ai/suggestions?repo={valgtRepo}&limit=6` | `title, description, actionType, actionTarget` |

Knapper per anbefaling:
- **[Vis tasks →]** — navigerer til `/oppgaver` filtrert
- **[Kjør monitor →]** — trigger `POST /monitor/check`
- **[Start i Huginn →]** — åpner Huginn med pre-fylt melding

### Tomtilstand
Hvis ingen data finnes (ny bruker):
```
"Velkommen til TheFold. Koble et GitHub-repo i Innstillinger for å komme i gang."
[Gå til Innstillinger →]
```

---

## Del 4: Side 2 — Huginn (samarbeidsmodus)

### Formål
Du og agenten jobber SAMMEN på kode. Alt er kontekstbundet til et repo. Du ser hva som skjer i sanntid.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│  [Repo: thefold-dev/webapp ▼]   [Skills ▼]  [⏰ Hist] [⌨ Cmd]│
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─ 💬 Chat ──────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  🧑 Lag en dark mode toggle-komponent med Tailwind      │   │
│  │                                                         │   │
│  │  🤖 Ser på oppgaven. Analyserer repoet for eksisterende │   │
│  │     tema-system...                                      │   │
│  │                                                         │   │
│  │  ┌─ 🔧 Dark mode toggle ──────────────── Jobb #47 ──┐  │   │
│  │  │  Fase: Kontekst → Plan → Bygging → Validering     │  │   │
│  │  │        ✅        ✅      ⏳ 3/5      ○             │  │   │
│  │  │                                                    │  │   │
│  │  │  📄 Filer: 5 endret | ⏱ 84s | 💰 $0.03          │  │   │
│  │  │  🧪 Tester: 3 pass, 0 fail                        │  │   │
│  │  │                                                    │  │   │
│  │  │  [Vis filer ▼]                                     │  │   │
│  │  │    src/components/DarkToggle.tsx  (+89 linjer)     │  │   │
│  │  │    src/hooks/useTheme.ts         (+34 linjer)     │  │   │
│  │  │    src/styles/theme.css          (+12 linjer)     │  │   │
│  │  │    tests/DarkToggle.test.tsx     (+45 linjer)     │  │   │
│  │  │    src/app/layout.tsx            (~3 linjer)      │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  │  ┌─ ⚡ Review klar ─────────────── Score: 8.2/10 ───┐  │   │
│  │  │                                                    │  │   │
│  │  │  AI-vurdering: "Ren implementasjon med god          │  │   │
│  │  │  separasjon. Mangler keyboard shortcut (Cmd+D)."    │  │   │
│  │  │                                                    │  │   │
│  │  │  Bekymringer:                                      │  │   │
│  │  │  ⚠️ Ingen aria-label på toggle-knappen              │  │   │
│  │  │  ⚠️ CSS-variablene bør bruke prefers-color-scheme  │  │   │
│  │  │                                                    │  │   │
│  │  │  [✅ Godkjenn & PR]  [✏️ Endringer]  [❌ Avvis]   │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ Sub-agents ─────────────────────── Jobb #47 (2 aktive) ─┐ │
│  │  🧪 Tester   ██████████░░░ 78%  "skriver integrasjonstest"│ │
│  │  📋 Reviewer  ░░░░░░░░░░░░ venter på tester              │ │
│  │  [Vis all aktivitet →]                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Skriv en melding...                [📎] [Send ⌘⏎]      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Topplinje

| Element | Funksjon | API-kall |
|---------|----------|----------|
| **Repo-velger** | Dropdown med alle repos | `GET /github/repos` → `{repos: [{owner, name, defaultBranch}]}` |
| **Skills-velger** | Multi-select dropdown, filtrert til valgt repo | `GET /skills/list` → filtrert på `routingRules.filePatterns` match |
| **⏰ Historikk** | Åpner drawer fra høyre med samtalehistorikk | `GET /chat/conversations` → `{conversations: [{id, title, updatedAt, messageCount}]}` |
| **⌨ Cmd+K** | Command palette (cmdk) | Lokal — søk i kommandoer, repos, tasks, minner |

### Repo-velger detaljer
- Dropdown med søkefelt
- Viser `owner/name` + siste commit-melding
- Bytte repo = bytte kontekst = laste ny samtale om den finnes for dette repoet
- API: `GET /github/repos` (auth: true) returnerer alle tilkoblede repos
- Valgt repo lagres i `localStorage` og sendes som `repoContext` med alle meldinger

### Skills-velger detaljer
- Multi-select med checkboxer
- Viser skill-navn + fase-tag (inject/pre_run/post_run)
- Auto-aktiverer skills basert på repo-innhold via `POST /skills/resolve` med `{taskDescription: "", repoName}`
- Manuelt tilvalg/fravalg overstyrer auto-valg
- Valgte skills sendes som `skillIds[]` i `POST /chat/send`

### Historikk-drawer detaljer
```
┌─ Samtaler ────────────────── [✕] ─┐
│                                     │
│  🔍 Søk i samtaler...              │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Dark mode toggle            │   │
│  │ webapp · 14 min siden · 8 msg│   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ API auth middleware         │   │
│  │ api-server · 2 timer · 23 msg│   │
│  └─────────────────────────────┘   │
│  ...                               │
│                                     │
│  [Ny samtale +]                    │
└─────────────────────────────────────┘
```
- API: `GET /chat/conversations` for liste
- Klikk samtale: `GET /chat/history?conversationId={id}&limit=50` laster meldinger
- **[Ny samtale +]** oppretter ny via `POST /chat/send` med nytt `conversationId` (UUID generert frontend)
- Slett samtale: sveip venstre eller høyreklikk → `DELETE /chat/conversation/{id}`
- Søk: filtrerer lokalt på tittel

### Chat-melding-flyten

**Bruker sender melding:**
1. Frontend: `POST /chat/send` med `{conversationId, message, repoContext, skillIds[], modelOverride?, subAgentsEnabled}`
2. Backend returnerer: `{messageId, agentTriggered: boolean, taskId?: string}`
3. Hvis `agentTriggered = true` og `taskId` finnes:
   - Frontend kobler til SSE: `GET /agent/stream/{taskId}` (EventSource)
   - Events mottas: `agent.status`, `agent.message`, `agent.tool_use`, `agent.tool_result`, `agent.done`, `agent.error`

**SSE-events → UI-mapping:**

| SSE-event | Data | UI-effekt |
|-----------|------|-----------|
| `agent.status` | `{status: "building", phase: "implement", step: 3, totalSteps: 5}` | Oppdaterer faselinje i arbeidskort |
| `agent.message` | `{text: "Analyserer imports..."}` | Legger til tekst i chat-boblen |
| `agent.tool_use` | `{tool: "create_task", input: {...}}` | Viser tool-bruk-kort med ikon |
| `agent.tool_result` | `{tool: "create_task", result: {...}}` | Oppdaterer tool-kort med resultat |
| `agent.review` | `{reviewId, qualityScore, filesChanged, aiReview}` | Viser review-kort med knapper |
| `agent.done` | `{taskId, success, prUrl?}` | Fjerner spinner, viser ferdig-status |
| `agent.error` | `{error, errorType}` | Viser feil-kort med retry-knapp |

**Error recovery:**
- Hvis SSE kobler fra: automatisk reconnect etter 2s, 5s, 15s (eksponentiell backoff)
- Etter 3 mislykkede reconnects: vis banner "Mistet tilkobling" med **[Koble til igjen]** knapp
- Fallback polling: `GET /chat/history` hvert 3. sek mens SSE er nede
- Stall-deteksjon: Ingen SSE-event på 60 sek → vis "Agenten ser ut til å ha stoppet" med **[Tving fortsettelse]** knapp → `POST /agent/force-continue/{taskId}`
- Connection-indikator i topplinje: 🟢 Tilkoblet / 🔴 Frakoblet / 🟡 Kobler til

### Arbeidskort (job card)

Vises inline i chatten når agenten starter en oppgave.

**Faselinjer:**
```
Kontekst → Plan → Bygging → Validering → Review
   ✅       ✅      ⏳ 3/5     ○           ○
```

Henter data fra SSE `agent.status` events. Mapping:
| Agent-fase | Visningsnavn | Ikon |
|------------|-------------|------|
| `context_building` | Kontekst | 📂 |
| `confidence` | Vurdering | 🔍 |
| `planning` | Plan | 📋 |
| `building` | Bygging | ⚡ |
| `validating` | Validering | 🧪 |
| `reviewing` | Review | 📝 |
| `completing` | Ferdigstilling | ✅ |

**Filer-ekspansjon:**
Klikk **[Vis filer ▼]** viser alle endrede filer med +/- linjetall.
Data fra `agent.done` event som inkluderer `filesChanged[]`.
Klikk på filnavn → åpner diff-visning (se under).

**Metadata-linje:**
- 📄 Filer: antall fra `filesChanged.length`
- ⏱ Tid: beregnet frontend fra `agent.status` start til `agent.done`
- 💰 Kostnad: fra `agent.done` → `cost` felt
- 🧪 Tester: fra `agent.status` når fase = `validating` → `testResults`

### Diff-visning

Når bruker klikker på en fil i arbeidskort eller review-kort:

```
┌─ src/components/DarkToggle.tsx ──────────── [✕] ─┐
│                                                    │
│  + import { useState, useEffect } from 'react'    │
│  +                                                 │
│  + export function DarkToggle() {                  │
│  +   const [dark, setDark] = useState(false)       │
│  +                                                 │
│  +   useEffect(() => {                             │
│  +     document.body.classList.toggle('dark', dark) │
│  +   }, [dark])                                    │
│  ...                                               │
│                                                    │
└────────────────────────────────────────────────────┘
```

Data: `POST /agent/review/get` → `filesChanged[].content` (hele filen) eller `filesChanged[].diff` (hvis diff-format).
Visning: Syntax-highlighted med monospace, grønn bakgrunn for nye linjer, rød for slettede.

### Review-kort

Vises når `agent.review` SSE-event ankommer eller `status = "pending_review"`.

**Innhold:**
- Kvalitetsscore: stor tall med farge (grønn ≥8, gul ≥6, rød <6)
- AI-vurdering: `aiReview.documentation` (kort oppsummering)
- Bekymringer: `aiReview.concerns[]` som ⚠️-liste
- Arkitekturbeslutninger: `aiReview.architecturalDecisions[]`
- Minner ekstrahert: `aiReview.memoriesExtracted[]` med 💡-ikon

**Knapper:**

| Knapp | Handling | API-kall | Etter-effekt |
|-------|----------|----------|-------------|
| **[✅ Godkjenn & PR]** | Godkjenn, opprett PR | `POST /agent/review/approve` → `{prUrl}` | Viser PR-lenke, oppdaterer Linear, lagrer minner |
| **[✏️ Endringer]** | Send tilbakemelding | Åpner textarea → `POST /agent/review/request-changes` med `{feedback}` | Agent kjører på nytt med feedback, ny review |
| **[❌ Avvis]** | Avvis helt | Åpner textarea for grunn → `POST /agent/review/reject` med `{reason}` | Destroyer sandbox, logger |

Alle knapper har bekreftelses-steg (modal) for å hindre uhell.

### Sub-agent panel

Vises kun når sub-agents er aktive (kompleksitet ≥5 og `subAgentsEnabled: true`).

**Per sub-agent:**
```
🧪 Tester   ██████████░░░ 78%  "skriver integrasjonstest for auth"
```

Data fra SSE `agent.status` events med `subAgentId` felt.

| Sub-agent | Ikon | Rolle |
|-----------|------|-------|
| planner | 📋 | Detaljert implementeringsplan |
| implementer | ⚡ | Kodegenereringsguidance |
| tester | 🧪 | Testskriving |
| reviewer | 📝 | Kodekvalitetsreview |
| documenter | 📄 | Dokumentasjon (kun kompleksitet 10) |
| researcher | 🔍 | Kontekstforskning |

**[Vis all aktivitet →]** åpner expandert panel med:
- Hver sub-agents full output
- Tidsbruk per sub-agent
- Token-forbruk per sub-agent
- Avhengighetsgrafen (hvem venter på hvem)

### Input-felt detaljer

```
┌──────────────────────────────────────────────────────────┐
│  Skriv en melding...                   [📎] [Send ⌘⏎]   │
└──────────────────────────────────────────────────────────┘
```

| Element | Funksjon |
|---------|----------|
| Tekstfelt | Auto-expanderende textarea (1-8 linjer), monospace for kodeblokker |
| **📎** | Filopplasting (bilde, kode, PDF) → `POST /chat/upload` |
| **⌘⏎** | Send melding (Cmd+Enter / Ctrl+Enter) |
| Escape | Lukker drawer/modal |
| **Cmd+K** | Command palette — søk kommandoer |

**Command palette (Cmd+K) — kommandoer:**

| Kommando | Handling |
|----------|----------|
| `/task Tittel` | Oppretter task via chat tool-use |
| `/run taskId` | Starter eksisterende task |
| `/review` | Viser ventende reviews |
| `/skills` | Åpner skills-velger |
| `/model sonnet` | Bytter modell for neste melding |
| `/repos` | Åpner repo-velger |
| `/dream` | Trigger drømmemotor manuelt |
| `@fil src/...` | Legg til fil som kontekst |

### Chat-verktøy (tool-use)

Når bruker ber om handlinger, kan AI-en bruke disse verktøyene direkte:

| Tool | API-kall (intern) | Hva den gjør |
|------|-------------------|-------------|
| `create_task` | `POST /tasks/create` | Oppretter task med source="chat" |
| `start_task` | `POST /agent/start` | Starter agent-loop for en task |
| `list_tasks` | `GET /tasks/list` | Lister tasks med filtre |
| `read_file` | `POST /github/file` | Leser fil fra repo |
| `search_code` | `POST /memory/search-code` | Semantisk kode-søk |

Nye verktøy å legge til:
| Tool | API-kall | Hva den gjør |
|------|----------|-------------|
| `run_tests` | `POST /sandbox/validate` | Kjører tsc+lint+tests |
| `validate_syntax` | `POST /sandbox/validate` (typecheck only) | Kun typecheck |
| `search_memory` | `POST /memory/search` | Søk i minner |
| `search_patterns` | `POST /memory/search-patterns` | Søk i kodemønstre |
| `list_skills` | `GET /skills/list` | Vis tilgjengelige skills |

---

## Del 5: Side 3 — Muninn (autonom modus, BETA)

### Formål
Du gir en oppgave, Muninn gjør ALT selv. Ingen dialog, bare en rapport når den er ferdig.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│  Muninn                                        BETA 🏷️        │
│  Autonom agent — gjør alt fra plan til PR                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─ Ny oppgave ────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  Repo:     [thefold-dev/webapp ▼]                       │  │
│  │  Tittel:   [Implementer dark mode med system-pref...  ] │  │
│  │  Detaljer: [Lag en toggle-komponent som respekterer    ]│  │
│  │            [prefers-color-scheme, lagrer valg i        ]│  │
│  │            [localStorage, og bruker CSS-variabler...   ]│  │
│  │                                                          │  │
│  │  Maks kostnad: [$1.00 ▼]    Sikkerhetsnivå: [Streng ▼] │  │
│  │                                                          │  │
│  │  [🚀 Start Muninn]                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Aktive oppdrag ────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  #47 Dark mode toggle                                    │  │
│  │  ███████████████░░░░░ 75%  Fase: Validering             │  │
│  │  Startet: 14:20 · Estimert ferdig: ~14:25               │  │
│  │  [Vis live-logg →]  [⏹ Avbryt]                          │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Fullførte rapporter ───────────────────────────────────┐  │
│  │                                                          │  │
│  │  📋 #46 — API rate limiter                    8.2/10    │  │
│  │     webapp · 5 filer · $0.08 · 3 min · PR #89          │  │
│  │     [Les rapport →]                                      │  │
│  │                                                          │  │
│  │  📋 #45 — Database migration script           9.1/10    │  │
│  │     api-server · 2 filer · $0.04 · 1 min · PR #87      │  │
│  │     [Les rapport →]                                      │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Ny oppgave-skjema

| Felt | Type | Validering | Standard |
|------|------|-----------|---------|
| Repo | Dropdown | Påkrevd | Siste brukte repo |
| Tittel | Tekstfelt | Min 10 tegn | Tom |
| Detaljer | Textarea | Min 20 tegn | Tom |
| Maks kostnad | Dropdown | $0.50 / $1.00 / $2.00 / $5.00 / Ubegrenset | $1.00 |
| Sikkerhetsnivå | Dropdown | Standard / Streng / Paranoid | Streng |

**Sikkerhetsnivåer:**

| Nivå | Sandbox | Validering | Review |
|------|---------|-----------|--------|
| Standard | Filesystem | tsc + lint | AI self-review |
| Streng | Docker (--network=none, --read-only) | tsc + lint + tests (alle må passere) | AI self-review + automatisk re-validering |
| Paranoid | Docker + snapshot + performance | Alt over + snapshot-diff + performance-benchmark | AI self-review + dobbel-validering + advarsel ved score <8 |

### Start-flow

1. Bruker klikker **[🚀 Start Muninn]**
2. Frontend: `POST /tasks/create` med `{title, description, repo, source: "autonomous", securityLevel}`
3. Frontend: `POST /agent/start` med `{taskId, skipReview: true, autonomousMode: true, costLimit}`
4. Agent kjører hele loopen: buildContext → assessConfidence → executePlan → AI self-review → createPR
5. Forskjell fra Huginn: INGEN review-gate. Agent godkjenner selv hvis score ≥7. Score <7 → markeres som "trenger manuell review" og dukker opp i Huginn.
6. Frontend kobler til SSE `GET /agent/stream/{taskId}` for live-progress

### Aktive oppdrag

Viser alle pågående autonome tasks. Per task:
- Progresjonsbar med prosent (beregnet fra fase: context=10%, plan=25%, build=50%, validate=75%, review=90%, done=100%)
- Nåværende fase-navn
- Tid startet + estimert ferdigtid (basert på kompleksitetsestimat)
- **[Vis live-logg →]** åpner expandert panel med all SSE-aktivitet i sanntid
- **[⏹ Avbryt]** sender `POST /agent/cancel/{taskId}`, destroyer sandbox

### Fullførte rapporter

Klikk **[Les rapport →]** åpner full rapport:

```
┌─ Rapport: Dark mode toggle ─────────────────── 8.2/10 ──────┐
│                                                               │
│  Sammendrag                                                   │
│  Implementerte dark mode toggle med prefers-color-scheme      │
│  respekt, localStorage persistering, og CSS-variabler.        │
│                                                               │
│  Tidsforbruk                                                  │
│  Kontekst: 8s | Plan: 12s | Bygging: 54s | Validering: 10s  │
│  Total: 84s | Kostnad: $0.03                                 │
│                                                               │
│  Validering                                                   │
│  ✅ TypeScript: 0 feil                                        │
│  ✅ ESLint: 0 feil, 2 warnings                               │
│  ✅ Tester: 3 pass, 0 fail                                   │
│  ✅ Snapshot: OK (5 nye filer, 1 endret)                     │
│                                                               │
│  AI self-review                                               │
│  Score: 8.2/10                                                │
│  Styrker: God separasjon, testdekning                        │
│  Bekymringer: Mangler a11y-label, bør bruke CSS custom props │
│                                                               │
│  Filer endret (5)                                             │
│  + src/components/DarkToggle.tsx     89 linjer               │
│  + src/hooks/useTheme.ts            34 linjer               │
│  + src/styles/theme.css             12 linjer               │
│  + tests/DarkToggle.test.tsx        45 linjer               │
│  ~ src/app/layout.tsx               3 linjer endret         │
│                                                               │
│  Audit-logg (12 handlinger)                                  │
│  14:20:01  Leste repo-tre (247 filer)                        │
│  14:20:03  Søkte minner ("dark mode", "theme")               │
│  14:20:05  Vurderte kompleksitet: 4/10                       │
│  14:20:06  Valgte modell: claude-sonnet-4-5                    │
│  14:20:08  Plan: 5 filer, 3 faser                            │
│  14:20:12  Genererte DarkToggle.tsx                          │
│  ...                                                          │
│                                                               │
│  Minner lagret (2)                                           │
│  💡 "webapp bruker CSS custom properties for temaing"         │
│  💡 "Tailwind dark: prefix konfigurert i tailwind.config"    │
│                                                               │
│  PR: github.com/thefold-dev/webapp/pull/89                   │
│  [Åpne PR ↗]  [Kjør på nytt ↻]  [Slett rapport 🗑]         │
└───────────────────────────────────────────────────────────────┘
```

**Rapport-data hentes fra:**

| Seksjon | API-kall | Felt |
|---------|----------|------|
| Sammendrag | `GET /agent/job/{jobId}` | `result.summary` |
| Tidsforbruk | `GET /agent/metrics/{taskId}` | Per-fase tidsbruk |
| Validering | `GET /agent/job/{jobId}` | `result.validationResult` |
| AI review | `GET /agent/review/get?taskId={id}` | `aiReview.*` |
| Filer | `GET /agent/review/get?taskId={id}` | `filesChanged[]` |
| Audit-logg | `GET /agent/audit/{taskId}` | `auditLog[]` med timestamp + handling |
| Minner | `POST /memory/search` med `{linearTaskId}` | Minner knyttet til oppgaven |
| PR | `GET /agent/job/{jobId}` | `result.prUrl` |

---

## Del 6: Side 4 — Oppgaver

### Formål
All oppgaveadministrasjon på ett sted. Tasks + Projects + Linear-sync.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│  Oppgaver                     [+ Ny oppgave]  [🔄 Sync Linear]│
├────────────────────────────────────────────────────────────────┤
│  [Alle oppgaver]  [Prosjekter]  [Linear-sync]                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Filtre: [Status ▼] [Kilde ▼] [Repo ▼] [Score ▼] [Søk... ] │
│                                                                │
│  ☐ Velg alle    Bulk: [Arkiver] [Re-kjør] [Slett]            │
│                                                                │
│  ┌──────────────────────────┬──────────────────────────────┐  │
│  │ Oppgaveliste             │ Detaljer                     │  │
│  │                          │                              │  │
│  │ ☐ 🟡 Dark mode toggle   │ Dark mode toggle             │  │
│  │   webapp · chat · 7.8   │ Status: pending_review       │  │
│  │                          │ Repo: thefold-dev/webapp     │  │
│  │ ☐ 🟢 API rate limiter   │ Kilde: chat                  │  │
│  │   api · linear · 8.2    │ Opprettet: 14:20             │  │
│  │                          │ Kompleksitet: 4/10           │  │
│  │ ☐ 🔵 DB migration       │ Estimert: 1200 tokens        │  │
│  │   api · manual · —      │                              │  │
│  │                          │ Beskrivelse:                 │  │
│  │ ☐ 🔴 Auth bugfix        │ Lag en dark mode toggle-     │  │
│  │   webapp · linear · —   │ komponent som respekterer    │  │
│  │                          │ prefers-color-scheme...      │  │
│  │                          │                              │  │
│  │                          │ ┌─ Kvalitetsrapport ──────┐ │  │
│  │                          │ │ Score: 7.8/10           │ │  │
│  │                          │ │ Filer: 5 endret         │ │  │
│  │                          │ │ Status: Venter review   │ │  │
│  │                          │ │                         │ │  │
│  │                          │ │ [✅ Godkjenn]           │ │  │
│  │                          │ │ [✏️ Endringer]          │ │  │
│  │                          │ │ [❌ Avvis]              │ │  │
│  │                          │ └─────────────────────────┘ │  │
│  │                          │                              │  │
│  │                          │ Sub-tasks:                   │  │
│  │                          │ ✅ Opprett komponent         │  │
│  │                          │ ✅ Legg til hook            │  │
│  │                          │ ⏳ Skriv tester             │  │
│  │                          │                              │  │
│  │                          │ [Åpne i Huginn →]           │  │
│  │                          │ [Se i Linear ↗]             │  │
│  └──────────────────────────┴──────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Tab 1: Alle oppgaver

**Filtre:**

| Filter | Verdier | API-parameter |
|--------|---------|--------------|
| Status | backlog, planned, in_progress, pending_review, done, blocked, failed | `?status=` |
| Kilde | manual, chat, linear, healing, autonomous | `?source=` |
| Repo | Alle repos fra `GET /github/repos` | `?repo=` |
| Score | Alle, ≥8, ≥6, <6, Ingen score | Frontend-filtrert |
| Søk | Fritekst | `?search=` |

**Oppgaveliste (venstre):**

API: `GET /tasks/list` med filtre → `{tasks: [{id, title, status, repo, source, qualityScore?, updatedAt, complexity, estimatedTokens}]}`

Per oppgave:
- Checkbox for bulk-valg
- Status-prikk: 🟡 pending_review, 🟢 done, 🔵 in_progress/planned, 🔴 blocked/failed, ⚪ backlog
- Tittel (klikkbar for detaljer)
- Metadata-linje: repo · kilde · score (hvis finnes)

**Detaljer (høyre):**

Vises når oppgave er valgt. Data fra:
- `GET /tasks/get/{id}` — all task info
- `GET /agent/review/list?taskId={id}` — review hvis finnes
- `GET /agent/job?taskId={id}` — agent job info

Innhold:
- Tittel, status-tag, repo, kilde, timestamps
- Kompleksitet (1-10) og token-estimat
- Beskrivelse (full tekst)
- Kvalitetsrapport med review-knapper (hvis pending_review)
- Sub-tasks (fra AI-dekomponering)
- Handlingslenker

**Bulk-operasjoner:**

| Handling | API-kall | Betingelse |
|----------|----------|-----------|
| Arkiver | `POST /tasks/archive` med `{taskIds[]}` | Status = done/failed |
| Re-kjør | `POST /agent/start` per task | Status = failed/blocked |
| Slett | `POST /tasks/delete` med `{taskIds[]}` | Bekreftelses-modal |

**[+ Ny oppgave] knapp → modal:**

```
┌─ Ny oppgave ─────────────────────── [✕] ─┐
│                                            │
│  Tittel:    [                           ] │
│  Repo:      [thefold-dev/webapp ▼]       │
│  Beskrivelse:                             │
│  [                                      ] │
│  [                                      ] │
│                                            │
│  Labels:  ☐ bug  ☐ feature  ☐ refactor   │
│  Skills:  ☐ TypeScript  ☐ React          │
│                                            │
│  [Opprett]  [Opprett & start ▶]          │
└────────────────────────────────────────────┘
```

- **[Opprett]**: `POST /tasks/create` med `{title, description, repo, labels, skillIds}`
- **[Opprett & start ▶]**: Oppretter + `POST /agent/start` med `{taskId}`, navigerer til Huginn

### Tab 2: Prosjekter

Viser repos gruppert med oppgavefremdrift.

API: `GET /tasks/list?limit=500` → grupper per repo frontend-side.

Per prosjekt-kort:
```
┌─ thefold-dev/webapp ──────────────────── 67% ──┐
│  Totalt: 12 | Ferdig: 8 | Aktive: 2 | Blokkert: 1 │
│  ████████████████░░░░░░░░                           │
│  Siste aktivitet: 14 min siden                     │
│  [Se oppgaver →]                                    │
└─────────────────────────────────────────────────────┘
```

Klikk **[Se oppgaver →]** filtrerer oppgavelisten med `?repo=thefold-dev/webapp`.

### Tab 3: Linear-sync

```
┌─ Linear-integrasjon ───────────────────────────────┐
│                                                     │
│  Status: 🟢 Tilkoblet                              │
│  Siste sync: 12 min siden                          │
│  Oppgaver importert: 47                             │
│  Status-syncs (push): 128                          │
│                                                     │
│  [🔄 Sync nå]  [⚙️ Konfigurer]                    │
│                                                     │
│  Siste synced tasks:                               │
│  → FOLD-123: "Fiks auth timeout" (imported)        │
│  → FOLD-124: "Legg til rate limit" (imported)      │
│  ← FOLD-120: "DB migration" (status → done)       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

| Handling | API-kall |
|----------|----------|
| **[🔄 Sync nå]** | `POST /tasks/sync-linear` |
| **[⚙️ Konfigurer]** | Navigerer til `/innstillinger?tab=integrasjoner` |
| Import-logg | `GET /linear/tasks?limit=10` → vis siste importerte |

---

## Del 7: Side 5 — Drømmer (EGET KONSEPT)

### Visjon

Drømmer er TheFolds underbevissthet. Mens du sover, prosesserer TheFold alt den har lært. Den finner mønstre, konsoliderer kunnskap, og våkner med innsikter du aldri ba om.

Dette er ikke en rapport-side. Det er en **journal** — en levende historie om hva TheFold har forstått.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│  🌙 Drømmer                                                    │
│  TheFolds underbevissthet — mønstre, innsikter, konsolidering │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [Drøm-journal]  [Innsikter]  [Konstellasjoner]  [Motor]     │
│                                                                │
├── Drøm-journal ────────────────────────────────────────────────┤
│                                                                │
│  ┌─ 🌙 Drøm #12 — Søn 12. apr 05:00 ─── 4 klynger ────────┐│
│  │                                                            ││
│  │  "Fant gjentagende auth-mønster: 4 repos bruker samme     ││
│  │   utdaterte token-validering. Konsoliderte til én strategi ││
│  │   med refresh-token rotation."                             ││
│  │                                                            ││
│  │  Klynger funnet:        5                                  ││
│  │  Minner slått sammen:   12 → 3                            ││
│  │  Meta-innsikter:        2                                  ││
│  │  Minner slettet:        7 (utløpt, irrelevant)            ││
│  │  Drøm-varighet:         34 sekunder                       ││
│  │  Token-forbruk:         2,400 tokens ($0.003)             ││
│  │                                                            ││
│  │  Klynger:                                                  ││
│  │  ┌─ Klynge 1: Auth-mønstre (4 minner → 1) ─────────┐    ││
│  │  │ Før: "webapp har JWT expiry bug"                   │    ││
│  │  │      "api-server mangler refresh token"            │    ││
│  │  │      "mobile app har hardkodet token TTL"          │    ││
│  │  │      "auth middleware ignorerer exp claim"          │    ││
│  │  │                                                    │    ││
│  │  │ Etter: "Alle repos har auth-token-svakheter.       │    ││
│  │  │ Anbefaler sentralisert token-validering med        │    ││
│  │  │ rotation. Se felles middleware i gateway."          │    ││
│  │  └────────────────────────────────────────────────────┘    ││
│  │                                                            ││
│  │  ┌─ Klynge 2: CSS-konvensjoner (3 minner → 1) ─────┐    ││
│  │  │ ...                                                │    ││
│  │  └────────────────────────────────────────────────────┘    ││
│  │                                                            ││
│  │  Meta-innsikter:                                           ││
│  │  📌 "Token-håndtering er det mest sårbare feltet           ││
│  │      på tvers av alle repos. Prioriter sentralisering."   ││
│  │  📌 "CSS-konvensjoner divergerer — vurder Tailwind         ││
│  │      config som delt avhengighet."                        ││
│  │                                                            ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  ┌─ 🌙 Drøm #11 — Søn 5. apr 05:00 ─── 3 klynger ─────────┐│
│  │  ...                                                       ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Tab 1: Drøm-journal

Kronologisk liste over alle drømmer, nyeste først.

**Data-henting:**

| Data | API-kall | Detaljer |
|------|----------|---------|
| Drøm-liste | `POST /memory/search` med `{query: "", tags: ["dream-consolidated", "dream-meta"], limit: 100}` | Alle drøm-minner, sortert på `createdAt` DESC |
| Drøm-metadata | `GET /memory/stats` | `lastConsolidation`, total consolidated count |
| Klynge-detaljer | `POST /memory/search` med `{tags: ["dream-consolidated"], limit: 50}` | Individuelle klynge-resultater |
| Meta-innsikter | `POST /memory/search` med `{tags: ["dream-meta"], pinned: true}` | Kryss-klynge innsikter (pinned) |
| Original-minner | Sporet via `consolidatedFrom[]` felt | Hvert konsolidert minne peker til sine kilder |

**Per drøm vises:**
- Dato og klokkeslett
- Oppsummeringstekst (fra meta-innsikt)
- Statistikk: klynger funnet, minner slått sammen, meta-innsikter, minner slettet, varighet, kostnad
- Expanderbare klynger med før/etter-visning
- Meta-innsikter med 📌-ikon (disse er pinned, dør aldri)

**Interaksjoner:**

| Knapp | Handling |
|-------|----------|
| **[Pin innsikt 📌]** | `POST /memory/store` med `{pinned: true}` — forhindrer at innsikten dør |
| **[Unpin]** | Oppdater minne med `pinned: false` |
| **[Bruk i oppgave →]** | Pre-fyller Huginn med innsikten som kontekst |
| **[Slett klynge]** | `DELETE /memory/{id}` — fjerner konsolidert minne, originaler forblir |

### Tab 2: Innsikter

Alle meta-innsikter samlet, uavhengig av drøm. Dette er TheFolds "visdommer" — destillert kunnskap.

```
┌─ Innsikter ────────────────────────────────────────────────────┐
│                                                                │
│  📌 Pinned innsikter (aldri glemmes)                          │
│                                                                │
│  "Token-håndtering er det mest sårbare feltet                 │
│   på tvers av alle repos."                                    │
│   Kilde: Drøm #12 · 12. apr · 4 relaterte minner            │
│   [Bruk i oppgave →]  [Unpin]                                │
│                                                                │
│  "Alle nye repos mangler initial eslint-config.               │
│   autoInitRepo() bør inkludere dette."                        │
│   Kilde: Drøm #10 · 29. mar · 6 relaterte minner            │
│   [Bruk i oppgave →]  [Unpin]                                │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│                                                                │
│  🔮 Aktive innsikter (decay påvirker)                         │
│                                                                │
│  "Testing-konvensjoner varierer mye mellom repos.              │
│   Vitest er mest konsistent."                                 │
│   Decay: ████████░░ 82% · Tilgang: 4x · Alder: 14 dager    │
│   [Pin 📌]  [Bruk i oppgave →]                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Data fra: `POST /memory/search` med `{tags: ["dream-meta"], limit: 50}`, sortert med pinned først, deretter decayed relevance.

### Tab 3: Konstellasjoner

Visuell graf som viser hvordan minner kobler seg sammen på tvers av repos og oppgaver. Nytt konsept.

```
┌─ Konstellasjoner ──────────────────────────────────────────────┐
│                                                                │
│         webapp ●─────────────● api-server                     │
│                 \           /                                   │
│                  \   auth  /                                   │
│                   \       /                                     │
│                    ●─────●                                     │
│                   /       \                                     │
│                  /  tokens  \                                  │
│                 /           \                                   │
│         mobile ●─────────────● gateway                        │
│                                                                │
│  Klynge: "Auth & tokens" — 12 minner, 4 repos                │
│  Styrke: ████████████████ sterk (0.87)                        │
│                                                                │
│  [Zoom inn]  [Filtrer: repo/type/alder]  [Eksporter]          │
└────────────────────────────────────────────────────────────────┘
```

**Data-henting:**
1. `POST /memory/search` med `{limit: 200}` — hent alle minner med `sourceRepo`
2. `POST /memory/search-patterns` — hent alle kodemønstre med `sourceRepo`
3. Frontend grupperer på felles nøkkelord (word overlap, samme logikk som drømmemotoren)
4. Bygger graf med repos som noder og delte mønstre som kanter
5. Kantstyrke = antall delte minner / total minner

**Implementasjon:** React med d3.js force-directed graf, eller enklere: statisk SVG med beregnet layout.

**Interaksjoner:**
- Klikk node (repo) → filtrer minner til det repoet
- Klikk kant → vis delte minner mellom de to repos
- Zoom/pan for navigering
- Filter-dropdown for repo, type, alder

### Tab 4: Motor

Drømmemotorens kontrollpanel. Vis status, trigger manuelt, konfigurer.

```
┌─ Drømmemotor ──────────────────────────────────────────────────┐
│                                                                │
│  Status: 💤 Sover (neste drøm: søn 05:00)                    │
│                                                                │
│  ┌─ Siste kjøring ────────────────────────────────────────┐   │
│  │  Dato: Søn 12. apr 05:00 CEST (03:00 UTC)             │   │
│  │  Varighet: 34 sekunder                                 │   │
│  │  Klynger: 5 funnet, 4 konsolidert                     │   │
│  │  Minner: 12 slått sammen, 7 slettet                   │   │
│  │  Meta-innsikter: 2 opprettet                          │   │
│  │  Tokens: 2,400 ($0.003)                               │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ Historikk ────────────────────────────────────────────┐   │
│  │  #12  12. apr  34s  5 klynger  12→3  2 meta  $0.003  │   │
│  │  #11   5. apr  28s  3 klynger   8→2  1 meta  $0.002  │   │
│  │  #10  29. mar  45s  7 klynger  18→4  3 meta  $0.004  │   │
│  │  ...                                                   │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ Kontroll ─────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  [🌙 Drøm nå]     Trigger drømmemotor manuelt         │   │
│  │  [🧹 Rens minne]  Slett utløpte minner                │   │
│  │  [📉 Decay nå]    Kjør decay-beregning                │   │
│  │  [🔄 Re-embed]    Regenerer embeddings                │   │
│  │                                                         │   │
│  │  Innstillinger:                                         │   │
│  │  Min. minner for drøm:  [3 ▼]    (standard: 3)        │   │
│  │  Min. tid mellom drøm:  [24t ▼]  (standard: 24 timer)│   │
│  │  Klynge-terskel:        [0.4 ▼]  (ordlikhet)          │   │
│  │  Prune alder:           [90d ▼]  (dager)              │   │
│  │  Prune terskel:         [0.1 ▼]  (relevans)           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ Hukommelsens helse ───────────────────────────────────┐   │
│  │                                                         │   │
│  │  Totalt minner:     314                                │   │
│  │  Aktive:            287 (relevans > 0.1)               │   │
│  │  Pinnede:           12  (aldri decay)                  │   │
│  │  Utløper snart:     23  (< 30 dager TTL igjen)        │   │
│  │  Konsoliderte:      45  (slått sammen av drøm)        │   │
│  │  Gjennomsnittlig decay: 0.67                          │   │
│  │                                                         │   │
│  │  Per type:                                              │   │
│  │  error_pattern  ████████████████████ 89  (snitt: 0.82)│   │
│  │  decision       ████████████████     67  (snitt: 0.74)│   │
│  │  task           ██████████████       54  (snitt: 0.61)│   │
│  │  session        ████████████         42  (snitt: 0.43)│   │
│  │  skill          ████████             34  (snitt: 0.69)│   │
│  │  general        ████████░░░░░░░░░░  28  (snitt: 0.31)│   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Kontroll-knapper:**

| Knapp | API-kall | Detaljer |
|-------|----------|---------|
| **[🌙 Drøm nå]** | `POST /memory/dream` | Trigger drømmemotor manuelt, vis progresjons-spinner |
| **[🧹 Rens minne]** | `POST /memory/cleanup` | Sletter utløpte minner, returnerer antall slettet |
| **[📉 Decay nå]** | `POST /memory/decay` | Oppdaterer decay-score på alle minner |
| **[🔄 Re-embed]** | `POST /memory/re-embed` | Regenerer embeddings for minner med NULL-embedding |

Alle knapper: loading-spinner under kjøring, suksesstekst etter ("3 minner slettet", "Decay oppdatert for 287 minner").

**Innstillinger:**
Disse er i dag hardkodet i backend. For v1: vis som read-only med "Krever kodeendring" tooltip. For v2: backend-støtte for konfigurerbare parametre via `memory_meta`-tabell.

**Hukommelsens helse:**
- API: `GET /memory/stats` → `{totalMemories, byType: {}, avgRelevance, expiringCount, storageBytes}`
- Per type: beregnet frontend fra `byType`-objektet, decay-gjennomsnitt fra søkeresultater

---

## Del 8: Side 6 — Hukommelse

### Formål
All kunnskap TheFold har. Minner, kodemønstre, skills, kodeindeks. Drømmer har sin egen side.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│  Hukommelse — TheFolds kunnskapsbase                           │
├────────────────────────────────────────────────────────────────┤
│  [Minner (287)]  [Mønstre (34)]  [Skills (6)]  [Kodeindeks]  │
├────────────────────────────────────────────────────────────────┤
```

### Tab 1: Minner

All lagret kunnskap (unntatt drømme-genererte, som er på Drømmer-siden).

```
┌─ Minner ───────────────────────────────────────────────────────┐
│                                                                │
│  🔍 [Søk i minner...                    ]  [Type ▼] [Repo ▼] │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ "webapp bruker CSS custom properties for temaing"      │   │
│  │ Type: decision · Repo: webapp · Decay: ████████ 0.82  │   │
│  │ Tilgang: 7x · Alder: 5 dager · Trust: agent           │   │
│  │ Tags: css, theme, tailwind                             │   │
│  │ [Pin 📌] [Bruk i Huginn →] [Slett 🗑]                │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ "JWT refresh token bør ha kort TTL (15 min)"           │   │
│  │ Type: error_pattern · Repo: api-server · Decay: 0.91  │   │
│  │ 📌 Pinned · Tilgang: 12x · Trust: user                │   │
│  │ [Unpin] [Bruk i Huginn →] [Slett 🗑]                 │   │
│  └────────────────────────────────────────────────────────┘   │
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
```

**Data-henting:**

| Element | API-kall |
|---------|----------|
| Søk | `POST /memory/search` med `{query, memoryType, limit: 50}` — debounced 350ms |
| Type-filter | Verdier: alle, decision, error_pattern, strategy, skill, task, session, general, episode |
| Repo-filter | Fra `sourceRepo` felt |
| Decay-bar | Beregnet fra `relevanceScore` + `calculateDecayedRelevance()` |

**Per minne:**
- Innhold (tekst, maks 200 tegn, expanderbar)
- Type-tag med farge
- Repo-tag
- Decay-bar (grønn ≥0.7, gul ≥0.4, rød <0.4)
- Tilgangsantall, alder, trust-level
- Tags

**Knapper per minne:**

| Knapp | API-kall |
|-------|----------|
| **[Pin 📌]** | `POST /memory/store` med `{id, pinned: true}` |
| **[Unpin]** | `POST /memory/store` med `{id, pinned: false}` |
| **[Bruk i Huginn →]** | Navigerer til `/huginn?context=memory:{id}` |
| **[Slett 🗑]** | `DELETE /memory/{id}` med bekreftelses-dialog |

### Tab 2: Mønstre (code patterns)

Problem-løsning-par ekstrahert fra fullførte oppgaver.

```
┌─ Mønstre ──────────────────────────────────────────────────────┐
│                                                                │
│  🔍 [Søk i mønstre...              ]  [Type ▼]               │
│                                                                │
│  ┌─ bug_fix ──────────────────────────── Konfidanse: 0.89 ──┐│
│  │                                                            ││
│  │  Problem: "JWT token utløper men refresh skjer ikke"       ││
│  │  Løsning: "Legg til interceptor som sjekker exp            ││
│  │           claim og kaller refresh 60s før utløp"           ││
│  │                                                            ││
│  │  Filer: auth.ts, interceptor.ts                           ││
│  │  Repo: api-server · Gjenbrukt: 3x · Bugs forhindret: 1  ││
│  │  [Vis kode ▼]  [Bruk i oppgave →]                        ││
│  └────────────────────────────────────────────────────────────┘│
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
```

**Data-henting:**

| Element | API-kall |
|---------|----------|
| Søk | `POST /memory/search-patterns` med `{query, limit: 20}` |
| Type-filter | bug_fix, optimization, refactoring, new_feature |

**Per mønster:**
- Type-tag
- Problem-beskrivelse
- Løsning-beskrivelse
- **[Vis kode ▼]** ekspanderer `codeBefore` / `codeAfter` med syntax highlighting
- Metadata: filer, repo, gjenbruk-teller, bugs forhindret
- Konfidanse-score

### Tab 3: Skills

Prompt-skills som påvirker hvordan TheFold tenker og koder.

```
┌─ Skills ─────────────────────────────────── [+ Ny skill] ─────┐
│                                                                │
│  ┌──────────────────────────┬──────────────────────────────┐  │
│  │ Skill-liste              │ Detaljer                     │  │
│  │                          │                              │  │
│  │ 🟢 TypeScript Best      │ TypeScript Best Practices    │  │
│  │    inject · pri: 10     │ Fase: inject                 │  │
│  │                          │ Prioritet: 10               │  │
│  │ 🟢 React Patterns       │ Token-estimat: ~800         │  │
│  │    inject · pri: 8      │ Konfidanse: 87%             │  │
│  │                          │ Brukt: 23 ganger            │  │
│  │ 🔴 Security Scanner     │                              │  │
│  │    post_run · pri: 5    │ Routing-regler:              │  │
│  │                          │ Keywords: typescript, ts     │  │
│  │ 🟢 Tailwind Style       │ Filpatterns: *.ts, *.tsx     │  │
│  │    inject · pri: 7      │ Labels: coding, quality      │  │
│  │                          │                              │  │
│  │                          │ Prompt-fragment:             │  │
│  │                          │ ┌─────────────────────────┐ │  │
│  │                          │ │ Always use strict mode. │ │  │
│  │                          │ │ Prefer interfaces over  │ │  │
│  │                          │ │ type aliases for object │ │  │
│  │                          │ │ shapes...               │ │  │
│  │                          │ └─────────────────────────┘ │  │
│  │                          │                              │  │
│  │                          │ [🔄 Aktiver/Deaktiver]      │  │
│  │                          │ [✏️ Rediger]                │  │
│  │                          │ [🗑 Slett]                  │  │
│  └──────────────────────────┴──────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**Data-henting:**

| Element | API-kall |
|---------|----------|
| Skill-liste | `GET /skills/list` → `{skills: [{id, name, enabled, phase, priority, tokenEstimate, confidenceScore, usageCount, routingRules}]}` |
| Skill-detalj | `GET /skills/get/{id}` → full skill med `promptFragment` |
| Toggle | `POST /skills/toggle` med `{skillId, enabled}` |
| Opprett | `POST /skills/create` med `{name, description, promptFragment, phase, scope, taskPhase, routingRules}` |

**[+ Ny skill] modal:**
```
Navn:           [                              ]
Beskrivelse:    [                              ]
Fase:           [inject ▼]  (inject/pre_run/post_run)
Scope:          [all ▼]     (all/repo-specific)
Prioritet:      [5 ▼]       (1-10)
Prompt-fragment:
[                                               ]
[                                               ]
Routing keywords: [typescript, react           ]
Fil-patterns:     [*.ts, *.tsx                 ]
Labels:           [coding, quality             ]
[Opprett]  [Avbryt]
```

**[✏️ Rediger]** — samme modal som opprett, forhåndsutfylt med eksisterende data. API: `POST /skills/update` (trenger nytt endpoint, i dag finnes bare create).

### Tab 4: Kodeindeks

Semantisk kode-søk på tvers av repos.

```
┌─ Kodeindeks ───────────────────────────────────────────────────┐
│                                                                │
│  🔍 [Søk med naturlig språk: "autentisering middleware"... ] │
│  Repo: [Alle ▼]                                               │
│                                                                │
│  Resultater (12 filer):                                        │
│                                                                │
│  📄 gateway/auth.ts                          Score: 0.92     │
│     "Auth handler with Bearer token validation..."            │
│     [Vis i GitHub ↗]                                          │
│                                                                │
│  📄 agent/helpers.ts                         Score: 0.84     │
│     "validateAgentScope checks write permission..."           │
│     [Vis i GitHub ↗]                                          │
│                                                                │
│  ┌─ Indekseringsstatus ──────────────────────────────────┐   │
│  │ webapp:     1,247 filer · commit abc123 · 2t siden    │   │
│  │ api-server:   834 filer · commit def456 · 5t siden    │   │
│  │ [🔄 Re-indekser alle]                                 │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Data-henting:**

| Element | API-kall |
|---------|----------|
| Søk | `POST /memory/search-code` med `{query, repoName?, limit: 20}` |
| Indeks-status | `POST /memory/code-index-meta` (trenger eksponert endpoint) |
| Re-indekser | `POST /memory/index-repo` med `{repoOwner, repoName}` |

---

## Del 9: Side 7 — Innstillinger

### Formål
All konfigurasjon samlet. Profil, AI, integrasjoner, MCP, komponenter, system.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│  Innstillinger                                                 │
├────────────────────────────────────────────────────────────────┤
│  [Profil] [AI-modeller] [Integrasjoner] [MCP] [Kompon.] [Sys]│
├────────────────────────────────────────────────────────────────┤
```

### Tab 1: Profil

```
┌─ Profil ───────────────────────────────────────────────────────┐
│                                                                │
│  Navn:          [Kjartan                    ] [Lagre]         │
│  E-post:        mikkis@twofold.no (ikke redigerbar)           │
│  Organisasjon:  Twofold AS                                     │
│  Rolle:         admin                                          │
│  AI-navn:       [TheFold                    ] [Lagre]         │
│                                                                │
│  Autentisering                                                 │
│  Metode: OTP via e-post (Resend)                              │
│  Token utløper: 30 dager                                       │
│  Siste innlogging: 12. apr 14:20                              │
│  [Revokér alle tokens]                                         │
│                                                                │
│  Varsler                                                       │
│  ☐ Push-varsler     (krever nettlesertillatelse)              │
│  ☐ Slack-varsler    (krever Slack-integrasjon)                │
│  ☐ E-post-varsler                                              │
│                                                                │
│  Hendelser:                                                    │
│  ☑ task.completed    ☑ review.pending                         │
│  ☑ health.alert      ☑ agent.error                            │
│  ☑ dream.completed   ☐ cost.threshold                         │
│                                                                │
│  Preferanser                                                   │
│  Sub-agents:       [Av ▼]  (På / Av / Auto)                  │
│  Budsjettmodus:    [Balansert ▼]  (Sparing / Balansert / Kvalitet) │
│  Standard repo:    [thefold-dev/webapp ▼]                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**API-kall:**

| Felt | API-kall |
|------|----------|
| Profilinfo | `GET /users/me` |
| Oppdater navn | `POST /users/profile` med `{name}` |
| Oppdater AI-navn | `POST /users/preferences` med `{aiName}` |
| Revokér tokens | `POST /gateway/revoke` |
| Logout | `POST /gateway/logout` |

### Tab 2: AI-modeller

```
┌─ AI-modeller ──────────────────────────────────────────────────┐
│                                                                │
│  Providers                                                     │
│  ┌─ Anthropic ──── 🟢 ── 3 modeller aktive ─── [+ Modell] ─┐│
│  │ claude-haiku-4-5    tier 2   $0.80/$4.00   chat, coding   ││
│  │ claude-sonnet-4-5   tier 3   $3.00/$15.00  chat, coding   ││
│  │ claude-opus-4-5     tier 5   $15.00/$75.00 coding, analysis││
│  └────────────────────────────────────────────────────────────┘│
│  ┌─ OpenAI ──── 🟢 ── 2 modeller aktive ──── [+ Modell] ───┐│
│  │ gpt-4o-mini         tier 1   $0.15/$0.60   chat           ││
│  │ gpt-4o              tier 3   $5.00/$15.00  coding          ││
│  └────────────────────────────────────────────────────────────┘│
│  ...                                                           │
│  [+ Ny provider]                                               │
│                                                                │
│  Kostnadsoversikt (7 dager)                                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Man Tir Ons Tor Fre Lør Søn                           │  │
│  │  ██  ███ ██  █   ██████  █  ░                          │  │
│  │  $0.12 $0.34 $0.08 $0.02 $0.89 $0.04 -               │  │
│  │                                                         │  │
│  │  Total: $1.49 · Gjennomsnitt: $0.25/dag · ↓12% vs uke │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  Fase-tilordning                                              │
│  Confidence:  [claude-haiku-4-5 ▼]    (billig, rask)         │
│  Planning:    [claude-sonnet-4-5 ▼]   (balansert)            │
│  Building:    [claude-sonnet-4-5 ▼]   (kvalitet)             │
│  Review:      [claude-sonnet-4-5 ▼]   (presis)              │
│  Chat:        [auto ▼]                (tag-basert valg)      │
│                                                                │
│  Token-budsjetter per fase                                    │
│  Confidence: ████░░░░░░ 2K / 2K                              │
│  Planning:   ██████░░░░ 8K / 8K                              │
│  Building:   ██████████████████████░░░░░░ 35K / 50K          │
│  Review:     █████░░░░░ 5K / 8K                              │
│  Diagnosis:  ██░░░░░░░░ 2K / 4K                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**API-kall:**

| Element | API-kall |
|---------|----------|
| Provider-liste | `GET /ai/providers` → providers med nested models |
| Kostnad 7 dager | `GET /ai/cost-summary` → `{dailyCosts[], weeklyTotal, trend}` |
| Fasemetrikker | `GET /agent/phase-metrics?days=7` → token per fase |
| Opprett provider | `POST /ai/providers/save` |
| Opprett modell | `POST /ai/models/save` |
| Toggle modell | `POST /ai/models/toggle` med `{modelId, enabled}` |
| Slett modell | `POST /ai/models/delete` med `{modelId}` |

### Tab 3: Integrasjoner

```
┌─ Integrasjoner ────────────────────────────────────────────────┐
│                                                                │
│  ┌─ Slack ──── 🟢 Tilkoblet ────────────────────────────────┐│
│  │ Webhook URL: https://hooks.slack.com/...                  ││
│  │ Hendelser: task.completed, review.pending, agent.error    ││
│  │ [Konfigurer]  [Koble fra]                                ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  ┌─ Discord ──── 🔴 Ikke tilkoblet ─────────────────────────┐│
│  │ Webhook-integrasjon for notifikasjoner                    ││
│  │ [Koble til]                                               ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  ┌─ Linear ──── 🟢 Konfigurert (server) ────────────────────┐│
│  │ Toveis sync: import tasks + push status                   ││
│  │ Siste sync: 12 min siden                                 ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  ┌─ GitHub ──── 🟢 Konfigurert (server) ────────────────────┐│
│  │ App-integrasjon med JWT auth                              ││
│  │ Repos: 3 tilkoblet                                        ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  ┌─ E-post (Resend) ──── 🟢 Konfigurert (server) ──────────┐│
│  │ Avsender: thefold@twofold.no                              ││
│  │ Brukes til: OTP, notifikasjoner, rapporter                ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**API-kall:**

| Element | API-kall |
|---------|----------|
| Liste | `GET /integrations/list` |
| Lagre config | `POST /integrations/save` med `{platform, enabled, webhookUrl?, apiKey?}` |
| Slett | `DELETE /integrations/delete` med `{platform}` |

### Tab 4: MCP

```
┌─ MCP-servere ──────────────────────────────────────────────────┐
│                                                                │
│  Installerte                                                   │
│  ┌─ filesystem ── 🟢 ── general ────── [⚙] [🔄] [Avinstall]┐│
│  │ Filsystem-tilgang for agent                               ││
│  │ Verktøy: read_file, write_file, list_dir (3)             ││
│  └────────────────────────────────────────────────────────────┘│
│  ┌─ github ── 🟢 ── code ──────────── [⚙] [🔄] [Avinstall]┐│
│  │ GitHub API-tilgang                                        ││
│  │ Verktøy: search_repos, get_file, create_pr (8)           ││
│  └────────────────────────────────────────────────────────────┘│
│  ...                                                           │
│                                                                │
│  Tilgjengelige                                                 │
│  ┌─ puppeteer ── ⚪ ── general ─────────────── [Installer] ─┐│
│  │ Nettleser-automatisering                                  ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  Routing-status                                                │
│  Aktive servere: 4 | Tilgjengelige verktøy: 23               │
│  Siste helsesjekk: 5 min siden | Neste: om 10 min            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**API-kall:**

| Element | API-kall |
|---------|----------|
| Liste | `GET /mcp/list` |
| Installer | `POST /mcp/install` med `{serverId}` |
| Avinstaller | `POST /mcp/uninstall` med `{serverId}` |
| Konfigurer [⚙] | `POST /mcp/configure` med `{serverId, envVars}` |
| Helsesjekk [🔄] | `POST /mcp/validate` med `{serverId}` |
| Routing-status | `GET /mcp/routing-status` |

### Tab 5: Komponenter

```
┌─ Komponenter ──────────────────────────────────────────────────┐
│                                                                │
│  🔍 [Søk...              ]  [Kategori ▼]                     │
│                                                                │
│  ┌─ AuthMiddleware ── stable ── 92% ──────────────────────┐  │
│  │ JWT-validering med refresh-token-støtte                 │  │
│  │ Tags: auth, jwt, middleware                             │  │
│  │ Brukt i: 3 repos · Versjon: 2                          │  │
│  │ [Oppdater]  [Se healing-historikk]                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ...                                                           │
│                                                                │
│  Healing-pipeline                                              │
│  Siste kjøring: fre 05:00 · Komponenter sjekket: 12          │
│  Problemer funnet: 2 · Oppgaver opprettet: 1                 │
│  [Se healing-detaljer]                                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**API-kall:**

| Element | API-kall |
|---------|----------|
| Liste | `GET /registry/list` med `{search?, category?}` |
| Oppdater | `POST /registry/trigger-healing` med `{componentId}` |
| Healing-status | `GET /registry/healing-status` |

### Tab 6: System

```
┌─ System ───────────────────────────────────────────────────────┐
│                                                                │
│  Cron-jobber                                                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Jobb               Neste kjøring      Siste    Status   │  │
│  │ Monitor helsesjekk Søn 05:00 CEST     I dag    🟢      │  │
│  │ Drømmemotor        Søn 05:00 CEST     Sist søn 🟢      │  │
│  │ Memory decay       Man 05:00 CEST     I dag    🟢      │  │
│  │ Memory cleanup     Man 06:00 CEST     I dag    🟢      │  │
│  │ Rate limit cleanup Man 05:00 CEST     I dag    🟢      │  │
│  │ Sandbox cleanup    Hvert 30. min      14:30    🟢      │  │
│  │ Healing pipeline   Fre 05:00 CEST     Sist fre 🟢      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  [🔄 Kjør alle nå]  [Se logg]                                │
│                                                                │
│  Individuelle trigger:                                         │
│  [🌙 Drøm] [🏥 Monitor] [🧹 Cleanup] [📉 Decay] [🔧 Heal] │
│                                                                │
│  Encore-tjenester                                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ gateway 🟢 | chat 🟢 | ai 🟢 | agent 🟢 | tasks 🟢   │  │
│  │ builder 🟢 | github 🟢 | sandbox 🟢 | linear 🟢       │  │
│  │ memory 🟢 | skills 🟢 | registry 🟢 | templates 🟢    │  │
│  │ mcp 🟢 | integrations 🟢 | monitor 🟢                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  Sikkerhetsrapport                                             │
│  Innloggingsforsøk siste 24t: 3 (0 mislykket)               │
│  Rate limits utløst: 0                                         │
│  Circuit breakers: AI 🟢 | GitHub 🟢 | Sandbox 🟢           │
│  [Last ned sikkerhetsrapport]                                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**API-kall:**

| Element | API-kall |
|---------|----------|
| Sikkerhetsrapport | `GET /users/security/login-report` |
| Trigger monitor | `POST /monitor/check` med `{repo: "alle"}` |
| Trigger drøm | `POST /memory/dream` |
| Trigger cleanup | `POST /memory/cleanup` |
| Trigger decay | `POST /memory/decay` |
| Trigger healing | `POST /registry/trigger-healing` |
| Circuit breaker status | Ny: `GET /agent/circuit-breaker-status` |

**[🔄 Kjør alle nå]** — kjører alle cron-trigger-endepunkter parallelt, viser progresjonsindikator per jobb.

---

## Del 10: Nye backend-endpoints som trengs

For å støtte alt ovenfor trengs disse nye endpunktene:

| Endpoint | Service | Formål |
|----------|---------|--------|
| `POST /monitor/trigger` | monitor | Manuell trigger for helsesjekk |
| `POST /memory/trigger-dream` | memory | Manuell trigger for drømmemotor (eksisterer allerede som `POST /memory/dream`) |
| `GET /agent/circuit-breaker-status` | agent | Status for alle circuit breakers |
| `POST /skills/update` | skills | Oppdater eksisterende skill |
| `POST /skills/delete` | skills | Slett skill |
| `GET /memory/dream-history` | memory | Liste over drømme-kjøringer med statistikk |
| `GET /memory/code-index-status` | memory | Indekseringsstatus per repo |
| `POST /tasks/archive` | tasks | Bulk-arkiver tasks |
| `POST /tasks/bulk-delete` | tasks | Bulk-slett tasks |
| `GET /agent/audit/{taskId}` | agent | Audit-logg for enkelt task |
| `GET /agent/stream/{taskId}` | agent | SSE-stream (erstatter polling, kan være eksisterende) |

---

## Del 11: Sprint-plan (oppdatert)

### Sprint 1 — Kritiske bugs (dag 1, ~6.5t)
Uendret fra v2. Fiks de 7 kritiske bugene.

### Sprint 2 — Sidestruktur + Oversikt (dag 2-3, ~12t)
- Ny sidebar med 7 items (inkl. Drømmer som egen)
- Oversikt-side med statuskort, reviews, aktivitet, drøm-widget, helse
- Oppgaver-side (slå sammen Tasks + Projects + Linear-sync)
- Innstillinger-side (slå sammen alle konfig-sider med tabs)
- Fjern Sandbox-side

### Sprint 3 — Huginn (dag 3-5, ~16t)
- Ny samarbeids-layout med repo-velger og full-bredde
- Tre-lags visning (chat / arbeidskort / review)
- Samtale-drawer
- Sub-agent panel
- SSE-only arkitektur
- Error recovery + connection status
- Diff-visning i review-kort
- Cmd+K command palette

### Sprint 4 — Drømmer + Hukommelse (dag 5-6, ~10t)
- Drømmer-side: journal, innsikter, konstellasjoner, motor
- Hukommelse-side: minner, mønstre, skills, kodeindeks
- Manuell drøm-trigger
- Pin/unpin minner
- Konstellasjons-graf (d3.js)
- Drøm-historikk endpoint

### Sprint 5 — Muninn BETA (dag 6-7, ~10t)
- Ny autonom-side med BETA-badge
- Oppgave-skjema med sikkerhetsnivåer
- Live-logg visning
- Rapport-generering
- AI self-review (skip review gate)
- Audit-logg endpoint

### Sprint 6 — Polish & AI-intelligens (dag 7-8, ~8t)
- Chain-of-thought i prompts
- Nye chat-tools (run_tests, search_memory, etc.)
- Tilgjengelighet (a11y)
- Loading states og error boundaries
- Responsivt design

**Total: ~62.5 timer (8-9 arbeidsdager)**

---

## Del 12: Hva dette gir TheFold

| Før | Etter |
|-----|-------|
| 13 sider | 7 tydelige sider |
| Chat gjør alt dårlig | To dedikerte modi (Huginn + Muninn) |
| Dashboard med tom data | Oversikt med reviews, aktivitet, drøm-widget |
| Drømmer gjemt i Memory | Egen Drømmer-side med journal, innsikter, grafer |
| Memory/Knowledge/Skills spredt | Én Hukommelse-side med tabs |
| 5 konfig-sider | Én Innstillinger-side |
| Ingen manuell cron-trigger | System-tab med alle triggere |
| Ingen diff-visning | Inline diff i review-kort |
| Ingen autonom modus | Muninn BETA med rapport og self-review |
| Drømmemotor er usynlig | Drømmer er prominent, med journal og grafer |

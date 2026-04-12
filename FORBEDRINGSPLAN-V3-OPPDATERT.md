# TheFold — Forbedringsplan v3 OPPDATERT: Komplett sidedesign

> 12. april 2026. Revidert etter feature-for-feature sammenligning med eksisterende frontend.
> Navnevalg: **Huginn** (samarbeid) + **Muninn** (autonom). Odins ravner.

---

## Del 0: Feature-sammenligning — hva vi har vs. hva planen dekker

### Funksjoner vi MÅ beholde (finnes i dag, mangler/uklart i v3-planen)

| # | Eksisterende funksjon | Hvor den er i dag | Status i v3-plan | Handling |
|---|----------------------|-------------------|------------------|---------|
| 1 | **Samtaletyper** (main, repo-spesifikk, inkognito) | Chat | Ikke nevnt | Må inn i Huginn — samtaler er enten frie eller repo-bundne |
| 2 | **transferContext()** — overføre kontekst mellom repos | Chat API | Ikke nevnt | Kritisk — må inn i Huginn repo-velger |
| 3 | **Cancel generation** knapp | Chat | Ikke nevnt | Må inn i Huginn input-felt |
| 4 | **ProactiveSuggestions** — AI-forslag i chat | Chat | Bare i Oversikt | Må inn i Huginn (tom samtale) |
| 5 | **MemoryInsight-kort** inline i chat | Chat MessageList | Ikke nevnt | Må inn i Huginn meldingsflyt |
| 6 | **ToolCallCard** — viser tool-bruk med input/output | Chat MessageList | Bare nevnt generelt | Detaljeres i Huginn |
| 7 | **ThinkingBlock** — utvidet tenkning | Chat MessageList | Ikke nevnt | Må inn i Huginn |
| 8 | **Auto-send fra URL** (?msg=, ?repo=, ?skills=, ?subagents=) | Chat | Ikke nevnt | Viktig for deep-linking fra Oversikt |
| 9 | **Filopplasting** (uploadChatFile) | Chat | Bare 📎-ikon nevnt | Må detaljere med støttede formater |
| 10 | **Samtalefiltrering per repo** | ConversationSidebar | Ikke nevnt | Må inn i historikk-drawer |
| 11 | **Meldingsmetadata** (modell, kostnad, tokens) per melding | MessageList | Ikke nevnt | Beholde — viktig for transparens |
| 12 | **ChatComposer på dashboard** — hurtigstart | Overview | Ikke nevnt | Beholde i Oversikt |
| 13 | **Stall-deteksjon** med timer + "Fortsett" + "Avbryt" | Chat (60s timeout) | Nevnt vagt | Detaljere med timer-visning |
| 14 | **Circuit breaker i API-klient** | api/client.ts | Ikke nevnt | Beholde — viktig for stabilitet |
| 15 | **estimateCost() / estimateSubAgentCost()** | AI/Agent API | Ikke nevnt | Inn i Muninn oppgaveskjema |
| 16 | **checkPendingTasks()** | Agent API | Ikke nevnt | Brukes av Oversikt |
| 17 | **previewPrompt() / resolveSkills()** | Skills API | Ikke nevnt | Inn i Hukommelse → Skills tab (debug) |
| 18 | **getNotifications()** | Chat API | Ikke nevnt | Beholde NotifBell i header |
| 19 | **getRepoActivity()** | Chat API | Ikke nevnt | Inn i Oppgaver → Prosjekter |
| 20 | **TaskEditor** — inline redigering av tasks | Tasks | Ikke nevnt | Inn i Oppgaver detalj-panel |
| 21 | **Healing pipeline panel** i Monitor | Monitor (høyre kolonne) | Bare widget i Oversikt | Trenger fullstendig visning et sted |
| 22 | **Monitor historikk-tabell** (20 entries) | Monitor | Bare widget i Oversikt | Trenger fullstendig visning |
| 23 | **Manuell monitor-kjøring** med repo-dropdown + resultater | Monitor | Kun i System-tab | Trenger full interaktivitet |
| 24 | **Feature flags-visning** | Settings | Ikke nevnt (fjernes?) | Beholde i System-tab inntil alt er aktivert |
| 25 | **Notification events konfig** (task.completed etc.) | Settings | Nevnt kort i Profil | Detaljere |
| 26 | **ApiKeyForm per MCP-server** med per-variabel inputs | MCP | Nevnt kort | Detaljere |
| 27 | **Discovered tools per MCP-server** | MCP | Ikke nevnt | Må vise — viktig for forståelse |
| 28 | **cleanupReviews() / deleteAllReviews()** | Agent API | Ikke nevnt | Inn i Oppgaver eller System |
| 29 | **Review detail side** (/review/[id]) | Egen side | Ikke nevnt som egen rute | Beholde som modal eller egen rute |
| 30 | **Breadcrumb-navigasjon** | Layout | Ikke nevnt | Beholde |
| 31 | **Sidebar collapse** (260px → 56px) | Layout | Ikke nevnt | Beholde |
| 32 | **Mobile hamburger-meny** | Layout | Ikke nevnt | Beholde og forbedre |

### Funksjoner som bør FORBEDRES (finnes men er halvveis)

| # | Funksjon | Problem i dag | Forbedring |
|---|----------|--------------|-----------|
| F1 | **Skills edit** | Knapp finnes, modal mangler | Fullstendig edit-modal med alle felter |
| F2 | **Memory prune** | Knapp finnes, ingen implementasjon | Koble til `POST /memory/cleanup` |
| F3 | **Notification bell** | Viser rå JSON | Parse agent-status + formatert visning |
| F4 | **Review filvisning** | Rå kode i pre-tag, ingen diff | Syntax-highlighted diff med +/- farger |
| F5 | **Error handling i chat** | Klassifiserer men viser generisk | Spesifikke recovery-handlinger per feiltype |
| F6 | **Docs-side** | Ingen implementasjon | Fjernes — docs er ekstern |
| F7 | **Sandbox-side** | Ingen implementasjon | Fjernes — intern infrastruktur |
| F8 | **AI cost chart** | Bar chart uten tooltip-detaljer | Interaktiv med daglig breakdown |
| F9 | **Agent-modus toggle** på dashboard | Global toggle, uklar effekt | Flytt til Innstillinger → Profil |
| F10 | **Integration event tags** | Hardkodet, ikke konfigurerbar | Gjør konfigurerbar per integrasjon |

---

## Del 1: Navnevalg — BESLUTTET

**Huginn** = samarbeidsmodus. **Muninn** = autonom modus.

Ravnene til Odin. Huginn (tanke) flyr ut og tenker med verden. Muninn (minne) flyr ut alene og bringer tilbake kunnskap.

---

## Del 2: Sidestruktur (13 → 7 sider)

```
1. Oversikt              — actionable dashboard med hurtigstart
2. Huginn                — samarbeidsmodus (erstatter Chat)
3. Muninn                — autonom modus (BETA)
4. Oppgaver              — tasks + projects + reviews sammenslått
5. Drømmer               — drøm-journal + innsikter + konstellasjoner + motor
6. Hukommelse            — minner + mønstre + skills + kodeindeks
7. Innstillinger         — profil + AI-modeller + integrasjoner + MCP + komponenter + system
```

### Layout-ramme (beholdes fra i dag, forbedret)

```
┌─ Header (64px) ─────────────────────────────────────────────────┐
│ [Logo]  [Breadcrumb...]           [Repo ▼] [📚 Docs] [🔔] [⚙]│
├─ Sidebar (260px / 56px collapsed) ┬─ Content ──────────────────┤
│                                    │                            │
│ 👁 Oversikt                       │                            │
│ 🐦 Huginn                         │  (sideinnhold)             │
│ 🐦‍⬛ Muninn  BETA                   │                            │
│ 📋 Oppgaver                       │                            │
│ 🌙 Drømmer                        │                            │
│ 🧠 Hukommelse                     │                            │
│ ⚙ Innstillinger                   │                            │
│                                    │                            │
│ [◀ Collapse]                      │                            │
└────────────────────────────────────┴────────────────────────────┘
```

- **Header:** Beholdes med Repo-velger, NotifBell (fikset formattering), Docs-link, Settings-link
- **Sidebar:** Collapsible (260px → 56px), mobile hamburger-meny beholdes
- **Breadcrumbs:** Beholdes for alle sider unntatt Huginn (full-bredde)
- **NotifBell:** `getNotifications()` — parses agent_status riktig (fiks F3)

---

## Del 3: Side 1 — Oversikt

### Hva vi beholder fra i dag
- ChatComposer hurtigstart (⬆ #12) — beholdes nederst som "Spør Huginn noe..."
- Stat-kort (tokens, kostnad, aktive tasks, suksessrate)
- AI-suggestions med handlingsknapper
- Skills-oversikt (aktive + topp 4)
- Lenker til alle undersider

### Hva vi ENDRER
- Fjerner: Agent-modus toggle og Sub-agents toggle (flyttes til Innstillinger → Profil, #F9)
- Fjerner: Tom "alt ser bra ut" melding
- Legger til: Ventende reviews med direkte Godkjenn/Avvis
- Legger til: Drøm-widget med siste innsikt
- Legger til: Repo-helse fra monitor
- Legger til: Aktivitetstidslinje

### Fullstendig layout

```
┌────────────────────────────────────────────────────────────────┐
│  Oversikt                                                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─ Tokens ──┐ ┌─ Kostnad ──┐ ┌─ Aktive ───┐ ┌─ Suksess ──┐│
│  │  12.4K    │ │  $1.24    │ │  3 tasks   │ │  94%       ││
│  │  i dag    │ │  ↓12% uke │ │  + 2 review│ │  siste 30d ││
│  └───────────┘ └───────────┘ └────────────┘ └────────────┘│
│                                                                │
│  ┌─ Venter på deg ──────────────────────────────────────────┐ │
│  │ ⚡ Dark mode toggle    7.8/10  5 filer  [Godkjenn] [Avvis]│ │
│  │ ⚡ API rate limiter    8.2/10  3 filer  [Godkjenn] [Avvis]│ │
│  │ 0 flere ventende  [Se alle i Oppgaver →]                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─ AI-forslag ───────────────┐ ┌─ Siste aktivitet ────────┐ │
│  │ 💡 "3 tasks har lignende   │ │ 14:23  PR opprettet      │ │
│  │    feilmønster..."         │ │ 14:20  Review godkjent   │ │
│  │    [Vis tasks →]           │ │ 13:45  Task startet      │ │
│  │ 💡 "ESLint warnings opp    │ │ 12:10  Linear synced     │ │
│  │    40% i webapp"           │ │ 11:30  Drøm fullført     │ │
│  │    [Kjør monitor →]        │ │                           │ │
│  └─────────────────────────────┘ └───────────────────────────┘ │
│                                                                │
│  ┌─ Repo-helse ─────────────┐ ┌─ 🌙 Siste drøm ───────────┐ │
│  │ webapp     ████████ 9/10 │ │ Søn 05:00 — "Auth-mønster  │ │
│  │ api-server ██████░░ 7/10 │ │ gjentar seg i 4 repos."    │ │
│  │ mobile     ████░░░░ 5/10 │ │ 5 klynger · 12→3 minner   │ │
│  │ [Kjør helsesjekk 🔄]     │ │ [Se full drøm →]           │ │
│  └───────────────────────────┘ └─────────────────────────────┘ │
│                                                                │
│  ┌─ Skills ──────────────────┐ ┌─ Hukommelse ──────────────┐  │
│  │ 4 aktive av 6             │ │ 287 minner · 34 mønstre   │  │
│  │ TS Best Practices  23x   │ │ Avg decay: 0.67           │  │
│  │ React Patterns     18x   │ │ 12 pinned · 23 utløper    │  │
│  │ [Se alle skills →]       │ │ [Se hukommelse →]          │  │
│  └───────────────────────────┘ └─────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Spør Huginn noe...                           [Send ⌘⏎] │  │
│  │  [Skills ▼] [Modell ▼]                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### API-kall (komplett)

| Element | API-kall | Oppdatering |
|---------|----------|-------------|
| Stat-kort tokens | `getCostSummary()` | Hvert 5. min |
| Stat-kort kostnad | `getCostSummary()` | Hvert 5. min |
| Stat-kort aktive | `getTaskStats()` | Hvert 30. sek |
| Stat-kort suksess | `getAuditStats()` | Hvert 5. min |
| Ventende reviews | `listReviews({status: "pending"})` | Hvert 30. sek |
| AI-forslag | `getSuggestions(repoName, 6)` | Ved sidelast + repo-bytte |
| Aktivitetstidslinje | `listTheFoldTasks({limit: 10, sort: "updatedAt"})` | Hvert 60. sek |
| Repo-helse | `getMonitorHealth()` | Hvert 5. min |
| Siste drøm | `searchMemories("", {tags: ["dream-meta"], limit: 1})` | Ved sidelast |
| Skills | `listSkills()` | Ved sidelast |
| Hukommelse | `getMemoryStats()` | Ved sidelast |
| Pending tasks | `checkPendingTasks()` | Hvert 30. sek (#16) |
| Hurtigstart | `sendMessage()` via ChatComposer | Ved submit → naviger til Huginn |

### Hurtigstart-logikk (#12)
ChatComposer nederst. Når bruker sender melding:
1. Oppretter samtale-ID basert på valgt repo: `repo-{name}-{uuid}` eller `main-{uuid}`
2. `POST /chat/send` med melding
3. Navigerer til `/huginn?conversationId={id}`
4. Huginn fanger opp og viser svaret

---

## Del 4: Side 2 — Huginn (samarbeidsmodus)

### Hva vi beholder fra i dag
- SSE streaming via `useAgentStream` med alle event-typer (#6, #7)
- Polling fallback (2s intervall, 87s vindu)
- Samtaletyper: main, repo-spesifikk, inkognito (#1)
- Repo-filtrering i samtalehistorikk (#10)
- Context transfer ved repo-bytte (#2)
- Cancel generation (#3)
- ProactiveSuggestions i tom samtale (#4)
- MemoryInsight-kort inline (#5)
- ToolCallCard med input/output (#6)
- ThinkingBlock for utvidet tenkning (#7)
- Auto-send fra URL-params (#8)
- Filopplasting (#9)
- Meldingsmetadata per melding (#11)
- Stall-deteksjon (60s) med timer + Fortsett + Avbryt (#13)
- Circuit breaker i API-klient (#14)

### Hva vi ENDRER
- Sidebar (280px) → Historikk-drawer (skjult, åpnes fra høyre)
- Inline review-knapper → Dedikert review-kort (sticky)
- "Tenker..." indikator → Faselinje i arbeidskort
- Rå JSON i status → Formaterte faselinjer
- Ingen diff → Syntax-highlighted diff-visning (#F4)
- Ingen Cmd+K → Command palette
- Ingen connection status → Visuell indikator
- Ingen sub-agent synlighet → Sub-agent panel

### Fullstendig layout

```
┌────────────────────────────────────────────────────────────────┐
│  [Repo: thefold-dev/webapp ▼]   [Skills ▼]  [⏰] [⌨] [🔗]   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─ 💬 Chat ──────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  🧑 Lag en dark mode toggle-komponent med Tailwind      │   │
│  │                                                         │   │
│  │  🤖 Ser på oppgaven. Analyserer repoet...               │   │
│  │     claude-sonnet-4-5 · 1.2K tokens · $0.004              │   │
│  │                                                         │   │
│  │  ┌─ 💡 Minne-innsikt ────────────────────────────────┐  │   │
│  │  │ "webapp bruker CSS custom properties for temaing"  │  │   │
│  │  │ decision · decay: 82% · brukt 7x                   │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  │  ┌─ 🔧 Arbeidskort: Dark mode toggle ─── Jobb #47 ──┐  │   │
│  │  │  Kontekst → Plan → Bygging → Validering → Review  │  │   │
│  │  │     ✅       ✅     ⏳ 3/5      ○           ○      │  │   │
│  │  │                                                    │  │   │
│  │  │  📄 5 filer | ⏱ 84s | 💰 $0.03 | 🧪 3/0         │  │   │
│  │  │                                                    │  │   │
│  │  │  Tool-bruk:                                        │  │   │
│  │  │  ┌ 🔧 read_file("src/app/layout.tsx") ─────────┐  │  │   │
│  │  │  │ → 142 linjer lest                            │  │  │   │
│  │  │  └──────────────────────────────────────────────┘  │  │   │
│  │  │  ┌ 🔧 search_code("theme toggle") ─────────────┐  │  │   │
│  │  │  │ → 3 resultater funnet                        │  │  │   │
│  │  │  └──────────────────────────────────────────────┘  │  │   │
│  │  │                                                    │  │   │
│  │  │  Tenkning:                                         │  │   │
│  │  │  ┌ 💭 "Repoet bruker allerede CSS vars. Bør      ┐│  │   │
│  │  │  │ bygge på dette i stedet for ny løsning..."     ││  │   │
│  │  │  └────────────────────────────────────────────────┘│  │   │
│  │  │                                                    │  │   │
│  │  │  [Vis filer ▼]  [Vis diff ▼]                      │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  │  ┌─ ⚡ Review klar ─────────────── Score: 8.2/10 ───┐  │   │
│  │  │  AI: "Ren implementasjon, mangler a11y-label."    │  │   │
│  │  │  ⚠️ Ingen aria-label på toggle                     │  │   │
│  │  │  ⚠️ Bør bruke prefers-color-scheme                │  │   │
│  │  │  💡 Minne: "webapp bruker CSS custom properties"  │  │   │
│  │  │                                                    │  │   │
│  │  │  [✅ Godkjenn & PR] [✏️ Endringer] [❌ Avvis]    │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ Sub-agents (2 aktive) ─────────────── Jobb #47 ────────┐  │
│  │  🧪 Tester    ██████████░░░ 78%  "integrasjonstest"      │  │
│  │  📋 Reviewer   ░░░░░░░░░░░░ venter på tester             │  │
│  │  [Vis detaljer →]                                         │  │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─ ⚠️ Agenten har stoppet (73s) ── [Fortsett] [Avbryt] ──┐  │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Skriv en melding...          [📎] [⏹ Avbryt] [Send ⌘⏎] │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Topplinje — komplett

| Element | Funksjon | API / Handling |
|---------|----------|---------------|
| **[Repo ▼]** | Repo-velger med auto-complete | `GET /github/repos` |
| **[Skills ▼]** | Multi-select, auto-resolve per repo | `POST /skills/resolve` + `GET /skills/list` |
| **[⏰]** | Historikk-drawer (se under) | `GET /chat/conversations` |
| **[⌨]** | Command palette (Cmd+K) | Lokal |
| **[🔗]** | Connection status (🟢/🔴/🟡) | SSE-tilstand fra `useAgentStream` |

### Repo-velger med context transfer (#2)
- Bytte repo → dialog: "Overføre kontekst fra nåværende samtale?"
- Ja → `transferContext(sourceConvId, targetRepo)` → ny samtale med oppsummert kontekst
- Nei → ny tom samtale for valgt repo
- Samtale-ID-format: `repo-{repoName}-{uuid}`

### Historikk-drawer (#1, #10)
```
┌─ Samtaler ────────── [Alle ▼] ── [✕] ─┐
│                                         │
│  Filter: [Alle] [Repo] [Frie] [Inkognito] │
│  🔍 Søk i samtaler...                  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 🟢 Dark mode toggle             │   │
│  │ webapp · 14 min · 8 msg         │   │
│  │                          [🗑]   │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ 🔵 API auth middleware          │   │
│  │ api-server · 2t · 23 msg       │   │
│  └─────────────────────────────────┘   │
│  ...                                    │
│                                         │
│  [+ Ny samtale]  [+ Inkognito 🔒]     │
└─────────────────────────────────────────┘
```

- **Filter-tabs:** Alle, Repo (bare repo-spesifikke), Frie (main-*), Inkognito (inkognito-*)
- **Søk:** Filtrerer lokalt på tittel
- **Inkognito:** Ny samtale uten kontekst-lagring, ID-format: `inkognito-{uuid}`
- **Slett:** Hover-reveal 🗑-knapp → `deleteConversation(id)` med bekreftelse
- **Status-prikk:** 🟢 aktiv samtale, 🔵 inaktiv, 🟡 har ventende review

### Meldingstyper i chat (#5, #6, #7, #11)

| Meldingstype | Visning | Data |
|-------------|---------|------|
| **user** | Høyrejustert boble med bakgrunn | `role: "user"` |
| **assistant** | Venstrejustert med metadata-linje: modell, tokens, kostnad | `role: "assistant"` + metadata JSON |
| **agent_status** | AgentStream komponent med faselinje | `messageType: "agent_status"` |
| **agent_progress** | Arbeidskort med faser + tool-bruk | `messageType: "agent_progress"` |
| **memory_insight** | MemoryInsight-kort med decay + type | `messageType: "memory_insight"` |
| **agent_thought** | ThinkingBlock, kollapserbar | `messageType: "agent_thought"` |
| **tool_call** | ToolCallCard med input/output, kollapserbar | Fra SSE `agent.tool_use` + `agent.tool_result` |
| **context_transfer** | Info-kort "Kontekst overført fra {repo}" | `messageType: "context_transfer"` |

### Filopplasting (#9)

Knapp: **📎** i input-felt

| Format | Maks størrelse | Bruk |
|--------|---------------|------|
| Bilder (png, jpg, gif) | 5 MB | Visuell kontekst |
| Kode (ts, tsx, js, py, etc.) | 1 MB | Direkte kodekontekst |
| PDF | 10 MB | Dokumenter |
| Tekst (txt, md, csv) | 1 MB | Data/docs |

API: `uploadChatFile(conversationId, filename, contentType, content, sizeBytes)`
Vises som vedlegg-kort i meldingen med filnavn + størrelse + forhåndsvisning.

### Auto-send fra URL (#8)

| Parameter | Effekt |
|-----------|--------|
| `?msg=Lag en login-side` | Pre-fyller og sender automatisk |
| `?repo=thefold-dev/webapp` | Velger repo |
| `?skills=skill-id-1,skill-id-2` | Aktiverer skills |
| `?subagents=true` | Aktiverer sub-agents |
| `?conversationId=abc-123` | Åpner eksisterende samtale |

Brukes av: Oversikt hurtigstart, Oppgaver "Åpne i Huginn", Drømmer "Bruk i oppgave"

### Stall-deteksjon (#13)

```
┌─ ⚠️ Agenten har stoppet (73s) ──────────────────────────────┐
│  Ingen aktivitet på 60 sekunder. Noe kan ha gått galt.       │
│  [🔄 Fortsett]  [⏹ Avbryt]                                  │
└──────────────────────────────────────────────────────────────┘
```

- Timer vises i sanntid (teller opp fra 60s)
- **[Fortsett]:** `forceContinueTask(taskId, conversationId)`
- **[Avbryt]:** `cancelChatGeneration(conversationId)` + `POST /agent/cancel/{taskId}`
- Beholdes fra eksisterende implementasjon, men med tydeligere UI

### Cmd+K Command palette

| Kommando | Handling |
|----------|----------|
| `/ny` | Ny samtale |
| `/inkognito` | Ny inkognito-samtale |
| `/task [tittel]` | Opprett task via tool-use |
| `/start [taskId]` | Start eksisterende task |
| `/review` | Vis ventende reviews |
| `/skills` | Åpne skills-velger |
| `/modell [navn]` | Bytt modell |
| `/repo [navn]` | Bytt repo |
| `/drøm` | Trigger drømmemotor |
| `@fil [sti]` | Legg til fil som kontekst |
| `Ctrl+K` / `Cmd+K` | Åpne palette |
| `Escape` | Lukk palette |

### SSE events → UI (komplett)

| SSE-event | Wire-data | UI-komponent | Handling |
|-----------|-----------|-------------|---------|
| `agent.status` | `{status, phase, message, loop}` | Faselinje i arbeidskort | Oppdater fase-progress |
| `agent.message` | `{role, content, delta, model}` | Chat-boble | Append tekst |
| `agent.tool_use` | `{toolName, toolUseId, input, loopIteration}` | ToolCallCard | Vis tool-bruk med input |
| `agent.tool_result` | `{toolUseId, toolName, content, isError, durationMs}` | ToolCallCard (oppdatert) | Vis resultat |
| `agent.thinking` | `{thought}` | ThinkingBlock | Vis tenkning (kollapserbar) |
| `agent.error` | `{message, code?, recoverable?}` | ErrorCard med retry | Vis feil + handling |
| `agent.done` | `{}` | Ferdig-status | Fjern spinner, aktiver review |

### Diff-visning (NYT, #F4)

Når bruker klikker **[Vis diff ▼]** i arbeidskort eller review:

```
┌─ src/components/DarkToggle.tsx ───────── +89 linjer ── [✕] ──┐
│                                                               │
│  1  + import { useState, useEffect } from 'react'            │
│  2  +                                                         │
│  3  + export function DarkToggle() {                          │
│  4  +   const [dark, setDark] = useState(false)               │
│  5  +                                                         │
│  6  +   useEffect(() => {                                     │
│  7  +     document.body.classList.toggle('dark', dark)         │
│  8  +   }, [dark])                                            │
│  ...                                                          │
└───────────────────────────────────────────────────────────────┘
```

- Grønn bakgrunn for nye linjer (+)
- Rød bakgrunn for slettede linjer (-)
- Grå for uendrede kontekstlinjer
- Linjenummer til venstre
- Syntax highlighting basert på filtype
- Scrollbar med minimap for lange filer

---

## Del 5: Side 3 — Muninn (autonom modus, BETA)

### Komplett som i v3-planen, med tillegg:

#### Kostnadsestimat i oppgaveskjema (#15)

Etter at bruker fyller inn tittel + beskrivelse:
- Frontend kaller `estimateSubAgentCost(complexity, budgetMode)` automatisk (debounced)
- Viser estimat: "Estimert kostnad: $0.05-$0.15 · ~2 min"
- Oppdateres når sikkerhetsnivå endres

#### Review-rute (#29)

Når Muninn produserer rapport med score <7:
- Vises i Oppgaver som "Trenger manuell review"
- Klikk → full review-side (`/oppgaver/review/{id}`) med alle detaljer
- Samme review-komponent som Huginn bruker

---

## Del 6: Side 4 — Oppgaver

### Hva vi beholder + forbedrer fra i dag

| Fra i dag | Forbedring |
|-----------|-----------|
| Split-view (liste + detalj) | Beholdes, bredere detalj-panel |
| Create task modal | Beholdes, + "Opprett & start ▶" knapp |
| Quality score farger | Beholdes (≥8 grønn, ≥6 gul, <6 rød) |
| LinearSync komponent | Flyttes til egen tab |
| TaskEditor inline (#20) | Beholdes i detalj-panel |
| PR-link | Beholdes, mer prominent |
| Sub-tasks med status | Beholdes |

### Ny: Tab-struktur

```
[Alle oppgaver (47)]  [Prosjekter (3)]  [Reviews (2)]  [Linear]
```

#### Tab: Reviews (NY — #29)

Samler alle reviews fra `listReviews({})`:

```
┌─ Reviews ──────────────────────────────────────────────────────┐
│                                                                │
│  ┌─ Ventende (2) ──────────────────────────────────────────┐  │
│  │ #47 Dark mode toggle   7.8/10   5 filer   14 min       │  │
│  │ [Godkjenn] [Endringer] [Avvis] [Se full review →]      │  │
│  │                                                          │  │
│  │ #46 API rate limiter   8.2/10   3 filer   2 timer       │  │
│  │ [Godkjenn] [Endringer] [Avvis] [Se full review →]      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─ Fullførte (14) ────────────────────────────────────────┐  │
│  │ #45 DB migration       9.1/10   PR #87   ✅ Godkjent    │  │
│  │ #44 Auth fix           7.4/10   PR #85   ✅ Godkjent    │  │
│  │ #43 Test refactor      6.2/10   —        ❌ Avvist      │  │
│  │ ...                                                      │  │
│  │ [Rydd opp gamle reviews] ← cleanupReviews() (#28)      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**[Se full review →]** åpner review-modal eller navigerer til `/oppgaver/review/{id}` med:
- Fil-liste med diff-visning
- AI-vurdering, bekymringer, arkitektur-beslutninger
- Minner ekstrahert
- Summary-stats (opprettet/endret/slettet filer)
- Alle handlingsknapper

#### Tab: Prosjekter — med aktivitetsdata (#19)

Bruker `getRepoActivity(repoName)` i tillegg til task-gruppering:
- Aktivitetstidslinje per repo (siste 20 hendelser)
- PR-historikk
- Kostnadsfordeling per repo

#### Inline TaskEditor (#20)

I detalj-panelet, klikk på tittel/beskrivelse for å redigere inline:
- Autosave etter 2s debounce
- API: `POST /tasks/update` med `{taskId, title?, description?, labels?}`

---

## Del 7: Side 5 — Drømmer

### Komplett som i v3-planen (4 tabs: Journal, Innsikter, Konstellasjoner, Motor)

Ingen endringer nødvendige — dette var allerede godt gjennomarbeidet.

---

## Del 8: Side 6 — Hukommelse

### Komplett som i v3-planen med tillegg:

#### Skills tab — forbedringer (#F1, #17)

**Edit-modal (NYTT, #F1):**
Samme layout som opprett-modal, men forhåndsutfylt. Alle felter redigerbare:
- Navn, beskrivelse, prompt-fragment, fase, scope, prioritet
- Routing rules (keywords, file patterns, labels)
- API: `POST /skills/update` (nytt endpoint)

**Slett-knapp:**
- Bekreftelses-dialog: "Slett skill '{navn}'? Dette kan ikke angres."
- API: `DELETE /skills/delete` (nytt endpoint)

**Debug-verktøy (#17):**
- **[Forhåndsvis prompt]** knapp → `previewPrompt({repoName, taskDescription})` → viser samlet system-prompt med aktive skills
- **[Test skill-matching]** → `resolveSkills({repoName, taskDescription, labels})` → viser hvilke skills som matcher og hvorfor

#### Stats-header (beholdt fra Skills-siden)
```
AKTIVE: 4 av 6 | PIPELINE: pre_run → inject → post_run | TOKEN-BUDSJETT: 2.4K / 4K
```

#### Memory prune (#F2)
Prune-knappen kobles til `POST /memory/cleanup`:
- Viser antall som vil slettes (tørr-kjøring først)
- Bekreftelses-dialog: "Slett 23 utløpte minner?"

---

## Del 9: Side 7 — Innstillinger

### Komplett som i v3-planen med tillegg:

#### Profil-tab — tillegg (#F9, #25)

**Preferanser (flyttet fra dashboard):**
```
Agent-modus:     [Balansert ▼]  (Sparing / Balansert / Kvalitet)
Sub-agents:      [Auto ▼]       (Av / Auto / Alltid på)
Standard repo:   [thefold-dev/webapp ▼]
```

**Notification events (#25) — konfigurerbare:**
```
Hendelser:
☑ task.completed    — Når en oppgave er ferdig
☑ review.pending    — Når review venter på deg
☑ health.alert      — Når helsesjekk finner problemer
☑ agent.error       — Når agenten feiler
☑ dream.completed   — Når drøm er fullført
☐ cost.threshold    — Når daglig kostnad overstiger [$X]
```

#### MCP-tab — tillegg (#26, #27)

**Discovered tools per server (#27):**
```
┌─ github ── 🟢 ── code ────────────────────────────────────┐
│ GitHub API-tilgang                                          │
│                                                             │
│ Oppdagede verktøy (8):                                     │
│ search_repos · get_file · create_pr · list_commits          │
│ get_tree · create_branch · push_files · get_repo_info      │
│                                                             │
│ [⚙ Konfigurer] [🔄 Helsesjekk] [Avinstaller]             │
└─────────────────────────────────────────────────────────────┘
```

**ApiKeyForm (#26):**
```
┌─ Konfigurasjon ──────────────────────────────────────────┐
│ GITHUB_TOKEN:  [••••••••••••••••••••] [👁]              │
│ GITHUB_OWNER:  [thefold-dev          ]                   │
│                                                          │
│ [Lagre & konfigurer]  [Avbryt]                          │
└──────────────────────────────────────────────────────────┘
```
Per miljøvariabel definert i MCP-serverens config. Password-input med vis/skjul toggle.

#### System-tab — tillegg (#21, #22, #23, #24)

**Monitor fullvisning (#21, #22, #23):**

Selv om Monitor ikke har egen side lenger, trenger System-tab fullstendig monitor-funksjonalitet:

```
┌─ Helseovervåking ──────────────────────────────────────────────┐
│                                                                │
│  Kjør sjekk: [thefold-dev/webapp ▼]  [Kjør nå 🔄]            │
│                                                                │
│  Siste resultater:                                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Repo          │ Type          │ Status │ Detalj          │ │
│  │ webapp        │ dep_audit     │ 🟢    │ 0 vulnerabilities│ │
│  │ webapp        │ test_coverage │ 🟡    │ 67% (mål: 80%)  │ │
│  │ webapp        │ code_quality  │ 🟢    │ 2 warnings       │ │
│  │ api-server    │ dep_audit     │ 🔴    │ 3 critical       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Vis historikk ▼] (siste 20 sjekker for valgt repo)          │
│                                                                │
│  Healing pipeline:                                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Komponent      │ Alvorlighet │ Status    │ Opprettet    │ │
│  │ AuthMiddleware  │ 🟡 medium  │ in_progress│ 2t siden    │ │
│  │ APIClient       │ 🔴 critical│ pending   │ 5t siden    │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**Feature flags (#24):**
Beholdes som read-only liste inntil alle er aktivert, deretter fjernes seksjonen:
```
Feature flags (midlertidig):
ProgressMessageEnabled:   true  🟢
GitHubAppEnabled:        false  🔴
DynamicSubAgentsEnabled: false  🔴
HealingPipelineEnabled:  false  🔴
...
```

---

## Del 10: Nye backend-endpoints (oppdatert)

| # | Endpoint | Service | Formål | Prioritet |
|---|----------|---------|--------|-----------|
| 1 | `POST /monitor/trigger` | monitor | Manuell helsesjekk-trigger | Sprint 1 |
| 2 | `POST /skills/update` | skills | Oppdater eksisterende skill | Sprint 2 |
| 3 | `DELETE /skills/delete` | skills | Slett skill | Sprint 2 |
| 4 | `GET /memory/dream-history` | memory | Drøm-kjøringer med statistikk | Sprint 4 |
| 5 | `GET /memory/code-index-status` | memory | Indekseringsstatus per repo | Sprint 4 |
| 6 | `POST /tasks/archive` | tasks | Bulk-arkiver tasks | Sprint 2 |
| 7 | `POST /tasks/update` | tasks | Oppdater task inline | Sprint 2 |
| 8 | `GET /agent/audit/{taskId}` | agent | Audit-logg for task | Sprint 5 |
| 9 | `GET /agent/circuit-breaker-status` | agent | CB-status for dashboard | Sprint 6 |
| 10 | `POST /tasks/bulk-delete` | tasks | Bulk-slett | Sprint 2 |

---

## Del 11: Sprint-plan (revidert)

### Sprint 1 — Kritiske bugs + cron-triggere (dag 1, ~7t)
- Fiks review dobbelt-klikk
- Fiks notifications rå JSON (#F3)
- Fiks skills appliesTo
- Fiks cron-jobs + `POST /monitor/trigger`
- Fiks zombie jobs
- Fiks import-graf cycles
- Fiks AI retry backoff

### Sprint 2 — Sidestruktur (dag 2-3, ~12t)
- Ny sidebar med 7 items
- Oversikt med alle widgets + hurtigstart ChatComposer (#12)
- Oppgaver (slå sammen Tasks + Projects + Reviews tab + Linear)
- Innstillinger (alle konfig-tabs inkl. full monitor i System)
- Skills update/delete endpoints + edit modal (#F1)
- Tasks update/archive endpoints + inline edit (#20)
- Fjern Sandbox + Docs

### Sprint 3 — Huginn (dag 3-5, ~16t)
- Ny layout med repo-velger, skills, historikk-drawer
- Beholde ALLE meldingstyper: MemoryInsight, ToolCallCard, ThinkingBlock (#5-7)
- Beholde samtaletyper + filtrering + inkognito (#1, #10)
- Beholde context transfer ved repo-bytte (#2)
- Beholde cancel generation + stall-deteksjon (#3, #13)
- Beholde auto-send fra URL (#8)
- Beholde filopplasting (#9)
- Beholde meldingsmetadata (#11)
- NYT: Arbeidskort med faselinje
- NYT: Diff-visning (#F4)
- NYT: Sub-agent panel
- NYT: Cmd+K command palette
- NYT: Connection status-indikator
- SSE-only + error recovery

### Sprint 4 — Drømmer + Hukommelse (dag 5-6, ~10t)
- Drømmer: journal, innsikter, konstellasjoner, motor
- Hukommelse: minner (med prune #F2), mønstre, skills (med debug #17), kodeindeks
- Memory prune knapp (#F2)
- Dream history endpoint
- Konstellasjons-graf (d3.js)

### Sprint 5 — Muninn BETA (dag 6-7, ~10t)
- Autonom side med oppgaveskjema + kostnadsestimat (#15)
- Live-logg, rapport-generering
- AI self-review
- Audit-logg endpoint
- Sikkerhetsnivåer (standard/streng/paranoid)

### Sprint 6 — Polish (dag 7-8, ~8t)
- Chain-of-thought i prompts
- Nye chat-tools (run_tests, search_memory, etc.)
- Tilgjengelighet (a11y)
- Circuit breaker status-visning (#14)
- Mobile responsivitet (#32)
- Loading states + error boundaries

**Total: ~63 timer (8-9 arbeidsdager)**

---

## Del 12: Sammendrag av alle endringer vs. v3

| Endring | Begrunnelse |
|---------|-------------|
| +32 bevarede funksjoner identifisert | Forhindrer funksjonstap ved redesign |
| +10 forbedringer av halvferdige features | Fikser det som er bygd men ikke virker |
| Reviews som egen tab i Oppgaver | Samler review-funksjonalitet (#28, #29) |
| Full monitor i System-tab | Erstatter Monitor-siden uten å miste funksjonalitet (#21-23) |
| Context transfer i Huginn | Kritisk for repo-bytte-workflow (#2) |
| Alle meldingstyper beholdt | Unngår tap av MemoryInsight, ThinkingBlock etc. (#5-7) |
| Samtaletyper beholdt | Main + repo + inkognito (#1) |
| Feature flags beholdt | Synlig til alt er aktivert (#24) |
| Skills debug-verktøy | previewPrompt + resolveSkills (#17) |
| Kostnadsestimat i Muninn | estimateSubAgentCost + estimateCost (#15) |
| Sidebar collapse + mobile | Beholder responsivitet (#31, #32) |
| Breadcrumbs beholdt | Navigasjon (#30) |

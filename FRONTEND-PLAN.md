# FRONTEND-PLAN — TheFold Redesign

_Dato: 24. februar 2026_
_Avhengighet: Z-prosjekt (backend ferdig), Z-CLEANUP (rename/flags ferdig)_

---

## HVA DETTE DOKUMENTET ER

Denne planen beskriver **hva som forsvinner, hva som endres, og hvordan ting skal fungere**. Ingen kode, ingen layout, ingen farger. Claude Code bruker dette sammen med den vedlagte prompten, Firecrawl MCP for å se referansesider, og frontend-design skill for å bygge det faktiske resultatet.

---

## DEL 1: HVA SOM FORSVINNER

### Sider som slettes helt

| Side | Grunn |
|------|-------|
| `/tools/ai-models` | Flyttes inn i én samlet AI-side |
| `/tools/builder` | Builder-jobber vises i chat når agenten jobber |
| `/tools/tasks` | Tasks-liste flyttes til sidebar eller dashboard-widget |
| `/tools/templates` | Templates er nå del av komponentbiblioteket i registry |
| `/tools/observability` | Metrics flyttes til dashboard-widgets |
| `/settings/costs` | Flyttes inn i samlet AI-side |
| `/settings/models` | Flyttes inn i samlet AI-side |

### Komponenter som slettes

| Komponent | Grunn |
|-----------|-------|
| `AgentStatus` (hele komponenten) | Erstattes av AgentProgress inline i chat |
| `AgentWorking` / tenker-indikator med bokser | Erstattes av enkel logo-animasjon |
| Fase-tabs (Forbereder/Bygger/Validerer/etc.) | Forsvinner — status vises som én linje |
| Magic phrases (Tryller/Glitrer/Forhekser) | Forsvinner helt |
| Fase-ikoner (separate ikoner per fase) | Forsvinner — erstattes av steg-liste |
| `parseAgentStatusContent` | Erstattes av `deserializeProgress` |
| `agent_thought` rendering (italic, liten tekst) | Thoughts vises ikke i ny UI |
| `agent_report` message filtering | Rapporter er del av AgentProgress |
| Message type filtering (6 typer → filtrering) | Forenklet — bare `chat` og `agent_progress` |
| Polling-logikk for agent_status | Erstattes av én melding som oppdateres |
| StatusOverride / statusDismissed state | Ikke nødvendig — progress er del av meldingen |
| `lastAgentStatus` / `agentActive` useMemo | Erstattes av enklere sjekk på siste melding |

### Navigasjonspunkter som forsvinner

Dagens sidebar har ~30 navigasjonspunkter. Etter redesign: ~7-10.

Fjernes fra sidebar:
- Tools-undermenyen (7 separate sider → 1-2 sider)
- Settings-undermeny (costs, models, security som separate sider)
- Separate review-side (review skjer i chat)

---

## DEL 2: HVA SOM ENDRES

### Chat — hovedendringen

Chatten er hub for alt. Alt arbeid skjer her, all status vises her.

**Dagens chat:** 
- Bruker sender melding
- Agent svarer med tekst ELLER trigger AgentStatus-boks
- AgentStatus-boks er sticky nederst med tabs, faser, steg, spørsmål
- Agent_thought vises som liten italic tekst
- Agent_report er en egen meldingstype
- Completion er en egen meldingstype
- Review er en lenke til /review/[id]
- 6 forskjellige meldingstyper rendres forskjellig

**Ny chat:**
- Bruker sender melding
- To moduser basert på hva brukeren ber om:

**Modus 1 — Direkte svar:**
Bruker spør et spørsmål → agent svarer med ren tekst. Ingen status, ingen dropdown, ingen plan. Som å snakke med Claude. Ingen synlig forskjell fra en vanlig chatbot.

**Modus 2 — Agent arbeid:**
Bruker gir en oppgave → agent oppdaterer ÉN melding progressivt:

1. Agent-logo vises under siste svar. Logoen animeres (pulse/glow) mens agenten jobber.
2. En statuslinje vises under logoen: "Bygger gateway/auth.ts (2/4)". Alltid én linje. Oppdateres i sanntid.
3. Klikk på statuslinjen → collapsible steg-liste åpnes:
   - ✓ done (grønn hake)
   - ● pågår (pulserende prikk)
   - ○ venter (tom prikk)
4. Når agenten er ferdig, collapses steg-listen automatisk til én linje: "✓ Ferdig — 4 filer, $0.02"
5. Rapport vises inline: filer endret, kostnad, tid, kvalitetsscore
6. Handlingsknapper under rapporten: Godkjenn → PR, Be om endringer, Avvis
7. Bruker klikker Godkjenn → PR opprettes, bekreftet i chatten

**Ingen separate bokser.** Ingen tabs. Ingen sticky-posisjonert AgentStatus. Alt er del av meldingsstrømmen.

**Clarification (når agent er usikker):**
Agenten stiller et vanlig spørsmål i chatten. Ikke en "clarification-tilstand". Ikke en spesiell UI-komponent. Bare et spørsmål som brukeren svarer på. Chatten detekterer at det er et svar på clarification og router det riktig.

**Sub-agenter:**
Når sub-agenter brukes, vises de i steg-listen:
- ● Bygger med 3 agenter (fase 2/3)
  - ✓ Agent 1 (sonnet): gateway/auth.ts
  - ● Agent 2 (sonnet): gateway/middleware.ts
  - ○ Agent 3 (haiku): tester

**Progress-format (N/M tall):**
- Fase-nivå: "Fase 3/6: Bygger kode"
- Oppgave-nivå: "Bygger fil 2/4: gateway/otp.ts"
- Validering: "Validerer (forsøk 1/3)"

Dataen for dette kommer fra `AgentProgress` i backend (Z-prosjektet). Frontenden leser `agent_progress`-meldingen og renderer den.

### Review — fra egen side til chat-knapper

**I dag:** Review er en egen side `/review/[id]` med fil-liste, AI-vurdering, og godkjenn/avvis/endre-knapper.

**Nytt:** Rapport leveres inline i chatten som del av agent-svaret. Godkjenn/avvis/be om endringer-knapper sitter under rapporten i chatten. Backend-endepunktene `POST /chat/review/approve`, `/chat/review/changes`, `/chat/review/reject` er allerede bygget i Z-prosjektet.

`/review/[id]`-siden beholdes som arkiv/historikk — ikke primær flyt. Kan nås fra en "Historikk"-seksjon.

### Navigasjon — konsolidert

**Ny navigasjonsstruktur (sidebar):**

| Punkt | Hva det viser |
|-------|---------------|
| Overview | Startside — søkefelt til chat + bento grid med metrics |
| Chat | Hovedchat — samtaler, inkognito, repo-tilknyttet |
| Repos | Liste over tilkoblede repos med helse-status |
| Komponenter | Komponentbibliotek (erstatter registry + templates + marketplace) |
| AI | Modeller, providers, kostnader, saldo — alt samlet |
| Innstillinger | Profil, preferanser, sikkerhet, secrets |

6 hovedpunkter. Overview er landing page. Chat viser samtale-liste med filter (inkognito/repo/alle). Under "Repos" kan du velge et repo og se repo-spesifikke ting.

### Dashboard — widget-basert

Dashboardet viser informasjon som widgets. Hver widget henter data fra et backend-endepunkt. Widgets kan være:
- Aktive oppgaver (tasks med status)
- Siste agent-aktivitet (siste fullførte oppgaver)
- Token-forbruk siste 7 dager (graf)
- Kostnad per modell (graf)
- Memory-statistikk
- Repo-helse (fra monitor)
- Healing-rapport (siste kjøring)

Widgets er gjenbrukbare komponenter som kan plasseres forskjellig på desktop vs mobil.

### AI-side — samlet

Én side for alt AI-relatert:
- Konfigurerte providers (Anthropic, OpenRouter, Fireworks, OpenAI)
- Aktive modeller per provider med pris
- Saldo/kreditt per provider
- Kostnadshistorikk (graf over tid)
- Modell-bruksstatistikk (hvilken modell brukes mest, success rate)
- Token-budsjett per fase (fra Z-prosjektet)

### Settings — forenklet

Tre seksjoner, ikke tre separate sider:
- Profil (navn, avatar, e-post)
- Preferanser (tema, språk, AI-navn, modellmodus)
- Sikkerhet (audit log, secrets-status, aktive sesjoner)

---

## DEL 2B: NYE KONSEPTER

### Overview-side (landing page)

Overview er det første du ser etter innlogging. Den har to formål: rask tilgang til chat, og oversikt over status.

Inneholder:
- Stort inputfelt øverst som leder rett til chat når du begynner å skrive
- Bento grid under med widgets: aktive oppgaver, siste aktivitet, kostnader, repo-helse, memory-stats, healing-status
- Widgets er klikkbare — klikk på "Aktive oppgaver" tar deg til tasklisten i chat-kontekst

Overview er IKKE et eget arbeidsverktøy. Det er en startside som viser deg hva som skjer og lar deg hoppe rett inn i chat.

### Chat-kontroller

Chat-vinduet har en kontrollrad over eller ved siden av inputfeltet. Mange knapper, men organisert i grupper:

**Alltid synlige:**
- Send-knapp
- Vedlegg-knapp (filer)

**Kontekst-valg (venstre side av input):**
- Repo-valg (dropdown med GitHub-tilkoblede repos, eller "ingen repo")
- Inkognito-toggle (pixel-spøkelse-ikon)

**Agent-kontroller (høyre side, eller expandable):**
- Agent-modus (av/på — av = bare chat, på = agent kan utføre oppgaver)
- Sub-agent toggle (av/på)
- Modellvalg (dropdown med tilgjengelige modeller)
- Skills-valg (multi-select med aktive skills)

**Inkognito-modus:**
Når inkognito er aktivert (pixel-spøkelse lyser opp):
- Alle "business"-kontroller forsvinner: repo-valg, agent-modus, sub-agent, skills
- Bare modellvalg og vedlegg beholdes
- Samtalen lagres privat — kun brukeren som eier den kan se den
- Visuell indikator: spøkelse-ikon i chatten, subtil bakgrunnsendring
- Ingen agent-arbeid mulig — bare direkte chat

**Repo-modus (standard):**
Når et repo er valgt:
- Alle kontroller er synlige
- Samtalen er tilknyttet repoet
- Alle brukere med tilgang til repoet kan se samtalen
- Agent kan utføre oppgaver mot repoet

**Uten repo (generell chat):**
- Agent-kontroller synlige men agent-arbeid begrenset
- Samtalen eies av brukeren (privat)
- Nyttig for planlegging, spørsmål, research

### Samtale-synlighet

| Modus | Hvem ser samtalen |
|-------|-------------------|
| Inkognito | Kun brukeren som opprettet den |
| Generell (uten repo) | Kun brukeren |
| Repo-tilknyttet | Alle brukere med tilgang til repoet |

Dette betyr at repo-chatten er et delt arbeidsrom per repo. Teammedlemmer kan se hva agenten har gjort, hvilke oppgaver som er fullført, og hvilke rapporter som er levert. Inkognito er for personlige spørsmål, eksperimentering, eller ting du ikke vil dele.

### Tasks — redesignet

**I dag:** Tasks vises som fargede bokser med statusbadges, tunge kort med mye info. Vanskelig å skanne, vanskelig å klikke seg gjennom. Ser ut som et prosjektstyringsverktøy, ikke en agent-plattform.

**Nytt:** Tasks skal være enkle å skanne og klikke seg gjennom. Ikke fargede bokser. Ikke badges overalt. Tenk task-liste som er lett å lese, lett å filtrere, og lett å handle på.

Krav til Claude Code / frontend-design skill:
- Bruk kreativiteten og finn en løsning som er enklere for en forbruker
- Tasks skal være klikkbare og lede rett til relevant chat/rapport
- Status skal være tydelig uten å bruke fargede bokser — bruk subtile indikatorer
- Filtrer på status, repo, dato — uten å fylle skjermen med kontroller
- Vis det viktigste først: hva gjøres nå, hva venter, hva er ferdig
- Aktive tasks skal skille seg ut uten å skrike — animasjon eller subtil glow
- Fullførte tasks collapser til minimal info (tittel + dato + kostnad)
- Klikk på en task åpner samtalen der arbeidet ble gjort

Tasks kan vises som widget på Overview-siden (topp 5 aktive) og som fullstendig liste i en egen visning tilgjengelig fra sidebar eller chat.

---

## DEL 3: HVORDAN TING FUNGERER

### Chat-polling erstattes av oppdaterbar melding

**I dag:** Frontend poller `/chat/history` hvert X sekund. Filtrerer meldinger etter type. Parser JSON i content-feltet. Holder state for `lastAgentStatus`, `agentActive`, `statusDismissed`, etc.

**Nytt:** Frontend poller `/chat/history` som før (eller bruker SSE/WebSocket senere). Men i stedet for å filtrere og parse 6 meldingstyper, ser den bare etter meldinger med `messageType === "agent_progress"`. For disse:

1. Parse content med `deserializeProgress()` (importert fra backend-typer)
2. Render basert på `progress.status`:
   - "thinking" → logo animerer, ingen steg ennå
   - "working" → statuslinje + steg-liste
   - "waiting" → spørsmål vises som vanlig melding
   - "done" → rapport med handlingsknapper
   - "failed" → feilmelding

All annen state (`lastAgentStatus`, `agentActive`, `statusOverride`, `statusDismissed`) forsvinner. Erstattes av: "er siste agent_progress-melding i status working?"

### Mobil-first widgets

Alle widgets bygges som selvstendige komponenter med sin egen datahenting. På desktop vises de i grid. På mobil stables de vertikalt. Samme komponent, forskjellig layout.

Widget-komponenten har:
- Tittel
- Innhold (data fra backend)
- Loading state
- Error state
- Optional: expand/collapse

### Komponentbibliotek-side

Erstatter tre gamle sider (registry, templates, marketplace) med én:
- Liste over tilgjengelige komponenter
- Filter på type (component, template, pattern)
- Filter på kategori
- "Bruk i repo"-knapp som kaller `POST /registry/use`
- Kvalitetsscore per komponent
- Healing-status (sist healat, neste planlagt)

### Repo-kontekst

Når bruker velger et repo i sidebar:
- Chatten filtreres/kontekstualiseres til det repoet
- Dashboard-widgets viser repo-spesifikke metrics
- Agent-oppgaver starter automatisk med det repoet som kontekst

### Innlogging

OTP-flyten beholdes som den er. Samme endepunkter. Eventuelt visuell oppfriskning for å matche ny design.

---

## DEL 4: BACKEND-ENDEPUNKTER FRONTENDEN BRUKER

### Eksisterende (uendret)
- `POST /chat/send` — send melding
- `GET /chat/history` — hent meldinger
- `GET /chat/conversations` — liste samtaler
- `POST /chat/transfer-context` — overfør kontekst
- `POST /chat/cancel` — avbryt generering
- `GET /agent/reviews` — liste reviews (arkiv)
- `GET /agent/review/:id` — hent review (arkiv)
- `POST /memory/search` — søk minner
- `GET /memory/stats` — statistikk
- `GET /skills/list` — liste skills
- `POST /skills/create` — opprett skill
- `POST /skills/toggle` — aktiver/deaktiver
- `GET /cache/stats` — cache-statistikk
- `GET /monitor/health` — repo-helse
- `GET /agent/audit/log` — audit log
- `GET /agent/audit/stats` — audit statistikk
- `GET /agent/metrics/phases` — fase-metrics
- `GET /agent/costs/phases` — kostnader per fase
- `GET /github/repos` — liste repos
- `POST /gateway/request-otp` — be om OTP
- `POST /gateway/verify-otp` — verifiser OTP
- `GET /users/me` — brukerinfo
- `POST /users/update-profile` — oppdater profil
- `POST /users/preferences` — oppdater preferanser
- `GET /tools/secrets-status` — secrets-status

### Nye fra Z-prosjektet
- `POST /chat/review/approve` — godkjenn review fra chat
- `POST /chat/review/changes` — be om endringer fra chat
- `POST /chat/review/reject` — avvis review fra chat
- `POST /registry/use` — bruk komponent
- `POST /registry/list` — liste komponenter
- `POST /registry/maintenance/run` — kjør healing manuelt
- `POST /mcp/validate` — valider MCP-server
- `POST /web/scrape` — scrape nettside (intern, brukes av agent)
- `POST /github/repo/create` — opprett repo

### Trenger kanskje nye endepunkter
- `GET /ai/providers` — liste konfigurerte providers med status
- `GET /ai/provider/:id/balance` — saldo hos provider (krever provider-API)
- `GET /ai/costs/history` — kostnadshistorikk over tid (for graf)
- `GET /ai/models/usage` — bruksstatistikk per modell
- `GET /tasks/list` — filtrert taskliste for dashboard-widget

---

## DEL 5: MELDINGSTYPER I CHAT

### Gamle typer (fases ut gradvis)
- `chat` — vanlig melding (beholdes)
- `agent_status` — status-oppdatering (erstattes av agent_progress)
- `agent_thought` — agent-tanke (vises ikke i ny UI)
- `agent_report` — agent-rapport (erstattes av agent_progress med report)
- `context_transfer` — kontekstoverføring (beholdes)
- `task_start` — task startet (beholdes)

### Ny type
- `agent_progress` — én oppdaterbar melding per task

### Rendering-logikk

```
For hver melding i historikk:
  
  Hvis messageType === "chat":
    → Render som vanlig bruker/assistant-boble
  
  Hvis messageType === "agent_progress":
    → Parse content med deserializeProgress()
    → Render basert på status:
      "thinking"  → Animert logo, ingen tekst ennå
      "working"   → Statuslinje + collapsible steg-liste
      "waiting"   → Vanlig spørsmål-boble (ingen spesiell UI)
      "done"      → Rapport + handlingsknapper (godkjenn/avvis/endre)
      "failed"    → Feilmelding med retry-knapp
  
  Hvis messageType === "context_transfer":
    → Render som liten info-badge (uendret)
  
  Hvis messageType === "agent_status" (legacy):
    → Konverter via convertLegacy() → render som agent_progress
  
  Hvis messageType === "agent_thought":
    → Ikke vis (skip)
  
  Hvis messageType === "agent_report":
    → Ikke vis (skip — erstattet av rapport i agent_progress)
```

---

## DEL 6: HVA SOM MÅ BYGGES SOM WIDGETS/KOMPONENTER

Alle disse skal bygges som selvstendige, gjenbrukbare komponenter:

### Chat-komponenter
- **ChatBubble** — bruker/assistant melding med avatar
- **AgentProgressCard** — statuslinje, steg-liste, collapsible
- **AgentReport** — rapport med filer, kostnad, kvalitet, handlingsknapper
- **AgentLogo** — animert logo (pulse/glow under arbeid, statisk ellers)
- **ReviewActions** — godkjenn/avvis/be om endringer-knapper
- **ChatInput** — meldingsinput med send-knapp og kontrollrad
- **ChatControls** — repo-valg, inkognito-toggle, agent-modus, sub-agent, modell, skills
- **IncognitoIndicator** — pixel-spøkelse med glow når aktiv

### Dashboard-widgets
- **TasksWidget** — aktive oppgaver med status
- **ActivityWidget** — siste agent-aktivitet
- **CostWidget** — token-forbruk graf
- **MemoryWidget** — memory-statistikk
- **HealthWidget** — repo-helse
- **HealingWidget** — siste healing-rapport

### Sidekomponenter
- **ComponentCard** — komponent i biblioteket
- **ProviderCard** — AI-provider med status og saldo
- **ModelRow** — modell med pris og bruksstatistikk
- **RepoCard** — repo med helse-status
- **SkillCard** — skill med toggle og bruksstatistikk

### Generelle
- **Widget** — wrapper med tittel, loading, error, expand/collapse
- **StatusBadge** — liten badge med farge og tekst
- **MetricCard** — tall + label + trend
- **EmptyState** — "ingen data"-visning
- **ConfirmDialog** — bekreft destruktive handlinger

---

## DEL 7: REKKEFØLGE

Bygg i denne rekkefølgen:

1. **Branding og tema** — farger, fonter, spacing, CSS-variabler. Alt definert sentralt slik at det enkelt kan endres.

2. **Layout-shell** — sidebar, topbar, innholdsområde. Responsiv (desktop + mobil). Sidebar kollapser til hamburger på mobil.

3. **Chat** — viktigst. Bygges først fordi det er hub for alt. AgentProgressCard, AgentReport, ReviewActions, ChatBubble, ChatInput, ChatControls, IncognitoIndicator. Kobles mot `/chat/*`-endepunktene. Inkognito-modus, repo-valg, agent-kontroller.

4. **Overview** — landing page med søkefelt som leder til chat + bento grid med widgets. Widgets henter ekte data.

5. **AI-side** — providers, modeller, kostnader. Kobles mot `/ai/*` og `/agent/costs/*`.

6. **Komponentbibliotek** — liste, filter, "bruk"-funksjon. Kobles mot `/registry/*`.

7. **Settings** — profil, preferanser, sikkerhet. Forenklet fra 3 sider til 3 seksjoner.

8. **Login** — visuell oppfriskning. Samme funksjonalitet.

---

## DEL 8: VIKTIGE PRINSIPPER

1. **Chat er hub.** Alt arbeid skjer i chat. Andre sider er referanse/oversikt.

2. **Ingen agent-bokser.** Agenten har ikke egne UI-elementer. Den oppdaterer én melding som vokser.

3. **Agenten er usynlig når den svarer direkte.** Spørsmål → svar, ingen status, ingen plan, ingen dropdown. Som Claude.

4. **Agenten er synlig når den jobber.** Oppgave → statuslinje → steg → rapport → godkjenn. Alt i meldingsstrømmen.

5. **Widgets over sider.** Informasjon vises som widgets der den er relevant, ikke som separate sider man må navigere til.

6. **Mobil er likeverdig.** Samme design fungerer på desktop, tablet, mobil. Widgets stables vertikalt på smalt. Sidebar kollapser.

7. **Branding er sentralisert.** Alle farger, fonter, spacing, animasjoner defineres på ett sted. Endre én variabel → hele appen oppdateres.

8. **Komponenter er atomiske.** Hver komponent er selvstendig med egen datahenting, loading state, og error state. Kan brukes alene eller i grid.

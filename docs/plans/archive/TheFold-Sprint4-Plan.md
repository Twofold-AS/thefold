# TheFold — Sprint 4 Plan (Gjenstående bugs)

**Dato:** 26. februar 2026  
**Kontekst:** Sprint 1-3 fullført (22 oppgaver, 19 filer, ~2000 linjer). Denne planen dekker alt som gjenstår.  
**Scope:** Frontend + backend der nødvendig  
**Antall bugs:** 28

---

## Gruppering

| Gruppe | Tema | Bugs | Kompleksitet |
|--------|------|------|--------------|
| A | Overview & ChatComposer | 3 | Middels |
| B | Chat — kontroller & samtaler | 5 | Høy |
| C | AI-modeller, auto-routing & fasetilordning | 7 | Høy |
| D | Tasks & Komponenter | 4 | Middels |
| E | Integrasjoner, MCP & Monitor | 4 | Middels |
| F | Innstillinger & E-post | 3 | Lav |
| G | Sidebar, UX & nye sider | 5 | Middels |

---

## Gruppe A — Overview & ChatComposer

### A1 — Dither dekker ikke hele content-bredden
**Kilde:** Bugs 1.1  
**Status etter sprint 1-3:** Uendret. DitherBackground ligger inne i ChatComposer men er begrenset til ChatComposer sin bredde (~1232px).  
**Klargjøring:** DitherBackground skal BLI i ChatComposer-boksen. Problemet er kun at den er for smal. Den skal fylle hele content-area (1636px — fra sidebar-kanten til høyre skjermkant), ikke hele siden.  
**Fix:** DitherBackground-wrapperen i ChatComposer må bryte ut av ChatComposers max-width ved å bruke negativt margin + full viewport-bredde, begrenset til content-area. Konkret: sett DitherBackground til `position: absolute`, `left: 0`, `right: 0` relativt til content-containeren (ikke ChatComposer). Alternativt: gi DitherBackground `width: calc(100vw - sidebar-bredde)` og sentrér den med negativ margin. ChatComposer sin parent (`<div style={{ maxWidth: IW, padding: SP }}>`) er begrensningen — Dither må posisjoneres relativt til content-wrapperen utenfor denne.

### A2 — Knapper (skills, sub-agent, +) fungerer ikke på overview
**Kilde:** Bugs 1.2, 2.5  
**Status etter sprint 1-3:** ChatComposer sender ikke skills/sub-agent/modell-props videre. Sprint 2 la til `isPrivate` prop på ChatInput, men ChatComposer bruker den ikke.  
**Rot-årsak:** ChatComposer er en forenklet wrapper. Chat-siden har ChatControls med full funksjonalitet — overview mangler dette.  
**Fix:** Overview-siden (`page.tsx`) må wire opp same kontroll-state som chat-siden:
1. Hent `listSkills()`, `listProviders()` (for modeller), `listRepos()`
2. State for `selectedSkillIds`, `subAgentsEnabled`, `selectedModel`, `selectedRepo`, `ghost`
3. Send disse som props til ChatInput (eller bruk ChatControls-komponenten direkte under ChatComposer)
4. `onSubmit` → videresend alt via URL-params til `/chat` (msg, repo, ghost, skills, model)

### A3 — "Kontrollere"-boks erstattet med ekte data
**Kilde:** Bugs 1.3  
**Status etter sprint 1-3:** Sprint 1.8 erstattet bunn-grid med Skills + Memory widgets. Men "Kontrollere"-boksen kan fortsatt eksistere som et annet element.  
**Fix:** Verifiser at ingen "Kontrollere"-boks finnes i overview. Hvis den gjenstår: fjern den helt eller erstatt med aktive tasks/siste samtaler fra `listTheFoldTasks()`.

---

## Gruppe B — Chat: kontroller, samtaler & visning

### B1 — AgentStatus/AgentProgress vises ikke i chat
**Kilde:** Bugs 2.1  
**Status etter sprint 1-3:** AgentStream ble omskrevet (Sprint 2.3) med full parsing av AgentProgress JSON. Men det er usikkert om chat-sidens meldingsloop faktisk renderer AgentStream for `agent_status`/`agent_progress` meldingstyper.  
**Fix:** I `chat/page.tsx` sin meldings-render-loop: sjekk `message.messageType`. For `agent_status`, `agent_progress`, `agent_report` → rendre `<AgentStream content={m.content} />` i stedet for vanlig ChatMessage. Verifiser at `listMessages`/`getChatHistory` returnerer alle meldingstyper (ikke filtrerer bort agent-meldinger).

### B2 — Slette-ikon for samtaler
**Kilde:** Bugs 2.2  
**Status etter sprint 1-3:** Ikke implementert.  
**Fix:** I samtale-listen (chat/page.tsx): legg til `Trash2`-ikon (Lucide) som vises on hover per samtale. onClick → bekreftelsesdialog → kall `deleteConversation(id)` → refresh samtale-listen. Backend endpoint finnes allerede: `POST /chat/delete`.

### B3 — Repo-valg viser feil repos
**Kilde:** Bugs 2.3  
**Status etter sprint 1-3:** Ikke endret.  
**Rot-årsak:** `listRepos("Twofold-AS")` er hardkodet til org-navn. Kan returnere repos brukeren ikke forventer, eller mangle repos.  
**Fix:** Verifiser at repo-dropdown bruker `listRepos()` fra RepoProvider og viser `fullName` (owner/name). Sjekk at GitHub-tilkobling fungerer (secret `GitHubToken` eller GitHub App). Vis feilmelding hvis API-kall feiler i stedet for tom liste.

### B4 — Skills-dropdown: hele raden blir blå ved valg
**Kilde:** Bugs 2.4  
**Status etter sprint 1-3:** Ikke fikset.  
**Fix:** I ChatControls skills-dropdown: DropdownMenuItem har default aktiv-styling som farger hele raden. Overstyr: fjern bakgrunnsfarge på DropdownMenuItem. Behold kun checkbox-indikatoren (det lille kvadratet med `var(--tf-heat)` border) for å vise valg.

### B5 — Knapper i ny-samtale-modus fungerer ikke
**Kilde:** Bugs 2.5  
**Status etter sprint 1-3:** Sprint 2.1 satte `newChat: true` som default, men ChatControls/ChatInput er kanskje disabled eller ikke rendret i ny-samtale-modus.  
**Fix:** Sørg for at ChatControls rendres ALLTID, også i ny-samtale-modus. Repo-dropdown, skills, sub-agents og modellvalg skal være tilgjengelige FØR bruker sender første melding. State fra disse kontrollene sendes med i `sendMessage()`.

---

## Gruppe C — AI-modeller, auto-routing & fasetilordning

### C1 — Modellvalg fra leverandører fungerer ikke
**Kilde:** Bugs 1.4, 2.4  
**Status etter sprint 1-3:** AI-side redesignet (Sprint 2.5) med 3 providers. Men modellvalg-dropdown i chat sender `displayName` (string) — backend trenger `model_id`.  
**Fix:**
1. ChatControls `onModelChange` → send `model.id` (ikke `displayName`)
2. Chat-sidens `sendMessage` → inkluder `modelId` i request
3. Hent modeller fra `listProviders()` → flat-map til `{ id, displayName, provider }`
4. Backend `processAIResponse`: bruk `modelId` fra request når `mode === "manual"`

### C2 — Auto-modell: Sonnet brukes alltid
**Kilde:** Bugs 1.5, 2.6  
**Status etter sprint 1-3:** Frontend-only sprinter — ingen backend-endring.  
**Rot-årsak:** `processAIResponse` i `chat.ts` kaller ikke `selectOptimalModel()` fra router. Den bruker trolig hardkodet modell-ID.  
**Fix (backend):**
1. I `chat.ts` `processAIResponse`: legg til kjapt pre-kall som scorer meldingskompleksitet (1-10)
2. For **enkle meldinger** (1-3, f.eks. "Hei"): bruk Haiku/Moonshot, DROPP skills.resolve og getTree
3. For **medium** (4-7): bruk Sonnet med standard pipeline
4. For **komplekse** (8-10): bruk Opus med full kontekst
5. Kall `selectOptimalModel(complexity)` som allerede finnes og er testet i `router.ts`
6. **Viktig:** Ikke ødelegg eksisterende flyt — dette er en pre-routing sjekk FØR hovedkallet

### C3 — OpenRouter og Fireworks modeller
**Kilde:** Bugs 5.3  
**Status etter sprint 1-3:** Backend har provider-adaptere. AI-side viser OpenRouter/Fireworks. Men brukeren kan ikke legge til vilkårlige modeller fra disse providerne.  
**Fix:**
1. Settings/models (eller AI-side): "Legg til modell"-knapp per provider
2. Skjema: modell-ID, display name, tier (1/3/5), tags (coding/chat/planning)
3. Lagre via `saveModel()` endpoint (finnes)
4. For OpenRouter: modell-ID er `provider/model` format (f.eks. `moonshotai/moonshot-v1-128k`)
5. For Fireworks: modell-ID er `accounts/fireworks/models/xxx`

### C4 — Fasetilordning: dropdown fungerer ikke
**Kilde:** Bugs 5.4  
**Status etter sprint 1-3:** Sprint 2.5 la til "FASE-TILORDNING" seksjon i AI-side med localStorage. Men dropdown fungerer ikke.  
**Fix:**
1. Erstatt custom dropdown med shadcn `DropdownMenu` + multi-select (kan velge flere modeller per fase)
2. Hent ALLE enabled modeller fra alle providers (ikke bare de 3 synlige)
3. Vis modell med provider-prefiks: "Anthropic → Sonnet 4.5", "OpenRouter → Moonshot v1"
4. Auto-lagre ved endring (lagre til backend `updatePreferences()`, ikke bare localStorage)

### C5 — Flytt fasetilordning over modell-listen
**Kilde:** Bugs 5.5  
**Status etter sprint 1-3:** Fasetilordning lagt til i AI-side, men plassering er etter modell-tabellen.  
**Fix:** Flytt FASE-TILORDNING-seksjonen til TOPPEN av AI-siden (etter provider-kortene, FØR modell-tabellen).

### C6 — "Legg til"-knapp i stedet for endre/slett per modell
**Kilde:** Bugs 5.6  
**Status etter sprint 1-3:** Ikke fikset.  
**Fix:** Fjern inline endre/slett-knapper per modell-rad i tabellen. Legg til en "Legg til modell"-knapp per provider (eller globalt) som åpner et skjema. Modellen lagres via `saveModel` → kan deretter velges i fasetilordning.

### C7 — Leverandør-logoer
**Kilde:** Bugs 5.1  
**Status etter sprint 1-3:** Ikke fikset. Sprint 2.5 bruker fargede sirkler med initialer.  
**Fix:** Legg SVG-logoer i `public/logos/` (anthropic.svg, openrouter.svg, fireworks.svg). Bruk `<Image src="/logos/{slug}.svg">` med fallback til farget sirkel-initial.

---

## Gruppe D — Tasks & Komponenter

### D1 — Godkjenn/avvis-knapper vises for blokkerte/godkjente tasks
**Kilde:** Bugs 3.1, 3.2  
**Status etter sprint 1-3:** Ikke fikset.  
**Fix:** I tasks/page.tsx: vis handlingsknapper (Godkjenn, Avvis, Be om endringer) KUN når:
- `task.status === "in_review"` OG
- det finnes en review med `status === "pending"`
For status `blocked`, `done`, `completed`, `planned`, `backlog` → vis kun info, ingen action-knapper.

### D2 — Linear-ikon er "play" → skal være refresh/sync
**Kilde:** Bugs 3.3  
**Status etter sprint 1-3:** Ikke fikset.  
**Fix:** I tasks/page.tsx "Importer fra Linear"-knappen: bytt ikon fra `Play`/`Triangle` til `RefreshCw` (Lucide).

### D3 — Ny oppgave: repo-dropdown (dynamisk) + skills
**Kilde:** Bugs 3.4  
**Status etter sprint 1-3:** Sprint 2.7 la til opprett-modal med hardkodet repo-velger (`thefold-api`/`thefold-frontend`).  
**Fix:**
1. Repo-valg → dropdown fra `listRepos()` (dynamisk, ikke hardkodet)
2. Legg til skills-dropdown (multi-select) fra `listSkills()` → send `skillIds` i `createTask` request

### D4 — Komponenter: "Bruk" → "Oppdater" (healing pipeline)
**Kilde:** Bugs 4  
**Status etter sprint 1-3:** Sprint 3.3 la til "Bruk"-knapp med repo-dropdown. Men brukeren ønsker "Oppdater" som trigger healing.  
**Fix:** Endre knapp-tekst fra "Bruk" til "Oppdater". onClick → kall `healComponentEndpoint({ componentId })` (backend finnes: `POST /registry/heal`). Vis resultat (healed/skipped/failed) i en liten status-melding.

---

## Gruppe E — Integrasjoner, MCP & Monitor

### E1 — Firecrawl viser "Frakoblet"
**Kilde:** Bugs 6  
**Status etter sprint 1-3:** Sprint 3.1 la til Firecrawl i integrasjonslisten. Sprint 3.2 la til konfig-dialog. Men `isConnected()` sjekker `IntegrationConfig` i DB — Firecrawl er server-side (API-nøkkel er Encore secret), så det finnes ingen frontend-config.  
**Fix:** Legg `"firecrawl"` til i `SERVER_SIDE_PLATFORMS` array. Alternativt: kall `webHealth()` (`GET /web/health`) fra frontend og vis "Koblet til" når response er `{ status: "ready" }`.

### E2 — Fjern linear-mcp fra MCP-servere
**Kilde:** Bugs 7  
**Status etter sprint 1-3:** Ikke fikset.  
**Fix:** Enten:
- (a) Backend: ny migrasjon `DELETE FROM mcp_servers WHERE name = 'linear-mcp'`
- (b) Frontend: filtrer ut `name === 'linear-mcp'` fra listen
Best: (a) for en permanent løsning.

### E3 — Monitor: "Kjør nå" fungerer ikke + mangler rapporter
**Kilde:** Bugs 8.2  
**Fix:**
1. "Kjør nå"-knapp → kall `runCheck({ repo: selectedRepo })` (POST /monitor/run-check), IKKE `runDailyChecks` (som er feature-flagget)
2. Vis resultater direkte fra responsen (`results[]` med check_type, status, details)
3. Historikk → kall `history({ repo })` og vis i tabell/tidslinje
4. Legg til repo-velger dropdown (fra `listRepos()`) slik at brukeren kan velge hvilket repo som sjekkes

### E4 — Monitor: Forklare daglig vs fredag
**Kilde:** Bugs 8.1  
**Fix:** Legg til en info-seksjon på monitor-siden som forklarer de to cron-jobbene:
- **Daglig kl 03:00** — `monitor/daily-health-check`: Repo health checks (dependencies, tests, code quality, docs). Feature-flag: `MonitorEnabled` secret.
- **Fredag kl 03:00** — `registry/weekly-maintenance`: Healing pipeline for komponenter med kvalitetsscore under 60. Feature-flag: `HealingPipelineEnabled` secret.
Vis status for begge feature-flags (enabled/disabled) og neste planlagte kjøring.

---

## Gruppe F — Innstillinger & E-post

### F1 — AI-navn: auto-lagring uten "Lagre"-knapp
**Kilde:** Bugs 9.1  
**Status etter sprint 1-3:** Sprint 3.4 la til AI-navn input med "Lagre"-knapp.  
**Fix:** Fjern "Lagre"-knappen. Bruk `onBlur` + debounce (500ms) for auto-lagring via `updatePreferences({ aiName })`. Vis en diskret "✓ Lagret" indikator som fader ut etter 2 sekunder.

### F2 — Push/Slack-varsler uten oppsett
**Kilde:** Bugs 9.2  
**Fix:**
1. Kall `listIntegrations()` ved mount
2. Sjekk om `platform: "slack"` har `enabled: true`
3. Hvis ikke → vis Slack-toggle som disabled med tooltip "Koble til Slack under Integrasjoner først"
4. Push-varsler: sjekk `Notification.permission` — vis disabled med tooltip "Nettleser-varsler er ikke aktivert" hvis ikke `granted`

### F3 — E-post-varsler for ferdigstilte tasks
**Kilde:** Bugs 9.3  
**Rot-årsak:** Backend har `gateway/email.ts` (Resend) og `taskEvents` Pub/Sub. Men det finnes ingen subscriber som kobler task-completion til e-post-sending.  
**Fix (backend):** Opprett ny Pub/Sub subscriber (i `gateway/email.ts` eller `chat/chat.ts`):
1. Lytt på `taskEvents` med `action === "completed"`
2. Hent brukerens e-post via `getUser()`
3. Send e-post via `sendEmail()` (Resend) med task-tittel, repo, og lenke til review
4. Respekter brukerens e-post-varsling-toggle (sjekk preferences)

---

## Gruppe G — Sidebar, UX & nye sider

### G1 — Sidebar: hardkodet "Jørgen Andre" og "admin"
**Kilde:** Generelle bugs, punkt 5  
**Status etter sprint 1-3:** Ikke fikset.  
**Fix:** I `layout.tsx` sidebar-bunnens bruker-seksjon: bruk `useUser()` fra UserPreferencesContext for å hente `user.name` og `user.role`. Vis `initial` i avatar-sirkelen. Erstatt hardkodet tekst.

### G2 — Blå venstre-border ved valgt element
**Kilde:** Generelle bugs, punkt 1  
**Fix:** `borderLeft: 3px solid ${T.accent}` (eller lignende) finnes på så og si ALLE aktive valg-knapper gjennom hele appen. Gjør et søk i hele frontend-mappen etter `borderLeft` som inneholder `accent` eller `3px solid` og fjern alle forekomster. Berørte filer inkluderer men er ikke begrenset til:
- `tasks/page.tsx` (task-listen)
- `chat/page.tsx` (samtale-panelet)
- `skills/page.tsx`
- `komponenter/page.tsx`
- `mcp/page.tsx`
- `integrasjoner/page.tsx`
- `ai/page.tsx`
- Alle andre sider med seleksjon/aktiv-state
Bruk kun subtil bakgrunnsfarge (`T.subtle`) for å indikere valgt element. Ingen blå venstre-kant noe sted.

### G3 — Skeleton loaders: forbedring
**Kilde:** Generelle bugs, punkt 2  
**Status etter sprint 1-3:** Sprint 3.6 erstattet tekst-loading med `<Skeleton rows={N} />` på 10 sider.  
**Fix:** Brukeren ønsker kontekst-spesifikke skeletons som matcher layouten, eller en enkel sentrert spinner. Beslutning: Erstatt generiske `<Skeleton rows={N} />` med sentrert `<Loader2 className="animate-spin" />` (Lucide) på sider der skeleton ikke matcher innholdet godt. Behold skeleton-rader kun der de ligner reell layout (tabeller, lister).

### G4 — Docs-side
**Kilde:** Generelle bugs, punkt 3  
**Fix:** Opprett `/app/(dashboard)/docs/page.tsx`. Innhold:
- Samler healing-rapporter (`getHealingStatus`)
- Monitor-rapporter (`getMonitorHealth`)  
- Fremtidig: system-docs, agent-rapporter
- Legg til i sidebar-navigasjon (ikon: `FileText` fra Lucide)

### G5 — Varslinger (NotifBell)
**Kilde:** Generelle bugs, punkt 4  
**Fix:**
1. Backend: Opprett `GET /chat/notifications` — hent meldinger med `message_type IN ('agent_report', 'agent_status')` fra siste 24 timer, sortert desc, limit 20
2. Frontend: `NotifBell` poller endpunktet hvert 30s, viser badge med antall uleste
3. Klikk → dropdown med siste hendelser (task fullført, review klar, healing utført)
4. Klikk på hendelse → naviger til relevant side

### G6 — Token/kostnad oppdateres ikke på overview
**Kilde:** Bugs 5.2  
**Fix:**
1. Verifiser at `processAIResponse` lagrer `tokens_used` og `cost_usd` i messages-metadata
2. Verifiser at overview-widgeten kaller riktig stats-endpoint og summerer korrekt
3. Frontend: legg til `refresh`-mekanisme (poll eller manuell) etter chat-bruk, slik at overview oppdateres

---

## Avhengigheter

```
A (Overview/ChatComposer) ← ingen avhengigheter, kan starte først
B (Chat kontroller)       ← A2 (delt ChatInput-logikk)
C (AI-modeller)           ← B ferdig (modellvalg i chat), men C2 er backend-uavhengig
D (Tasks/Komponenter)     ← ingen avhengigheter
E (Integrasjoner/Monitor) ← ingen avhengigheter
F (Settings/E-post)       ← E1 (Firecrawl status for F2 toggle-logikk)
G (Sidebar/UX/Docs)       ← ingen avhengigheter
```

**Anbefalt rekkefølge:** A → B → C → D/E/F/G parallelt

---

## Backend-endringer

| Fil | Endring | Gruppe |
|-----|---------|--------|
| `chat/chat.ts` | Kompleksitets-pre-routing med `selectOptimalModel()`, `modelId` fra request, notifications endpoint | C2, G5 |
| `chat/chat.ts` (send) | Bruk `modelId` fra request body når mode=manual | C1 |
| `mcp/migrations/` | Ny migrasjon: `DELETE FROM mcp_servers WHERE name = 'linear-mcp'` | E2 |
| `gateway/email.ts` | Ny subscriber: taskEvents → e-post ved completion | F3 |

## Frontend-endringer

| Fil | Endring | Gruppe |
|-----|---------|--------|
| `page.tsx` (overview) | Dither som bakgrunn utenfor ChatComposer, wire skills/model/repo state, fjern evt. "Kontrollere" | A |
| `ChatComposer.tsx` | Fjern DitherBackground, aksepter control-props | A |
| `chat/page.tsx` | AgentStream for agent-meldinger, slett-ikon samtaler, ChatControls alltid synlig, modell-ID fix, fjern borderLeft | B, G2 |
| `chat/chat-controls.tsx` | Skills-dropdown styling fix, modell-ID (ikke displayName) | B4, C1 |
| `ai/page.tsx` | Flytt fasetilordning opp, multi-select dropdown, "Legg til modell"-knapp, logoer | C |
| `tasks/page.tsx` | Conditional action-knapper, RefreshCw-ikon, dynamisk repo-dropdown, skills i create | D |
| `komponenter/page.tsx` | "Bruk" → "Oppdater" → healing endpoint | D4 |
| `integrasjoner/page.tsx` | Firecrawl i SERVER_SIDE_PLATFORMS | E1 |
| `mcp/page.tsx` | Filtrer ut linear-mcp (eller backend-migrasjon) | E2 |
| `monitor/page.tsx` | "Kjør nå" → runCheck, repo-velger, historikk-visning, info-seksjon | E3, E4 |
| `innstillinger/page.tsx` | AI-navn auto-save (onBlur), disabled toggles for Slack/push | F1, F2 |
| `layout.tsx` | useUser() for sidebar navn/rolle | G1 |
| `docs/page.tsx` | NY side: rapporter og dokumentasjon | G4 |
| `NotifBell.tsx` | Poll notifications, badge, dropdown | G5 |
| `public/logos/` | Provider SVG-logoer | C7 |
| Diverse sider | Skeleton → spinner der det passer bedre | G3 |

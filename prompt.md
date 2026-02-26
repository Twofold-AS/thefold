# MASTER PROMPT — TheFold Sprint 4: 28 gjenstående bugs

> **Legg denne filen i prosjektets rot (ved siden av CLAUDE.md)**
> **Dato:** 26. februar 2026
> **Scope:** Frontend + backend
> **Forutsetning:** Sprint 1-3 er fullført (22 oppgaver, 19 filer). Se `sprint1-3.md` for hva som allerede er gjort. IKKE gjør noe av det som er i sprint 1-3 rapporten på nytt.

---

## Kontekst

Du jobber på TheFold — en autonom utviklingsagent bygget med Encore.ts (backend) og Next.js 15 (frontend). Les `CLAUDE.md` i prosjektets rot for full arkitekturoversikt, filstruktur og konvensjoner.

**Viktige konvensjoner:**
- Frontend: Next.js 15 App Router, `T` design tokens fra `lib/tokens.ts`, Lucide React-ikoner, shadcn/ui komponenter, `useApiData` hook for datahenting
- Backend: Encore.ts med SQLDatabase, Pub/Sub, CronJob, `secret()` for API-nøkler
- Alle norske labels i UI (ikke engelsk)
- `npx next build` MÅ passere etter alle endringer (16/16 sider)
- Ikke bruk `fontFamily: T.brandFont` på noe annet enn logo

---

## Sub-agenter

Denne prompten er designet for å kjøres med sub-agenter. Hver gruppe (A-G) er en selvstendig enhet som kan parallelliseres. Avhengigheter er markert.

**Kjørerekkefølge:**
1. **Fase 1** (parallelt): Gruppe A, D, E, F, G
2. **Fase 2** (etter A): Gruppe B
3. **Fase 3** (etter B): Gruppe C

---

## Gruppe A — Overview & ChatComposer (3 bugs)

### A1 — DitherBackground for smal
**Fil:** `frontend/src/components/ChatComposer.tsx` og `frontend/src/app/(dashboard)/page.tsx`

DitherBackground er inne i ChatComposer og skal FORBLI der. Problemet er at den kun dekker ChatComposer sin bredde (~1232px). Den skal dekke hele content-area (1636px) — fra sidebar-kanten til høyre skjermkant.

**Fix:** DitherBackground må bryte ut av ChatComposers bredde. I overview-sidens layout (`page.tsx`): sett content-wrapperen som inneholder ChatComposer til `position: relative`. I ChatComposer: gi DitherBackground `position: absolute`, `left: -SP` (negativ sidePadding), `right: -SP`, `top: 0`, `bottom: 0` slik at den strekker seg til kantene av content-area. Alternativt: bruk `width: calc(100% + 2 * SP)` med `margin-left: -SP`. Content-wrapperen i `layout.tsx` bruker `maxWidth: IW` og `padding: SP` — Dither må kompensere for denne paddingen.

ChatComposer-innholdet (heading + input) forblir sentrert med `position: relative; z-index: 1` over Dither.

### A2 — Knapper (skills, sub-agent, +) fungerer ikke på overview
**Filer:** `frontend/src/app/(dashboard)/page.tsx`, `frontend/src/components/ChatComposer.tsx`

ChatComposer sender kun `repo`, `ghost`, og `onSubmit` til ChatInput. Overview mangler hele kontroll-panelet som chat-siden har via `ChatControls`.

**Fix:**
1. I `page.tsx` (overview): importer og bruk `listSkills`, `listProviders`, `listRepos` fra `lib/api`
2. Opprett state: `selectedSkillIds`, `subAgentsEnabled`, `selectedModel`, `selectedRepo`, `ghost`
3. Send disse som props til ChatComposer, som videresender til ChatInput
4. ChatComposer må akseptere og sende videre: `skills`, `selectedSkillIds`, `onSkillsChange`, `subAgentsEnabled`, `onSubAgentsToggle`, `models`, `selectedModel`, `onModelChange`
5. `onStartChat` → videresend alt via URL-params: `/chat?msg=X&repo=Y&ghost=1&skills=id1,id2&model=Z`
6. Chat-siden (`chat/page.tsx`) må lese disse parameterene og bruke dem ved første `sendMessage`

### A3 — "Kontrollere"-boks
**Fil:** `frontend/src/app/(dashboard)/page.tsx`

Sjekk om det finnes en boks med teksten "Kontrollere" eller "KONTROLLERE" i overview. Sprint 1.8 erstattet bunn-grid med Skills + Memory widgets, men sjekk at det ikke er et tredje element som gjenstår. Hvis den finnes → fjern den eller erstatt med data fra `listTheFoldTasks()` (aktive tasks-oversikt).

---

## Gruppe B — Chat: kontroller, samtaler & visning (5 bugs)

**Avhengighet:** Gruppe A (ChatComposer props-wiring)

### B1 — AgentStatus vises ikke i chat
**Fil:** `frontend/src/app/(dashboard)/chat/page.tsx`, `frontend/src/components/AgentStream.tsx`

AgentStream-komponenten ble omskrevet i Sprint 2.3 og parser AgentProgress JSON. Men chat-sidens meldingsloop rendrer kanskje ikke AgentStream for riktige meldingstyper.

**Fix:** I chat-sidens meldings-render-loop, sjekk `m.messageType`:
```tsx
if (m.messageType === "agent_status" || m.messageType === "agent_progress" || m.messageType === "agent_report") {
  return <AgentStream key={m.id} content={m.content} />;
}
```
Verifiser også at `getChatHistory` / `listMessages` API-kallet returnerer ALLE meldingstyper (ikke filtrerer bort agent-meldinger i backend eller frontend).

### B2 — Slette-ikon for samtaler
**Fil:** `frontend/src/app/(dashboard)/chat/page.tsx`

Legg til `Trash2`-ikon (Lucide) i samtale-listen. Backend finnes: `POST /chat/delete` med `deleteConversation(conversationId)`.

**Fix:**
1. I samtale-listen: vis `<Trash2 size={14} />` som vises on hover (opacity 0 → 1 ved hover på samtale-raden)
2. onClick → `window.confirm("Slett denne samtalen?")` → kall `deleteConversation(id)` → refresh samtale-listen
3. Gjelder BÅDE repo- og privat-samtaler

### B3 — Repo-valg viser feil repos
**Fil:** `frontend/src/app/(dashboard)/chat/page.tsx`, `frontend/src/contexts/RepoProvider.tsx`

Repo-dropdown viser kun repos fra `listRepos("Twofold-AS")` med hardkodet org-navn.

**Fix:** Verifiser at `listRepos` kalles med korrekt org eller uten org-filter. Sjekk at alle repos fra GitHub-responsen vises med `fullName` (owner/name). Hvis API feiler → vis feilmelding i dropdown i stedet for tom liste. Sjekk `CLAUDE.md` for info om GitHub-tilkobling (GitHub App vs PAT).

### B4 — Skills-dropdown: hele raden blir blå
**Fil:** `frontend/src/components/chat/chat-controls.tsx`

Når man velger en skill i dropdown-menyen, får hele `DropdownMenuItem`-raden blå bakgrunn.

**Fix:** Overstyr DropdownMenuItem styling for skills:
- Fjern default hover/aktiv bakgrunnsfarge på selve raden
- Behold KUN checkbox-indikatoren (det lille `div` med `w-3 h-3 rounded-sm border` + `var(--tf-heat)`) som visuell indikator
- Raden selv skal ha transparent bakgrunn, kun subtle hover-effekt

### B5 — Knapper fungerer ikke i ny-samtale-modus
**Fil:** `frontend/src/app/(dashboard)/chat/page.tsx`

Når `newChat === true`, kan ChatControls eller ChatInput være disabled/ikke rendret.

**Fix:** ChatControls (repo, skills, model, sub-agents, ghost) skal rendres ALLTID, uavhengig av `newChat`-state. Brukerens valg fra kontrollene sendes med i `sendMessage()` når de skriver sin første melding.

---

## Gruppe C — AI-modeller, auto-routing & fasetilordning (7 bugs)

**Avhengighet:** Gruppe B (modellvalg i chat fungerer)

### C1 — Modellvalg fungerer ikke (sender displayName, ikke model_id)
**Filer:** `frontend/src/components/chat/chat-controls.tsx`, `frontend/src/app/(dashboard)/chat/page.tsx`, `backend: chat/chat.ts`

**Frontend-fix:**
1. `ChatControls.onModelChange` mottar nå `displayName` (string) → endre til å sende `model.id`
2. Hent modeller fra `listProviders()` → flat-map til `Array<{ id: string, displayName: string, provider: string }>`
3. I `sendMessage()`: inkluder `modelId` i request body
4. Modell-dropdown: vis "Auto (anbefalt)" som default + alle enabled modeller gruppert per provider

**Backend-fix:**
1. I `chat.ts` `processAIResponse` (eller `send`-endepunktet): les `modelId` fra request
2. Når `modelId` er satt → bruk den direkte (mode="manual")
3. Når `modelId` er null/undefined → bruk auto-routing (mode="auto", se C2)

### C2 — Auto-modell: Sonnet brukes alltid
**Fil:** `backend: chat/chat.ts`, `backend: ai/router.ts`

`selectOptimalModel()` i `router.ts` finnes og er testet. Men `processAIResponse` bruker den ikke.

**Backend-fix:**
1. Legg til et kjapt pre-kall i `processAIResponse` som vurderer meldingskompleksitet (1-10)
2. Bruk eksisterende `selectOptimalModel(complexity)` for å velge modell
3. Kortslutning for enkle meldinger (kompleksitet 1-3): dropp `skills.resolve` og `getTree` — svar direkte med Haiku/Moonshot
4. Medium (4-7): standard pipeline med Sonnet
5. Komplekse (8-10): full pipeline med Opus

Kompleksitetsvurderingen kan være enkel heuristikk:
```typescript
function quickComplexity(msg: string): number {
  const len = msg.length;
  const hasCode = /```|function |const |import /.test(msg);
  const hasQuestion = msg.includes("?");
  const wordCount = msg.split(/\s+/).length;
  
  if (wordCount <= 5 && !hasCode) return 2; // "Hei", "Takk", etc.
  if (wordCount <= 20 && !hasCode && hasQuestion) return 4; // Enkelt spørsmål
  if (hasCode || len > 500) return 7; // Kode eller langt
  if (len > 1500 || wordCount > 200) return 9; // Veldig komplekst
  return 5; // Default middels
}
```

**VIKTIG:** Ikke ødelegg eksisterende flyt. Dette er en pre-routing sjekk FØR hovedkallet. Fallback til Sonnet hvis noe feiler.

### C3 — OpenRouter/Fireworks modeller: "Legg til modell"-knapp
**Fil:** `frontend/src/app/(dashboard)/ai/page.tsx`

Brukeren trenger å legge til vilkårlige modeller fra OpenRouter og Fireworks (generell API-nøkkel, ikke per-modell).

**Fix:** Per provider-kort: legg til "Legg til modell"-knapp → modal med:
- Modell-ID (tekst, f.eks. `moonshotai/moonshot-v1-128k` for OpenRouter)
- Display name (tekst)
- Tier (dropdown: 1=rask/billig, 3=balansert, 5=best kvalitet)
- Tags (multi-select: coding, chat, planning, review)
- Lagre via `saveModel()` endpoint (finnes i backend)

### C4 — Fasetilordning: dropdown fungerer ikke
**Fil:** `frontend/src/app/(dashboard)/ai/page.tsx`

Sprint 2.5 la til FASE-TILORDNING seksjon med localStorage. Dropdowns fungerer ikke.

**Fix:**
1. Erstatt custom dropdown med shadcn `DropdownMenu` + multi-select
2. Hent alle enabled modeller fra `listProviders()` → flat-map
3. Per fase (planlegging, programmering, review, chat): vis dropdown med alle modeller
4. Bruker kan velge FLERE modeller per fase (multi-select med checkmarks)
5. Vis valgt som: "Anthropic → Sonnet 4.5, OpenRouter → Moonshot v1"
6. Auto-lagre ved endring via `updatePreferences({ phaseModels: { planning: [...ids], coding: [...ids], ... } })`

### C5 — Flytt fasetilordning over modell-listen
**Fil:** `frontend/src/app/(dashboard)/ai/page.tsx`

Flytt hele FASE-TILORDNING-seksjonen til rett ETTER provider-kortene, FØR modell-tabellen. Visuell rekkefølge:
1. Provider-kort (Anthropic, Fireworks, OpenRouter)
2. **Fasetilordning** (planlegging, programmering, review, chat)
3. Modell-tabell

### C6 — Fjern endre/slett-knapper per modell, bruk "Legg til"
**Fil:** `frontend/src/app/(dashboard)/ai/page.tsx`

Fjern inline endre/slett-knapper per modell-rad. Modeller administreres via "Legg til modell"-knappen fra C3 og kan brukes i fasetilordning fra C4.

### C7 — Leverandør-logoer
**Fil:** `frontend/public/logos/`, `frontend/src/app/(dashboard)/ai/page.tsx`

Legg SVG-logoer i `public/logos/`: `anthropic.svg`, `openrouter.svg`, `fireworks.svg`.

Bruk i provider-kort: `<img src={"/logos/" + provider.slug + ".svg"} />` med fallback til farget sirkel med initialer. Hent logoer fra offisielle kilder eller lag enkle tekst-baserte SVG-er.

---

## Gruppe D — Tasks & Komponenter (4 bugs)

### D1 — Godkjenn/avvis-knapper vises for blokkerte/godkjente tasks
**Fil:** `frontend/src/app/(dashboard)/tasks/page.tsx`

Handlingsknappene (Godkjenn, Avvis, Be om endringer) vises uavhengig av task-status.

**Fix:** Vis kun handlingsknapper når BEGGE er sant:
- `task.status === "in_review"`
- det finnes en tilhørende review med `status === "pending"`

For status `blocked`, `done`, `completed`, `planned`, `backlog` → vis INGEN action-knapper. Vis kun info (status-tag, beskrivelse, tidspunkt).

### D2 — Linear-ikon: play → refresh
**Fil:** `frontend/src/app/(dashboard)/tasks/page.tsx`

"Importer fra Linear"-knappen bruker feil ikon.

**Fix:** Importer `RefreshCw` fra `lucide-react`. Erstatt nåværende ikon (Play/Triangle/annet) med `<RefreshCw size={14} />`.

### D3 — Ny oppgave: dynamisk repo-dropdown + skills
**Fil:** `frontend/src/app/(dashboard)/tasks/page.tsx`

Sprint 2.7 la til opprett-modal med hardkodet repo-velger (`thefold-api`/`thefold-frontend`).

**Fix:**
1. Erstatt hardkodede repo-knapper med dropdown fra `listRepos()` (dynamisk)
2. Legg til skills-dropdown (multi-select) fra `listSkills()`
3. Send valgte `skillIds` i `createTask()` request body

### D4 — Komponenter: "Bruk" → "Oppdater" via healing
**Fil:** `frontend/src/app/(dashboard)/komponenter/page.tsx`

Sprint 3.3 la til "Bruk"-knapp med repo-dropdown. Brukeren ønsker "Oppdater" som trigger self-healing.

**Fix:**
1. Endre knapp-tekst fra "Bruk" til "Oppdater"
2. Fjern repo-dropdown (healing er ikke repo-spesifikt)
3. onClick → kall `healComponentEndpoint({ componentId })` — API: `POST /registry/heal`
4. Vis resultat: "Oppdatert ✓" (healed), "Allerede oppdatert" (skipped), "Feil ved oppdatering" (failed)
5. Importer `healComponentEndpoint` i `lib/api.ts` hvis den ikke finnes:
```typescript
export async function healComponent(componentId: string) {
  return apiFetch<{ action: string; reason?: string }>("/registry/heal", {
    method: "POST", body: { componentId }
  });
}
```

---

## Gruppe E — Integrasjoner, MCP & Monitor (4 bugs)

### E1 — Firecrawl viser "Frakoblet"
**Fil:** `frontend/src/app/(dashboard)/integrasjoner/page.tsx`

Firecrawl er en server-side integrasjon (API-nøkkel er Encore secret). Men `SERVER_SIDE_PLATFORMS` inkluderer den ikke — frontend sjekker `IntegrationConfig` i DB som ikke finnes for Firecrawl.

**Fix:** Legg `"firecrawl"` til `SERVER_SIDE_PLATFORMS` array:
```typescript
const SERVER_SIDE_PLATFORMS = ["linear", "github", "resend", "brave-search", "firecrawl"];
```
Server-side integrasjoner viser allerede `<Tag>Konfigurert via server</Tag>` i stedet for "Koble til" (Sprint 3.2).

### E2 — Fjern linear-mcp fra MCP-servere
**Filer:** `frontend/src/app/(dashboard)/mcp/page.tsx` + eventuelt backend-migrasjon

**Fix (frontend — rask):** Filtrer ut linear-mcp fra listen:
```typescript
const servers = (data?.servers ?? []).filter(s => s.name !== "linear-mcp");
```

**Fix (backend — permanent):** Opprett ny migrasjon i `mcp/migrations/`:
```sql
DELETE FROM mcp_servers WHERE name = 'linear-mcp';
```

Gjør begge for å være sikker.

### E3 — Monitor: "Kjør nå" fungerer ikke
**Fil:** `frontend/src/app/(dashboard)/monitor/page.tsx`

"Kjør nå"-knappen kaller trolig `runDailyChecks` som er feature-flagget og returnerer `{ ran: false }`.

**Fix:**
1. Legg til repo-velger dropdown (fra `listRepos()`)
2. "Kjør nå"-knapp → kall `runCheck({ repo: selectedRepo })` (POST /monitor/run-check) — IKKE `runDailyChecks`
3. Vis resultater fra responsen (results[] med checkType, status, details)
4. Legg til historikk-visning: kall `history({ repo })` og vis i tabell

Importer i `lib/api.ts` hvis de mangler:
```typescript
export async function runMonitorCheck(repo: string) {
  return apiFetch<{ results: Array<{ repo: string; checkType: string; status: string; details: Record<string, unknown> }> }>(
    "/monitor/run-check", { method: "POST", body: { repo } }
  );
}
export async function getMonitorHistory(repo: string, limit?: number) {
  return apiFetch<{ checks: Array<{ id: string; repo: string; checkType: string; status: string; details: Record<string, unknown>; createdAt: string }> }>(
    "/monitor/history", { method: "POST", body: { repo, limit: limit || 20 } }
  );
}
```

### E4 — Monitor: info om daglig vs fredag cron
**Fil:** `frontend/src/app/(dashboard)/monitor/page.tsx`

Brukeren er forvirret fordi det står "daglig 03:00" men forventet fredag self-healing.

**Fix:** Legg til en info-seksjon øverst på monitor-siden:
```
AUTOMATISKE SJEKKER

Daglig kl 03:00 — Repo-helssjekk
Sjekker avhengigheter, testdekning, kodekvalitet og dokumentasjon.
Status: [Aktivert/Deaktivert] (MonitorEnabled)

Fredag kl 03:00 — Self-healing
Reparerer komponenter med kvalitetsscore under 60.
Status: [Aktivert/Deaktivert] (HealingPipelineEnabled)
```

Hent feature-flag status fra `getSecretsStatus()` hvis tilgjengelig, ellers vis statisk tekst.

---

## Gruppe F — Innstillinger & E-post (3 bugs)

### F1 — AI-navn: auto-lagring
**Fil:** `frontend/src/app/(dashboard)/innstillinger/page.tsx`

Sprint 3.4 la til AI-navn input med "Lagre"-knapp.

**Fix:**
1. Fjern "Lagre"-knappen ved AI-navn
2. Legg til `onBlur` handler: lagre via `updatePreferences({ aiName })` automatisk
3. Legg til debounce (500ms) for å unngå for mange API-kall
4. Vis diskret "✓ Lagret" indikator som fader ut etter 2 sekunder
5. Gjør det identisk med hvordan profil-navn fungerer (etter fix: begge auto-save)

### F2 — Push/Slack-varsler uten oppsett
**Fil:** `frontend/src/app/(dashboard)/innstillinger/page.tsx`

Toggles for push-varsler og Slack-varsler kan aktiveres selv når tjenestene ikke er konfigurert.

**Fix:**
1. Ved mount: kall `listIntegrations()` og sjekk om `platform: "slack"` har `enabled: true`
2. Slack-toggle: vis som disabled med `opacity: 0.5` og tooltip "Koble til Slack under Integrasjoner først" hvis Slack ikke er konfigurert
3. Push-toggle: sjekk `typeof Notification !== "undefined" && Notification.permission === "granted"` — vis disabled med tooltip "Nettleser-varsler er ikke aktivert" hvis ikke

### F3 — E-post-varsler for ferdigstilte tasks
**Fil:** `backend: gateway/email.ts` (eller `chat/chat.ts`)

Task-completion-events publiseres via Pub/Sub (`taskEvents` topic), men ingen subscriber sender e-post.

**Backend-fix:**
```typescript
import { Subscription } from "encore.dev/pubsub";
import { taskEvents } from "../tasks/tasks";
import { sendEmail } from "./email"; // eller direkte Resend-kall

const _taskEmailSub = new Subscription(taskEvents, "email-task-completed", {
  handler: async (event) => {
    if (event.action !== "completed") return;
    
    // Hent brukerens e-post
    const user = await users.getUser();
    if (!user?.email) return;
    
    // Sjekk om bruker har e-post-varsler aktivert
    const prefs = user.preferences;
    if (prefs?.emailNotifications === false) return;
    
    await sendEmail({
      to: user.email,
      subject: `TheFold: Oppgave fullført — ${event.title || event.taskId}`,
      html: `<p>Oppgaven "${event.title || event.taskId}" er fullført.</p>
             <p>Repo: ${event.repo || "Ingen"}</p>
             <p><a href="https://app.thefold.dev/tasks">Se oppgaver →</a></p>`,
    });
  },
});
```

---

## Gruppe G — Sidebar, UX & nye sider (6 bugs)

### G1 — Sidebar: hardkodet "Jørgen Andre" og "admin"
**Fil:** `frontend/src/app/(dashboard)/layout.tsx`

Sidebar-bunnen viser hardkodet navn og rolle.

**Fix:**
1. Importer `useUser` fra `@/contexts/UserPreferencesContext`
2. Erstatt hardkodet "Jørgen Andre" med `user?.name || "—"`
3. Erstatt hardkodet "admin" med `user?.role || "—"`
4. Erstatt hardkodet avatar-initial med `initial` fra context
5. Bruk `avatarColor` fra context for avatar-bakgrunn

### G2 — Blå venstre-border på ALLE aktive valg-knapper
**Filer:** ALLE frontend-sider med seleksjon/aktiv-state

`borderLeft: 3px solid ${T.accent}` (eller `"3px solid transparent"` → accent) finnes på nesten alle sider med valg-elementer.

**Fix:** Søk i hele `frontend/src/` etter `borderLeft` som inneholder `accent` eller `3px solid`. Fjern ALLE forekomster. Filer inkluderer men er ikke begrenset til:
- `tasks/page.tsx`
- `chat/page.tsx`
- `skills/page.tsx`
- `komponenter/page.tsx`
- `mcp/page.tsx`
- `integrasjoner/page.tsx`
- `ai/page.tsx`
- `monitor/page.tsx`
- `memory/page.tsx`
- `sandbox/page.tsx`
- `innstillinger/page.tsx`

Erstatt med kun `background: T.subtle` for valgt element. Ingen blå venstre-kant noe sted i hele appen.

### G3 — Skeleton loaders: forbedring
**Filer:** Alle sider med `<Skeleton rows={N} />`

Sprint 3.6 la til generiske skeleton-rader. Brukeren ønsker bedre match med layout, eller en enkel spinner.

**Fix:** Erstatt `<Skeleton rows={N} />` med sentrert spinner der skeleton ikke matcher innholdet:
```tsx
import { Loader2 } from "lucide-react";

// Erstatt:
<Skeleton rows={4} />

// Med:
<div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "60px 0" }}>
  <Loader2 size={24} style={{ color: T.textFaint, animation: "spin 1s linear infinite" }} />
</div>
```

Behold skeleton-rader KUN der de ligner reell layout (tabeller med kjente kolonner, profil-felt med kjent bredde). Alle andre → spinner.

### G4 — Docs-side
**Filer:** `frontend/src/app/(dashboard)/docs/page.tsx` (NY), `frontend/src/app/(dashboard)/layout.tsx`

**Fix:**
1. Opprett `/app/(dashboard)/docs/page.tsx`
2. Innhold: to seksjoner:
   - "Healing-rapporter" → data fra `getHealingStatus({ limit: 20 })`
   - "Helse-sjekker" → data fra `getMonitorHealth()`
3. Vis som tidslinje/tabell med dato, type, status, detaljer
4. Legg til i sidebar-navigasjon i `layout.tsx`:
   - Ikon: `FileText` fra Lucide
   - Label: "Docs"
   - Href: `/docs`
   - Plasser i SYSTEM-gruppen (etter Monitor)

### G5 — Varslinger (NotifBell)
**Filer:** `frontend/src/components/NotifBell.tsx`, `backend: chat/chat.ts`

**Backend-fix:** Opprett nytt endpoint:
```typescript
export const notifications = api(
  { method: "GET", path: "/chat/notifications", expose: true, auth: true },
  async (): Promise<{ notifications: Array<{ id: string; content: string; type: string; createdAt: string }> }> => {
    const rows = db.query`
      SELECT id, content, message_type, created_at
      FROM messages
      WHERE message_type IN ('agent_report', 'agent_status')
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 20
    `;
    const notifications = [];
    for await (const row of rows) {
      notifications.push({
        id: row.id,
        content: String(row.content).substring(0, 100),
        type: row.message_type,
        createdAt: String(row.created_at),
      });
    }
    return { notifications };
  }
);
```

**Frontend-fix:** Oppdater `NotifBell.tsx`:
1. Poll `/chat/notifications` hvert 30 sekunder
2. Vis rødt badge med antall uleste (basert på sist sett tidspunkt i localStorage)
3. Klikk → dropdown med siste hendelser
4. Klikk på hendelse → naviger til `/tasks` eller `/chat`

### G6 — Token/kostnad oppdateres ikke på overview
**Filer:** `frontend/src/app/(dashboard)/page.tsx`, `backend: chat/chat.ts`

Overview-widgets for tokens og kostnad viser samme tall etter bruk.

**Fix:**
1. **Backend:** Verifiser at `processAIResponse` lagrer `tokens_used` og `cost_usd` i messages-metadata (JSON-felt)
2. **Backend:** Verifiser at stats-endpoint (`getStats` eller tilsvarende) aggregerer fra messages-metadata korrekt
3. **Frontend:** Overview-widgets bruker `useApiData` — legg til refresh-mekanisme. Enklest: legg til `key`-prop som endres ved navigasjon tilbake til overview, eller bruk `router.refresh()`.

---

## Sjekkliste etter alle endringer

```bash
# 1. Frontend build
cd frontend && npx next build
# Forventet: 17/17 sider (16 + ny docs-side) kompilerer uten feil

# 2. Backend tester (hvis endret)
encore test ./chat/... ./gateway/... ./mcp/...

# 3. Verifiser visuelt
# - Overview: Dither fyller hele content-bredden (1636px)
# - Overview: Skills/sub-agent/modell-knapper fungerer
# - Chat: AgentProgress rendres for agent-meldinger
# - Chat: Slett-ikon på samtaler
# - Chat: Modellvalg sender model_id til backend
# - AI-side: Fasetilordning øverst, dropdown fungerer, "Legg til modell" fungerer
# - Tasks: Ingen action-knapper på blokkerte/godkjente tasks
# - Tasks: RefreshCw-ikon for Linear-sync
# - Integrasjoner: Firecrawl viser "Konfigurert via server"
# - MCP: linear-mcp er borte
# - Monitor: "Kjør nå" fungerer med repo-valg
# - Innstillinger: AI-navn auto-lagrer
# - Sidebar: Viser brukerens navn og rolle (ikke hardkodet)
# - INGEN blå venstre-border noe sted
# - Docs-side fungerer med rapporter
```
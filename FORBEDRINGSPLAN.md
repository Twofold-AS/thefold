# TheFold — Forbedringsplan etter E2E-testing

> Generert 12. april 2026 etter full gjennomgang av alle 13 sider og AI-chat pipeline.

---

## 1. Chat & SSE-streaming — Bedre visning av AI-arbeidet

### Problem
SSE-streamingen **fungerer** — events kommer inn i sanntid, faser vises, og "Tenker..."-indikatoren er på plass. Men visningen er rotete:

- Teksten fra AI-svaret kommer som en ferdig blokk, ikke inkrementelt
- "Tenker..." dukker opp to ganger: først mens AI planlegger, så igjen under "fullføring"
- AgentStatus-widgeten viser faser (Bygger, Gjennomgår) men forsvinner for raskt
- Hele samtalen er én lang strøm — vanskelig å skille "AI snakker" fra "Agent jobber"

### Foreslått løsning: Tre-lags visning

**Lag 1 — AI-svar (direktechat)**
Vis AI-teksten med typing-effekt (token-for-token fra SSE `agent.message`-events). Fjern den andre "Tenker..."-indikatoren ved å sjekke om fasen er `completing` — da skal den IKKE vise "Tenker..." igjen, bare oppdatere ferdig status.

**Lag 2 — Agent-arbeid (kollapserbar boks)**
Når agenten starter en task (create_task → start_task), vis arbeidet i en **dedikert, kollapserbar boks** inne i chatten:
```
┌─ 🔧 Legg til dark mode toggle ──────────────────┐
│  ✅ Kontekst bygget (skills, repos, memory)      │
│  ✅ Plan generert (1 fil)                        │
│  ✅ index.html bygget                            │
│  ✅ AI-review fullført (4/10)                    │
│  ⏳ Venter på godkjenning                        │
│                                                   │
│  Filer: 1 | Tid: 84s | Kostnad: $0.03           │
│  [Godkjenn] [Be om endringer] [Avvis]            │
└──────────────────────────────────────────────────┘
```

**Lag 3 — Ferdig-sammendrag**
Etter review-avgjørelse, vis et kort sammendrag med PR-link (eller avvisnings-melding).

### Tekniske endringer

| Fil | Endring |
|-----|---------|
| `frontend/src/hooks/useAgentStream.ts` | Parse `agent.message` delta-events for typing-effekt |
| `frontend/src/components/chat/AgentStatusBar.tsx` | Ikke vis "Tenker..." når fase = `completing`/`reviewing` |
| `frontend/src/components/chat/AgentWorkCard.tsx` | **NY** — Kollapserbar boks for agent-arbeid |
| `chat/chat.ts` | Lagre agent-arbeid som egen `message_type='agent_work'` |

---

## 2. Review-godkjenning — Dobbelt-klikk bug

### Problem
Bruker klikker "Godkjenn" → knappen laster → knappen blir klikkbar igjen UTEN PR-link. Må klikke igjen for å se PR.

### Rotårsak
`useReviewFlow.ts` gjør `await approveReview(reviewId)` og deretter `refreshMsgs()`. Backend-endpointet `agent/review.ts` setter status til `approved` tidlig, lager PR, og returnerer `{ prUrl }`. Men `refreshMsgs()` henter chat-historikk — den henter IKKE den oppdaterte reviewen med PR-URL. Reviewen forblir "pending_review" i frontenden til neste fetch.

### Løsning
```typescript
// useReviewFlow.ts — oppdatert
const handleApprove = async (reviewId: string) => {
  try {
    setLoading("approve");
    const result = await approveReview(reviewId);
    // Oppdater review-state direkte med PR-URL
    setReviewState(prev => ({
      ...prev,
      status: "approved",
      prUrl: result.prUrl
    }));
    refreshMsgs();
  } catch (e) {
    setChatError(e instanceof Error ? e.message : "Godkjenning feilet");
  } finally {
    setLoading(null);
  }
};
```

Og i `ReviewPanel.tsx`: vis PR-link når `reviewState.status === "approved"` uten å vente på refresh.

---

## 3. Notifications — Rå JSON i stedet for formatert tekst

### Problem
Varsel-dropdown viser `{"type":"status","phase":"Bygger","steps...}` — helt uleselig.

### Løsning
I `NotifBell.tsx`, parse agent-status JSON og vis formatert:

```typescript
function formatNotification(n: Notification): string {
  if (n.messageType === "agent_status" || n.messageType === "agent_progress") {
    try {
      const data = JSON.parse(n.content);
      const phase = data.phase || "Ukjent";
      if (data.type === "review") return `📋 Review: ${data.phase}`;
      if (data.type === "completion") return `✅ Fullført: ${data.summary || "Task ferdig"}`;
      return `⚙️ ${phase}`;
    } catch { return n.content; }
  }
  return n.content;
}
```

---

## 4. Skills — "Ny skill" feiler (appliesTo mangler)

### Problem
Backend krever `appliesTo` (minst én context), men frontend-skjemaet sender ikke dette feltet.

### Løsning
Legg til multi-select i "Ny skill"-modalen:

```tsx
// I skill-creation modal
<label>Gjelder for</label>
<MultiSelect
  options={["framework", "language", "security", "style", "quality", "general"]}
  value={appliesTo}
  onChange={setAppliesTo}
  placeholder="Velg kategorier..."
/>
```

Og inkluder i API-kallet:
```typescript
body: { name, description, promptFragment, phase, appliesTo }
```

---

## 5. Diff-visning i code review

### Problem
Klikk på endrede filer i review-panelet ekspanderer ikke for å vise diff/innhold.

### Løsning
Implementer accordion-ekspansjon med syntax-highlighted innhold:
- Hent fil-innholdet fra `review.filesChanged` JSONB
- Vis med enkel diff-view (grønne linjer for nye filer, rød/grønn for endringer)
- Bruk `<pre><code>` med monospace font

---

## 6. Cron-jobbene — Kjører ikke + mangler manuell trigger

### Funn fra testing 12. april

Cron-jobbene trigget IKKE over natten. Årsaker identifisert:

| Cron | Schedule | Hva skjedde | Årsak |
|------|----------|-------------|-------|
| **Monitor health check** | `0 3 * * *` (03:00 UTC) | Aldri logget | Returnerer tidlig hvis ingen repos er konfigurert — `runDailyChecks()` har guard som sjekker repo-liste |
| **Dream engine** | `0 3 * * 0` (søndager 03:00 UTC) | Aldri logget | Har 3 gates: tid (>24h), aktivitet (≥3 nye minner), advisory lock. Mulig edge case med `last_dream_at` |
| **Sandbox cleanup** | `every: "30m"` | Kjørte stille | SandboxMode = "filesystem" → returnerer `{ removed: 0 }` uten logging |
| **Rate limit cleanup** | `0 3 * * *` (03:00 UTC) | Uklart | Ingen synlig output hvis det ikke er records å slette |

Tilleggsproblem: 03:00 UTC = 05:00 CEST. Loggene viser et gap 03:37–11:11 CEST — ingen requests i det hele tatt. Encore kan ha mistet cron-scheduleren selv om prosessen var oppe.

### Løsning A: Manuell trigger-knapp

Legg til et "Kjør nå"-panel i UI (f.eks. på Monitor-siden eller Settings) som trigger cron-jobbene on-demand:

```typescript
// monitor/monitor.ts — nytt endpoint
export const triggerHealthCheck = api(
  { method: "POST", path: "/monitor/trigger", auth: true },
  async (): Promise<HealthCheckResult> => {
    return await runDailyChecks();
  }
);

// memory/dream.ts — nytt endpoint  
export const triggerDream = api(
  { method: "POST", path: "/memory/trigger-dream", auth: true },
  async (): Promise<DreamResult> => {
    return await runDream(); // bypass time-gate for manuell kjøring
  }
);

// registry/healing.ts — nytt endpoint
export const triggerHealing = api(
  { method: "POST", path: "/registry/trigger-healing", auth: true },
  async (): Promise<HealingResult> => {
    return await runHealingPipeline();
  }
);
```

Frontend: Dedikert "Vedlikehold"-panel med tre knapper og siste kjøretid for hver:
```
┌─ Vedlikehold ─────────────────────────────────┐
│                                                │
│  🏥 Helsesjekk    [Kjør nå]   Sist: aldri    │
│  🧠 Drømming      [Kjør nå]   Sist: aldri    │
│  🔧 Healing       [Kjør nå]   Sist: aldri    │
│                                                │
│  Automatisk: daglig kl 05:00 norsk tid        │
└────────────────────────────────────────────────┘
```

### Løsning B: Fiks cron-guards

1. **Monitor**: `runDailyChecks()` returnerer tidlig med "No repos found" — men repos ER konfigurert via GitHub App. Endpointet bruker sannsynligvis feil kilde for repo-listen. Sjekk om den kaller `github.listRepos()` eller leser fra en lokal config.
2. **Dream engine**: Legg til logging på ALLE gates slik at vi kan se HVORFOR den skippet: `log.info("dream skipped", { reason: "too_recent" | "not_enough_memories" | "lock_held" })`
3. **Sandbox cleanup**: Legg til `log.info("sandbox cleanup ran", { mode, removed })` selv i filesystem-modus.
4. **Rate limit cleanup**: Legg til `log.info("rate limits cleaned", { deleted: result.rowCount })`.

---

## 7. Dreams & Memory — Konsept: «TheFold Drømmer»

### Visjon

Drømming er TheFolds "nattarbeid" — den prosesserer dagens opplevelser og blir smartere til neste dag. Dette bør være synlig og forståelig for brukeren, ikke gjemt i en database-tab.

### Konsept: Drøm-journal

Hver gang dream engine kjører, produser en **Drøm-rapport** — et kort, lesbart sammendrag av hva TheFold lærte:

```
┌─ 🌙 Drøm-rapport — 12. april 2026 ──────────────┐
│                                                     │
│  TheFold drømte i 45 sekunder og behandlet          │
│  321 minner fra 8 oppgaver.                         │
│                                                     │
│  💡 Innsikter:                                      │
│  • "Encore.ts CronJob trenger kontinuerlig prosess" │
│    — konsolidert fra 3 feilmønstre                  │
│  • "AI review scorer 4-6/10 på enkle tasks"         │
│    — mønster fra 5 reviews                          │
│                                                     │
│  🧹 Opprydding:                                     │
│  • 12 duplikat-minner fjernet                       │
│  • 5 utdaterte feilmønstre arkivert                │
│                                                     │
│  📊 Hukommelse: 321 → 314 minner (netto -7)        │
│  ⏱️  Neste drøm: søndag 13. april kl 05:00        │
└─────────────────────────────────────────────────────┘
```

### Hvor dette vises

1. **Overview-dashboardet** — nytt kort "Siste drøm" med 1-linje sammendrag + dato. Klikk åpner full rapport.
2. **Memory-siden** — "Drøm-journal" tab (erstatter "Drøm-historikk") med alle rapporter i kronologisk rekkefølge.
3. **Notifications** — push en varsel "🌙 TheFold drømte — 3 innsikter funnet" etter hver kjøring.

### Teknisk implementering

```typescript
// memory/dream.ts — utvid runDream()
interface DreamReport {
  id: string;
  date: string;
  duration_seconds: number;
  memories_processed: number;
  insights: { text: string; source_count: number }[];
  duplicates_removed: number;
  patterns_archived: number;
  memory_delta: { before: number; after: number };
  next_scheduled: string;
}

// Lagre rapport som egen memory med type 'dream_report'
// ELLER i en ny dream_reports tabell for enklere querying

// Nytt endpoint for frontend
export const getDreamJournal = api(
  { method: "GET", path: "/memory/dream-journal", auth: true },
  async (): Promise<{ reports: DreamReport[] }> => {
    // Hent alle dream_report memories sortert by date desc
  }
);
```

### Memory-siden redesign

Nåværende tabs: Alle minner | Kode-mønstre | Drøm-historikk

Foreslått:
```
[Minner (314)]  [Mønstre (12)]  [🌙 Drøm-journal]  [Statistikk]
```

**Drøm-journal**: Viser rapporter som kort — nyeste øverst, med expandable innsikter.
**Statistikk**: Viser memory-health over tid — antall minner, konsolideringsrate, mest brukte tags, temporal decay-kurve.

### Dream engine forbedringer

1. **Bypass time-gate for manuell trigger**: Når `triggerDream()` kalles manuelt, skip 24h-gaten.
2. **Produser alltid en rapport**: Selv om drømmen finner 0 klynger, lag en rapport som sier "Alt er ryddig — ingen konsolidering nødvendig."
3. **Insight extraction**: Etter konsolidering, kjør et kort AI-kall som oppsummerer de viktigste mønstrene i 2-3 setninger. Lagre som `dream_report`.

---

## 8. Cost tracking — Viser $0.00

### Problem
AI-dashboardet viser $0.00 selv etter at chat-oppgaver har kostet $0.0859 + $0.0262.

### Sannsynlig årsak
Chat-kostnadene logges i `messages`-tabellens metadata, men AI-dashboardets `/cost/summary`-endpoint leser fra en annen kilde (muligens `agent_jobs` eller `phase_metrics`).

### Undersøk
1. Sjekk om `/ai/cost/summary` (eller tilsvarende) finnes
2. Sjekk om agent-jobs registrerer kostnader korrekt
3. Koble chat token-bruk til kostnadsoversikten

---

## 9. Feature flags i innstillinger

### Status nå
Innstillings-siden viser 6 feature flags. Du har sagt at alt skal være aktivt by default.

`DynamicSubAgentsEnabled` og `HealingPipelineEnabled` er **false**. Disse bør settes til **true** for å aktivere full funksjonalitet, eller fjernes fra UI helt.

---

## 10. Komponenter — Alle "pending"

### Problem
Alle 5 komponenter har status "pending". Ingen har "active" eller "published".

### Foreslått
Enten:
- Oppdater seed-data til å sette status "active" for ferdige komponenter
- Eller legg til en "Publiser"-knapp i UI for å endre status

---

---

## 11. Backend — Kritiske bugs funnet i audit

### 11a. Zombie jobs — Silent error swallowing i job tracking
`agent/completion.ts` og `agent/review-handler.ts` har catch-blokker som logger advarsler men ikke markerer jobben som feilet. Resultatet er at jobber kan bli stående som `running` for alltid.

**Fiks**: Alle catch-blokker som håndterer terminal failures må kalle `failJob(jobId)` i tillegg til logging.

### 11b. Uguarded JSON.parse() i flere filer
Flere steder bruker `JSON.parse()` uten try/catch. Korrupt data i DB (f.eks. `messages.metadata` eller `filesChanged` JSONB) krasjer hele request.

**Fiks**: Wrap alle `JSON.parse()` i try/catch med fallback-verdier. Spesielt viktig i:
- `chat/chat.ts` — meldings-parsing
- `agent/messages.ts` — `deserializeMessage()`
- Frontend `MessageList.tsx` — metadata parsing (linje 39-46)

### 11c. Advisory locks som aldri frigis
`acquireRepoLock()` bruker session-level advisory locks. Hvis Encore-prosessen krasjer midt i en task, holdes locken til DB-sesjonen dør. Men med connection pooling kan dette ta svært lang tid.

**Fiks**: Bruk transaction-level locks (`pg_advisory_xact_lock`) i stedet for session-level, eller implementer en cleanup-mekanisme.

### 11d. N+1 query i context-builder
`context-builder.ts` gjør separate `github.readFile()` kall for hver relevant fil. Med 10+ filer per task ganget med parallelle tasks = API-overbelastning.

**Fiks**: Batch file reads via `github.readFiles()` (ny batch-endpoint) eller bruk `Promise.all` med rate limiting.

---

## 12. Backend — Viktige forbedringer

### 12a. Ubegrenset prompt-kontekst
`ai/call.ts` sender alt av kontekst uten å trimme. For store repos kan dette bety 60-70% token-sløsing.

**Fiks**: `filterForPhase()` i `context-builder.ts` eksisterer allerede men brukes ikke konsekvent. Aktiver for ALLE AI-kall, ikke bare building-fasen.

### 12b. Model fallback bare oppgraderer (aldri nedgraderer)
`ai/router.ts` `getUpgradeModel()` prøver neste tier opp ved feil. Betyr at en feil med haiku → sonnet → opus. Dyrt og unødvendig for enkle feil.

**Fiks**: Implementer retry-on-same-tier først, deretter oppgrader.

### 12c. Ingen observability på AI-beslutninger
Confidence assessment, modellvalg, og diagnosis-type er viktige beslutninger som ikke logges strukturert. Umulig å debugge hvorfor agenten tok feil avgjørelse.

**Fiks**: Logg alle AI-beslutninger til `agent_phase_metrics` eller en ny `agent_decisions`-tabell. Vis i UI som "beslutningslogg".

### 12d. Cron logging mangler fullstendig
Ingen av de 4 cron-jobbene logger start/slutt/resultat. Umulig å verifisere at de kjører.

**Fiks**: Alle crons må logge: `log.info("cron started", { job })` ved start og `log.info("cron completed", { job, duration, result })` ved slutt.

---

## 13. Frontend — Kritiske mangler

### 13a. Null tilgjengelighet (a11y)
Kun 2-3 `aria`-attributter i hele frontenden. Ingen keyboard-navigasjon utover Enter/Escape i chat. Ingen fokus-håndtering, ingen screen reader-støtte.

**Fiks**: Prioriter de mest brukte flows: chat input, review-knapper, navigasjon. Legg til `role`, `aria-label`, `tabIndex`, og fokus-traps i modale dialogs.

### 13b. Command Palette (Cmd+K) installert men ikke koblet
`cmdk` pakken er i `package.json` og `command.tsx` UI-komponent finnes, men den er aldri instantiert. Kraftig produktivitetsverktøy som mangler.

**Fiks**: Aktiver command palette med: navigasjon til alle sider, søk i samtaler, hurtigkommandoer (ny samtale, ny task, kjør drøm).

### 13c. Race conditions i chat-polling
Chat-siden har 4 separate timeout-baserte refreshes (2s, 8s, 20s, 60s) OG SSE-streaming OG fallback-polling som alle kjører parallelt. Risiko for duplikate meldinger og stale state.

**Fiks**: Bruk SSE som primærkilde. Fjern timeout-kaskaden. Fallback-polling bare når SSE feiler, med deduplisering via message ID.

### 13d. Ingen mobil-responsivitet
Kun én media query i hele appen. Hardkodede bredder overalt. Dashboard-grid kollapser ikke på tablet/mobil.

**Fiks**: Legg til breakpoints for sidebar, grid-layouts, og chat-input. Prioriter chat-opplevelsen på mobil (mest brukte flow).

### 13e. Ingen error recovery UI
Etter 3 mislykkede SSE-reconnects vises "Connection lost" uten retry-knapp. Bruker må refreshe siden.

**Fiks**: Vis "Prøv igjen"-knapp med manuell reconnect. Vis tydelig status (tilkoblet / kobler til / frakoblet).

---

## 14. Frontend — Viktige forbedringer

### 14a. Keyboard shortcuts
Bare Ctrl+Enter for å sende meldinger. Mangler: Cmd+K (palette), Cmd+B (ny chat), Escape (lukk panel), piltaster for navigasjon.

### 14b. Dark mode toggle mangler UI
Theme-system finnes (`lib/theme.ts`), men ingen knapp for å bytte. Default er hardkodet dark.

### 14c. Store komponenter uten code splitting
`ai/page.tsx` = 864 linjer, `tasks/page.tsx` = 804, `settings/models/page.tsx` = 752. Bør splittes for vedlikeholdbarhet.

### 14d. Ingen request cancellation
`apiFetch` bruker ikke `AbortController`. Navigasjon bort fra en side canceller ikke pågående requests.

### 14e. Inkonsistente tomme tilstander
Noen sider har "Laster..." tekst, andre har ingenting. Ingen skeleton loaders. Tomme states har ingen CTA-knapper.

---

## 15. Grunnmur som bør aktiveres (fra GRUNNMUR-STATUS.md)

Disse finnes i koden men er ikke aktivert:

| Feature | Fil | Status | Verdi |
|---------|-----|--------|-------|
| `solution_embedding` i searchPatterns | memory/memory.ts | 🔴 | Finn lignende løsninger, ikke bare lignende problemer |
| `bugs_prevented` counter | memory/memory.ts | 🔴 | Mål effektiviteten av error patterns |
| Skills tag/category filtering | skills/engine.ts | 🔴 | Skill-valg basert på tags (seeded men aldri brukt i queries) |
| Skills token budget | skills/engine.ts | 🔴 | `token_budget_max` finnes men sjekkes aldri |
| Monitor alert thresholds | monitor/monitor.ts | 🔴 | `monitor_thresholds` tabell finnes men brukes ikke |
| LivePreview i sandbox | frontend | 🟡 | Placeholder for sandbox-preview |

---

## 16. AI-intelligens — Prompt og orkestrering

### 16a. Ingen chain-of-thought i prompts
Planlegging og dekomponering ber ikke AI-en om å tenke steg-for-steg. For komplekse tasks fører dette til grunne planer.

**Fiks**: Legg til "Tenk gjennom dette steg-for-steg før du svarer:" i planning- og decomposition-prompts (`ai/prompts.ts`).

### 16b. Ingen retry-delay ved AI-feil
`ai/call.ts` retrier umiddelbart etter feil. Ved rate-limit (429) hamrer dette API-et.

**Fiks**: Legg til eksponentiell backoff: `await new Promise(r => setTimeout(r, 1000 * 2^attempts))` før retry.

### 16c. Import-graf mangler syklusdeteksjon
`context-builder.ts` sin import-graf-traversering har ingen cycle detection. Sirkulære imports (A → B → A) kan gi uendelig loop.

**Fiks**: Track besøkte noder i `getRelatedFiles()`, returner tidlig ved cycle.

### 16d. D27-manifest lagres ikke korrekt
`context-builder.ts` beregner file-hashes men sender IKKE hashene til `memory.updateManifest()`. Feature er halvveis implementert.

**Fiks**: Pass `fileHashes` til updateManifest-kallet.

### 16e. Manglende chat-tools
Kun 5 tools tilgjengelig for AI i chat. Mangler:
- `run_tests` — validér kode i sandbox
- `validate_syntax` — sjekk TypeScript uten full build
- `read_recent_history` — se git diffs for kontekst ved retry

**Fiks**: Legg til 3 nye tools i `ai/tools.ts`.

### 16f. Sub-agents får ikke kontekst fra avhengigheter
Dependent sub-agents (tester, reviewer) starter UTEN output fra planner. De får bare task-tittel og rolle-beskrivelse.

**Fiks**: Inject planner-output i dependent agents' inputContext FØR execution (ikke etter).

---

## 17. GitHub & Linear — Integrasjonsgap

### 17a. Ingen draft PRs
Alle PRs opprettes som «ready for review». For store endringer bør dette være draft først.

**Fiks**: Legg til `draft: true` i `github.createPR()` basert på filantall eller quality score.

### 17b. Linear sync er enveis
TheFold henter tasks fra Linear, men pusher bare status tilbake. Kommentarer, labels, og attachments synkes ikke.

**Fiks**: Utvid `linear/linear.ts` med toveis kommentar-sync (minst). Attachments kan vente.

### 17c. Ingen CI-sjekk før PR merge
PR opprettes uten å sjekke om CI (GitHub Actions) passerer.

**Fiks**: Etter PR-opprettelse, poll CI status. Rapporter til bruker om CI feiler.

---

## 18. Frontend — Side-spesifikke UX-problemer

### 18a. Review-panel er usynlig i chat
Når en review venter, render knappene inline i meldingsstrømmen. Lett å scrolle forbi.

**Fiks**: Sticky banner øverst i chatten: "Review venter — godkjenn/avvis nedenfor" med scroll-to-review.

### 18b. Tasks har ingen filtrering/sortering
Alle tasks vises i én liste uten filter for status, kilde, eller kvalitetsscore.

**Fiks**: Filter-bar med status-chips + sortering på kolonne-headers.

### 18c. Memory "Prune"-knapp er placeholder
Knappen finnes men er stubbet med `setTimeout` + fake alert. Forvirrer brukere.

**Fiks**: Enten fjern knappen eller koble til `memory.cleanup()` endpoint.

### 18d. Monitor helsesjekk-detaljer avkuttet
Detalj-kolonnen viser 80 tegn og kutter av. Ingen måte å se full feilmelding.

**Fiks**: Expandable rows eller tooltip med full tekst.

### 18e. Btn-komponent mangler loading-state
8+ sider gjør manuell `opacity: loading ? 0.5 : 1`. Ingen standard loading-prop.

**Fiks**: Legg til `loading?: boolean` i `Btn.tsx` med spinner og disabled state.

### 18f. Ingen CopyToClipboard-komponent
Flere sider kopierer ad-hoc (memory IDs, PR URLs, kode). Ingen gjenbrukbar komponent.

**Fiks**: Lag `<CopyBtn value={text} />` — brukes på minst 5 sider.

---

## Prioritert rekkefølge (oppdatert etter dyp audit)

### Sprint 1 — Kritiske bugs og blockers (dag 1)
| # | Oppgave | Estimat |
|---|---------|---------|
| 1 | Review dobbelt-klikk bug + PR-link display | 45 min |
| 2 | Notifications formatering (parse JSON) | 1 time |
| 3 | Skills appliesTo felt i modal | 30 min |
| 4 | Cron manuell trigger + fiks guards + logging | 2.5 timer |
| 5 | Zombie jobs — fiks silent catch-blokker | 1 time |
| 6 | Feature flags → alt aktivt by default | 15 min |
| 7 | Komponenter status → active | 15 min |
| 8 | Import-graf syklusdeteksjon | 30 min |

**Sprint 1 total: ~7 timer**

### Sprint 2 — Chat & UX overhaul (dag 2-3)
| # | Oppgave | Estimat |
|---|---------|---------|
| 9 | Chat tre-lags visning (AgentWorkCard) | 3-4 timer |
| 10 | Sticky review-banner i chat | 30 min |
| 11 | Fjern polling-kaskade, SSE-only + fallback | 2 timer |
| 12 | Error recovery UI (retry-knapp, status-indikator) | 1 time |
| 13 | Diff-visning i code review (react-diff-viewer) | 2 timer |
| 14 | Cmd+K command palette (aktivere cmdk) | 2 timer |
| 15 | Btn loading-prop + CopyBtn komponent | 1 time |

**Sprint 2 total: ~12 timer**

### Sprint 3 — Dreams, Memory & AI Intelligence (dag 3-4)
| # | Oppgave | Estimat |
|---|---------|---------|
| 16 | Dreams — Drøm-journal konsept + UI | 3-4 timer |
| 17 | Cost tracking kobling | 1.5 timer |
| 18 | AI chain-of-thought i prompts | 30 min |
| 19 | AI retry backoff (eksponentiell) | 30 min |
| 20 | Nye chat-tools (run_tests, validate_syntax) | 2 timer |
| 21 | Sub-agent kontekst fra dependencies | 1 time |
| 22 | AI beslutningslogg (observability) | 2 timer |
| 23 | Aktiver solution_embedding i memory search | 1 time |
| 24 | Aktiver skills tag filtering + token budget | 1 time |
| 25 | Fiks D27 manifest persistence | 30 min |

**Sprint 3 total: ~13-14 timer**

### Sprint 4 — Integrasjoner & Kvalitet (dag 5-6)
| # | Oppgave | Estimat |
|---|---------|---------|
| 26 | GitHub draft PRs for store endringer | 1 time |
| 27 | CI-sjekk etter PR-opprettelse | 1.5 timer |
| 28 | Task-filtrering og sortering | 2 timer |
| 29 | Memory prune-knapp koble til endpoint | 30 min |
| 30 | Monitor detalj-ekspansjon | 30 min |

**Sprint 4 total: ~5.5 timer**

### Sprint 5 — Polish & World-class (dag 6-7)
| # | Oppgave | Estimat |
|---|---------|---------|
| 31 | Keyboard shortcuts (Cmd+K, Cmd+B, Escape) | 1.5 timer |
| 32 | Tilgjengelighet (a11y) for chat + review | 3 timer |
| 33 | Mobil-responsivitet (chat + overview) | 3 timer |
| 34 | Tomme states med onboarding + CTA | 1.5 timer |
| 35 | Dark mode toggle i UI | 30 min |
| 36 | Store komponenter → code split | 2 timer |
| 37 | Linear toveis kommentar-sync | 2 timer |

**Sprint 5 total: ~13.5 timer**

---

**Total: 37 oppgaver, ~51 timer (7 arbeidsdager)**

### Avhengigheter
- Sprint 2.9 (Chat) → avhenger av Sprint 1.1 (Review-bug)
- Sprint 3.16 (Dreams) → avhenger av Sprint 1.4 (Cron-fiks)
- Sprint 3.17 (Cost) → krever undersøkelse av cost endpoint først
- Sprint 4.27 (CI-sjekk) → avhenger av Sprint 4.26 (Draft PRs)
- Sprint 5.31 (Shortcuts) → avhenger av Sprint 2.14 (Cmd+K)

### Hva som gjør TheFold world-class etter disse endringene
1. **Chat som arbeidssenter** — tre-lags visning + sticky review + SSE-only = proff opplevelse
2. **AI som lærer** — drøm-journal + beslutningslogg + chain-of-thought = transparent intelligens
3. **Utvikler-opplevelse** — Cmd+K, keyboard shortcuts, diff-view = kraftbrukervennlig
4. **Selvreparerende** — manuell cron-trigger, sub-agent kontekst, retry backoff = robust autonomi
5. **Integrasjonsdybde** — draft PRs, CI-sjekk, Linear sync = profesjonell pipeline

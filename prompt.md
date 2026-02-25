Kontekst
Nettsiden har blitt oppdatert med mange hardkodede placeholdere. Alle sider bruker statisk data istedenfor API-kall. Det er Unicode-problemer (escape-sekvenser vises som tekst), og knapper/toggles mangler handlers. Denne planen fikser alt uten å endre layout, typografi eller farger.
Problem 1: Unicode Escape-Sekvenser (Norske tegn vises feil)
Alle \u00e5 (å), \u00f8 (ø), \u00e6 (æ) vises som literal tekst istedenfor korrekte norske tegn.
Filer som må fikses:
FilLinje(r)FeilKorrekt(dashboard)/page.tsx (Overview)~23, ~112N\u00e5r, best\u00e5ttNår, bestått(dashboard)/chat/page.tsx~29,38,43,45,48n\u00e5, st\u00f8tte, utl\u00f8pstid, kj\u00f8r, best\u00e5ttnå, støtte, utløpstid, kjør, bestått(dashboard)/tasks/page.tsx~36,112,127,383p\u00e5, best\u00e5tt, utf\u00f8rt, enn\u00e5på, bestått, utført, ennå(dashboard)/skills/page.tsx~117modul\u00e6rtmodulært(dashboard)/ai/page.tsx~51,52L\u00f8r, S\u00f8n, prim\u00e6rLør, Søn, primær(dashboard)/komponenter/page.tsx~140S\u00f8k...Søk...
Fix: Søk-og-erstatt alle \u00e5 → å, \u00f8 → ø, \u00e6 → æ, \u00e9 → é, \u2014 → — i alle page-filer.

Problem 2: 100% Hardkodet Data — Koble til Backend API
Alle sider bruker hardkodede arrays. Backend API-ene eksisterer allerede i frontend/src/lib/api.ts (40+ endpoints). Vi trenger bare å koble dem.
Side-for-side plan:
2a. Overview ((dashboard)/page.tsx)

Nå: Hardkodede tall (12.4k tokens, $1.24, 3 tasks, 94%)
Fix: Bruk getCostSummary(), getTaskStats(), listTheFoldTasks() fra api.ts
Aktivitet-listen: Bruk listTheFoldTasks({ limit: 4 }) for siste aktivitet
Toggles: Wire onChange til faktiske preferences (localStorage el. API)

2b. Chat ((dashboard)/chat/page.tsx)

Nå: 6 hardkodede samtaler med statiske meldinger
Fix: Bruk getConversations() for samtale-liste, getChatHistory(id) for meldinger
Send melding: Bruk sendMessage() API
Ny samtale: Opprett via API, ikke bare setState

2c. Tasks ((dashboard)/tasks/page.tsx)

Nå: 5 hardkodede tasks med fake kvalitetsrapporter
Fix: Bruk listTheFoldTasks() for taskliste
Detaljer: Bruk getTask(id) for full detalj-visning
Knapper: Wire "Ny task" → createTask(), "Godkjenn" → approveReview(), "Be om endringer" → requestReviewChanges(), "Avvis" → rejectReview(), "Importer fra Linear" → syncLinearTasks()

2d. Komponenter ((dashboard)/komponenter/page.tsx)

Nå: 8 hardkodede komponenter
Fix: Bruk listComponents() fra api.ts
Søk: Bruk searchComponents(query) istedenfor client-side filter
"Bruk" knapp: Wire til useComponentApi()

2e. Skills ((dashboard)/skills/page.tsx)

Nå: 6 hardkodede skills
Fix: Bruk listSkills() fra api.ts
Toggle: Bruk toggleSkill(id, enabled)
Rediger: Bruk updateSkill() med dialog
Ny skill: Bruk createSkill()

2f. AI ((dashboard)/ai/page.tsx)

Nå: Hardkodede providers, modeller, kostnadsdiagram
Fix: Bruk listProviders() for provider-data, listModels() for modell-liste
Kostnad: Bruk getCostSummary() for 7-dagers chart
Endre-knapp: Wire til saveModel() / saveProvider()

2g. Integrasjoner ((dashboard)/integrasjoner/page.tsx)

Nå: 8 hardkodede integrasjoner
Fix: Bruk listIntegrations() fra api.ts
"Koble til": Bruk saveIntegration() med konfigurasjon-dialog
Frakoblet: Bruk deleteIntegration()

2h. MCP ((dashboard)/mcp/page.tsx)

Nå: 7 hardkodede MCP-servere
Fix: Bruk listMCPServers() fra api.ts
Installer: Bruk installMCPServer(id)
Avinstaller: Bruk uninstallMCPServer(id)
Konfigurer: Bruk configureMCPServer(id, config) med dialog
Routing toggle: Sjekk faktisk routing-status

2i. Memory ((dashboard)/memory/page.tsx)

Nå: 6 hardkodede minner, 4 kode-mønstre
Fix: Bruk searchMemories({ query: "", limit: 20 }) for minne-liste
Stats: Bruk getMemoryStats() for top-metrikker
Kode-mønstre: Vis fra memory search med type-filter

2j. Monitor ((dashboard)/monitor/page.tsx)

Nå: 8 hardkodede helse-sjekker, 4 healing events
Fix: Bruk getHealingStatus() fra api.ts for healing-data
"Kjør nå" knapp: Wire til monitor-endpoint (eller vis melding at det er cron-basert)

2k. Sandbox ((dashboard)/sandbox/page.tsx)

Nå: 3 hardkodede sandbox-kjøringer
Fix: Foreløpig behold hardkodet data men vis korrekt — sandbox har ingen list-endpoint ennå
Alternativ: Koble til builder jobs via getBuilderJobs() som viser validering-resultater

2l. Innstillinger ((dashboard)/innstillinger/page.tsx)

Nå: Hardkodede profil-data, settings, API-nøkler
Fix: Profil-data fra auth/session, toggles lagrer til localStorage, "Revoke alle tokens" kaller logout() API


Problem 3: Tomme Button/Toggle Handlers
Mange onChange={() => {}} og knapper uten onClick.
Fix per side:

Overview toggles: Lagre preferences i localStorage, bruk i chat-controls
Tasks knapper: Wire Godkjenn/Endringer/Avvis til review API
Skills toggle: Wire til toggleSkill() API
MCP toggle: Wire til routing-status check
Innstillinger: Wire alle toggles til localStorage + API der relevant
Monitor "Kjør nå": Vis toast "Manuell kjøring er ikke tilgjengelig ennå"


Implementeringsrekkefølge
Steg 1: Unicode-fix (5 min)
Søk-erstatt alle escape-sekvenser i alle page-filer.
Steg 2: Shared hooks & utils (15 min)
Lag useApiData(fetcher) hook for data-fetching med loading/error states.
Steg 3: Overview — koble til API (15 min)
Stats fra API, aktivitet fra tasks, toggles til localStorage.
Steg 4: Tasks — koble til API (20 min)
Task-liste, detaljer, review-knapper, ny task, Linear-import.
Steg 5: Chat — koble til API (20 min)
Samtaler, meldinger, send-funksjon.
Steg 6: Skills — koble til API (15 min)
Liste, toggle, detalj-panel.
Steg 7: AI — koble til API (15 min)
Providers, modeller, kostnad.
Steg 8: Komponenter — koble til API (10 min)
Liste, søk, bruk-knapp.
Steg 9: MCP — koble til API (15 min)
Server-liste, install/uninstall, routing.
Steg 10: Integrasjoner — koble til API (10 min)
Liste fra API, koble til/fra.
Steg 11: Memory — koble til API (10 min)
Minner fra søk, stats.
Steg 12: Monitor — koble til API (10 min)
Healing-status, helse-sjekker (der tilgjengelig).
Steg 13: Sandbox & Innstillinger (10 min)
Sandbox: behold som er (mangler list-endpoint). Innstillinger: wire toggles.

Viktige filer

frontend/src/lib/api.ts — Alle API-funksjoner (allerede implementert)
frontend/src/lib/tokens.ts — Design tokens (IKKE endre)
frontend/src/app/(dashboard)/*/page.tsx — Alle sider som skal fikses
frontend/src/components/ — Gjenbruk eksisterende komponenter

- Verifikasjon når du er ferdig med thefold-verify skill
- Lag rapport i frontend mappen når du er ferdig
- Ikke endre backend, bruk endepunkter for data som skal vises
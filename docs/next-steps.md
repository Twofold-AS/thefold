# TheFold — Strategisk Utviklingsplan

> Oppdatert 12. april 2026

## Visjon

TheFold er ikke en IDE-copilot. Det er en autonom utviklingskollega — en agent som husker, tar initiativ, jobber selvstendig, og blir smartere over tid. Cursor reagerer på tastetrykk. TheFold driver prosjekter fremover mens du sover.

Denne planen bygger videre på bugfiksene og infrastrukturen fra v1–v3 dispatch, og fokuserer på det som skiller TheFold fra alle andre: **autonomi, hukommelse, proaktivitet og transparens**.

---

## Fullførte faser (11–12. april)

- [x] Duplikat AgentEventBus — fikset
- [x] 9 døde komponenter fjernet (2179 linjer)
- [x] SSE field renames — alle 5 event handlers i useAgentStream.ts rettet
- [x] SSE replay-buffer koblet opp (Last-Event-ID → buffer replay)
- [x] Review polling utvidet (60s ekstra vindu)
- [x] /settings/models — full CRUD for AI-modeller med provider/tier/pris
- [x] /review/[id] — dedikert review-side med kvalitetsscore, fil-diffs, approve/reject
- [x] Chat UX — typing indicator, auto-start tasks, tom-melding-filter, parallelliserte GitHub-kall

---

## Fase 4: Agent-pålitelighet

### 4.1 Full tool-loop for direkte chat
Agenten oppretter task-record via chat men kjører tool-loop separat. Hele flyten bør være én sammenhengende prosess: bruker skriver → agent planlegger → bygger → validerer → review — alt innenfor samme chat-kontekst.

### 4.2 Error recovery
- Automatisk retry med eksponentiell backoff ved transiente feil
- Checkpoint-resumption: agent kan gjenoppta fra siste vellykkede steg
- Graceful degradation: hvis sandbox feiler, rapporter hva som ble gjort

### 4.3 Context manager
- Sliding window for lange samtaler (behold de viktigste meldingene)
- Token-budsjett per fase (allerede stubbet i token-policy.ts — aktiver)
- Automatisk komprimering av eldre kontekst via AI-oppsummering

### 4.4 Heartbeat og timeout
- Frontend heartbeat-polling: vis "agenten har stoppet" etter 60s uten events
- Backend timeout: avbryt stuck tasks etter konfigurerbart tidsvindu
- "Fortsett"-knapp som lar bruker pushe agenten videre

---

## Fase 5: Frontend polish

### 5.1 useApiData overalt
Hook finnes i lib/hooks.ts men brukes bare i 2 av 15+ sider. Migrer alle sider til konsistent data-fetching med loading/error states.

### 5.2 Error boundaries
ErrorBoundary.tsx finnes men brukes ikke. Wrap alle sider og kritiske seksjoner.

### 5.3 Loading skeletons
LoadingSkeleton.tsx finnes men brukes ikke. Erstatt "Loading..." tekst med skjeletter.

### 5.4 Keyboard shortcuts
- `Cmd+Enter` — send melding
- `Cmd+K` — command palette (søk tasks, repos, settings)
- `Escape` — avbryt/lukk modal
- `Cmd+Shift+N` — ny samtale

### 5.5 Responsive design
Mobile-gjennomgang av alle sider. Chat bør fungere godt på telefon.

### 5.6 Toast-varsler
Bakgrunns-events (task ferdig, review klar, agent feilet) som toasts — ikke bare i chatten.

---

## Fase 6: Testing

### 6.1 E2E chat flow
Send melding → agent starter → tool-use → kode generert → review → approve → PR

### 6.2 SSE testing
Connection, reconnection, replay-buffer, concurrent connections

### 6.3 Agent integration
Mock AI provider (finnes allerede i test-helpers/) → test full agent loop

### 6.4 Load testing
Concurrent SSE connections, parallelle agent-kjøringer, memory search under last

---

## Fase 7: Hukommelse som superkraft 🧠

> *"Agenten husker at du forrige uke sa X, og bruker det til å gjøre bedre valg i dag."*

Dette er TheFolds viktigste differensiator. Memory-systemet finnes i backend — nå må det bli synlig og føles magisk.

### 7.1 Memory-synlighet i chatten
Når agenten bruker en memory i sin reasoning, vis det inline:
```
💡 Husker: "Du foretrekker Zod over Joi for validering" (fra 3. april)
```
Brukeren skal *se* at agenten lærer. Implementer som en spesiell meldingstype i chat med collapsible detaljer.

### 7.2 Memory dashboard (/knowledge forbedret)
Nåværende /knowledge er en flat liste. Gjør den til:
- **Tidslinje:** Vis når ting ble lært, med decay-score (hvor relevant det er nå)
- **Kategorier:** Kodepatterns, arkitekturbeslutninger, brukerpreferanser, feilmønstre
- **Søk:** Semantic search over alle minner
- **Rediger/slett:** Brukeren kan korrigere feil minner ("nei, vi bruker IKKE Prisma lenger")
- **Confidence-indikator:** Vis hvor sikker agenten er på hvert minne

### 7.3 Proaktiv læring
Etter hver fullført task, ekstraher og lagre:
- Arkitekturvalg ("brukte tRPC i stedet for REST her fordi...")
- Kodekonvensjoner ("dette repoet bruker barrel exports")
- Feilmønstre ("denne typen ESLint-feil fikses alltid med...")
- Brukerpreferanser (implisitt fra approve/reject-mønster)

### 7.4 Onboarding-scanning
Første gang agenten kobles til et repo:
- Indekser hele codebase med embeddings
- Oppdag patterns: testrammeverk, state management, API-stil, mappestruktur
- Generer en "repo-profil" som agenten alltid har tilgang til
- Vis brukeren: "Jeg har lært dette om repoet ditt" med mulighet for korrigering

### 7.5 Cross-task læring
Minnet fra én task bør gjøre neste task bedre:
- Feilmønstre: "Sist gang tsc feilet pga manglende type export — sjekker det proaktivt nå"
- Stil: "Du godkjente functional components med hooks, avviste class components"
- Arkitektur: "I dette repoet er alle API-routes under /api/v1"

---

## Fase 8: Proaktiv agent 🔮

> *"Agenten oppdager problemer før du gjør det."*

### 8.1 Repo-watch
Bakgrunnsjobb som overvåker repoet:
- Nye commits → sjekk for breaking changes, typesfeil, testfeil
- Nye PRs → automatisk code review (uten å bli bedt)
- Dependency updates → sjekk for sikkerhetsproblemer
- Branch conflicts → varsle før de blir store

### 8.2 Proaktive forslag
Basert på memory + repo-analyse:
- "Jeg ser at 3 filer mangler tester — vil du at jeg skriver dem?"
- "Denne funksjonen ligner på en som feilet forrige uke — bør vi refaktorere?"
- "package.json har 5 outdated dependencies med kjente CVE-er"

### 8.3 Daglig digest
Automatisk oppsummering av repo-helse:
- Testdekning-endring
- Ny teknisk gjeld
- Åpne PRs som trenger review
- Agentens læringsfremgang

### 8.4 Smart prioritering
Agenten foreslår rekkefølge på tasks basert på:
- Avhengigheter mellom oppgaver
- Estimert kompleksitet vs. verdi
- Historisk data (hva tar lang tid, hva feiler ofte)

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

| Fase | Impact | Effort | Prioritet |
|------|--------|--------|-----------|
| 4: Agent-pålitelighet | Høy | Medium | 🔴 Nå |
| 5: Frontend polish | Medium | Lav | 🔴 Nå |
| 6: Testing | Høy | Medium | 🔴 Nå |
| 7: Hukommelse | Svært høy | Medium | 🟠 Neste |
| 8: Proaktiv agent | Svært høy | Høy | 🟠 Neste |
| 9: Multi-agent | Høy | Høy | 🟡 Senere |
| 10: Codebase intelligence | Høy | Høy | 🟡 Senere |
| 11: Dyp Git | Medium | Medium | 🟡 Senere |

---

## Hva gjør TheFold bedre enn Cursor?

| Egenskap | Cursor | TheFold |
|----------|--------|---------|
| Inline code completion | ✅ Kjerne-feature | ❌ Ikke relevant (ikke IDE) |
| Autonom task-utførelse | ❌ Reagerer på bruker | ✅ Kjører selvstendig |
| Persistent hukommelse | ❌ Kun per-sesjon | ✅ Vokser over tid |
| Proaktive forslag | ❌ Venter på input | 🟡 Bygges nå |
| Multi-agent | ❌ Én modell | ✅ Sub-agent system |
| Code review | ❌ | ✅ Full review pipeline |
| Task management | ❌ | ✅ Linear + egen task engine |
| Repo-overvåking | ❌ | 🟡 Monitor service (grunnmur) |
| Multi-provider AI | Begrenset | ✅ 4 providers, 9+ modeller |
| Sandbox-isolasjon | ❌ | ✅ Docker + filesystem |

TheFold vinner ikke ved å kopiere Cursor. TheFold vinner ved å være den kollegaen du alltid har ønsket deg — en som husker alt, jobber mens du sover, og blir bedre for hver oppgave.

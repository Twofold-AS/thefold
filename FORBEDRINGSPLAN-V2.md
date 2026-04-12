# TheFold — Forbedringsplan v2: Restrukturering

> 12. april 2026. Komplett redesign av UX, sidestruktur, og tjenesteinndeling.

---

## Del 1: Ny tjenesteinndeling

### Tjeneste 1 — Samarbeidsmodus (velg navn)

**Norrønt alternativ: Fylgja** — i norrøn mytologi er fylgja en skytsånd som følger deg gjennom livet. Den jobber med deg, ikke for deg. Perfekt metafor for en AI-partner du samarbeider med.

**Gresk/latinsk alternativ: Socius** — latin for "kompanjong, alliert, partner". Opprinnelsen til ordet "sosial". Beskriver to parter som jobber mot samme mål.

**Hva dette er:**
Dagens Chat, men fundamentalt redesignet. Du og agenten jobber SAMMEN på et repo.

Nøkkelfunksjoner:
- Repo-velger øverst — all arbeid er kontekstbundet til et spesifikt repo
- Full-bredde arbeidsflate (100% av containeren, ingen sidekolonne for samtaler)
- Samtalehistorikk: skjult bak en knapp (f.eks. klokke-ikon) som åpner et overlay/drawer
- Sub-agents synlige som parallelle arbeidere — du kan klikke inn på hver enkelt jobb og se hva den gjør
- Skills-valg tilgjengelig i kontekst (repo-spesifikke skills auto-aktivert)
- Tre-lags visning av agent-arbeid (chat-meldinger / arbeidskort / ferdig-sammendrag)
- Review-panel sticky og tydelig — ikke begravd i meldingsstrømmen

Teknisk: Erstatter `/chat`. Frontend-rute: `/fylgja` eller `/socius`. Backend: bruker eksisterende chat + agent services.

---

### Tjeneste 2 — Autonom modus (velg navn)

**Norrønt alternativ: Norn** — de tre Nornene (Urd, Verdandi, Skuld) spinner skjebnetråden uten menneskelig innblanding. Ting skjer av seg selv. Perfekt for en fullstendig autonom agent.

**Gresk/latinsk alternativ: Daemon** — i gresk filosofi en mellomvesen mellom guder og mennesker som handler selvstendig. I dataverden: en bakgrunnsprosess som kjører uten brukerinteraksjon.

**Hva dette er:**
(BETA) Fullstendig autonom modus. Du gir en oppgave — agenten gjør ALT selv, inkludert review.

Nøkkelfunksjoner:
- BETA-badge synlig i innholdet (ikke sidebar), f.eks. "Norn (BETA)" øverst på siden
- Minimal input: tittel + beskrivelse + repo → start
- Agenten planlegger, bygger, validerer, OG reviewer seg selv (ingen review-gate)
- Output: én komplett rapport med alt som skjedde, kvalitetsscore, filer endret, og PR-link
- Sterkere sikkerhet enn samarbeidsmodus:
  - Strengere sandbox (Docker-only, ingen filesystem-modus)
  - Dobbel validering (AI review + automatisk re-validering etter fix)
  - Hardere token-grenser og kostnadstak ($X per oppgave)
  - Obligatorisk tsc + eslint + tests ALLE må passere (ingen "warnings ok")
  - Audit-logg for hver handling agenten tok
- Historikk: liste over tidligere autonome kjøringer med rapporter

Teknisk: Ny frontend-rute `/norn` eller `/daemon`. Backend: bruker eksisterende agent med `skipReview: true` + strengere sandbox-config + rapport-generering.

---

## Del 2: Ny sidestruktur

### Nå: 13 sider i sidebar
```
Overview, Chat, Tasks, Projects, Komponenter, Skills, Knowledge,
AI, Integrasjoner, MCP, Memory, Monitor, Sandbox
```

### Foreslått: 6 sider

```
1. Oversikt          — actionable dashboard
2. [Fylgja/Socius]   — samarbeidsmodus (erstatter Chat)
3. [Norn/Daemon]     — autonom modus (BETA)
4. Oppgaver          — tasks + projects sammenslått
5. Hukommelse        — memory + knowledge + skills + dreams + patterns
6. Innstillinger     — settings + AI-modeller + integrasjoner + MCP
```

### Hva som absorberes hvor:

| Nåværende side | Flyttes til | Begrunnelse |
|----------------|-------------|-------------|
| Chat | Fylgja/Socius | Erstattes helt av ny samarbeidsmodus |
| Tasks | Oppgaver | Beholder, utvides |
| Projects | Oppgaver | Prosjekter er bare grupperte tasks — én tab/filter |
| Komponenter | Innstillinger | Registry er konfigurasjon, ikke daglig arbeidsflate |
| Skills | Hukommelse | Skills er del av "hjernen" — hvordan TheFold tenker |
| Knowledge | Hukommelse | Allerede tett koblet til memory |
| AI (modeller) | Innstillinger | Modellkonfig er settings, ikke eget arbeidsverktøy |
| Integrasjoner | Innstillinger | Konfigurasjon av Slack/Discord/etc. |
| MCP | Innstillinger | MCP-servere er konfigurasjon |
| Memory | Hukommelse | Kjernen i hukommelse-siden |
| Monitor | Oversikt | Helsesjekk-widget på dashboard (ikke egen side) |
| Sandbox | Fjernes | Ingen grunn til egen side — sandbox er intern infrastruktur |

---

## Del 3: Oversikt (ny hovedside)

### Hva som fjernes
- Tagline "Når AI sier umulig..." — vises kun for nye brukere, deretter skjult
- Sub-agents on/off toggle — hører hjemme i Innstillinger
- Tom "AI-anbefalinger: alt ser bra ut" — erstatt med faktiske anbefalinger
- Statiske tall uten kontekst

### Hva som vises

**Rad 1: Statuskort (4 stk)**
- Aktive oppgaver (antall in_progress + lenke)
- Venter på review (antall pending_review + direkte action-knapp)
- Siste PR (repo + tidspunkt + status)
- Kostnad denne uken ($X.XX + trend vs forrige uke)

**Rad 2: Handlingskort**
- "Venter på deg" — liste over reviews som trenger godkjenning, med Godkjenn/Avvis-knapper direkte
- "Siste aktivitet" — tidslinje med de 5 siste hendelsene (task startet, PR opprettet, review godkjent, etc.)

**Rad 3: Helsestatus**
- Repo-helse: siste monitor-sjekk (grønn/gul/rød) per repo
- Siste drøm: 1-linje oppsummering + dato
- System: Encore services status

Ingen dummy-data. Hvis det ikke finnes noe å vise, vis "Ingen aktive oppgaver — start en i [Fylgja/Socius]" med direkte lenke.

---

## Del 4: Samarbeidsmodus (Fylgja/Socius) — detaljert design

### Layout
```
┌──────────────────────────────────────────────────────────┐
│  [Repo: thefold-dev/webapp ▼]     [Skills ▼]  [⏰ Hist] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ AI-svar ──────────────────────────────────────────┐ │
│  │ Ser på oppgaven din. Jeg foreslår å opprette en    │ │
│  │ ny komponent med Tailwind-styling...               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ 🔧 Dark mode toggle ────────────────── Jobb #1 ──┐ │
│  │  ✅ Kontekst       ✅ Plan       ✅ Bygging        │ │
│  │  ⏳ Review (7/10)                                   │ │
│  │                                                     │ │
│  │  Filer: 3 | Tid: 84s | $0.03                      │ │
│  │  [Godkjenn]  [Endringer]  [Avvis]                  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Sub-agents (2 aktive) ─────────────── Jobb #1 ──┐  │
│  │  🧪 Tester — skriver test for toggle.tsx (12s)    │  │
│  │  📋 Reviewer — venter på tester...                │  │
│  │  [Vis detaljer →]                                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Skriv en melding...                      [Send ⌘⏎] │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Nøkkeldesign-prinsipper
- **100% av containeren** — innhold vokser ikke utover, men fyller alltid tilgjengelig plass
- **Samtalehistorikk er skjult** — klokke-ikon øverst høyre åpner drawer fra høyre side
- **Repo er kontekst** — alt arbeid er knyttet til valgt repo. Bytt repo = bytt kontekst
- **Sub-agents synlige** — når sub-agents jobber, vises de som en kollapserbar seksjon. Klikk "Vis detaljer" for å se hva hver agent gjør i sanntid
- **Review er prominent** — sticky kort, ikke inline i meldingsstrømmen

### Hva som fjernes fra dagens Chat
- Sidebar med samtalehistorikk (erstattes av skjult drawer)
- Inline review-knapper blandet i meldinger (erstattes av dedikert review-kort)
- "Tenker..." dobbel-indikator (erstattes av faselinje i arbeidskort)
- Rå JSON i status-meldinger (erstattes av formaterte faselinjer)

### Hva som legges til
- Repo-velger med auto-complete
- Skills-velger (filtrert til valgt repo)
- Sub-agent panel med sanntidsvisning
- Keyboard shortcuts: Cmd+K (command palette), Cmd+Enter (send), Escape (lukk drawer)
- Connection status-indikator (tilkoblet / frakoblet / kobler til)

---

## Del 5: Hukommelse-siden — "TheFolds hjerne"

Slår sammen: Memory + Knowledge + Skills + Dreams

### Tabs
```
[Minner (314)]  [Mønstre (12)]  [Skills (6)]  [🌙 Drøm-journal]  [Statistikk]
```

**Minner** — alle minner med søk, type-filter, decay-indikator. Erstatter Memory-siden.
**Mønstre** — code patterns med problem/solution par. Erstatter Knowledge-siden.
**Skills** — skill-liste med create/edit/toggle. Flyttes fra egen side.
**Drøm-journal** — dream reports med innsikter. Nytt.
**Statistikk** — memory health, token-forbruk per fase, skill-effektivitet.

---

## Del 6: Oppgaver-siden

Slår sammen: Tasks + Projects

### Layout
```
[Alle oppgaver]  [Prosjekter]  [Linear-sync]
```

**Alle oppgaver** — filtrerbar liste (status, kilde, repo, kvalitetsscore). Sorterbar.
**Prosjekter** — prosjekt-planer med faser og avhengigheter. Erstatter Projects-siden.
**Linear-sync** — sync-status, siste import, konfigurasjon.

Legges til: filterkjede, sortering, bulk-operasjoner (arkiver, re-kjør, slett).

---

## Del 7: Innstillinger-siden

Slår sammen: Settings + AI + Integrasjoner + MCP + Komponenter

### Tabs
```
[Profil]  [AI-modeller]  [Integrasjoner]  [MCP]  [Komponenter]  [System]
```

**Profil** — brukerprofil, notifications-preferanser
**AI-modeller** — provider/model CRUD, fase-tilordning, kostnadsoversikt
**Integrasjoner** — Slack, Discord, email konfigurasjon
**MCP** — MCP-server registry, install/uninstall
**Komponenter** — component marketplace, healing status
**System** — feature flags (fjernes når alt er aktivt), vedlikehold (cron-trigger knapper)

---

## Del 8: Bugs og tekniske fiks (fra audit)

### Kritiske (må fikses først)

| # | Bug | Fiks | Estimat |
|---|-----|------|---------|
| 1 | Review dobbelt-klikk — PR-link vises ikke | Oppdater useReviewFlow + ReviewPanel med direkte state | 45 min |
| 2 | Notifications viser rå JSON | Parse agent-status i NotifBell.tsx | 1 time |
| 3 | Skills "Ny skill" mangler appliesTo | Legg til multi-select i modal | 30 min |
| 4 | Cron-jobs kjører ikke + ingen manuell trigger | Nye trigger-endpoints + fiks guards + logging | 2.5 timer |
| 5 | Zombie jobs (catch uten failJob) | Fiks catch-blokker i completion.ts og review-handler.ts | 1 time |
| 6 | Import-graf uten cycle detection | Legg til visited-set i getRelatedFiles() | 30 min |
| 7 | AI retry uten backoff | Legg til eksponentiell backoff i call.ts | 30 min |

### Viktige (etter restrukturering)

| # | Forbedring | Estimat |
|---|------------|---------|
| 8 | SSE-only arkitektur (fjern 4x polling-kaskade) | 2 timer |
| 9 | Error recovery UI (retry-knapp ved disconnect) | 1 time |
| 10 | Cmd+K command palette (cmdk allerede installert) | 2 timer |
| 11 | Diff-visning i code review | 2 timer |
| 12 | Chain-of-thought i AI-prompts | 30 min |
| 13 | Nye chat-tools (run_tests, validate_syntax) | 2 timer |
| 14 | Sub-agent kontekst fra dependencies | 1 time |
| 15 | D27 manifest persistence fiks | 30 min |
| 16 | Aktiver solution_embedding | 1 time |
| 17 | Aktiver skills tag filtering + token budget | 1 time |
| 18 | GitHub draft PRs for store endringer | 1 time |
| 19 | Btn loading-prop + CopyBtn komponent | 1 time |
| 20 | Tilgjengelighet (a11y) for kritiske flows | 3 timer |

---

## Del 9: Sprint-plan

### Sprint 1 — Kritiske bugs (dag 1)
Fiks #1-7 fra bug-listen ovenfor.
**Total: ~6.5 timer**

### Sprint 2 — Restrukturering av sider (dag 2-3)
- Ny sidebar med 6 items i stedet for 13
- Ny Oversikt-side med actionable data
- Ny Hukommelse-side (slå sammen Memory + Knowledge + Skills)
- Ny Oppgaver-side (slå sammen Tasks + Projects)
- Ny Innstillinger-side (slå sammen Settings + AI + Integrasjoner + MCP + Komponenter)
- Fjern Sandbox-side
**Total: ~10-12 timer**

### Sprint 3 — Samarbeidsmodus / Fylgja/Socius (dag 3-5)
- Ny layout med repo-velger og full-bredde arbeidsflate
- Tre-lags visning (chat / arbeidskort / sammendrag)
- Samtalehistorikk som skjult drawer
- Sub-agent panel med sanntidsvisning
- Sticky review-kort
- SSE-only arkitektur (#8)
- Error recovery (#9)
- Cmd+K (#10)
**Total: ~14-16 timer**

### Sprint 4 — Autonom modus / Norn/Daemon BETA (dag 5-6)
- Ny side med BETA-badge
- Minimal input → full rapport output
- Strengere sandbox-sikkerhet
- AI self-review (bypass review-gate med kvalitetsgarantier)
- Rapport-generering med innsikter
**Total: ~8-10 timer**

### Sprint 5 — Dreams, AI-intelligens & polish (dag 6-7)
- Drøm-journal konsept + UI i Hukommelse
- Cron manuell trigger i Innstillinger → System
- Diff-visning (#11)
- Chain-of-thought (#12)
- Nye chat-tools (#13)
- Tilgjengelighet (#20)
**Total: ~10-12 timer**

---

**Total: ~49-57 timer (7-8 arbeidsdager)**

### Hva dette gir TheFold

| Før | Etter |
|-----|-------|
| 13 sider i sidebar | 6 tydelige sider |
| Chat som gjør alt dårlig | To dedikerte modi (samarbeid + autonom) |
| Dashboard med tom data | Actionable oversikt med reviews og aktivitet |
| Memory, Knowledge, Skills som separate siloer | Én "hjerne"-side med alt samlet |
| 5 settings-sider spredt rundt | Én Innstillinger-side med tabs |
| Bruker vet ikke hva agenten gjør | Tre-lags visning + sub-agent panel |
| Ingen autonom modus | Norn/Daemon BETA for full autonomi |

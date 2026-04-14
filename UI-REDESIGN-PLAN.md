# TheFold UI/UX Redesign Plan

Basert på visuell audit av alle 7 sider + iOS UX Guidelines.

---

## Overordnet diagnose

### Hva fungerer
- Top-bar navigasjon er bra — ren, sentrert, Google Stitch-inspirert
- Mørkt tema med god kontrast
- Innholdsstruktur og tab-system fungerer logisk

### Hovedproblemer

**1. Fargekaos**
- Stat-tall bruker regnbue-farger uten mening (grønn, rød, lilla, blå) — ser ut som julebelysning
- `success` (#34D399), `error` (#EF4444), `accent` (#6366F1) brukes vilkårlig for tall som ikke er positive/negative
- Tags har for mange varianter og farger, skaper visuell støy

**2. For mange bokser og rammer**
- Hver lille ting har sin egen boks med border — gir "spreadsheet"-følelse
- Stat-cards, memory items, task rows, feature flags — alt er innrammet
- Mangler hierarki: alt har like mye visuell vekt

**3. Proaktive forslag er for aggressive**
- AI-ANBEFALINGER tar opp halve Oversikt-siden med "Start oppgave"-knapper
- Bør være subtile hints, ikke call-to-action
- "Oppgave klar: Lag kreativ landingsside..." — dette er forvirrende, ikke hjelpsomt

**4. Enorm tom plass / dårlig innholdshierarki**
- Oversikt: gigantisk hero-seksjon med tagline + input tok 60% av viewport
- Huginn: chat-input midt på skjermen med ingenting rundt
- Mange sider har lite innhold spredt over mye plass

**5. Inkonsistent typografi og spacing**
- Noen overskrifter er 28px, andre 24px, noen 20px
- Stat-tall varierer fra 14px til 28px uten system
- Spacing mellom seksjoner er ujevn

**6. "Fake" data og ikke-fungerende elementer**
- Kodeindeks-tab viser hardkodet mock-data (webapp 87%, api-server 92%)
- Manifester-tab har hardkodede konvensjoner
- Repo-watch viser "Ingen nye funn siste 7 dager" — ser uferdig ut
- Feature flags viser "true" tags som grønne knapper — gir inntrykk av at man kan klikke

---

## Design-prinsipper (fra iOS UX Guidelines)

1. **Focus on the Primary Task** — Vis bare det som er relevant nå
2. **Elevate Content** — UI er en subtil ramme, ikke hovedpersonen
3. **Think Top Down** — Viktigst øverst, detaljer bak klikk
4. **Make Usage Easy and Obvious** — Minimal UI, klare handlinger
5. **De-emphasize Settings** — Ikke vis konfigurasjon som innhold
6. **Be Succinct** — Kort, headline-stil tekst
7. **Delight with Stunning Graphics** — Ren, premium visuell kvalitet

---

## Designsystem-endringer

### Fargepalett — Monokromatisk med én aksent
```
Bakgrunn:    #09090B (dypere, litt blålig svart — ikke ren #000)
Raised:      #111113
Surface:     #18181B (zinc-900)
Subtle:      #1F1F23
Border:      #27272A (zinc-800)

Tekst:       #FAFAFA (zinc-50)
TextSec:     #A1A1AA (zinc-400)
TextMuted:   #71717A (zinc-500)
TextFaint:   #52525B (zinc-600)

Accent:      #6366F1 (beholder indigo — fungerer bra)
AccentSoft:  rgba(99,102,241,0.08) (subtilere enn 0.12)

Success/Warning/Error: Bare brukes for faktisk status (pass/warn/fail)
ALDRI for dekorasjon av tall eller labels
```

### Stat-tall: Kun hvit
Alle tall i stat-cards skal være hvite (#FAFAFA). Farge bare for:
- Grønn: noe som er bra og trenger oppmerksomhet (success rate > 90%)
- Rød: noe som feiler og trenger handling
- Gul: advarsel
- ALDRI lilla, blå, gradient-farger for tall

### Borders: Subtile, nesten usynlige
- Hovedborder: `rgba(255,255,255,0.06)` i stedet for #2A2A2A
- Hover-border: `rgba(255,255,255,0.1)`
- Bento-grid celler: Ingen border, bare background-forskjell

### Border-radius: Større, mykere
- Cards: 16px (opp fra 8px)
- Buttons: 10px
- Input: 12px
- Stat-cards: 16px

---

## Side-for-side plan

### 1. Oversikt (/)

**Fjern:**
- Hero-seksjon med "Når AI sier umulig..." tagline — tar for mye plass
- Chat-input — den hører hjemme på Huginn-siden
- "AI-ANBEFALINGER" med "Start oppgave"-knapper

**Erstatt med bento-grid dashboard:**
```
┌──────────────────┬──────────┬──────────┐
│                  │ Aktive   │ Success  │
│  Velkommen-kort  │ Tasks    │ Rate     │
│  (lite, subtilt) │          │          │
├──────────┬───────┴──────────┤──────────┤
│ Tokens   │ Kostnad          │ Minner   │
│ i dag    │ denne uka        │ totalt   │
├──────────┴──────────────────┴──────────┤
│                                         │
│  Siste aktivitet (kompakt tidslinje)    │
│                                         │
├──────────────────┬──────────────────────┤
│  Ventende        │  Backlog-kø          │
│  reviews         │  (3 neste oppgaver)  │
│                  │                      │
└──────────────────┴──────────────────────┘
```

Nøkkelprinsipper:
- Ingen tagline/slogan — gå rett på innhold
- Stat-tall i hvitt, ikke regnbue
- Bento-grid med varierende størrelser (2:1, 1:1, 3:1 celler)
- Siste aktivitet erstatter proaktive forslag — vis hva som faktisk har skjedd
- Ingen "Start oppgave"-knapper på Oversikt — det er Huginn/Muninn sin jobb

### 2. Huginn (/chat)

**Endre:**
- Topline er OK, men "Skills", "Historikk", "⌘K" knappene bør være mer subtile (ghost-style, ikke outline)
- "Tilkoblet" status med grønn dot — beholder, men flytt til venstre ved repo-selector
- Chat-input: flytt ned til bunnen av skjermen (fast posisjon), ikke midt på
- Fjern "Når AI sier umulig..." tagline fra chat-area
- Tom-tilstand: vis 3-4 subtile forslag som placeholder-tekst, ikke bokser

### 3. Muninn (/muninn)

**Endre:**
- Stat-cards øverst: fjern farger fra tallene (alle hvite), bare status-feltet kan ha farge
- Feature-preview cards (Autonom oppgave-kjøring, Kontinuerlig drift, etc.): 
  - Fjern fargede topp-borders
  - Gjør dem til subtile info-kort uten farget kantlinje
  - Disse tar for mye plass for informasjon som ikke endrer seg
- "Ny autonom oppgave"-form: bra, men "Sikkerhetsnivå" knappene ser ut som tabs, ikke valg
  - Bruk segmented control (pill-style) i stedet
- Kontrollpanel: "Start"-knapp er OK, men Pause/Stop bør bare vises når Muninn kjører

### 4. Oppgaver (/tasks)

**Endre:**
- "Tasks" overskrift bør være "Oppgaver" (konsistent norsk)
- Task-listen er for flat — alt har lik visuell vekt
  - Done-tasks: dimme dem (opacity 0.6), push nedover
  - Backlog-tasks: vis tydeligere (hvit tekst, ikke grå)
- "done" og "backlog" badges: fjern grønn/grå-fargelegging, bruk subtile outline-tags
- "kvalitet: 9/10" — flytt inn i en hover-tooltip, ikke vis inline
- Task-ID (b1bdd8ea, 6958c48a): vis kun på hover, ikke alltid
- Tab: "Reviews" tallen (0) — vis ikke badge når den er 0
- "Importer fra Linear" — for prominent som primærknapp. Gjør til ghost-knapp

### 5. Drømmer (/dreams)

**Endre:**
- Stat-cards: tall i hvitt, "Søndag 03:00" ser bra ut
- "Kjør drøm nå"-knapp i empty state: OK, men bør være subtilere
- Tom-tilstand tekst er bra og informativ

### 6. Hukommelse (/memory)

**Endre:**
- Stat-bar (6 celler): for tett, for mange rammer
  - Reduser til 4 viktige stats i bento-grid style (uten borders mellom)
  - "60/40" og "Hybrid-søk" er implementasjonsdetaljer — fjern fra stats
- Memory-items: "decision" tag vises to ganger (en gang i lilla, en gang i grå) — dedupliser
- "slett"-knapp i rødt på hver rad: for aggressivt. Gjør til ikon-knapp som bare vises på hover
- "[REDACTED]Hei! [REDACTED]Hei igjen!" — dette er raw data som ikke bør vises. Filtrer bort session-minner med [REDACTED]
- Kodeindeks og Manifester tabs: fjern hardkodet mock-data. Vis heller en ren tom-tilstand med beskrivelse av hva som kommer

### 7. Innstillinger (/innstillinger)

**Endre:**
- Feature Flags seksjon i profil-tab: flytt til System-tab (vises nå begge steder!)
- "true" badges i grønt: erstatt med diskre checkmark-ikon eller fjern helt (alle er jo true)
- Varsler-toggles: Push-varsler og Slack-varsler er begge disabled (grå) uten forklaring — vis en hjelpetekst
- System-tab: bra innhold, men stat-cards for circuit breaker osv. trenger hvite tall, ikke fargede

---

## Globale UI-endringer

### Tags/Badges
- Maks 2 fargevarianter: standard (subtil grå) og aktiv (indigo)
- Fjern "error", "success", "warning" varianter for tags som ikke representerer status
- Mindre padding, subtilere bakgrunn

### Knapper
- Primær: Filled indigo (bare for hovedhandling per side)
- Sekundær: Ghost med subtil border (de fleste knapper)
- Destruktiv: Rød, bare for sletting/avbryt med bekreftelse

### Tomme tilstander
- Konsistent mønster: Ikon + kort tekst + én handling
- Ingen "dette er ikke implementert ennå" — si heller "Ingen [ting] ennå" 
- Aldri vis mock/fake data — bedre å vise tom tilstand

### Stat-cards
- Alle tall i hvitt (#FAFAFA)
- Label i muted (#71717A)
- Ingen border mellom celler — bruk spacing + bakgrunn
- Hover: subtil glow/lighten

---

## Implementeringsrekkefølge

1. **Tokens** — Oppdater fargepalett, border-radius, spacing
2. **Tag/Badge komponent** — Forenkle varianter
3. **StatCard** — Hvite tall, fjern farge-parameter
4. **Oversikt** — Total omskriving til bento-grid
5. **Oppgaver** — Opprydding av task-liste
6. **Hukommelse** — Stats-bar, fjern duplikat-tags, mock-data
7. **Muninn** — Subtilere feature-cards, segmented control
8. **Huginn** — Chat-input plassering, tom-tilstand
9. **Innstillinger** — Fjern duplikat feature flags, fiks toggles
10. **Drømmer** — Stat-farger

---

*Denne planen endrer UTSEENDE og OPPLEVELSE — ikke funksjonalitet. Alt som fungerer i dag skal fungere etterpå.*

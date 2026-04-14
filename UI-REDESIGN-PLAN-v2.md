# TheFold UI/UX Redesign Plan v2

Revidert plan basert på full interaktiv testing i Chrome + all brukerfeedback.

---

## Del 1: Overordnet diagnose

### Kritiske problemer funnet under testing

**A. Visuelt kaos**
- Regnbue-farger på stat-tall: grønn, rød, lilla, blå, oransje — uten semantisk mening
- For mange bokser med borders — "spreadsheet"-følelse
- Inkonsistent typografi (28px, 24px, 20px uten system)
- TheFold-logo er bittesmå (28px) og gjemt i et hjørne

**B. Navigasjon og informasjonsarkitektur**
- Top-bar navigasjon fungerer, men tar lite plass — bør vurdere sidebar
- Samtalehistorikk er gjemt bak "Historikk"-knapp som er lett å overse
- Innstillinger har 6 tabs der 3 bare er redirect-knapper (AI-modeller, Integrasjoner, MCP)
- Feature Flags duplisert i både Profil-tab og System-tab

**C. Bugs og feil**
- Varsler viser rå JSON (`{"type":"status","phase":"completed"...}`) i stedet for lesbar tekst
- Klikk på varsling navigerer alltid til /chat uten kontekst
- "Kjør drøm nå"-knapp på Drømmer gjør ingenting synlig
- Cache hit rate viser "3610%" — umulig tall, beregningsfeil
- "1 Issue" Next.js error overlay på flere sider
- Kodeindeks og Manifester tabs viser hardkodet mock-data
- Memory items viser duplikat-tags (f.eks. "decision" to ganger)

**D. UX-problemer**
- Oversikt: Gigantisk hero-seksjon med tagline + chat-input tar 60% av viewport
- Huginn: Chat-input midt på skjermen med "Når AI sier umulig..." tagline
- AI-ANBEFALINGER med aggressive "Start oppgave"-knapper
- "Tenker"-boks er en flat tekst med shimmer — kjedelig og repetitiv
- Repo-watch viser "Ingen nye funn siste 7 dager" — ser uferdig ut

---

## Del 2: Design-prinsipper

Fra iOS UX Guidelines + Apple design-filosofi:

1. **Focus on the Primary Task** — Vis bare det som er relevant nå
2. **Elevate Content** — UI er en subtil ramme, ikke hovedpersonen
3. **Think Top Down** — Viktigst øverst, detaljer bak klikk
4. **Make Usage Easy and Obvious** — Minimal UI, klare handlinger
5. **De-emphasize Settings** — Ikke vis konfigurasjon som innhold
6. **Be Succinct** — Kort, headline-stil tekst
7. **Delight with Stunning Graphics** — Ren, premium visuell kvalitet

---

## Del 3: Sidebar vs Top-bar — Anbefaling

### Forslag: Sidebar-navigasjon

**Argumenter for sidebar:**
- Mer plass for navigasjon uten å klemme sammen
- TheFold-logo kan bli større og mer prominent
- Samtalehistorikk kan integreres direkte i sidebar (alltid synlig)
- Bedre hierarki: navigasjon til venstre, innhold til høyre
- Passer bedre for verktøy-/dashboard-applikasjoner (VS Code, Linear, Notion)
- Innstillinger-ikon naturlig nederst i sidebar

**Sidebar-layout:**
```
┌─────────────┬──────────────────────────────────────────┐
│             │                                          │
│  ⬡ TheFold │  [Innhold / Dashboard / Chat]            │
│             │                                          │
│  ──────── │                                          │
│             │                                          │
│  👁 Oversikt│                                          │
│  💬 Huginn  │                                          │
│  🧠 Muninn  │                                          │
│  ✓ Oppgaver │                                          │
│  ✨ Drømmer │                                          │
│  📦 Hukomm. │                                          │
│             │                                          │
│  ──────── │                                          │
│             │                                          │
│  Samtaler:  │                                          │
│  • Siste..  │                                          │
│  • Oppgave..│                                          │
│  • Debug..  │                                          │
│             │                                          │
│  ──────── │                                          │
│  ⚙ Innst.  │                                          │
│  Mikael-kul │                                          │
└─────────────┴──────────────────────────────────────────┘
```

**Spesifikasjoner:**
- Sidebar bredde: 260px (expanded), 60px (collapsed med kun ikoner)
- Toggle-knapp for å collapse/expand
- TheFold-logo: 36px ikon + "TheFold" tekst i brandFont, 18px
- Samtalehistorikk: Siste 5-8 samtaler direkte i sidebar (ikke skjult i drawer)
- Repo-selector flyttes til toppen av innholdsområdet (eller sidebar-toppen)
- Mobil: Sidebar er skjult, hamburger-meny åpner overlay

---

## Del 4: Designsystem-endringer

### Fargepalett — Monokromatisk med én aksent (Apple-stil)

```
Bakgrunn:    #09090B    (dypere, litt blålig svart)
Raised:      #111113
Surface:     #18181B    (zinc-900)
Subtle:      #1F1F23
Border:      rgba(255,255,255,0.06)  (nesten usynlig)
BorderHover: rgba(255,255,255,0.10)

Tekst:       #FAFAFA    (zinc-50)
TextSec:     #A1A1AA    (zinc-400)
TextMuted:   #71717A    (zinc-500)
TextFaint:   #52525B    (zinc-600)

Accent:      #6366F1    (beholder indigo)
AccentSoft:  rgba(99,102,241,0.08)

Success:     #34D399    (KUN for faktisk positiv status)
Warning:     #FBBF24    (KUN for advarsler)
Error:       #EF4444    (KUN for feil)

REGEL: Farge-semantikk er STRENG.
- Grønn = noe som er bra og trenger oppmerksomhet
- Rød = noe som feiler og trenger handling
- Gul = advarsel
- ALDRI lilla, blå, gradient for dekorasjon av tall
```

### Typografi — Inter + Geist Mono

```
h1:    24px / 700 / 1.2   (sidetitler)
h2:    18px / 600 / 1.3   (seksjonsoverskrifter)
h3:    15px / 600 / 1.4   (korttitler)
body:  14px / 400 / 1.5   (brødtekst)
small: 12px / 400 / 1.5   (labels, metadata)
mono:  13px / 400 / 1.5   (kode, IDs, teknisk)

TheFold brand: 18px / 700 / TheFold Brand font (i sidebar)
```

### Border-radius — Større, mykere

```
Cards/Modaler:  16px
Buttons:        10px
Input:          12px
Tags/Badges:    6px
Sidebar items:  10px
```

### Spacing — Konsistent system

```
xs:  4px   (mellom ikoner)
sm:  8px   (mellom relaterte elementer)
md:  16px  (standard gap, padding i kort)
lg:  24px  (mellom seksjoner)
xl:  32px  (mellom store blokker)
xxl: 48px  (side-padding)
```

---

## Del 5: Norrøn loading-animasjon

### Erstatt "TheFold tenker" med Aegishjalmur-spinner

Aegishjalmur (Ægishjálmr / Helm of Awe) er et norrønt beskyttelsessymbol med 8 stråler
som radierer ut fra et sentrum. Perfekt som loading-ikon:

**Implementasjon:**
1. Bruk SVG fra Wikipedia (Aegishjalmr.svg — kun 913 bytes, public domain)
2. Forenkle til ren linjegrafik (stroke only, ingen fill)
3. CSS-animasjon: langsom rotasjon (8s per omdreining) + pulserende opacity
4. Farge: `T.accent` (#6366F1) med glow-effekt
5. Størrelse: 32px i chat, 24px i kompakte kontekster

**Erstatter:**
- `AgentStatusBar.tsx` → "TheFold tenker" tekst + shimmer → Aegishjalmur-spinner + "Tenker..." under
- `StreamIndicator.tsx` → Pulserende dot → Aegishjalmur med rotasjon
- `TypingIndicator.tsx` → Tre-prikk animasjon → Kan beholdes for ren tekst-typing

**Fallback:** Hvis Aegishjalmur er for kompleks, bruk Valknut (tre sammenlåste trekanter)
som også er enkelt og ikonisk norrønt.

---

## Del 6: Side-for-side plan

### 1. Sidebar + Layout (`layout.tsx`)

**Fjern:**
- Top-bar navigasjon
- Hamburger-meny for mobil (erstattes med sidebar overlay)

**Ny sidebar:**
- Fast sidebar venstre side, 260px bred
- TheFold-logo: 36px ikon + tekst, godt synlig øverst
- 6 nav-items med ikoner + labels
- Samtalehistorikk-seksjon: siste 5-8 samtaler med status-dots
- "Ny samtale" knapp
- Innstillinger-link + bruker-info nederst
- Collapse-toggle for å minimere til 60px (kun ikoner)
- Repo-selector: flyttes til toppen av innholdsområdet eller sidebar-topp

### 2. Oversikt (`/`)

**Fjern:**
- Hero-seksjon med "Når AI sier umulig..." tagline
- Chat-input (den hører hjemme på Huginn-siden)
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
└──────────────────┴──────────────────────┘
```

- Stat-tall: ALLE hvite (#FAFAFA), ingen regnbue
- Bento-grid med varierende cellesstørrelser
- Siste aktivitet erstatter proaktive forslag
- Ingen "Start oppgave"-knapper her

### 3. Huginn (`/chat`)

**Endre:**
- Fjern "Når AI sier umulig..." tagline helt
- Chat-input: flytt ned til bunnen (fast posisjon), som alle moderne chat-apper
- Tom-tilstand: vis 3-4 subtile forslagslinjer som placeholder, ikke bokser
- "Skills", "Historikk" knapper → fjernes fra chat-header (historikk er nå i sidebar)
- Erstat "TheFold tenker" med Aegishjalmur-spinner
- ⌘K snarvei-knapp: kan beholdes, men mer subtil

### 4. Muninn (`/muninn`)

**Endre:**
- Stat-cards: alle tall i hvitt (#FAFAFA), fjern farger fra tallene
- Feature-preview cards: fjern fargede topp-borders, gjør subtilere
- "Sikkerhetsnivå": erstatt knapper med segmented control (pill-style)
- Kontrollpanel: Pause/Stop vises KUN når Muninn kjører
- Backlog-kø: beholdes, men med subtilere design

### 5. Oppgaver (`/tasks`)

**Endre:**
- Tittel: "Tasks" → "Oppgaver" (konsistent norsk)
- Done-tasks: dimme dem (opacity 0.6)
- Task-ID: vis kun på hover
- "kvalitet: 9/10": flytt til hover-tooltip
- "done"/"backlog" badges: subtilere outline-tags, ikke fylte farger
- "Importer fra Linear": ghost-knapp i stedet for prominent indigo
- Slett-ikon: kun synlig på hover
- Reviews badge (0): ikke vis når tallet er 0

### 6. Drømmer (`/dreams`)

**Endre:**
- Stat-tall: hvitt
- "Kjør drøm nå": verifiser at knappen faktisk fungerer (bug!)
- Konstellasjoner-tab: sjekk datakilden — den sier "Ingen minner" men det finnes 329

### 7. Hukommelse (`/memory`)

**Endre:**
- Stat-bar: reduser fra 6 til 4 viktige stats, bento-grid style
- Fjern "60/40" og "Hybrid-søk" fra stats (implementasjonsdetaljer)
- Memory items: dedupliser tags (f.eks. "decision" vises to ganger)
- Slett-knapp: ikon-knapp som vises på hover, ikke rød tekst
- Filtrer bort `[REDACTED]` session-minner
- Kodeindeks/Manifester: fjern hardkodet mock-data, vis ren tom-tilstand
- Skills-tab: fiks JSON-feil ved opprettelse

### 8. Innstillinger (`/innstillinger`)

**Endre:**
- Feature Flags: fjern fra Profil-tab (beholdes kun i System-tab)
- "true" badges: erstatt med diskrete checkmark-ikoner
- Varsler-toggles: legg til hjelpetekst for hvorfor de er disabled
- AI-modeller, Integrasjoner, MCP tabs: embed innholdet direkte i stedet for redirect-knapper
- System-tab: fiks cache hit rate "3610%" bug, hvite stat-tall

### 9. Varsler (`NotifBell.tsx`)

**Fiks:**
- `parseContent()`: håndter alle agent message-formater korrekt
- Fallback: vis "Ny hendelse" i stedet for rå JSON
- Klikk-routing: naviger til relevant side basert på type:
  - `agent_report` → `/tasks` eller `/chat` med kontekst
  - `task_start` → `/tasks`
  - `healing_notification` → `/memory`
  - `agent_status` → `/chat` med riktig samtale-ID

---

## Del 7: Globale komponent-endringer

### Tags/Badges
- Maks 2 varianter: standard (subtil grå) og aktiv (indigo)
- Fjern fargede varianter for ikke-status tags
- Mindre padding, subtilere bakgrunn

### Knapper
- Primær: Filled indigo (bare for hovedhandling per side)
- Sekundær: Ghost med subtil border
- Destruktiv: Rød, bare for sletting med bekreftelse

### Stat-cards
- Alle tall i hvitt (#FAFAFA)
- Label i muted (#71717A)
- Ingen border mellom celler — bruk spacing + bakgrunn
- Hover: subtil lighten

### Tomme tilstander
- Konsistent mønster: Ikon + kort tekst + én handling
- Aldri vis mock/fake data
- Aldri "ikke implementert ennå"

---

## Del 8: Implementeringsrekkefølge

### Sprint A: Fundament (tokens + sidebar + loading)
1. Oppdater `tokens.ts` — ny fargepalett, border-radius, spacing
2. Bygg sidebar-layout i `layout.tsx` (erstatt top-bar)
3. Integrer samtalehistorikk i sidebar
4. Lag Aegishjalmur SVG spinner-komponent
5. Erstatt `AgentStatusBar` med ny spinner

### Sprint B: Oversikt + Oppgaver
6. Oversikt: total omskriving til bento-grid dashboard
7. Oppgaver: opprydding (norsk tittel, hover-detaljer, dimming)

### Sprint C: Chat + Varsler
8. Huginn: flytt chat-input til bunn, fjern tagline, tom-tilstand
9. Fiks `NotifBell.tsx` — parseContent + routing
10. Fiks varslings-JSON-format

### Sprint D: Hukommelse + Muninn
11. Hukommelse: stats-bar, fjern duplikat-tags, mock-data
12. Muninn: subtilere feature-cards, segmented control, stat-farger

### Sprint E: Innstillinger + Drømmer + Bugs
13. Innstillinger: fjern duplikat feature flags, embed tabs, fiks 3610%
14. Drømmer: fiks "Kjør drøm nå" bug, stat-farger, Konstellasjoner data
15. Generell bug-sweep

### Sprint F: Polish + Verifikasjon
16. Gå gjennom alle sider for konsistens
17. Test alle interaktive elementer
18. Responsiv testing (mobil sidebar)
19. Performance-sjekk

---

## Estimert arbeidsmengde

| Sprint | Timer (ca.) | Beskrivelse |
|--------|-------------|-------------|
| A      | 12-15h      | Tokens, sidebar, spinner |
| B      | 6-8h        | Oversikt, Oppgaver |
| C      | 6-8h        | Chat, varsler |
| D      | 6-8h        | Hukommelse, Muninn |
| E      | 6-8h        | Innstillinger, Drømmer, bugs |
| F      | 4-6h        | Polish, testing |
| **Total** | **~40-53h** | |

---

*Denne planen endrer UTSEENDE, OPPLEVELSE og FIKSER BUGS — funksjonalitet beholdes. Alt som fungerer i dag skal fungere etterpå, og ting som ikke fungerer skal fikses.*

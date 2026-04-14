# UI Overhaul V2 — Masterplan

Dato: 2026-04-13
Status: Plan — ikke start for godkjent

---

## Nøkkelkorreksjon fra forrige runde

Forrige runde brukte **feil fargeretning**. Nå er det klart:

**Bakgrunn = mørk gradient basert på #2b4f4a** (den mørkeste fargen i paletten)

Sage Grove paletten (colorffy + sage-grove-farger.md):
- `#2b4f4a` — Mørk teal → BAKGRUNN (gradient)
- `#5b8a6a` — Medium sage → Sekundær/brand
- `#a7c58e` — Lys sage → Aksent/highlights
- `#e8ddcb` — Varm beige → Tekst (på mørk bg)
- `#3a3a3a` — Charcoal → Overflater/kort

sage-grove-farger.md sin gradient-seksjon (linjer 41-45) er laget for lyst tema — vi
bruker den IKKE. Vi lager en mørk gradient fra #2b4f4a i stedet:
```css
background: linear-gradient(135deg, #1e3a36 0%, #2b4f4a 50%, #1a332f 100%);
```

Tekst på denne bakgrunnen: `#e8ddcb` (beige) — kontrast mot #2b4f4a ≈ 6.74:1 (AA+).
For AAA bruker vi #f0e8d8 eller lysere.

---

## 1. Farger (tokens.ts + globals.css)

### tokens.ts — Nye verdier
```
bg:          "#2b4f4a"      // Gradient base
raised:      "#3a3a3a"      // Kort/bokser (charcoal)
surface:     "#3a3a3a"      // Bokser
subtle:      "#334f4a"      // Subtil variant av bg
border:      "#4a6a60"      // Border på mørk bg
borderHover: "#5b8a6a"      // Hover = medium sage
text:        "#e8ddcb"      // Beige tekst
textSec:     "#c8bda8"      // Dempet beige
textMuted:   "#9e9488"      // Muted
textFaint:   "#6e6860"      // Faint
accent:      "#a7c58e"      // Lys sage — aksent/knapper
accentDim:   "rgba(167,197,142,0.1)"
accentHover: "#8fb57a"
brand:       "#5b8a6a"      // Medium sage
brandLight:  "#a7c58e"      // Lys sage
success:     "#22946e" → "#47d5a6"  (a10 for synlighet)
warning:     "#d7ac61"      (a10)
error:       "#d94a4a"      (a10)
```

### Semantic (uendret fra sage-grove-farger.md)
Alle 12 semantic farger beholdes som de er i filen.

### globals.css
- Body background: `linear-gradient(135deg, #1e3a36 0%, #2b4f4a 50%, #1a332f 100%)`
- Alle :root CSS variabler oppdateres til mørk versjon
- Sidebar-bg: transparent (gradient flyter gjennom)
- Sidebar-border: transparent (ingen border)
- Kort/bokser: #3a3a3a med liten border #4a6a60

### Font
- Fjern alle Inter @font-face deklarasjoner
- Behold Plus Jakarta Sans CDN import (allerede riktig)
- Behold TheFold Brand + TheFold Default
- Font stack: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', ...`

---

## 2. Layout — Chat posisjonering (CoWork)

### Problem
Chatboksen og "Hva kan TheFold bygge for deg?" teksten vises i toppen.

### Årsak
`main` har `height: 100vh` + `overflow: hidden`. Innholdet inni har `height: 100%` +
`display: flex` + `flex-direction: column`. ChatComposer bruker `flex: 1` for heading
og `flexShrink: 0` for input. Men noe i parent-chain kollapser flex-konteksten.

### Fiks
- `main`: `height: 100vh`, `display: flex`, `flex-direction: column`
- Content wrapper (isFullHeight): `flex: 1`, `display: flex`, `flex-direction: column`, `min-height: 0`, `overflow: hidden`
- Fjern `height: 100%` på content wrapper — bruk `flex: 1` i stedet
- CoWork page wrapper: `flex: 1`, `display: flex`, `flex-direction: column`, `min-height: 0`
- ChatComposer: heading flex: 1 (tar resten), input flexShrink: 0 (bunnen)

### Filer
- `layout.tsx` linje 351-364
- `cowork/page.tsx` linje 383
- `ChatComposer.tsx`

---

## 3. Seamless design — sidebar + innhold

### Nåværende
Sidebar er transparent, border er fjernet. ✓

### Mangler
- Fjern `borderTop` i sidebar bottom section (linje 214)
- Sidebar hover-farge i `<style>` må bruke en semi-transparent fargen, ikke T.subtle
- Mobile overlay sidebar bør matche dark theme
- Hele appen er én farge (gradient), innhold i hvite/charcoal bokser

### Filer
- `layout.tsx`

---

## 4. Auto-siden — fjern ferdige oppgaver

### Problem
"Done" oppgaver vises i Auto task-listen.

### Fiks
Filteret `t.status !== "done"` er allerede lagt til, men API-kallet henter
`listTheFoldTasks({ limit: 30 })` som kan returnere done-oppgaver.
Verifiser at client-side filteret fungerer. Eventuelt filtrer også `completed`.

### Fil
- `auto/page.tsx` — linje med `allTasks` filter

---

## 5. Oppgavevisning — tasks, reviews, linear

### Problem
Tasks-siden bruker gammel split-view (vertikal deling) med liste til venstre og detaljer
til høyre. Ser ikke bra ut. Skal ligne på Auto-sidens expandable cards.

### Plan
Erstatt tasks-siden med expandable cards for ALLE tabs:
1. **Oppgaver-tab**: Liste med ExpandableTaskCard for hver oppgave
2. **Reviews-tab**: Liste med ExpandableTaskCard der review-handlinger (godkjenn/avvis)
   er i Detaljer-fanen
3. **Linear-tab**: Beholder sync-knapp, viser synkede oppgaver som ExpandableTaskCard

Fjern `gridTemplateColumns: t ? "1fr 1fr" : "1fr"` strukturen helt.

### Filer
- `tasks/page.tsx` — total rewrite av task list og review list renderingen
- Bruk `ExpandableTaskCard` komponenten (allerede opprettet)

---

## 6. Font-opprydding

### Fjern fra globals.css
Alle 5 Inter @font-face deklarasjoner (linjer 7-45 i original)

### Behold
- Plus Jakarta Sans (CDN)
- Geist Mono (CDN)
- TheFold Brand (lokal)
- TheFold Default (lokal)

### Verifiser
At `T.sans` i tokens.ts er korrekt: `'Plus Jakarta Sans', ...`

---

## Endringsoversikt per fil

| Fil | Hva |
|-----|-----|
| `tokens.ts` | Nye farger: mørk gradient bg, beige tekst, sage aksent |
| `globals.css` | Mørk gradient body, fjern Inter fonts, oppdater alle CSS vars |
| `layout.tsx` | Fix flex-chain for fullheight pages, fjern borderTop i sidebar |
| `cowork/page.tsx` | Evt. juster flex container |
| `ChatComposer.tsx` | Verifiser at flex-layout fungerer |
| `ChatInput.tsx` | Bakgrunn: charcoal (#3a3a3a) i stedet for white |
| `auto/page.tsx` | Verifiser done-filter, oppdater farger på kort |
| `tasks/page.tsx` | Rewrite: bruk ExpandableTaskCard, fjern split-view |
| Diverse components | Sjekk hardkodede farger som ikke bruker T.* |

---

## AAA Kontrastsjekk (må verifiseres programmatisk)

| Par | Forventet ratio |
|-----|----------------|
| #e8ddcb på #2b4f4a | ~6.74 (AA) |
| #e8ddcb på #3a3a3a | ~8.47 (AAA) |
| #a7c58e på #2b4f4a | ~? (sjekkes) |
| #a7c58e på #3a3a3a | ~? (sjekkes) |
| #d94a4a på #3a3a3a | ~? (sjekkes) |

Hvis #e8ddcb på #2b4f4a er under 7:1, bump til #f0e8d8 eller #f5ede0.

---

## Rekkefølge

1. tokens.ts + globals.css (farger + font)
2. layout.tsx (flex-fix + sidebar seamless)
3. ChatComposer + ChatInput (posisjonering + farger)
4. auto/page.tsx (verifiser done-filter)
5. tasks/page.tsx (rewrite til expandable cards)
6. Kontrast-verifisering
7. Scan alle komponenter for hardkodede farger

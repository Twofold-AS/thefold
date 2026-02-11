# TheFold Frontend Design Guide

## Estetisk retning: Encore-klon
Match Encore.dev sitt dashboard så nøyaktig som mulig. Encore har to modi — mørkt og lyst. Vi starter med mørkt tema som default men bygger for begge.

## Nøkkelobservasjoner fra Encore sitt design:
1. Sidebar er ALLTID mørk (selv i lyst tema)
2. Lyst tema: varm off-white bakgrunn (#faf9f6), IKKE kald hvit
3. Badges er avrundet med gul-grønn farge (som "Active")
4. Kodeblokker har venstre farge-border (oransje, blå, etc.)
5. Knapper er firkantet (rounded-sm eller rounded-none), IKKE avrundet
6. Monospace font brukes for titler og kode
7. Veldig generøs spacing og whitespace
8. Minimalt med farger — nesten monokromt med grønn aksent

## Fargepalett

### Mørkt tema (default)
```css
[data-theme="dark"] {
  --bg-page: #111110;
  --bg-sidebar: #18181a;
  --bg-sidebar-hover: #252528;
  --bg-sidebar-active: #2a2a2d;
  --bg-card: #1a1a1c;
  --bg-input: #141414;
  --bg-code: #0d0d0d;
  --bg-hover: #222224;
  
  --text-primary: #fafaf9;
  --text-secondary: #a1a1aa;
  --text-muted: #52525b;
  
  --border: #27272a;
  --border-hover: #3f3f46;
}
```

### Lyst tema
```css
[data-theme="light"] {
  --bg-page: #faf9f6;          /* Varm off-white, IKKE #fff */
  --bg-sidebar: #1c1c1e;       /* Sidebar er ALLTID mørk */
  --bg-sidebar-hover: #2a2a2d;
  --bg-sidebar-active: #333336;
  --bg-card: #ffffff;
  --bg-input: #f4f3f0;
  --bg-code: #f0efec;
  --bg-hover: #f0efec;
  
  --text-primary: #1a1a1a;
  --text-secondary: #6b6b6b;
  --text-muted: #9a9a9a;
  
  --border: #e5e4e0;
  --border-hover: #d4d3cf;
}
```

### Felles farger (begge temaer)
```css
:root {
  /* Aksent — Encore sin grønne */
  --accent: #22c55e;
  --accent-hover: #16a34a;
  --accent-muted: rgba(34, 197, 94, 0.15);
  
  /* Badges — Encore bruker gul-grønn for "Active" */
  --badge-active-bg: #d5e8a0;
  --badge-active-text: #3d5a00;
  --badge-inactive-bg: #e8e8e4;
  --badge-inactive-text: #6b6b6b;
  
  /* Status */
  --success: #22c55e;
  --warning: #eab308;
  --error: #ef4444;
  --info: #3b82f6;
  
  /* Kodeblokk venstre-border farger */
  --code-border-orange: #f59e0b;
  --code-border-blue: #3b82f6;
  --code-border-green: #22c55e;
  --code-border-purple: #8b5cf6;
}
```

## Typografi
Encore bruker monospace for headings og systemfont for body:

```css
--font-heading: "GT America Mono", "SF Mono", "Cascadia Code", "JetBrains Mono", ui-monospace, monospace;
--font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
--font-code: "SF Mono", "Cascadia Code", "JetBrains Mono", ui-monospace, monospace;
```

- **Sideoverskrifter:** Monospace, 32-40px, font-medium (som "Cron Jobs" i screenshottet)
- **Korttitler:** Monospace, 18-20px, font-medium
- **Body:** System sans-serif, 14-15px
- **Labels:** System sans-serif, 12-13px, text-secondary
- **Kode:** Monospace, 13-14px

## Komponenter

### Sidebar (ALLTID mørk bakgrunn)
```
Bredde: 240px
Bakgrunn: #1c1c1e (alltid, uavhengig av tema)
Tekst: #a1a1aa (inaktiv), #fafafa (aktiv/hover)

Struktur:
┌──────────────────────┐
│ T  thefold-aoti  MK ▾│  ← App-navn + avatar
│                      │
│ ⌂ Home               │  ← Navigasjonslenker
│ ☰ Overview           │
│ ⚙ Settings           │
│                      │
│ ─── staging ───      │  ← Environment-gruppe
│   Dev Environment    │
│                      │
│ 📊 Oversikt          │
│ 💬 Chat              │
│ 📋 Tasks             │
│ 📁 Repoer            │
│ 🧠 Memory            │
│ ⚙ Settings           │
│                      │
│ ─── Observability ── │  ← Seksjons-label (uppercase, muted)
│ $ Forbruk            │
│                      │
│                      │
│ 🔍 Search            │  ← Nederst
│ ❓ Help              │
└──────────────────────┘
```

- Lenker: py-1.5 px-3, text-sm, rounded-none eller rounded-sm
- Aktiv: bg-sidebar-active, text-primary, font-medium
- Ikon: 18px, inline med tekst
- Seksjonslabels: uppercase, text-[11px], tracking-wider, text-muted, mt-6 mb-2

### Knapper (FIRKANTET — dette er viktig)
```css
/* Encore bruker nesten ingen avrunding */
.btn-primary {
  background: var(--accent);
  color: #000;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 2px;        /* Nesten firkantet! */
  font-size: 14px;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 8px 16px;
  border-radius: 2px;
  font-size: 14px;
}

/* "View all", "View details" stil */
.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 14px;
  border-radius: 2px;
  font-size: 13px;
  font-weight: 500;
}
```

### Badges (som Encore sin "Active" og "Inactive")
```css
.badge-active {
  background: #d5e8a0;       /* Gul-grønn */
  color: #3d5a00;
  font-family: monospace;
  font-size: 13px;
  padding: 2px 10px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-inactive {
  background: #e8e8e4;
  color: #6b6b6b;
  font-family: monospace;
  font-size: 13px;
  padding: 2px 10px;
  border-radius: 4px;
}
```

### Kort
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
}
/* Ingen box-shadow */
/* Hover: border-color → var(--border-hover) */
```

### Kodeblokker (med farget venstre-border som Encore)
```css
.code-block {
  background: var(--bg-code);
  border-left: 3px solid var(--code-border-orange);  /* Farge varierer */
  border-radius: 0;          /* Ingen avrunding */
  padding: 12px 16px;
  font-family: var(--font-code);
  font-size: 14px;
}
```

### Stat-blokker (som "0 Requests", "0 Errors")
```
┌─────────────────┐
│ ↕ 0 Requests    │  ← Ikon + tall + label på en linje
│   Last 24 hours │  ← Undertekst i text-muted
└─────────────────┘
```
- Ikon (16px) + tall (16px font-semibold) + label (16px) på en linje
- Undertekst: text-sm text-muted

### Input-felt
```css
.input {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 2px;        /* Firkantet som knappene */
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-primary);
}
.input:focus {
  border-color: var(--accent);
  outline: none;
}
```

### Tabeller
- Ingen synlige vertikale borders
- Header: text-muted, text-xs, uppercase, tracking-wider, border-b
- Rader: py-3 px-4, border-b border-border
- Hover: bg-hover

## Sidespesifikke retningslinjer

### Oversikt
- "Welcome [navn]" i monospace, 32px
- Undertittel i text-secondary
- Stat-kort i horizontal row (ikke grid)
- To-kolonne: Aktive tasks (venstre, bred), System status (høyre, smal)

### Chat
- Full-height layout
- TheFold-meldinger: bg-card med venstre border-l-3 border-accent
- Bruker-meldinger: høyre-justert, bg-sidebar-active (mørk)
- Agent-rapporter: bg-card med border-l-3 border-code-border-orange
- Input: festet til bunn, full bredde, firkantet

### Tasks
- Tabell-layout (ikke kort)
- Status-dot (8px sirkel) med farge
- Monospace for task-ID (FOLD-42)
- Ekspanderbar rad for detaljer

### Repoer
- Liste (ikke grid) — som Encore sin Environments-visning
- Hvert repo: navn (monospace, bold), URL (text-muted), stats

### Settings
- Seksjon-layout med tydelige overskrifter (monospace)
- Maskerte API-nøkler med toggle

## Anti-patterns
- ALDRI runde knapper (rounded-lg, rounded-full på knapper)
- ALDRI hvit #ffffff som bakgrunn — bruk varm off-white #faf9f6
- ALDRI box-shadow på kort
- ALDRI fargerike gradienter
- ALDRI mer enn 2px border-radius på knapper/inputs
- ALDRI emojis som ikoner i produksjon — bruk SVG
- ALDRI transitions over 150ms
- ALDRI sidebar i lys farge — den er ALLTID mørk

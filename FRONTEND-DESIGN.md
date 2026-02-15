# TheFold Frontend Design Guide

## Estetisk retning: Dashed, transparent, typografisk
TheFold bruker et minimalistisk design med dashed borders, transparente kort, og en tydelig typografisk hierarki. Merk og lys modus. Sidebar er alltid mørk.

## Fargepalett

### Mørkt tema (default)
```css
[data-theme="dark"] {
  --bg-page: #070706;
  --bg-card: transparent;
  --bg-card-secondary: transparent;
  --bg-input: #0e0e0d;
  --bg-code: #0a0a09;
  --bg-hover: #1e1e1c;

  --bg-chat: #1e1e1c;
  --text-chat: #787877;

  --text-primary: #fafaf9;
  --text-secondary: #7b7a76;
  --text-muted: #52524e;

  --border: #2a2a28;
  --border-hover: #3f3f3b;

  --bg-sidebar: #070706;
  --bg-sidebar-section: transparent;
  --bg-sidebar-hover: #1e1e1c;
  --bg-sidebar-active: #1e1e1c;
  --sidebar-text: #7b7a76;
  --sidebar-text-active: #fafaf9;
  --sidebar-border: #2a2a28;
}
```

### Lyst tema
```css
[data-theme="light"] {
  --bg-page: #faf9f6;
  --bg-card: transparent;
  --bg-card-secondary: transparent;
  --bg-input: #f4f3f0;
  --bg-code: #f0efec;
  --bg-hover: #ededea;

  --bg-chat: #f0efec;
  --text-chat: #6b6b68;

  --text-primary: #1a1a18;
  --text-secondary: #7b7a76;
  --text-muted: #9a9a96;

  --border: #e0dfdb;
  --border-hover: #d4d3cf;
}
```

### Felles farger (begge temaer)
```css
:root {
  --badge-active-bg: #d5e8a0;
  --badge-active-text: #3d5a00;
  --badge-inactive-bg: #e8e8e4;
  --badge-inactive-text: #6b6b6b;

  --success: #22c55e;
  --warning: #eab308;
  --error: #ef4444;
  --info: #3b82f6;

  --code-border-orange: #f59e0b;
  --code-border-blue: #3b82f6;
  --code-border-green: #22c55e;
  --code-border-purple: #8b5cf6;
}
```

## Typografi

### Fontfiler (`frontend/public/fonts/`)
```
VariantNeueDisplay-400.woff2       → Titler, overskrifter (h1, h2)
VariantNeueDisplay-400Italic.woff2 → "TheFold" branding, italic accenter
VariantNeueText-400.woff2          → Lengre tekst, beskrivelser, paragrafer
Inter_18pt-Regular.woff2           → Generell UI: labels, knapper, meny, sidebar, input
Inter_18pt-Medium.woff2            → Vektlagt UI: aktive tabs, viktige labels
```

### Font-bruk
| Hvor | Font | Tailwind-klasse | Stil |
|------|------|-----------------|------|
| Body default | Inter | `font-sans` (automatisk) | Regular 400 |
| Sidebar tekst | Inter | `font-sans` | Regular 400 |
| Knapper, labels | Inter | `font-sans` | Regular/Medium |
| Aktive tabs | Inter Medium | `font-sans font-medium` | Medium 500 |
| Sideoverskrifter (h1) | Variant Neue Display | `font-display` | Regular 400 |
| Seksjonsoverskrifter (h2) | Variant Neue Display | `font-display` | Regular 400 |
| "TheFold" branding | Variant Neue Display Italic | `font-brand italic` | Italic 400 |
| Beskrivelser, paragrafer | Variant Neue Text | `font-text` | Regular 400 |
| Kode, filnavn | Courier New | `font-mono` | Regular |

### Tailwind config
```typescript
fontFamily: {
  display: ['"Variant Neue Display"', 'system-ui', 'sans-serif'],
  brand: ['"Variant Neue Display"', 'system-ui', 'sans-serif'],
  text: ['"Variant Neue Text"', 'system-ui', 'sans-serif'],
  sans: ['"Inter"', 'system-ui', 'sans-serif'],
  mono: ['"Courier New"', 'monospace'],
}
```

## Dashed Border-filosofi

**Alle strukturelle borders bruker `dashed`:**
- Kort (`.card`) — `1px dashed var(--border)`
- Knapper — `1px dashed var(--border)`
- Input-felter — `1px dashed var(--border)` (solid ved `:focus`)
- Sidebar borderRight — `1px dashed var(--sidebar-border)`
- Tabell-headere/celler — `1px dashed var(--border)`
- Separatorer (borderTop/borderBottom) — `1px dashed var(--border)`

**Unntak — behold SOLID:**
- Feilmeldinger (rød borderLeft: `3px solid var(--error)`)
- Kodeblokker (fargede venstre-borders)
- Input `:focus` state (border-style: solid)
- Status-dots, progress bars, badges
- Interaktive aksent-borders (f.eks. aktiv tab)
- Suksess/feil-indikator borders

## Komponenter

### Knapper (pill, dashed, transparent)
```css
.btn-primary {
  background: transparent;
  color: var(--text-primary);
  font-weight: 500;
  padding: 8px 20px;
  border-radius: 9999px;
  border: 1px dashed var(--border);
}
.btn-primary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-hover);
}

.btn-secondary {
  /* Samme som primary, men font-weight 400 og text-secondary farge */
}

.btn-danger {
  color: var(--error);
  border: 1px dashed var(--error);
}
```

### Kort (transparent, dashed)
```css
.card {
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 20px;
}
```

### Input-felter (dashed, solid ved fokus)
```css
.input-field {
  background: var(--bg-input);
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px 14px;
}
.input-field:focus {
  border-color: var(--text-secondary);
  border-style: solid;
}
```

### Kodeblokker (solid farge-border)
```css
.code-block {
  background: var(--bg-code);
  border-left: 3px solid var(--code-border-orange);
  border-radius: 0;
}
```

### Chat-bobler
- TheFold-meldinger: `background: var(--bg-chat)`, tekst `var(--text-chat)`
- Bruker-meldinger: transparent bg, hvit tekst
- Meldingsinnhold: `font-text`
- Tidsstempler/metadata: `font-sans`

## Sidebar (alltid mørk)
```
Bredde: 240px (w-60)
borderRight: 1px dashed var(--sidebar-border)
background: var(--bg-sidebar)

Struktur:
┌──────────────────────┐
│ Logo  TheFold    [MK] │  ← font-brand italic
│                       │
│ Home                  │
│ Environments          │
│ Chat                  │
│ Reviews               │
│ Tools                 │
│                       │
│ ┌─ [repo-name] ▾ ──┐ │  ← dashed border selector
│ │ Oversikt          │ │
│ │ Chat              │ │
│ │ Oppgaver          │ │
│ │ Reviews           │ │
│ │ Aktivitet         │ │
│ └───────────────────┘ │
│                       │
│ ┌─ CONFIG ──────────┐ │
│ │ Settings          │ │
│ │ Skills            │ │
│ └───────────────────┘ │
│                       │
│ ● System online       │
└───────────────────────┘
```

## Login-side (split-view)
- Venstre: Bilde-placeholder (brukeren legger inn bilde selv)
- Høyre: Login-form
- "Logg inn på" → `font-display`, farge `var(--text-secondary)`
- "TheFold" → `font-brand italic`, farge `var(--text-primary)`
- OTP-basert innlogging (e-post → 6-siffer kode)
- Footer: "Twofold AS · © 2025"

## Anti-patterns
- ALDRI `background: #fafafa` eller `background: #fff` på knapper — bruk transparent
- ALDRI `border: solid` på strukturelle elementer (kort, knapper, separatorer)
- ALDRI box-shadow på kort
- ALDRI fargerike gradienter
- ALDRI font-heading (fjernet) — bruk `font-display`
- ALDRI font-general (fjernet) — bruk `font-sans`
- ALDRI Suisse Intl, TheFold Brand, Suisse Intl Mono — fjernet
- ALDRI sidebar i lys farge — den er ALLTID mørk
- ALDRI transitions over 150ms

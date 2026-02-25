# PROMPT — Synkroniser TheFold design-system med Tailwind/ShadCN oppsett

## Kontekst

TheFold-frontenden har to parallelle stilsystemer som må samkjøres. TheFold-designet er kilden til sannhet — ShadCN-oppsettet skal tilpasses TheFold. Fonten byttes fra Suisse Intl til **Inter (24pt-varianten)** som hoved-font.

---

## HVA SOM SKAL GJØRES

### 1. Legg Inter 24pt font-filer i `public/fonts/`

Kopier disse filene til `public/fonts/`:
```
public/fonts/
├── thefold.woff2                          ← TheFold Brand (finnes allerede)
├── Inter_24pt-Regular.woff2               ← Inter 400
├── Inter_24pt-Medium.woff2                ← Inter 500
├── Inter_24pt-SemiBold.woff2              ← Inter 600
├── Inter_24pt-Bold.woff2                  ← Inter 700
└── Inter_24pt-ExtraBold.woff2             ← Inter 800
```

Hvis du har `.ttf`-filer istedenfor `.woff2`, konverter dem først eller bruk `.ttf` direkte (endre `format('woff2')` til `format('truetype')` i `@font-face`).

---

### 2. Erstatt `globals.css`

Erstatt HELE filen med dette:

```css
@import "tailwindcss";

/* ─── Inter 24pt (self-hosted) ─── */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter_24pt-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter_24pt-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter_24pt-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter_24pt-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter_24pt-ExtraBold.woff2') format('woff2');
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}

/* ─── Geist Mono (CDN) ─── */
@import url('https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-mono/style.css');

/* ─── TheFold Brand font (kun for "TheFold" logotekst) ─── */
@font-face {
  font-family: 'TheFold Brand';
  src: url('/fonts/thefold.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

/* ─── TheFold dark palette (alltid mørkt, ingen light mode) ─── */
:root {
  /* Surfaces */
  --background: #000000;
  --foreground: #F5F5F5;
  --card: #141414;
  --card-foreground: #F5F5F5;
  --popover: #1A1A1A;
  --popover-foreground: #F5F5F5;

  /* Brand */
  --primary: #6366F1;
  --primary-foreground: #F5F5F5;
  --secondary: #1A1A1A;
  --secondary-foreground: rgba(255,255,255,0.68);

  /* Muted / subtle */
  --muted: #141414;
  --muted-foreground: rgba(255,255,255,0.44);
  --accent: #6366F1;
  --accent-foreground: #F5F5F5;

  /* Semantic */
  --destructive: #EF4444;
  --destructive-foreground: #F5F5F5;
  --success: #34D399;
  --warning: #FBBF24;

  /* Borders & inputs */
  --border: #2A2A2A;
  --input: #1A1A1A;
  --ring: #6366F1;

  /* Chart */
  --chart-1: #6366F1;
  --chart-2: #A5B4FC;
  --chart-3: #34D399;
  --chart-4: #FBBF24;
  --chart-5: #EF4444;

  /* Sidebar */
  --sidebar: #000000;
  --sidebar-foreground: #F5F5F5;
  --sidebar-primary: #6366F1;
  --sidebar-primary-foreground: #F5F5F5;
  --sidebar-accent: #1A1A1A;
  --sidebar-accent-foreground: #F5F5F5;
  --sidebar-border: #2A2A2A;
  --sidebar-ring: #6366F1;

  /* Fonts */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-serif: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;
  --font-brand: 'TheFold Brand', 'Inter', -apple-system, system-ui, sans-serif;

  /* Radius */
  --radius: 0.5rem;

  /* TheFold custom tokens (brukes av T-objekt via inline styles) */
  --tf-bg: #000000;
  --tf-raised: #0D0D0D;
  --tf-surface: #141414;
  --tf-subtle: #1A1A1A;
  --tf-border: #2A2A2A;
  --tf-border-hover: #3D3D3D;
  --tf-border-faint: #2A2A2A;
  --tf-text: #F5F5F5;
  --tf-text-sec: rgba(255,255,255,0.68);
  --tf-text-muted: rgba(255,255,255,0.44);
  --tf-text-faint: rgba(255,255,255,0.24);
  --tf-accent: #6366F1;
  --tf-accent-dim: rgba(99,102,241,0.12);
  --tf-brand: #6366F1;
  --tf-brand-light: #A5B4FC;
  --tf-success: #34D399;
  --tf-warning: #FBBF24;
  --tf-error: #EF4444;

  /* Shadows */
  --shadow-2xs: 0px 1px 2px 0px hsl(0 0% 0% / 0.15);
  --shadow-xs: 0px 1px 2px 0px hsl(0 0% 0% / 0.15);
  --shadow-sm: 0px 1px 2px 0px hsl(0 0% 0% / 0.25), 0px 1px 2px -1px hsl(0 0% 0% / 0.25);
  --shadow: 0px 1px 2px 0px hsl(0 0% 0% / 0.25), 0px 1px 2px -1px hsl(0 0% 0% / 0.25);
  --shadow-md: 0px 1px 2px 0px hsl(0 0% 0% / 0.25), 0px 2px 4px -1px hsl(0 0% 0% / 0.25);
  --shadow-lg: 0px 1px 2px 0px hsl(0 0% 0% / 0.25), 0px 4px 6px -1px hsl(0 0% 0% / 0.25);
  --shadow-xl: 0px 1px 2px 0px hsl(0 0% 0% / 0.25), 0px 8px 10px -1px hsl(0 0% 0% / 0.25);
  --shadow-2xl: 0px 1px 2px 0px hsl(0 0% 0% / 0.55);
}

/* Ingen .dark {} blokk — TheFold er alltid mørkt */

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
  }
}

/* ─── TheFold animasjoner ─── */
@keyframes spin { to { transform: rotate(360deg) } }
@keyframes blink { 50% { opacity: 0 } }
@keyframes shimmerMove { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

/* ─── Scrollbar ─── */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--tf-border); border-radius: 3px; }

/* ─── Selection ─── */
::selection { background: var(--tf-accent-dim); color: var(--tf-accent); }

/* ─── Brand shimmer (agent working) ─── */
.brand-shimmer {
  background: linear-gradient(90deg, var(--tf-accent) 0%, var(--tf-brand-light) 50%, var(--tf-accent) 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmerMove 2s ease-in-out infinite;
}
```

---

### 3. Erstatt `layout.tsx`

Fjern alle `next/font`-imports. Inter lastes via `@font-face` i globals.css.

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheFold",
  description: "Autonomous development agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="no" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
```

---

### 4. Oppdater `tokens.ts` — Bytt fra Suisse Intl til Inter

```ts
export const T = {
  bg: "#000000",
  raised: "#0D0D0D",
  surface: "#141414",
  subtle: "#1A1A1A",
  border: "#2A2A2A",
  borderHover: "#3D3D3D",
  text: "#F5F5F5",
  textSec: "rgba(255,255,255,0.68)",
  textMuted: "rgba(255,255,255,0.44)",
  textFaint: "rgba(255,255,255,0.24)",
  accent: "#6366F1",
  accentDim: "rgba(99,102,241,0.12)",
  brand: "#6366F1",
  brandLight: "#A5B4FC",
  success: "#34D399",
  warning: "#FBBF24",
  error: "#EF4444",
  mono: "'Geist Mono', ui-monospace, monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  brandFont: "'TheFold Brand', 'Inter', -apple-system, system-ui, sans-serif",
  r: 8,
} as const;

export const Layout = {
  sidebarWidth: 255,
  sidebarCollapsed: 56,
  contentWidth: 1636,
  innerWidth: 1232,
  headerHeight: 64,
  sidePadding: (1636 - 1232) / 2,
} as const;
```

---

### 5. Oppdater `tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "monospace"],
        brand: ["'TheFold Brand'", "'Inter'", "system-ui", "sans-serif"],
      },
      colors: {
        "tf-bg": "#000000",
        "tf-raised": "#0D0D0D",
        "tf-surface": "#141414",
        "tf-subtle": "#1A1A1A",
        "tf-border": "#2A2A2A",
        "tf-accent": "#6366F1",
        "tf-accent-dim": "rgba(99,102,241,0.12)",
        "tf-brand": "#6366F1",
        "tf-brand-light": "#A5B4FC",
        "tf-success": "#34D399",
        "tf-warning": "#FBBF24",
        "tf-error": "#EF4444",
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
```

---

### 6. Søk-erstatt i alle `.tsx`-filer: fjern Suisse Intl-referanser

Kjør global søk-erstatt i `frontend/src/`:

| Søk | Erstatt |
|-----|---------|
| `'Suisse Intl', 'SuisseIntl', 'Inter'` | `'Inter'` |
| `'Suisse Intl', 'Inter'` | `'Inter'` |
| `"Suisse Intl"` | `"Inter"` |
| `Suisse Intl` (i kommentarer/tekst) | `Inter` |

---

## Font-regler

| Font | Bruk | CSS-variabel | Tailwind-klasse |
|------|------|-------------|-----------------|
| **Inter 24pt** | All tekst — body, overskrifter, knapper, labels, alt | `--font-sans` | `font-sans` (default) |
| **Geist Mono** | Kode, monospace-verdier, tekniske labels | `--font-mono` | `font-mono` |
| **TheFold Brand** | KUN "TF" og "TheFold" logotekst i sidebar | `--font-brand` | `font-brand` |

## Verifisering

1. `npx next build` kompilerer uten feil
2. Body-tekst er Inter
3. Kode/monospace er Geist Mono
4. Kun "TheFold"-logotekst bruker TheFold Brand-fonten
5. Alle ShadCN-komponenter bruker TheFold mørke farger
6. Ingen `.dark`-klasse nødvendig
7. `tokens.ts` er synkronisert med CSS-variablene
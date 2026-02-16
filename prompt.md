Les frontend/src/components/sidebar.tsx — HELE filen. Finn "TheFold" teksten, logo-ikonet, og bunnen av sidebaren.
Les frontend/src/app/login/page.tsx — Finn "TheFold" teksten og shimmer.
Les frontend/src/app/globals.css — Finn font-face deklarasjoner og shimmer-animasjon.
Les frontend/public/fonts/ — list alle filer, finn thefold.woff2.

---

## SIDEBAR + LOGIN FONT-ENDRINGER

### 1. TheFold custom font

I globals.css, legg til ny @font-face:
```css
@font-face {
  font-family: 'TheFold Brand';
  src: url('/fonts/thefold.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

### 2. Sidebar — topp

I sidebar.tsx, endre toppen:
- FJERN logo-ikonet (SVG/img ved siden av teksten)
- BEHOLD "TheFold" teksten
- Endre font til TheFold Brand:
```tsx
<span style={{ fontFamily: "'TheFold Brand', var(--font-display)", color: "var(--text-primary)" }}>
  TheFold
</span>
```

Ingen ikon, bare teksten i custom font.

### 3. Sidebar — bunn

Flytt Twofold-logoen ned til BUNNEN av sidebaren. Plasser den som siste element, over eventuell padding:
```tsx
{/* Helt nederst i sidebaren */}
<div className="mt-auto px-4 py-4 flex items-center gap-2" style={{ borderTop: "1px solid var(--border)" }}>
  {/* Twofold logo — den eksisterende SVG/ikon */}
  <TwofoldLogo className="w-5 h-5" style={{ opacity: 0.4 }} />
  <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.5 }}>Twofold</span>
</div>
```

Hvis det ikke finnes en TwofoldLogo komponent, bruk en enkel tekst:
```tsx
<div className="mt-auto px-4 py-4 flex items-center gap-2" style={{ borderTop: "1px solid var(--border)" }}>
  <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.5 }}>Twofold</span>
</div>
```

### 4. Login-side — TheFold font + shimmer

I login/page.tsx, endre "TheFold" overskriften:
- Bruk TheFold Brand font
- Legg til shimmer-animasjon (samme som sidebar, men tregere)
```tsx
<h1 
  className="text-shimmer-slow"
  style={{ fontFamily: "'TheFold Brand', var(--font-display)", fontSize: "3rem" }}
>
  TheFold
</h1>
```

### 5. Shimmer-animasjon — tregere variant

I globals.css, legg til en tregere shimmer:
```css
.text-shimmer {
  background: linear-gradient(
    90deg,
    var(--text-primary) 0%,
    rgba(255,255,255,0.4) 50%,
    var(--text-primary) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: text-shimmer 3s ease-in-out infinite;
}

.text-shimmer-slow {
  background: linear-gradient(
    90deg,
    var(--text-primary) 0%,
    rgba(255,255,255,0.4) 50%,
    var(--text-primary) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: text-shimmer 5s ease-in-out infinite;
}

@keyframes text-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Sidebar: bruk `text-shimmer-slow` (5s)
Login: bruk `text-shimmer-slow` (5s)

Gi rapport.
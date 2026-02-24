# FARGESKIFTE — Bytt oransje/rød til blå

## REGLER
1. ALDRI endre backend-filer. Kun `frontend/`.
2. Gjør ALLE endringer. Ikke la noen oransje/røde aksenter stå igjen.

## Nye farger
- Primær (erstatter oransje `#FF6B2C` / `rgb(255, 107, 44)`): **#355872**
- Sekundær/lys variant (for hover, glows, gradienter): **#7aaace**

## Filer å endre

### 1. `frontend/src/app/globals.css`
Søk og erstatt alle forekomster av:
- `#FF6B2C` → `#355872`
- `rgb(255, 107, 44)` → `rgb(53, 88, 114)`
- `rgba(255, 107, 44,` → `rgba(53, 88, 114,`
- `--tf-heat` verdien → `#355872`
- Alle `box-shadow` med oransje glow → bruk `rgba(53, 88, 114, 0.3)` eller `rgba(122, 170, 206, 0.3)`

### 2. Alle `.tsx`-filer i `frontend/src/`
Søk gjennom ALLE tsx-filer etter:
- `"var(--tf-heat)"` — dette er allerede variabel, trenger ikke endres hvis globals.css er fikset
- `#FF6B2C` hardkodet — erstatt med `var(--tf-heat)`
- `rgb(255, 107, 44)` hardkodet — erstatt med `var(--tf-heat)`
- `rgba(255, 107, 44,` hardkodet — erstatt med riktig opacity av `rgba(53, 88, 114,`
- Inline styles med oransje farger

### 3. Gradienter og glows
Overalt der det brukes gradient med oransje:
- `linear-gradient(to top, var(--tf-heat), rgba(255, 107, 44, 0.3))` → `linear-gradient(to top, #355872, rgba(122, 170, 206, 0.3))`
- Box-shadow glows: `rgba(255, 107, 44, 0.5)` → `rgba(122, 170, 206, 0.4)`
- Radial gradient overlays: oppdater til blå

### 4. Spesifikke steder å sjekke
- Sidebar aktiv-state: oransje tekst/bakgrunn → `#355872`
- Chat: repo-badge, agent-active badge, inkognito-badge
- Overview: bar chart, active tasks LIVE badge
- AI-side: provider badges, cost bars
- Settings: save-knapp bakgrunn
- Topbar: repo-velger aktiv-indikator
- ThinkingIndicator: puls-farge
- AgentProgressCard: aktiv-steg farge
- Alle `badge-sparkle`, `badge-new` klasser

### 5. Legg til sekundærfarge
I globals.css, legg til:
```css
--tf-heat-light: #7aaace;
```
Bruk denne for:
- Hover-states (litt lysere enn primær)
- Glows og shadows
- Sekundære badges
- Gradienter (fra #355872 til #7aaace)

## Kommando for å finne alle forekomster
```bash
grep -rn "FF6B2C\|255, 107, 44\|tf-heat" frontend/src/ --include="*.tsx" --include="*.css" --include="*.ts"
```

## Verifiser
- [ ] Ingen oransje/røde aksenter synlig noe sted
- [ ] Sidebar aktiv-state er blå
- [ ] Knapper er blå
- [ ] Grafer/charts bruker blå
- [ ] Glows/shadows bruker blå
- [ ] Ser sammenhengende ut — ingen mismatched farger
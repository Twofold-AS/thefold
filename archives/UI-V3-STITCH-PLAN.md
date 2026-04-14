# UI V3 — Stitch-inspirert redesign

Dato: 2026-04-13

---

## Referanse

Stitch (stitch.withgoogle.com) layout:
- Mørk bakgrunn #202124
- Sidebar til venstre med prosjekter/repos, scrollbar
- To tabs øverst i sidebar ("Prosjektene mine" / "Delt med meg")
- Søkefelt under tabs
- Prosjekter listet med thumbnail, navn, dato
- Hovedinnhold: stor velkomsttekst sentrert
- Suggestion-chips under teksten
- Stor chatboks med mye spacing, avrundet (1.5rem)
- Chatboks har tekst øverst, knapper i bunnen — INGEN skillelinje
- Knapper i chatboks: +, App, Nettet (venstre), Chat, Model selector, Voice, Send (høyre)
- Topbar: Logo + BETA til venstre, ikoner til høyre (Docs, GitHub, X, osv.)

---

## Font

Google Sans er proprietary (ikke tilgjengelig via Google Fonts CDN).
Nærmeste alternativ: **Product Sans** er også proprietary.

Forslag: Bruk **"Google Sans"** med fallback til system fonts. Mange
Google-sider laster den fra `fonts.gstatic.com`. Vi kan referere den
via:
```
https://fonts.gstatic.com/s/googlesans/v62/4Ua_rENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iqcsih3SAyH6cAwhX9RFD48TE63OOYKtrwEIJllpyk.woff2
```
Eller bruke Product Sans / Inter som fallback om Google Sans ikke laster.

**Alternativ som brukeren kan godkjenne:** Bruk Product Sans-lignende
font som er offentlig tilgjengelig, f.eks. **Outfit** eller **Poppins**
fra Google Fonts som nærmeste match. Eller last ned Google Sans .woff2
og host lokalt.

---

## Farger (eksakte verdier fra brukeren)

| Token | Hex | Bruk |
|-------|-----|------|
| bg | #202124 | Hovedbakgrunn |
| sidebarBg | #1b1c1e | Sidebar bakgrunn |
| sidebarTabWrapperBg | #171919 | Wrapper rundt CoWork/Auto tabs |
| sidebarTabActive | #3c4043 | Aktiv tab bakgrunn |
| searchBg | #2a2c2d | Søkefelt bakgrunn |
| popupBg | #373840 | Popups, dropdowns |
| suggestionBg | #2d3032 | Suggestion chips |
| text | #f1f3f4 | Primærtekst |
| border | #e5e7eb | Borders (lys — OBS: sjekk kontrast) |

**OBS:** #e5e7eb border på #202124 bakgrunn gir svært høy kontrast
(~12:1). Dette er riktig for Stitch-stilen der borders er tydelige.

---

## Plan — steg for steg

### 1. tokens.ts — Nye farger + font
- bg: "#202124"
- raised: "transparent" (ingen bakgrunn på kort)
- surface: "#373840" (popups)
- subtle: "rgba(255,255,255,0.04)"
- border: "#e5e7eb" → MEN: Stitch bruker subtile borders, ikke
  #e5e7eb overalt. Sjekk bildet — borders er egentlig ganske subtile
  (#3c4043 eller lignende). #e5e7eb er for input borders / highlights.
  Standard border: rgba(255,255,255,0.12) eller #3c4043
- text: "#f1f3f4"
- textSec: "#9aa0a6" (Google's sekundærtekst)
- textMuted: "#80868b"
- accent: ingen sterk aksent — Stitch er veldig nøytral. Bruk
  en subtil grønn eller hvit. Kan beholde sage #a7c58e eller
  bytte til Google-blå #8ab4f8
- Font: Google Sans med fallback

### 2. globals.css
- Body bg: #202124 (flat, ingen gradient)
- Fjern gradient
- Fjern alle gamle font-imports
- Legg til Google Sans (lokal eller CDN)

### 3. layout.tsx — Sidebar omstrukturering
**Fjern** hele den gamle sidebaren. Ny struktur:

```
┌─────────────────────────────────────────────┐
│ TheFold (bold) BETA          [ikoner] [user]│ ← Topbar
├──────────┬──────────────────────────────────┤
│ Sidebar  │  Hovedinnhold                    │
│ #1b1c1e  │  #202124                         │
│          │                                  │
│ ┌──────┐ │  "Hva kan TheFold bygge for deg?"│
│ │CoWork│ │                                  │
│ │ Auto │ │  [suggestion chips]              │
│ └──────┘ │                                  │
│ [Søk]    │  ┌──────────────────────┐        │
│          │  │ Chat input...        │        │
│ Repos:   │  │                      │        │
│ • repo1  │  │                      │        │
│ • repo2  │  │ [+][Skills][Sub] [M] │        │
│ • repo3  │  └──────────────────────┘        │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

**Sidebar detaljer:**
- Bakgrunn: #1b1c1e
- Padding/spacing rundt hele
- To tabs side om side: "CoWork" og "Auto"
  - Wrapper: #171919, rounded
  - Aktiv tab: #3c4043, rounded
  - Inaktiv tab: transparent
- Søkefelt under tabs: #2a2c2d, rounded
- Under søk: liste med repos (scrollable)
  - Hvert repo: navn + dato, med lite ikon/preview
  - Klikk → velger repo for chat

**Topbar:**
- "TheFold" i bold Google Sans + "BETA" badge
- Ingen logo-ikon (fjernes)
- Høyre side: kun ikoner (settings, notifications), ingen tekst

### 4. ChatComposer — Stitch-stil chatboks
- Stor boks: 1.5rem border-radius
- Bakgrunn: #373840 eller rgba(255,255,255,0.06)
- INGEN skillelinje mellom tekst og knapper
- Placeholder-tekst sentrert
- 20px gap mellom tekstområde og knapper
- Knapper i bunnen av boksen med god spacing
- Størrelse: ~367x266 proporsjon (tilpasses responsivt)

### 5. Knapper → Topbar
- Flytt action-knapper (historikk, ny chat etc.) til topbar
- Kun ikoner, ingen tekst
- Topbar-ikoner høyrejustert

### 6. Fjern logo-ikonet
- Fjern `<img src="/logo/logo.svg">` fra sidebar
- Erstatt med "TheFold" tekst i topbar

---

## Filer som endres

| Fil | Hva |
|-----|-----|
| tokens.ts | Nye farger, ny font |
| globals.css | Flat bg, ny font, fjern gradient |
| layout.tsx | Total omskriving: topbar + ny sidebar + hovedinnhold |
| ChatComposer.tsx | Stitch-stil chatboks |
| ChatInput.tsx | Ny layout uten skillelinje |
| ChatContainer.tsx | Flytt knapper til topbar |
| cowork/page.tsx | Tilpass til ny layout |

---

## Spørsmål til bruker

1. **Font:** Google Sans er proprietary. Skal jeg:
   a) Prøve å laste den fra Google's CDN (kan slutte å fungere)
   b) Bruke en nær kopi som Outfit/Poppins fra Google Fonts
   c) Du har .woff2 filer jeg kan bruke?

2. **Accent-farge:** Stitch er nøytral (hvit/grå). Vil du beholde
   sage grønn (#a7c58e) som aksent, eller gå helt nøytralt?

3. **Sidebar repos:** Skal repos vises med thumbnails (som Stitch
   viser prosjekter), eller bare som tekstliste?

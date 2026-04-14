# UI V3 — Stitch-inspirert redesign — FINAL PLAN

Dato: 2026-04-13

---

## Farger (eksakte verdier)

| Token | Hex | Bruk |
|-------|-----|------|
| bg | #202124 | Hovedbakgrunn (flat, ingen gradient) |
| sidebarBg | #1b1c1e | Sidebar bakgrunn |
| tabWrapperBg | #171919 | Wrapper rundt CoWork/Auto tabs |
| tabActiveBg | #3c4043 | Aktiv tab / aktiv chatboks-item |
| searchBg | #2a2c2d | Søkefelt |
| popupBg | #373840 | Popup-menyer basefarge |
| suggestionBg | #2d3032 | Suggestion chips |
| chatboxBg | #373840 | Chatboks bakgrunn |
| text | #f1f3f4 | Primærtekst |
| textSec | #9aa0a6 | Sekundærtekst |
| textMuted | #80868b | Dempet tekst |
| border | #3c4043 | Subtile borders (ikke #e5e7eb) |

---

## Font

Google Sans — lokale .ttf filer fra /fonts/Google_Sans/static/:
- GoogleSans-Regular.ttf (400)
- GoogleSans-Medium.ttf (500)
- GoogleSans-SemiBold.ttf (600)
- GoogleSans-Bold.ttf (700)

Brukes OVERALT. Ingen andre fonter enn Google Sans.
Variable font finnes også: GoogleSans-VariableFont_GRAD,opsz,wght.ttf

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ TheFold (bold)  BETA                    [☆][🔔][⚙] │ Topbar
├────────────┬─────────────────────────────────────────────┤
│  Sidebar   │  Hovedinnhold                               │
│  #1b1c1e   │  #202124                                    │
│            │                                             │
│ ┌────┬───┐ │     "Hva kan TheFold bygge for deg?"        │
│ │CW  │Au │ │                                             │
│ └────┴───┘ │     [suggestion] [suggestion] [suggestion]  │
│ [🔍 Søk]  │                                             │
│            │     ┌─────────────────────────────────┐     │
│ Samtaler:  │     │ Beskriv hva du vil bygge...     │     │
│ ▸ Chat #1  │     │                                 │     │
│   repo-x   │     │                                 │     │
│ ▸ Chat #2  │     │                                 │     │
│   repo-y   │     │ [+][Skills][Sub]    [Model ▾][↑]│     │
│ ...scroll  │     └─────────────────────────────────┘     │
│            │                                             │
└────────────┴─────────────────────────────────────────────┘
```

---

## 1. globals.css — Font + farger

- Fjern ALL gammel font-import (CDN, @font-face for Inter, Plus Jakarta Sans, Geist Mono)
- Registrer Google Sans via @font-face (Regular 400, Medium 500, SemiBold 600, Bold 700) fra /fonts/Google_Sans/static/
- Behold TheFold Brand font for logo
- Body: background #202124, color #f1f3f4, font-family 'Google Sans'
- Flat bakgrunn (ingen gradient)

## 2. tokens.ts — Nye verdier

```
bg: "#202124"
raised: "transparent"
surface: "#373840"
subtle: "rgba(255,255,255,0.04)"
border: "#3c4043"
borderHover: "#5f6368"
text: "#f1f3f4"
textSec: "#9aa0a6"
textMuted: "#80868b"
textFaint: "#5f6368"
accent: "#8ab4f8" (Google Blue — for lenker/aksent)
accentDim: "rgba(138,180,248,0.08)"
brand: "#8ab4f8"
success: "#81c995"
warning: "#fdd663"
error: "#f28b82"
```

Font: `'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif`

## 3. layout.tsx — Total omskriving

### Topbar
- Venstre: "TheFold" i Google Sans Bold + "BETA" badge (border, liten tekst)
- Ingen logo-ikon (fjernes)
- Høyre: kun ikoner — suggestions (💡), notifications (🔔), settings (⚙)
- Alle items helt til høyre

### Sidebar (#1b1c1e)
- Spacing/padding rundt hele (16px)
- **CoWork / Auto tabs**: To knapper side om side
  - Ytre wrapper: #171919, rounded corners
  - Aktiv knapp: #3c4043, rounded corners (samme radius som wrapper)
  - Inaktiv knapp: transparent
- **Søkefelt**: Under tabs, #2a2c2d, rounded, med søkeikon
- **Samtalehistorikk** (ikke repos):
  - Scrollbar liste
  - Hvert item: samtaletittel + pil (▸) for å gå direkte
  - Under tittel: liten repo-nevnelse i textMuted
  - Hover: subtil bakgrunn
  - Klikk: åpner samtalen i hovedvinduet

### Hovedinnhold (#202124)
- Sentrert vertikalt og horisontalt
- Stor velkomsttekst
- Suggestion chips under
- Chatboks under

## 4. ChatComposer — Stitch-stil chatboks

- Border-radius: 1.5rem
- Bakgrunn: #373840
- INGEN skillelinje mellom tekst og knapper
- 20px gap mellom tekstområde og knapper
- Responsiv (mobilvennlig)
- Knapper i bunnen med god spacing
- Bold tekst på klikkbare knapper

### Aktiv item i chatboksen
- Bakgrunn: #3c4043
- Mer padding topp/bunn enn sidene (12px topp/bunn, 8px sider)

## 5. Popup-menyer — Stitch-stil

Basert på bildet av model-velgeren:
- Bakgrunn: #373840
- Border-radius: 12px
- Hvert item har:
  - Bold tittel
  - Beskrivelse under i textMuted
  - Ikon til venstre
  - Checkmark på valgt item
- Subtil skygge
- Brukes på: model-velger, notifications (bjella), skills dropdown

### Bjella (notifications)
- Samme popup-stil som model-velger
- FIKS: vis tekst, IKKE JSON
- Hvert varsel: bold tittel + beskrivelse

## 6. Suggestion chips

- Små "knapper" over chatboksen (som Stitch)
- Bakgrunn: #2d3032
- Border: 1px solid #3c4043
- Border-radius: 20px
- Padding: 8px 16px
- Font: Google Sans, 13px
- Eksempler: "Bygg en booking-app", "Lag en REST API", "Fiks auth-systemet"
- Klikk → fyller chatboksen med teksten

## 7. Sub-agenter — i chatten (ikke sidebar)

- Når sub-agenter er aktive, vises de INNE I chatten
- Under hovedagentens arbeidskort:
  - L-pil ned til sub-agent
  - Sub-agent kort med: rolle, status, hva den jobber med
  - Stopp-knapp ved siden av aktive agenter
- Fjern sub-agent fra sidebar

## 8. Topbar suggestions-ikon

- Nytt ikon i topbar (helt til høyre, ved siden av bjella/settings)
- Klikker → viser dropdown med foreslåtte oppgaver/prompts
- Stitch-stil popup

---

## Filer som endres

| Fil | Hva |
|-----|-----|
| globals.css | Google Sans font, nye farger, flat bg |
| tokens.ts | Alle nye farger/font |
| layout.tsx | Total omskriving: topbar + sidebar med samtaler + tabs |
| ChatComposer.tsx | Stitch chatboks + suggestions |
| ChatInput.tsx | Ny stil, ingen skillelinje, bold knapper |
| ChatContainer.tsx | Flytt knapper til topbar |
| NotifBell.tsx | Stitch popup-stil, fiks JSON-visning |
| cowork/page.tsx | Koble opp ny sidebar + samtalehistorikk |
| AgentStream.tsx | Sub-agenter med L-pil inline |
| SubAgentSidebarItem.tsx | Fjernes fra sidebar, flyttes til chat |

### Nye filer
| Fil | Hva |
|-----|-----|
| SuggestionChips.tsx | Suggestion chips komponent |
| StitchPopup.tsx | Gjenbrukbar popup-meny med Stitch-stil |
| TopBar.tsx | Topbar komponent |

---

## Rekkefølge

1. Font + farger (globals.css, tokens.ts)
2. Topbar (ny komponent)
3. Sidebar omskriving (layout.tsx)
4. Chatboks (ChatComposer, ChatInput)
5. Popup-menyer + NotifBell fix
6. Suggestion chips
7. Sub-agenter i chat
8. Topbar suggestions-ikon

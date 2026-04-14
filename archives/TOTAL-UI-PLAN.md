# TheFold UI — Total Plan

Alt som skal gjøres, samlet fra alle samtaler. Ingenting utelatt.

---

## A. DESIGN — Stitch-inspirert

### A1. Font
- **Google Sans** — eneste font på hele siden
- Lokale filer: `/fonts/Google_Sans/static/GoogleSans-Regular.ttf` (400), Medium (500), SemiBold (600), Bold (700) + Italic
- Fjern ALLE andre fonter (Inter, Plus Jakarta Sans, Geist Mono)
- Behold TheFold Brand font kun for "TheFold" logotekst
- globals.css: @font-face for Google Sans, fjern alt annet
- tokens.ts: `sans: "'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif"`
- layout.tsx root: fjern CDN link tags

### A2. Farger
| Token | Hex | Bruk |
|-------|-----|------|
| bg | #202124 | Hovedbakgrunn (flat, INGEN gradient) |
| sidebarBg | #1b1c1e | Sidebar |
| tabWrapperBg | #171919 | CoWork/Auto tab-wrapper |
| tabActiveBg | #3c4043 | Aktiv tab, aktiv chatboks-item |
| searchBg | #2a2c2d | Søkefelt |
| popupBg | #373840 | Popup-menyer |
| suggestionBg | #2d3032 | Suggestion chips |
| chatboxBg | #373840 | Chatboks |
| text | #f1f3f4 | Primærtekst |
| textSec | #9aa0a6 | Sekundærtekst |
| textMuted | #80868b | Dempet |
| textFaint | #5f6368 | Svak |
| border | #3c4043 | Borders |
| borderHover | #5f6368 | Hover borders |
| accent | #8ab4f8 | Google Blue aksent |
| success | #81c995 | Grønn |
| warning | #fdd663 | Gul |
| error | #f28b82 | Rød |

### A3. AAA kontrast
- Verifiser alle tekst-på-bakgrunn kombinasjoner programmatisk
- #f1f3f4 på #202124 — må være 7:1+
- #9aa0a6 på #202124 — må være 4.5:1+
- Juster farger som feiler

---

## B. LAYOUT — Total omskriving

### B1. Topbar (ny komponent: TopBar.tsx)
- Venstre: "TheFold" i Google Sans Bold + "BETA" badge med border
- **Ingen logo-ikon** — fjern helt
- Høyre: kun ikoner (ingen tekst):
  - 💰 Kostnadsoversikt (ny side)
  - 🔔 Varsler (bjella)
  - ⚙️ Innstillinger

### B2. Sidebar (total omskriving av layout.tsx)
- Bakgrunn: #1b1c1e
- Spacing/padding rundt hele (16px)
- **CoWork / Auto tabs**:
  - To knapper side om side i en wrapper
  - Wrapper bg: #171919, rounded corners
  - Aktiv: #3c4043, same rounded corners
  - Inaktiv: transparent
- **Søkefelt** under tabs: #2a2c2d, rounded, søkeikon
- **Samtalehistorikk** (IKKE repos):
  - Scrollbar liste
  - Hvert item: samtaletittel + pil (▸) for direkte navigering
  - Under tittel: liten repo-nevnelse i textMuted
  - Hover: subtil bakgrunn
  - Klikk: åpner samtalen
  - Nyeste samtale øverst
- Sidebar viser kun CoWork og Auto samtaler, ingen andre nav-items

### B3. Hovedinnhold — to tilstander

**Tilstand 1: Velkomst (ingen aktiv samtale)**
- "Velkommen til TheFold." sentrert midt på siden, stor tekst
- Suggestion chips under teksten
- Chatboks under suggestion chips
- Repo-velger INNE I chatboksen

**Tilstand 2: Aktiv samtale**
- Chatboks flyttes til BUNNEN av siden
- Meldinger/SSE fra agent fyller plassen OVER chatboksen
- Sidebar oppdaterer seg — ny samtale øverst i listen

---

## C. CHATBOKS — Stitch-stil

### C1. Utseende
- Border-radius: 1.5rem
- Bakgrunn: #373840
- **INGEN skillelinje** mellom tekst og knapper
- 20px mellom tekstområde og knapperad
- Mobilvennlig, responsiv
- Knapper i bunnen med god spacing

### C2. Aktive items i chatboksen
- Bakgrunn: #3c4043
- Mer padding topp/bunn enn sidene (12px tb, 8px lr)

### C3. Repo-velger i chatboksen
- Dropdown inne i chatboks for å velge repo
- Vises som chip/tag

### C4. Suggestion chips (ny komponent: SuggestionChips.tsx)
- Vises over chatboksen i velkomsttilstand
- Bakgrunn: #2d3032, border: #3c4043, radius: 20px
- Eksempler: "Bygg en booking-app", "Lag en REST API", "Fiks auth-systemet"
- Klikk → fyller chatboksen med teksten

---

## D. POPUP-MENYER — Stitch-stil

### D1. Generell popup-stil (ny komponent: StitchPopup.tsx)
- Bakgrunn: #373840
- Border-radius: 12px
- Subtil skygge
- Hvert item: bold tittel + beskrivelse i textMuted + ikon + checkmark på valgt
- Samme gradient/stil som Stitch sin model-velger

### D2. Brukes på:
- Model-velger dropdown
- Notifications (bjella) — **FIKS: vis tekst, IKKE JSON**
- Skills dropdown
- Repo-velger dropdown

---

## E. SUB-AGENTER — i chatten

- **FJERN fra sidebar** — sub-agenter vises IKKE i sidebar lenger
- Vises INNE I chatten, under hovedagentens arbeidskort
- L-pil ned fra hovedagenten til hver sub-agent
- Hvert sub-agent kort: rolle, status, hva den jobber med
- **Stopp-knapp** ved siden av aktive agenter
- Main agent har oversikt over sub-agent status
- **Kostnadsbanner** rett under topbar (over chat-meldinger):
  - Vises NÅR sub-agenter er aktive
  - Tekst: "Sub-agenter er aktive — dette medfører ekstra kostnad"
  - Mulighet for å deaktivere sub-agenter direkte fra banneret
  - Forsvinner når sub-agenter skrus av

---

## F. AGENT-TRANSPARENS

- Agent viser resonnement i chatten
- Viser: minner brukt, skills aktivert, kontekstfiler, valg tatt
- Collapsbar "Vis resonering" toggle
- AgentReasoningCard komponent (allerede opprettet, verifiser at den fungerer)

---

## G. BUGFIKSER (fra tidligere samtaler)

### G1. "Tenker..." animasjon ✅ FIKSET
- Skjules nå når assistant har svart

### G2. Chat refresh ⚠️ DELVIS FIKSET
- Mye rar refresh av chat-sider under/før/etter godkjenning
- Sjekk at debouncing fungerer

### G3. "La TheFold sove" ✅ FIKSET
- Knapp renamed, spinner lagt til

### G4. Prune minner ✅ FIKSET
- Kaller nå /memory/cleanup + /memory/decay

### G5. Skills-siden ⚠️ DELVIS FIKSET
- Create-knapp er der, tips-boks lagt til
- MEN: brukeren sier det fremdeles er rot — må gjennomgås visuelt med ny design

### G6. Slett-knapper ⚠️ SJEKK
- Slett-knapper skal være synlige (ikke skjult/lav kontrast)
- Verifiser med nye farger

### G7. Varsler viser JSON ⚠️ DELVIS FIKSET
- parseContent() finnes men noen meldinger faller gjennom
- Fiks med ny Stitch popup-stil

### G8. Varsler sender til tom cowork ⚠️ DELVIS FIKSET
- Routing med ?conv= er lagt til
- MEN: må teste at det faktisk fungerer

---

## H. OPPGAVEVISNING

### H1. ExpandableTaskCard ✅ OPPRETTET
- Expand nedover, horisontal meny (Detaljer/Rapporter/Logg)
- Firkantede borders inne i oppgaven
- PR-lenke i Detaljer
- Review-data i Rapporter (kvalitetsscore, filantall, bekymringer)
- Reelt kostnadsforbruk (tokens, USD, varighet) per fase

### H2. Tasks-side ✅ OMSKREVET
- Bruker ExpandableTaskCard
- Reviews-tab bruker også expandable kort

### H3. Auto-side ✅ OMSKREVET
- Ferdige oppgaver filtrert bort
- Chat-input i bunnen
- Beta-label

### H4. Estimert tokens → reell kostnad ✅ FIKSET
- Viser nå faktisk tokenforbruk fra /agent/metrics/task
- Per-fase breakdown med modell, tokens, USD

---

## I. NY SIDE — Kostnadsoversikt (💰-ikon i topbar)

- Ny side/popup som viser:
  - Daglig kostnad (USD)
  - Totalt forbruk siste 7/30 dager
  - Tokens brukt (input/output)
  - Success rate (% oppgaver fullført vs feilet)
  - **Totalt antall oppgaver** (tall, ikke liste)
  - **Totalt antall minner** (tall, ikke liste)
- Tilgjengelig fra 💰-ikon i topbar
- Henter data fra /agent/metrics/phases + /tasks/stats + /memory/stats

---

## J. IKONER

### J1. Drømmer ✅ ENDRET
- Sparkles → Moon

### J2. Hukommelse ✅ ENDRET
- Database → Brain

### J3. Logo-ikon
- **FJERNES** — erstattes av "TheFold" bold tekst + BETA badge i topbar

---

## GJENSTÅR Å GJØRE (prioritert rekkefølge)

1. **tokens.ts** — Stitch farger + Google Sans
2. **globals.css** — ✅ FERDIG (Google Sans + flat #202124)
3. **TopBar.tsx** — Ny: TheFold bold + BETA + ikoner
4. **layout.tsx** — Total omskriving: topbar + ny sidebar med tabs/søk/samtaler
5. **ChatComposer.tsx** — Velkomst: "Velkommen til TheFold." + suggestions + Stitch chatboks
6. **ChatInput.tsx** — Ingen skillelinje, #373840 bg, aktiv item #3c4043
7. **SuggestionChips.tsx** — Ny: klikkbare suggestion chips
8. **StitchPopup.tsx** — Ny: gjenbrukbar popup-meny
9. **cowork/page.tsx** — Wire opp: velkomst vs aktiv samtale, sidebar samtaler
10. **NotifBell.tsx** — Stitch popup-stil, fiks JSON → tekst
11. **AgentStream.tsx** — Sub-agenter med L-pil inline i chat
12. **SubAgentSidebarItem.tsx** — Fjern fra sidebar, flytt logikk til chat
13. **Kostnadsoversikt** — Ny side/popup med totaler
14. **AAA kontrastsjekk** — Verifiser alle fargepar
15. **Hardkodede farger** — Scan og fiks resterende

---

## FILER — OVERSIKT

### Endres
| Fil | Status |
|-----|--------|
| `globals.css` | ✅ Ferdig |
| `tokens.ts` | 🔧 Må oppdateres |
| `layout.tsx` (root) | 🔧 Fjern CDN links |
| `layout.tsx` (dashboard) | 🔧 Total omskriving |
| `ChatComposer.tsx` | 🔧 Omskriving |
| `ChatInput.tsx` | 🔧 Omskriving |
| `ChatContainer.tsx` | 🔧 Flytt knapper |
| `NotifBell.tsx` | 🔧 Stitch popup |
| `cowork/page.tsx` | 🔧 Omskriving |
| `AgentStream.tsx` | 🔧 Sub-agenter inline |
| `auto/page.tsx` | ✅ Ferdig |
| `tasks/page.tsx` | ✅ Ferdig |
| `dreams/page.tsx` | ✅ Ferdig |
| `memory/page.tsx` | ✅ Ferdig |
| `skills/page.tsx` | ⚠️ Visuell gjennomgang |

### Nye filer
| Fil | Status |
|-----|--------|
| `TopBar.tsx` | 🆕 Ny |
| `SuggestionChips.tsx` | 🆕 Ny |
| `StitchPopup.tsx` | 🆕 Ny |
| `CostOverview.tsx` (eller side) | 🆕 Ny |
| `ExpandableTaskCard.tsx` | ✅ Ferdig |
| `AgentReasoningCard.tsx` | ✅ Ferdig |
| `useSubAgentStatus.ts` | ✅ Ferdig (må refaktoreres) |

### Slettes/fjernes
| Fil/element | Grunn |
|-------------|-------|
| Logo-ikon i sidebar | Erstattes av tekst i topbar |
| Sub-agenter i sidebar | Flyttes til chat |
| Inter font-filer | Ikke i bruk |
| Plus Jakarta Sans CDN | Erstattes av Google Sans |
| Geist Mono CDN | Erstattes av Google Sans |

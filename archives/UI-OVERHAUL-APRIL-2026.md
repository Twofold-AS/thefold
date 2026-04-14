# TheFold UI Overhaul - April 2026

Komplett oversikt over alle endringer som skal gjennomfores. Bruk denne filen som sjekkliste under jobbing.

---

## Fase 1: Farger og tema

- [ ] Oppdater `frontend/src/lib/tokens.ts` med nytt fargepalett fra designbildene
- [ ] Oppdater `frontend/src/app/globals.css` med nye CSS custom properties
- [ ] Bakgrunn: gradient (se bilde 2 for referanse)
- [ ] Bytt alle farger: primary, secondary, accent, border, surface, text
- [ ] Legg inn semantic variables: success (a0/a10/a20), warning, danger, info
- [ ] Kjor AAA kontrastsjekk programmatisk pa alle fargekombinasjoner
- [ ] Verifiser at ingen farger kolliderer visuelt

### Berørte filer
- `frontend/src/lib/tokens.ts`
- `frontend/src/app/globals.css`
- `frontend/tailwind.config.ts` (om nødvendig)

---

## Fase 2: Layout og navigasjon

- [ ] Fjern "TheFold" tekst fra sidebar, behold kun ikon (venstrejustert)
- [ ] Flytt "skjul sidebar"-knapp ned rett over bjella (notification icon)
- [ ] "Hva kan TheFold bygge for deg?" — senter pa siden, større tekst, TheFold Brand font
- [ ] Chatboks flyttes helt ned pa siden
- [ ] Border rundt chatboksen
- [ ] CoWork-layout: alt er feilaktig i toppen, ma restructureres
- [ ] Flytt repo-valg fra sidebar inn i chatboksen for CoWork og Auto

### Berørte filer
- `frontend/src/app/(dashboard)/layout.tsx` (sidebar)
- `frontend/src/app/(dashboard)/cowork/page.tsx`
- `frontend/src/components/chat/ChatComposer.tsx`
- `frontend/src/components/chat/ChatContainer.tsx`
- `frontend/src/components/chat/MessageInput.tsx`
- `frontend/src/lib/repo-context.tsx`

---

## Fase 3: Ikoner og visuelle endringer

- [ ] Bytt ikon for Drømmer (na: Sparkles) — finn noe mer passende
- [ ] Bytt ikon for Hukommelse (na: Database) — finn noe mer passende
- [ ] Sørg for at alle action-knapper er synlige (slett-knapper etc.)
- [ ] Alt "inne i" noe annet skal ha firkantede borders (knapper inne i oppgaver osv.)

### Berørte filer
- `frontend/src/app/(dashboard)/layout.tsx` (sidebar icons)
- Diverse komponentfiler der knapper er skjult

---

## Fase 4: Bugfiks

### 4a: "Tenker..." animasjon henger igjen
- [ ] ThinkingBlock vises etter AI har svart — ma skjules nar svar er ferdig
- Fil: `frontend/src/components/chat/ThinkingBlock.tsx`
- Fil: `frontend/src/components/chat/MessageWithAgent.tsx` (logikk for visning)

### 4b: Chat refresh-problemer
- [ ] Rar refresh av chat-sider under/før/etter godkjenning og sending
- Fil: `frontend/src/hooks/useAgentStream.ts`
- Fil: `frontend/src/app/(dashboard)/cowork/page.tsx`

### 4c: Forsvunnede sider
- [ ] Prosjekter, Reviews og andre opprettede sider har forsvunnet
- Sjekk sidebar-navigasjon i `layout.tsx`
- Sjekk at routes finnes under `frontend/src/app/(dashboard)/`
- Verifiser: `projects/page.tsx`, `review/[id]/page.tsx`, `builds/page.tsx`

### 4d: "Kjør drøm na" knappen
- [ ] Knappen gjor ingenting — ingen spinner, bare rar refresh
- [ ] Legg til spinner/feedback ved klikk
- [ ] Endre tekst til "La TheFold sove"
- Fil: `frontend/src/app/(dashboard)/dreams/page.tsx`

### 4e: "Prune minner" knappen
- [ ] Alert vises, bruker trykker ja, men ingenting skjer med minnene
- [ ] Sjekk API-kall og respons-handling
- Fil: `frontend/src/app/(dashboard)/memory/page.tsx`
- Sjekk: `frontend/src/lib/api/memory.ts`

### 4f: Skills-siden
- [ ] Kan ikke lage nye skills
- [ ] Siden virker ubrukelig — forbedre UX
- Fil: `frontend/src/app/(dashboard)/skills/page.tsx`

---

## Fase 5: Auto-siden

- [ ] Fiks spacing og layout — matcher ikke resten av appen, veldig rotete
- [ ] Legg til "Beta" label i sidebar ved Auto
- [ ] Gjor det mulig a skrive/chatte med Auto-agenten (slik som CoWork)
- [ ] Redesign oppgavevisning:
  - [ ] Oppgaver utvider seg nedover (ikke vertikal split)
  - [ ] Horisontal knappemeny inne i oppgaven (feks "Rapporter")
  - [ ] Firkantede borders pa alt inne i oppgaven
- [ ] Repo-valg integrert i chatboksen
- [ ] Auto = tjeneste der TheFold far en stor task, jobber uten reviews, tester alt selv, leverer rapport til slutt

### Berørte filer
- `frontend/src/app/(dashboard)/auto/page.tsx`
- `frontend/src/app/(dashboard)/layout.tsx` (Beta label)
- Muligens nye komponenter for task-expansion view

---

## Fase 6: Sub-agenter

- [ ] Vis sub-agenter i sidebar under CoWork/Auto med L-formet pil
- [ ] Klikk pa sub-agent for a se hva den jobber med og hvorfor
- [ ] Mulighet for a stoppe individuelle agenter
- [ ] Main CoWork-agent far oversikt over sub-agent status (stopp/start/ferdig)
- [ ] Sub-agenter dukker opp i sidebar nar sub-agent-knappen er aktivert
- [ ] Ny sub-agent sidebar-seksjon med "Agent #1", "Agent #2" etc.

### Berørte filer
- `frontend/src/app/(dashboard)/layout.tsx` (sidebar sub-agent list)
- `frontend/src/components/chat/WorkCard.tsx` (eksisterende sub-agent visning)
- Nye komponenter for sub-agent sidebar items
- `frontend/src/hooks/useAgentStream.ts` (sub-agent status tracking)
- Backend: sjekk om `agent/agent.ts` og `ai/orchestrate-sub-agents.ts` eksponerer nok data

---

## Fase 7: Agent-transparens

- [ ] Vis agentens resonnement i chatten
- [ ] Vis valg gjort med referanse til memory, skills og kontekst
- [ ] Sjekk om backend allerede sender reasoning-data (ThinkingBlock bruker dette?)
- [ ] Implementer UI for a vise "hvorfor agenten valgte det den valgte"
- [ ] Tidligere diskutert men aldri implementert

### Berørte filer
- `frontend/src/components/chat/MessageWithAgent.tsx`
- `frontend/src/components/chat/ThinkingBlock.tsx`
- Backend: `agent/agent.ts`, `agent/helpers.ts` (reportProgress)
- Backend: `ai/ai.ts` (reasoning output)

---

## Fase 8: Prosjekt/repo-system

- [ ] Flytt repo-valg fra sidebar inn i chatboksen (CoWork + Auto)
- [ ] Design bedre system for a se og handtere prosjekter og repos
- [ ] Enklere oversikt over aktive prosjekter

### Berørte filer
- `frontend/src/lib/repo-context.tsx`
- `frontend/src/app/(dashboard)/layout.tsx`
- `frontend/src/components/chat/ChatComposer.tsx`
- `frontend/src/components/chat/MessageInput.tsx`
- `frontend/src/app/(dashboard)/projects/page.tsx`

---

## Fase 9: Verifisering

- [ ] Full AAA kontrastsjekk pa alle nye fargekombinasjoner
- [ ] Visuell test av alle 22 sider
- [ ] Verifiser at alle bugfikser fungerer
- [ ] Test responsivt design (mobile sidebar)
- [ ] Test SSE/streaming fortsatt fungerer etter endringer
- [ ] Test alle CRUD-operasjoner (skills, tasks, memory)

---

## Referansebilder

1. **Bilde 1** (image5.png): Fargepalett — primary, secondary, accent farger
2. **Bilde 2** (image4.png): Gradient bakgrunn referanse
3. **Bilde 3** (image2.png): Semantic variables — error, warning, success, info med a0/a10/a20 varianter

---

## Nøkkelfiler — hurtigreferanse

| Fil | Formal |
|-----|--------|
| `frontend/src/lib/tokens.ts` | Design tokens (farger, spacing, fonts) |
| `frontend/src/app/globals.css` | CSS custom properties, animasjoner |
| `frontend/src/app/(dashboard)/layout.tsx` | Sidebar + hovedlayout |
| `frontend/src/app/(dashboard)/cowork/page.tsx` | CoWork-side |
| `frontend/src/app/(dashboard)/auto/page.tsx` | Auto-side |
| `frontend/src/app/(dashboard)/dreams/page.tsx` | Drømmer-side |
| `frontend/src/app/(dashboard)/memory/page.tsx` | Hukommelse-side |
| `frontend/src/app/(dashboard)/skills/page.tsx` | Skills-side |
| `frontend/src/components/chat/ThinkingBlock.tsx` | "Tenker..." animasjon |
| `frontend/src/components/chat/ChatContainer.tsx` | Chat-container |
| `frontend/src/components/chat/ChatComposer.tsx` | Initial chat composer |
| `frontend/src/components/chat/MessageInput.tsx` | Meldingsinput |
| `frontend/src/components/chat/WorkCard.tsx` | Agent work/sub-agent visning |
| `frontend/src/hooks/useAgentStream.ts` | SSE streaming + status |
| `frontend/src/lib/repo-context.tsx` | Repo-valg kontekst |

Se på følgende filer før du begynner:
- agent/agent.ts (executeTask — ALLE report/reportSteps-kall, think(),
  hele flyten fra STEP 1 til STEP 12)
- agent/review.ts (approveReview — sjekk at memory.store er
  fire-and-forget etter BA/BB)
- frontend/src/components/agent/AgentStatus.tsx (dispatcher)
- frontend/src/components/agent/AgentWorking.tsx (steps-rendering,
  plan-steg, lastThought)
- frontend/src/components/agent/AgentReview.tsx (review-knapper,
  timeout, agent_thought JSON-bug)
- frontend/src/components/agent/AgentComplete.tsx
- frontend/src/components/agent/types.ts (AgentStatusMessage)
- frontend/src/components/agent/parseAgentMessage.ts
- frontend/src/components/agent/StepList.tsx (ikon-animasjoner)
- frontend/src/components/agent/PhaseTab.tsx (bakgrunnsfarge, animasjon)
- frontend/src/app/(dashboard)/repo/[name]/reviews/page.tsx
  (review-liste — bredde, repo-filter)
- frontend/src/app/(dashboard)/review/[id]/page.tsx
  (kode-font, "Tilbake"-lenke)
- frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx
  (agent_thought rendering, mistet kontakt, AgentComplete)
- frontend/src/app/(dashboard)/chat/page.tsx (samme)
- frontend/src/app/(dashboard)/layout.tsx (sidebar — robot-ikon animasjon)
- frontend/src/app/(dashboard)/repo/[name]/activity/page.tsx
  (aktivitet — ikon-farger, agent-navn, robot-ikon)
- chat/chat.ts (PubSub subscriber — agent_thought lagring)
- frontend/src/app/globals.css
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

=== BUG 1: agent_thought vises som rå JSON i chat ===

Tanke-meldingene vises som rå JSON i chatten i stedet for formaterte
💭-bobler. Sjekk BEGGE chat-sider:
1. Når agent_thought-melding mottas via SSE/polling, parser den content?
2. Er det message_type som filtreres på, eller content.type?
3. Sjekk chat.ts subscriber — lagres thought som:
   a) content = JSON string med { type: "agent_thought", thought: "..." }
   b) content = bare thought-teksten?
   
FIX: Sørg for at:
- chat.ts subscriber lagrer BARE thought-teksten som content
  (IKKE hele JSON-objektet)
- Frontend sjekker messageType === "agent_thought" og rendrer som
  💭-boble (text-xs, italic, opacity-50)
- Hvis content er JSON, parse og vis bare .thought-feltet

=== BUG 2: Review-boksen i chat vises ikke ===

Brukeren fikk IKKE review-boksen med Godkjenn/Avvis-knapper i chatten.
Måtte gå til review-fanen for å godkjenne.

Sjekk i begge chat-sider:
1. Kommer agent_status med phase:"Venter" og reviewData gjennom?
2. AgentReview-komponenten — vises den når phase === "Venter"?
3. Kanskje agent_thought-meldingene overskriver/erstatter agent_status?

FIX: Sørg for at:
- agent_status (med phase/steps/reviewData) og agent_thought er
  UAVHENGIGE strømmer — thoughts skal IKKE erstatte status
- Når status er "Venter" med reviewData, vis AgentReview MED knapper
- agent_thought-bobler vises I TILLEGG til status-boksen, ikke i stedet

=== BUG 3: "Mistet kontakt" under review-ventetid ===

Når agenten venter på brukerens review-godkjenning, viser frontend
"Mistet kontakt" etter en stund. Dette skjer sannsynligvis fordi:
1. Polling-intervallet timer ut
2. SSE-connection lukkes
3. Frontend tror oppgaven er stoppet

FIX: Når task status er "needs_input" eller "in_review":
- Polling skal FORTSETTE (ikke timeout)
- Vis "Venter på godkjenning" — IKKE "Mistet kontakt"
- Legg til i polling-logikken: if (status === 'needs_input' ||
  status === 'in_review') → fortsett polling, vis "Venter på deg"

=== BUG 4: Reviews viser reviews fra andre repoer ===

Review-listen på /repo/[name]/reviews/ viser ALLE reviews, ikke bare
de for dette repoet.

FIX: I reviews/page.tsx, send repoName til listReviews API-kallet:
  const reviews = await agent.listReviews({ repoName: repo })

Backend listReviews har allerede repoName-parameter (ifølge BA-rapport).
Sørg for at frontend sender den.

=== ENDRING 1: Fjern "Leser oppgave" etc. fra status-boksen ===

Stegene "Leser oppgave", "Henter prosjektstruktur", "Henter kontekst",
"Plan klar: N steg" er interne forberedelser som brukeren ikke trenger
å se.

FIX: I AgentWorking (eller reportSteps i agent.ts):
- Fjern disse forberedelsesstegene fra steps-listen
- Start med å vise steg FRA og MED bygge-fasen:
  ● Builder kjører
  ● Forsøk 1/5
  ✓ 2 filer skrevet
  ● Validerer kode

Brukeren ser forberedelsesfasen gjennom 💭 tanke-feeden i stedet.

Alternativt: vis forberedelsessteg, men FADE dem ut etter 3 sekunder
slik at de forsvinner fra listen.

=== ENDRING 2: Vis oppgavene (sub-tasks) i status-boksen ===

Brukeren ønsker å se OPPGAVENE (hva som bygges) i status-boksen:
- index.html (create) ✓
- style.css (create) ●

Disse finnes i plan.plan som steg med filePath og action.
Vis dem som en kompakt liste under progress-indikatoren.

=== ENDRING 3: Review-listen skal strekke seg 100% ===

Reviews-siden er plassert i midten og strekker seg ikke full bredde.

FIX: I reviews/page.tsx, fjern max-width/center-constrainten.
Tabellen skal bruke full bredde av innholdsområdet (w-full).

=== ENDRING 4: Kode-visning i review skal bruke TheFold-font ===

I review/[id]/page.tsx, kode-blokkene bruker standard monospace.

FIX: Legg til TheFold Brand font på kode-blokker i review:
  font-family: 'TheFold Brand', monospace;

Eller lag en CSS-klasse .code-thefold som brukes på pre/code-elementer
i review-visningen.

=== ENDRING 5: Aktivitet-fanen ===

I activity/page.tsx:
1. Ikon-farger: ALLE ikoner skal være HVITE. Fjern fargekodingen.
2. "TheFold svarte" → skal bruke agent-navnet + robotikon:
   Bruk Bot-ikonet fra lucide-react (samme som sidebar chat-ikon)
   Vis "Jørgen André" (agent-navnet) i stedet for "TheFold"
   ... eller vis det faktiske agent-displayname fra DB.
3. Verktøy-ikoner: også hvite

=== ENDRING 6: Agent status — fjern animasjoner og bakgrunnsfarge ===

I StepList.tsx / PhaseTab.tsx:
1. Fjern ALLE CSS-animasjoner på ikoner (bounce, pulse, spin, etc.)
2. Fjern bakgrunnsfarge på PhaseTab uansett status (ingen grønn/rød/gul
   bakgrunn). Bare tekst + ikon med riktig farge. Bakgrunnen skal
   alltid være transparent eller standard card-bg.

=== ENDRING 7: Sidebar — fjern animasjon på robot-ikon ===

I layout.tsx sidebar:
- Bot-ikonet for chat-knappene skal IKKE ha animasjon
- Fjern CSS animation, hover-animation, og transition på ikonet
- Ikonet skal bare være et statisk robot-ikon

=== IKKE GJØR ===
- Ikke endre createPR-logikken
- Ikke endre assessConfidence eller confidence-threshold
- Ikke endre shouldStopTask-logikken
- Ikke endre sandbox eller builder
- Ikke endre sidebar-fonten (bare animasjonen)
- Ikke endre approve-flyten (BA/BB fikset dette)

=== ETTER DU ER FERDIG ===
- Kjør: cd frontend && npm run build (verifiser ingen feil)
- Oppdater GRUNNMUR-STATUS.md
- Oppdater KOMPLETT-BYGGEPLAN.md under Prompt BC
- Gi meg rapport med:
  1. Hva som ble fullført
  2. Hva som IKKE ble gjort og hvorfor
  3. Bugs oppdaget
  4. Forslag til videre arbeid
Se på følgende filer før du begynner:
- github/github.ts (createPR — empty-repo if-blokken)
- agent/agent.ts (autoInitRepo-funksjonen og executeTask)
- agent/review.ts (listReviews, approveReview, hele review-endepunkter)
- frontend/src/app/(dashboard)/review/page.tsx (review-listen)
- frontend/src/app/(dashboard)/review/[id]/page.tsx (review-detaljer)
- frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx (chat-side med AgentStatus)
- frontend/src/components/AgentStatus.tsx (status-boksen som vises under oppgaver)
- chat/chat.ts (PubSub agent report subscriber)
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

KONTEKST:
createPR fungerer nå for tomme repos. Men det er 4 problemer å fikse:

=== DEL 1: autoInitRepo — legg til delay etter Contents API ===

I createPR sin empty-repo if-blokk (github/github.ts), legg til en liten
delay mellom Contents API-kallet og getRefSha-kallet:

  await ghApi(`/repos/${req.owner}/${req.repo}/contents/README.md`, {
    method: "PUT",
    body: {
      message: "Initial commit — TheFold",
      content: Buffer.from(`# ${req.repo}\n\nInitialized by TheFold\n`).toString("base64"),
    },
  });

  // GitHub needs a moment to propagate the new branch
  await new Promise(resolve => setTimeout(resolve, 2000));

  baseSha = await getRefSha(req.owner, req.repo, "main");

Legg til retry-logikk: hvis getRefSha fortsatt returnerer null etter delay,
prøv én gang til med 3 sekunder ekstra delay. Først etter to mislykkede
forsøk, kast feilen.

=== DEL 2: Reviews — filtrering per repo + UI-fix ===

Problem 1: /review-siden viser reviews fra ALLE repos. Reviews bør filtreres
per repo når brukeren er i repo-kontekst.

Backend (agent/review.ts):
- Oppdater listReviews endepunktet til å akseptere en valgfri `repoName?: string`
  parameter
- Når repoName er satt, filtrer SQL-spørringen med WHERE repo_name = $repoName
  (eller tilsvarende — sjekk hva som finnes i code_reviews tabellen)
- Når repoName ikke er satt, returnér alle reviews (for /review global-siden)

Frontend:
- /review (global): vis alle reviews som nå (ingen repoName-filter)
- Hvis det finnes en repo-spesifikk review-side, send repoName som parameter

Problem 2: Review-listen krymper i bredde etter navigering inn/ut av et review.
I review/page.tsx:
- Sørg for at tabellen/listen bruker `width: 100%` og `min-width: 0`
- Slett-knappen og "Ja/Nei" bekreftelsen skal IKKE endre layout-bredden
- Bruk `table-layout: fixed` eller `flex: 1` for å holde stabil bredde
- Test at bredden er konsistent ved: initial load, etter navigering tilbake
  fra /review/[id], og etter sletting av en review

=== DEL 3: AgentStatus-boksen — bedre visning ===

Problem 1: Tittelen viser "Plan: 1. [innhold]" to ganger — en gang som tittel
og en gang som steg-beskrivelse. Fjern dupliseringen.

Problem 2: Vis "Utfører plan X/Y" i stedet for bare "Plan: 1."
- Når agenten har en plan med N steg, vis "Utfører plan 1/N" som undertittel
- Oppdater for hvert steg som fullføres: "Utfører plan 2/N", etc.

Problem 3: Vis alle oppgaver agenten jobber med, inkludert auto-genererte
- autoInitRepo oppretter en "Initialiser repo" oppgave som ikke vises i boksen
- Alle oppgaver som agenten starter (enten bruker-opprettede eller auto-genererte)
  skal være synlige i AgentStatus-boksen
- Vis dem som en liste med status per oppgave (working/done/failed)

=== DEL 4: Rapport i chat når oppgave fullføres ===

Når agenten fullfører en oppgave (status: completed, phase: Ferdig), skal det
vises en synlig melding i chatten — ikke bare en status-oppdatering via PubSub.

I agent/agent.ts (eller review.ts ved approveReview):
- Etter at PR er opprettet og task er satt til "done", send en chat-melding
  via chat.addSystemMessage (eller tilsvarende) med:
  - PR-URL
  - Antall filer endret
  - Kvalitetsscore fra review
  - Totalt kostnad (costUsd)
- Denne meldingen skal vises som en vanlig TheFold-melding i chat-historikken
  (ikke som en agent_status PubSub-event som forsvinner)

Sjekk chat/chat.ts for om det finnes en addSystemMessage eller lignende funksjon.
Hvis ikke, lag en intern funksjon som inserter en melding med role="assistant"
i chat_messages tabellen.

=== IKKE GJØR ===
- Ikke endre createPR-logikken utover å legge til delay + retry
- Ikke endre sandbox, builder, eller AI-tjenestene
- Ikke endre Linear-integrasjonen (den feilen er kjent og separat)

=== ETTER DU ER FERDIG ===
- Oppdater GRUNNMUR-STATUS.md med endringene
- Oppdater KOMPLETT-BYGGEPLAN.md under ny prompt-seksjon
- Gi meg rapport med:
  1. Hva som ble fullført (filer endret, funksjoner lagt til)
  2. Hva som IKKE ble gjort og hvorfor
  3. Bugs, edge cases eller svakheter oppdaget
  4. Forslag til videre arbeid
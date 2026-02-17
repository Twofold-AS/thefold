Se på følgende filer før du begynner:
- github/github.ts (HELE filen — spesielt createPR-funksjonen og CreatePRResponse-typen)
- agent/review.ts (HELE filen — spesielt approveReview, rejectReview, og alle endepunkter)
- agent/db.ts (database-referanse)
- sandbox/sandbox.ts (destroy-endepunktet)
- github/github.test.ts (eksisterende tester)
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

KONTEKST:
createPR feiler med GitHub API 409 "Git Repository is empty" for repos som ikke har noen commits.
Feilen skjer to steder:
1. autoInitRepo() kaller createPR → 409 fordi createPR antar at main-branch finnes
2. approveReview() kaller createPR → 409 av samme grunn

Loggen viser dette tydelig:
- Linje 72: ERR endpoint=createPR "GitHub API error 409: Git Repository is empty" (autoInitRepo)
- Linje 337: ERR endpoint=createPR "GitHub API error 409: Git Repository is empty" (approveReview)

createPR starter med `ghApi(/repos/.../git/ref/heads/main)` som feiler fordi main-branch ikke eksisterer i et tomt repo.

I tillegg mangler review-systemet mulighet til å slette gamle/feilede reviews.

DEL 1 — Fix createPR for tomme repos (github/github.ts):

1. Lag en helper-funksjon `getRefSha(owner, repo, branch)`:
   - Kaller `ghApi(/repos/${owner}/${repo}/git/ref/heads/${branch})`
   - Ved suksess: returnerer `data.object.sha`
   - Ved 404 ELLER 409: returnerer `null` (ikke throw)
   - Ved andre feil: throw som normalt

2. Oppdater createPR med empty-repo-flyt:
   - Kall `getRefSha(owner, repo, "main")` i stedet for direkte ghApi-kall
   - Hvis baseSha === null (tomt repo):
     a. Opprett en initial commit på main:
        - Lag blob for README.md med innhold: `# ${repo}\n\nInitialized by TheFold`
        - Lag tree med denne ene bloben (UTEN base_tree — ny rot-tree)
        - Lag commit UTEN parents (tom parents-array)
        - Opprett ref `refs/heads/main` som peker til denne committen
     b. Bruk denne nye committen som baseSha
     c. Fortsett med normal PR-flyt (blobs → tree → commit → branch → PR)
   - Hvis baseSha !== null: normal flyt som i dag (ingen endring)

3. Fjern `directPush` fra CreatePRResponse-typen (om det ikke allerede er gjort)

4. Skriv tester i github.test.ts:
   - Test: getRefSha returnerer null for 404
   - Test: getRefSha returnerer null for 409
   - Test: getRefSha returnerer sha for gyldig ref
   - Test: createPR med tomt repo oppretter initial commit + PR
   - Test: createPR med eksisterende repo fungerer som normalt

DEL 2 — Review-sletting (agent/review.ts):

1. Legg til endepunkt POST /agent/review/delete:
   - Input: { reviewId: string }
   - Henter reviewen fra DB
   - Hvis reviewen har en sandboxId og status er 'pending': kall sandbox.destroy()
   - Slett reviewen fra code_reviews tabellen
   - Oppdater tilhørende task-status til 'cancelled' via tasks.updateTaskStatus()
   - Returnerer { deleted: true }
   - Auth: true, expose: true

2. Legg til endepunkt POST /agent/review/cleanup:
   - Ingen input (tom request)
   - Finner alle reviews med status 'pending' som er eldre enn 24 timer
   - For hver: destroyer sandbox (hvis den finnes), sletter reviewen
   - Returnerer { deleted: number, errors: number }
   - Auth: true, expose: true

3. Legg til endepunkt POST /agent/review/delete-all:
   - Ingen input
   - Sletter ALLE reviews uavhengig av status og alder
   - Destroyer alle tilknyttede sandboxer
   - Returnerer { deleted: number }
   - Auth: true, expose: true
   - MERK: Farlig endepunkt — bare for utvikling/testing

4. Oppdater frontend review-listen (/review-siden):
   - Legg til en "Slett"-knapp (søppelbøtte-ikon) på hver review i listen
   - Legg til en "Rydd opp" knapp øverst som kaller /review/cleanup
   - Bekreftelsesdialog før sletting
   - Oppdater listen etter sletting

IKKE GJØR:
- Ikke endre agent.ts (executeTask, autoInitRepo — de er fine, problemet er i createPR)
- Ikke endre orchestrator.ts
- Ikke endre sandbox-servicen
- Ikke endre getTree (den håndterer tomme repos allerede)
- Ikke endre noe annet i github.ts enn createPR og CreatePRResponse

ETTER AT DU ER FERDIG:
- Oppdater GRUNNMUR-STATUS.md:
  - createPR: marker som 🟢 med note om empty-repo-støtte
  - Review-endepunkter: legg til delete, cleanup, delete-all
- Oppdater KOMPLETT-BYGGEPLAN.md med hva som ble gjort under ny prompt-seksjon
- Gi meg en rapport med:
  1. Hva som ble fullført (filer endret, funksjoner lagt til)
  2. Hva som IKKE ble gjort og hvorfor
  3. Bugs, edge cases eller svakheter oppdaget
  4. Forslag til videre arbeid
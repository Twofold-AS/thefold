# Prompt AL — Review Godkjenn/Avvis + Chat Review UX

`git pull` først.

## FEIL FRA LOGG

**Godkjenn (linje 449):**
```
GitHub API error 403: Resource not accessible by personal access token
endpoint=createPR → endpoint=approveReview FAILED
```
GitHub PAT har ikke write-tilgang til repoet.

**Avvis (linje 493):**
```
unable to parse uuid
endpoint=rejectReview FAILED
```
Frontend sender ugyldig UUID til rejectReview.

## Les HELE disse filene FØR du endrer:
```bash
# Backend
cat agent/agent.ts | head -50          # Se exports
grep -rn "approveReview\|rejectReview\|requestChanges\|createPR" agent/
cat agent/review.ts 2>/dev/null || grep -rn "Review\|review" agent/

# Frontend review-side
find frontend/src -name "*review*" -o -name "*Review*" | head -10
cat frontend/src/app/(dashboard)/repo/[name]/reviews/[id]/page.tsx 2>/dev/null

# Frontend chat — review melding
grep -rn "review\|Venter på input\|gjennomgang\|Bekymring" frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx | head -20

# GitHub permissions
grep -rn "github_pat\|GITHUB_TOKEN\|access.token" agent/ github/ | head -10
```

---

## FIX 1: GitHub PAT permissions (KRITISK — DETTE ER IKKE EN KODEFEIL)

### Problem
PAT-en brukt for å lage PRs har ikke `contents: write` scope. Den kan klone (read) men ikke pushe (write).

### Fiks
Dette er en KONFIGURASJON, ikke kode. Fortell brukeren:

> GitHub PAT trenger `contents: write` og `pull_requests: write` scope for å lage PRs.
> Gå til GitHub Settings → Developer settings → Personal access tokens → Oppdater tokenet.

Men sjekk OGSÅ om koden håndterer denne feilen gracefully:

```bash
grep -rn "createPR\|403\|permissions\|accessible" agent/ github/
```

I `approveReview`, wrap createPR med feilhåndtering som gir en forståelig melding:

```typescript
try {
  await github.createPR(params);
} catch (e: any) {
  if (e?.message?.includes("403") || e?.message?.includes("not accessible")) {
    throw new Error("GitHub-tokenet har ikke skrivetilgang til dette repoet. Oppdater PAT med 'contents: write' og 'pull_requests: write' scopes.");
  }
  throw e;
}
```

---

## FIX 2: rejectReview UUID-feil (KRITISK)

### Problem
Frontend sender noe som ikke er en gyldig UUID til rejectReview.

### Diagnose
```bash
# Se hva frontend sender
grep -rn "rejectReview\|reject.*review\|avvis" frontend/src/app/(dashboard)/repo/[name]/reviews/
grep -rn "reviewId\|review_id\|params.id" frontend/src/app/(dashboard)/repo/[name]/reviews/
```

Mest sannsynlig bruker frontend `params.id` fra URL-en som er review-ID. Sjekk om det er en UUID eller en slug.

```bash
# Se review-URL format
grep -rn "reviews/\[" frontend/src/app/ | head -5
```

Fiks: Sørg for at review-IDen som sendes er en gyldig UUID:

```typescript
// I frontend review action handler
const handleReject = async () => {
  const reviewId = params.id; // Kan dette være en slug?
  console.log("[DEBUG-AL] rejectReview with id:", reviewId);
  
  // Sjekk at det er en gyldig UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(reviewId)) {
    console.error("[DEBUG-AL] Invalid UUID for review:", reviewId);
    // Kanskje reviewId er en slug — hent UUID fra review data
    // ...
    return;
  }
  
  await rejectReview(reviewId, feedback);
};
```

### Alternativ: Backend bruker feil parameter-type
Sjekk backend:
```bash
grep -n "rejectReview" agent/review.ts agent/agent.ts
```

Kanskje endpointet forventer UUID men mottar streng. Sjekk API-definisjon og parametertyper.

---

## FIX 3: Chat review-melding — forenkle UX (HØY)

### Problem
Bildet viser:
1. Duplikat tekst (tittel = innhold)
2. Emojier (👀, ❓) i meldingen — ser uprofesjonelt ut
3. "Skriv svar her..." input som sender til hovedchat
4. Teksten er for lang og detaljert

### Fiks
Finn hvor review-meldingen genereres i chatten. Det er sannsynligvis i:
- `agent/agent.ts` — report() sender meldingen
- `agent/review.ts` — review-resultat formateres
- `chat/chat.ts` — Pub/Sub lagrer meldingen

```bash
grep -rn "gjennomgang\|Bekymring\|Venter på input\|Se review" agent/ chat/
```

### Ny format for review-melding i chat:
Fjern emojier. Kort og konsist. Lenk til review-siden.

```typescript
// I agent review report — fjern emojier, forenkle
const reviewMessage = [
  `Kode klar for gjennomgang — Kvalitet: ${score}/10, ${filesChanged} fil${filesChanged > 1 ? 'er' : ''} endret.`,
  concerns.length > 0 ? `Bekymringer: ${concerns.join(', ')}` : '',
  `Se detaljer og godkjenn: /repo/${repoName}/reviews/${reviewId}`,
].filter(Boolean).join('\n');
```

### Fjern "Skriv svar her..." input i review-melding
I frontend chat-side, IKKE vis et ekstra input-felt for review-meldinger. Brukeren kan svare i hovedchatten eller gå til review-siden.

```bash
grep -rn "Skriv svar\|input.*review\|review.*input" frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx
```

Hvis det finnes et eget input-felt for review-meldinger, fjern det. Legg heller til knapper:

```tsx
{msg.messageType === "review_waiting" && (
  <div className="flex gap-2 mt-2">
    <Link href={`/repo/${repoName}/reviews/${msg.meta?.reviewId}`}>
      <button className="px-3 py-1.5 text-sm rounded" style={{ 
        background: "var(--bg-tertiary)", 
        color: "var(--text-primary)",
        fontFamily: "var(--font-body)"
      }}>
        Se review
      </button>
    </Link>
    <button onClick={() => handleApproveFromChat(msg.meta?.reviewId)} 
      className="px-3 py-1.5 text-sm rounded"
      style={{ background: "var(--accent-primary)", color: "#000" }}>
      Godkjenn
    </button>
  </div>
)}
```

---

## FIX 4: Review-side font (MEDIUM)

### Problem
Noen tekst på review-siden bruker en annen font enn resten av appen.

### VIKTIG: Font-regler
- `TheFold Brand` (thefold.woff2) brukes KUN for "TheFold"-logoteksten. IKKE for vanlig tekst.
- Resten av appen bruker de fontene som allerede er definert i globals.css / layout.tsx / tailwind config.

### Fiks
```bash
# Finn hvilke fonter som brukes globalt
grep -rn "fontFamily\|font-family\|--font" frontend/src/app/globals.css frontend/src/app/layout.tsx | head -20
grep -rn "fontFamily\|font-family" frontend/src/components/ | head -10

# Finn hva review-siden bruker
grep -rn "fontFamily\|font-family\|font-sans\|font-mono\|TheFold" frontend/src/app/(dashboard)/repo/[name]/reviews/
```

Sørg for at review-siden bruker SAMME fonter som resten av dashboard-sidene (tasks, chat, settings osv). Ikke hardkod fonter — bruk CSS-variabler eller Tailwind-klasser som allerede er definert. Sjekk hva andre sider bruker og kopier det mønsteret.

IKKE bruk `TheFold Brand` for vanlig tekst — den er kun for logo.

---

## OPPSUMMERING

| # | Hva | Rotårsak | Prioritet |
|---|-----|----------|-----------|
| 1 | Godkjenn feiler | GitHub PAT mangler write scope | KRITISK (config) |
| 2 | Avvis feiler | Ugyldig UUID til rejectReview | KRITISK |
| 3 | Chat review UX | Emojier, duplikat, ekstra input | HØY |
| 4 | Review font | Feil font brukt | MEDIUM |

## VIKTIG: GitHub PAT
Skriv ut en tydelig melding til brukeren om at GitHub PAT trenger oppdaterte scopes. Koden kan ikke fikse dette.

## Oppdater dokumentasjon
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

## Rapport
Svar på:
1. Hva er GitHub PAT-feilen? Hvilke scopes trengs?
2. Hva sendes som reviewId til rejectReview? Er det UUID eller slug?
3. Hvor genereres review-meldingen i chat? Fjernes emojiene?
4. Fjernes "Skriv svar her..." input i chat?
5. Bruker review-siden nå riktig font overalt?
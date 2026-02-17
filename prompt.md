# Prompt AP — Håndter tomme GitHub-repoer

`git pull` først.

## OVERSIKT

| # | Hva | Prioritet |
|---|-----|-----------|
| 1 | createPR feiler på tomt repo — push direkte til main | KRITISK |
| 2 | "Jørgen André tenker" spinner forsvinner ikke etter Lukk | HØY |
| 3 | Ferdig-melding sendes ikke etter godkjenning pga createPR-crash | HØY |

---

## Les disse filene FØR du endrer:

```bash
# GitHub createPR — hva feiler?
cat github/github.ts
grep -rn "createPR\|createRef\|getRef\|base.*main\|refs/heads" github/github.ts

# Agent approve — hva skjer når createPR feiler?
grep -rn "createPR\|approveReview" agent/review.ts | head -20

# Frontend spinner
grep -rn "tenker\|thinking\|sending\|waitingForReply\|agentActive" frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx | head -20
```

---

## FIX 1: createPR håndterer tomt repo (KRITISK)

### Problem
Linje 411 i loggen:
```
GitHub API error 409: Git Repository is empty
endpoint=createPR → get-a-reference
```

`createPR` prøver å hente `refs/heads/main` for å bruke som base for PR. Tomt repo har ingen branches → 409.

### Løsning
Når repo er tomt, push filer DIREKTE til main (ikke via PR). Flyten:

1. Prøv normal PR-flyt (getRef → createBlob → createTree → createCommit → createRef → createPR)
2. Hvis getRef feiler med 409 "Git Repository is empty":
   - Lag initial commit direkte på main
   - Returner `{ url: "direct-push", directPush: true }` i stedet for PR-URL

### Implementasjon i `github/github.ts`

```typescript
export const createPR = api(
  { method: "POST", path: "/github/pr", expose: false },
  async (req: CreatePRRequest): Promise<CreatePRResponse> => {
    const token = githubToken();
    const { owner, repo, branch, title, body, files } = req;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    };

    // STEG 1: Sjekk om repo er tomt ved å hente default branch ref
    let baseSha: string;
    let isEmptyRepo = false;

    try {
      const refRes = await fetch(`${baseUrl}/git/refs/heads/main`, { headers });
      if (refRes.status === 409) {
        // Repo er tomt — ingen branches
        isEmptyRepo = true;
      } else if (!refRes.ok) {
        // Prøv "master" som fallback
        const masterRes = await fetch(`${baseUrl}/git/refs/heads/master`, { headers });
        if (masterRes.status === 409) {
          isEmptyRepo = true;
        } else if (!masterRes.ok) {
          throw new Error(`Could not find base branch: ${refRes.status}`);
        } else {
          const masterData = await masterRes.json();
          baseSha = masterData.object.sha;
        }
      } else {
        const refData = await refRes.json();
        baseSha = refData.object.sha;
      }
    } catch (e: any) {
      if (e?.message?.includes("409") || e?.message?.includes("empty")) {
        isEmptyRepo = true;
      } else {
        throw e;
      }
    }

    // STEG 2: Lag blobs for alle filer
    const blobPromises = files.map(async (file) => {
      const blobRes = await fetch(`${baseUrl}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: file.content,
          encoding: "utf-8",
        }),
      });
      if (!blobRes.ok) throw new Error(`Failed to create blob: ${blobRes.status}`);
      const blobData = await blobRes.json();
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blobData.sha,
      };
    });

    const treeItems = await Promise.all(blobPromises);

    if (isEmptyRepo) {
      // === TOMT REPO: Push direkte til main ===
      console.log(`[DEBUG-AP] Empty repo detected, pushing directly to main`);

      // Lag tree UTEN base_tree (tomt repo)
      const treeRes = await fetch(`${baseUrl}/git/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tree: treeItems }),
      });
      if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
      const treeData = await treeRes.json();

      // Lag commit UTEN parent (initial commit)
      const commitRes = await fetch(`${baseUrl}/git/commits`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: title || "Initial commit from TheFold",
          tree: treeData.sha,
          // INGEN parents — dette er initial commit
        }),
      });
      if (!commitRes.ok) throw new Error(`Failed to create commit: ${commitRes.status}`);
      const commitData = await commitRes.json();

      // Lag refs/heads/main som peker til denne commit
      const refCreateRes = await fetch(`${baseUrl}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref: "refs/heads/main",
          sha: commitData.sha,
        }),
      });
      if (!refCreateRes.ok) throw new Error(`Failed to create ref: ${refCreateRes.status}`);

      return {
        url: `https://github.com/${owner}/${repo}/commit/${commitData.sha}`,
        number: 0,  // Ingen PR-nummer
        directPush: true,
      };
    }

    // === NORMAL FLYT: Lag PR ===
    // ... eksisterende PR-logikk med baseSha ...
    // (behold hele den eksisterende koden herfra)
  }
);
```

### Oppdater CreatePRResponse type

```typescript
interface CreatePRResponse {
  url: string;
  number: number;
  directPush?: boolean;  // Ny: true hvis pushet direkte (tomt repo)
}
```

### Oppdater approveReview for directPush

I `agent/review.ts` — `approveReview`:

```typescript
const prResult = await github.createPR(prParams);

if (prResult.directPush) {
  // Tomt repo — pushet direkte, ingen PR å vise
  console.log(`[DEBUG-AP] Direct push to empty repo: ${prResult.url}`);
  
  // Send melding om direkte push
  await agentReports.publish({
    taskId,
    conversationId: review.conversationId,
    status: "completed",
    content: `Review godkjent — kode pushet direkte til main (nytt repo): ${prResult.url}`
  });
} else {
  // Normal PR
  await agentReports.publish({
    taskId,
    conversationId: review.conversationId,
    status: "completed",
    content: `Review godkjent — PR opprettet: ${prResult.url}`
  });
}
```

---

## FIX 2: "Jørgen André tenker" spinner etter Lukk (HØY)

### Problem
Etter å lukke Feilet-boksen med "Lukk" vises fremdeles "Jørgen André · tenker · 57s".

### Rotårsak
`statusDismissed` skjuler AgentStatus-boksen, men `showThinking` beregnes uavhengig og viser thinking-indikatoren.

### Fiks
Når statusDismissed er true, skjul OGSÅ thinking-indikatoren:

```typescript
// I chat page
const showThinking = useMemo(() => {
  if (statusDismissed) return false;  // ← NYTT: Lukk fjerner alt
  if (cancelled) return false;
  return sending || waitingForReply;
}, [sending, waitingForReply, cancelled, statusDismissed]);
```

ELLER bedre — når bruker trykker Lukk på en Feilet-boks, reset ALL agent-state:

```typescript
const handleDismissStatus = () => {
  setLastAgentStatus(null);
  setStatusDismissed(true);
  setStatusOverride(null);
  setSending(false);
  setWaitingForReply(false);
  // Reset polling
  setPollMode?.("idle");
};
```

---

## FIX 3: Ferdig-melding garanti (HØY)

### Problem
Etter godkjenning, hvis createPR feiler, sendes ingen ferdig/feilet-melding til chat. Frontend viser "Feilet" via optimistisk oppdatering, men backend har ikke oppdatert noe.

### Fiks
I approveReview, wrap createPR i try/catch og ALLTID send status:

```typescript
export const approveReview = async (req) => {
  let prResult;
  
  try {
    prResult = await github.createPR(prParams);
  } catch (e: any) {
    console.error("[DEBUG-AP] createPR failed:", e?.message);
    
    // Send feilet-status
    await agentReports.publish({
      taskId,
      conversationId: review.conversationId,
      status: "failed",
      content: JSON.stringify({
        type: "agent_status",
        phase: "Feilet",
        title: "PR-opprettelse feilet",
        error: e?.message?.includes("409") 
          ? "Repoet er tomt — kan ikke lage PR uten initial commit"
          : e?.message || "Ukjent feil",
        steps: [
          { label: "Kode skrevet", status: "done" },
          { label: "Validert", status: "done" },
          { label: "Review godkjent", status: "done" },
          { label: "PR opprettelse", status: "failed" }
        ]
      })
    });
    
    // Sett task til blocked med tydelig feilmelding
    await tasks.updateTaskStatus({ 
      id: taskId, 
      status: "blocked", 
      errorMessage: `PR feilet: ${e?.message}` 
    });
    
    throw e; // Re-throw så frontend får 500
  }
  
  // Suksess — send ferdig
  // ... resten av eksisterende kode
};
```

---

## Oppdater dokumentasjon
- GRUNNMUR-STATUS.md — legg til "Tomme repoer håndtert" 
- KOMPLETT-BYGGEPLAN.md — changelog

## Rapport
Svar på:
1. Hva skjer nå når createPR kalles på et tomt repo?
2. Har du testet extractRepoFromConversationId med ekte conversation_id format?
3. Forsvinner "Jørgen André tenker" etter Lukk nå?
4. Sendes feilet/ferdig Pub/Sub ALLTID etter approve, uansett createPR-resultat?
5. Hva er response format for directPush vs normal PR?
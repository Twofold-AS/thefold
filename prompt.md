KRITISK FEIL — denne prompten fikser en blokkerende bug som har feilet 3 ganger.

STEG 1 — Les HELE createPR-funksjonen:
Åpne github/github.ts og les createPR-funksjonen fra start til slutt. 
Skriv ut de første 5 linjene i funksjonen til terminalen med cat/grep.

STEG 2 — Verifiser at feilen finnes:
createPR krasjer med GitHub API 409 "Git Repository is empty" fordi den
kaller ghApi(`/repos/${owner}/${repo}/git/ref/heads/main`) som feiler for
tomme repos (repos uten noen commits). Sjekk om det finnes en getRefSha
helper eller noen form for 404/409-håndtering rundt dette kallet.
Skriv ut resultatet: finnes den eller ikke?

STEG 3 — Implementer fixen:
Uavhengig av hva du finner i steg 2, skriv HELE createPR-funksjonen på nytt
med denne logikken:
```typescript
// Helper: get SHA of a ref, returns null if ref doesn't exist (404/409)
async function getRefSha(owner: string, repo: string, branch: string): Promise<string | null> {
  try {
    const data = await ghApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return data.object.sha;
  } catch (error: any) {
    const status = error?.message?.includes("404") || error?.message?.includes("409");
    if (status) return null;
    throw error;
  }
}
```

Og i createPR, erstatt steg 1-2 med:
```typescript
let baseSha = await getRefSha(req.owner, req.repo, "main");

if (baseSha === null) {
  // Empty repo — create initial commit on main
  const readmeBlob = await ghApi(`/repos/${req.owner}/${req.repo}/git/blobs`, {
    method: "POST",
    body: { content: Buffer.from(`# ${req.repo}\n\nInitialized by TheFold`).toString("base64"), encoding: "base64" },
  });
  
  const initTree = await ghApi(`/repos/${req.owner}/${req.repo}/git/trees`, {
    method: "POST",
    body: { tree: [{ path: "README.md", mode: "100644", type: "blob", sha: readmeBlob.sha }] },
  });
  
  const initCommit = await ghApi(`/repos/${req.owner}/${req.repo}/git/commits`, {
    method: "POST",
    body: { message: "Initial commit — TheFold", tree: initTree.sha, parents: [] },
  });
  
  await ghApi(`/repos/${req.owner}/${req.repo}/git/refs`, {
    method: "POST",
    body: { ref: "refs/heads/main", sha: initCommit.sha },
  });
  
  baseSha = initCommit.sha;
}

// Now baseSha is guaranteed to be valid
const baseCommit = await ghApi(`/repos/${req.owner}/${req.repo}/git/commits/${baseSha}`);
// ... rest of createPR continues as normal
```

STEG 4 — Verifiser endringen:
Etter at du har skrevet koden, les createPR-funksjonen igjen og skriv
ut de første 20 linjene for å bevise at getRefSha brukes.

STEG 5 — Kjør testene:
Kjør `encore test ./github/...` og rapporter resultatet.

IKKE GJØR:
- Ikke si "dette er allerede implementert" uten å BEVISE det med kode-output
- Ikke endre noe annet enn createPR-funksjonen i github.ts
- Ikke endre agent.ts, orchestrator.ts, review.ts, eller noe annet

Oppdater GRUNNMUR-STATUS.md med at createPR nå støtter tomme repos.

Gi meg rapport med hva som ble gjort, inkludert de 20 første linjene av
den nye createPR-funksjonen som bevis.
# Prompt AJ — Sandbox fallback cleanup + Frontend timer stopp

`git pull` først.

## ROTÅRSAK (fra debug-logg)

```
[DEBUG-AI] Clone with --branch main failed, trying without branch...
fatal: destination path '...\repo' already exists and is not an empty directory.
[DEBUG-AI] Clone failed entirely, creating empty repo...
error: remote origin already exists.
```

3-level fallback feiler fordi mappen ikke slettes mellom forsøk. Level 1 oppretter partial mappe, level 2/3 feiler fordi den finnes.

Les HELE sandbox/sandbox.ts FØR du endrer:
```bash
cat sandbox/sandbox.ts
```

## FIX 1: Slett repo-mappe mellom fallback-forsøk (KRITISK)

Finn git clone fallback-logikken i sandbox.ts. Legg til `rmSync`/`rm -rf` mellom hvert forsøk:

```typescript
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import * as path from "path";

// Level 1: Clone med branch
try {
  execSync(`git clone --depth 1 --branch ${ref} ${cloneUrl} ${repoPath}`, { stdio: "pipe" });
  console.log("[DEBUG-AJ] Clone with branch succeeded");
} catch (e1) {
  console.warn("[DEBUG-AJ] Clone with --branch failed, cleaning up...");
  
  // SLETT partial mappe fra mislykket clone
  if (existsSync(repoPath)) {
    rmSync(repoPath, { recursive: true, force: true });
  }
  
  // Level 2: Clone uten branch
  try {
    execSync(`git clone ${cloneUrl} ${repoPath}`, { stdio: "pipe" });
    console.log("[DEBUG-AJ] Clone without branch succeeded");
  } catch (e2) {
    console.warn("[DEBUG-AJ] Clone without branch failed, creating empty repo...");
    
    // SLETT partial mappe igjen
    if (existsSync(repoPath)) {
      rmSync(repoPath, { recursive: true, force: true });
    }
    
    // Level 3: Lag tom repo
    mkdirSync(repoPath, { recursive: true });
    execSync(`git init`, { cwd: repoPath, stdio: "pipe" });
    execSync(`git remote add origin ${cloneUrl}`, { cwd: repoPath, stdio: "pipe" });
    writeFileSync(path.join(repoPath, ".gitkeep"), "");
    execSync(`git add .`, { cwd: repoPath, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: repoPath, stdio: "pipe" });
    console.log("[DEBUG-AJ] Empty repo created with git init");
  }
}
```

**Windows-kompatibilitet**: `rmSync` med `{ recursive: true, force: true }` fungerer på Windows. Alternativt bruk `execSync('rmdir /s /q "${repoPath}"')` men det er mindre portabelt.

**NB**: Sjekk om sandbox.ts bruker `exec` (async) eller `execSync` (sync). Tilpass koden deretter. Hvis async:
```typescript
import { rm } from "fs/promises";

// Mellom forsøk:
await rm(repoPath, { recursive: true, force: true });
```

---

## FIX 2: Frontend — Timer stopper ikke ved feil (HØY)

### Problem
"Jørgen André · Forhekser · tenker · 100s" fortsetter å telle selv etter at agenten har krasjet og sendt "Feilet"-status.

Les frontend:
```bash
cat frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx
```

### Sjekk
```bash
grep -n "agentActive\|Feilet\|thinkingSeconds\|showThinking\|setThinkingSeconds" frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx | head -20
```

### Problemet
Tenker-indikatoren vises med `{showThinking && !agentActive && (...)}`. Men `agentActive` oppdateres bare når frontend poller og ser en agent_status melding med phase "Feilet". 

Mulige årsaker:
1. Polling henter ikke nye meldinger raskt nok → agent_status "Feilet" ikke sett
2. `lastAgentStatus` oppdateres, men `agentActive` sjekker ikke riktig phase
3. `showThinking` forblir true fordi `sending` eller `waitingForReply` er true

### Fiks A: Sjekk at Feilet-status stopper timeren
Verifiser at `agentActive` blir false når phase er "Feilet":
```typescript
const agentActive = useMemo(() => {
  if (!lastAgentStatus) return false;
  const phase = lastAgentStatus.phase;
  if (phase === "Ferdig" || phase === "Feilet") return false; // ← SJEKK DETTE
  if (!lastAgentStatus.meta?.taskId) return false;
  return true;
}, [lastAgentStatus]);
```

### Fiks B: showThinking må OGSÅ stoppe ved feil
Sjekk om det er en agent-feilmelding i chat som gjør at `waitingForReply` forblir true. Feilmeldingen fra agenten lagres som vanlig melding, men den har kanskje `message_type: "agent_report"` som filtreres ut.

Sjekk filteret i message-rendering:
```typescript
// Filtrer ut tomme + agent_status, men BEHOLD agent_report (feilmeldinger)
messages.filter(m => 
  m.content?.trim() &&
  m.messageType !== "agent_status"
  // agent_report BEHOLDES — dette er feilmeldinger som skal vises
)
```

### Fiks C: Timeout-sikkerhet
Legg til en timeout som stopper timeren etter 120 sekunder uansett:
```typescript
useEffect(() => {
  if (!showThinking) {
    setThinkingSeconds(0);
    return;
  }
  const interval = setInterval(() => {
    setThinkingSeconds(prev => {
      if (prev >= 120) {
        // Safety timeout — stopp etter 2 minutter
        return prev; // Stopp telleren men hold indikatoren
      }
      return prev + 1;
    });
  }, 1000);
  return () => clearInterval(interval);
}, [showThinking]);
```

---

## FIX 3: AgentStatus-boks ved feil — vis feilmelding (MEDIUM)

Når agenten feiler, bør AgentStatus-boksen vise "Feilet" med feilmeldingen, ikke bare forsvinne.

Pub/Sub sender allerede: `{"type":"agent_status","phase":"Feilet","steps":[{"label":"an internal error occurred","status":"error"}]}`

Sjekk at `AgentStatus.tsx` håndterer `phase: "Feilet"`:
```bash
grep -n "Feilet\|error\|failed" frontend/src/components/AgentStatus.tsx
```

AgentStatus-boksen bør:
1. Vise "Feilet" i header
2. Vise error-steget med rød farge
3. IKKE forsvinne umiddelbart (gi brukeren tid til å se feilen)

---

## OPPSUMMERING

| # | Hva | Rotårsak | Prioritet |
|---|-----|----------|-----------|
| 1 | Sandbox fallback crash | Mappe ikke slettet mellom clone-forsøk | KRITISK |
| 2 | Timer stopper ikke | Feilet-status ikke mottatt/prosessert | HØY |
| 3 | AgentStatus feilvisning | Boks forsvinner ved Feilet i stedet for å vise feil | MEDIUM |

## Oppdater dokumentasjon
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

## Rapport
Svar på:
1. Slettes repo-mappen nå mellom fallback-forsøk? Hvordan?
2. Hva skjer med `agentActive` når phase er "Feilet"?
3. Stopper `showThinking`/timeren korrekt ved agent-feil?
4. Viser AgentStatus-boksen feilmeldingen?
5. Test: "Lag index.html med h1 Test" — krasjer sandbox fortsatt?
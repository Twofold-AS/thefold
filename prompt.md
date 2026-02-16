Legg også inn i skills/page.tsx headeren:

"+ Ny skill" skal være en CELLE i headeren — ikke en knapp i ml-auto. Den skal se ut som de andre fase-celle-knappene, plassert helt til høyre:
```tsx
{/* Ny skill som celle — SISTE celle i headeren */}
<button
  onClick={() => setShowCreate(true)}
  className="px-4 flex items-center text-sm ml-auto"
  style={{
    borderLeft: "1px solid var(--border)",
    minHeight: "80px",
    color: "var(--text-muted)",
  }}
>
  + Ny skill
</button>
```

Fjern den nåværende "Ny skill" knappen som ligger i en div med ml-auto. Erstatt med cellen over. Den skal ha borderLeft (ikke borderRight) siden den er siste celle.

Les frontend/src/lib/api.ts — finn apiFetch funksjonen.
Les ai/ai.ts — finn executeToolCall → start_task case.
Les agent/agent.ts — finn executeTask og hvordan den kalles.
Les frontend/src/app/(dashboard)/repo/[name]/tasks/page.tsx — finn handleSoftDelete og deleted-seksjonen.

---

FIX 1: apiFetch krasjer på tom respons (KRITISK)

Problem: Noen endpoints returnerer tom body (void/204). apiFetch kaller alltid res.json() som feiler.

I api.ts, endre apiFetch — erstatt `const data = await res.json()` med:
```typescript
const text = await res.text();

if (!text || text.length === 0) {
  return {};
}

let data;
try {
  data = JSON.parse(text);
} catch {
  return {};
}
```

---

FIX 2: start_task feiler (KRITISK)

Les ai/ai.ts executeToolCall → start_task. Sjekk:

1. Kaller den agent.executeTask() riktig?
2. Hva er signaturen til executeTask? Matcher parameterne?
3. Er det en import-feil?
4. Er executeTask eksponert (expose: true) eller intern (expose: false)?

Legg til logging:
```typescript
case "start_task": {
  console.log("START_TASK called with:", JSON.stringify(input));
  console.log("repoName:", req.repoName);
  console.log("conversationId:", req.conversationId);
  
  try {
    // ... eksisterende kode
  } catch (e) {
    console.error("START_TASK FAILED:", e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

---

FIX 3: Slett-knapp flytter ikke task til "Slettet" visuelt (BUG)

Problem: Når man klikker slett, forsvinner tasken fra hovedlisten (bra), men den dukker IKKE opp i "Slettet" seksjonen. Etter full page refresh vises den korrekt i "Slettet". Gjenopprett fungerer perfekt.

Rotårsak: deletedTasks state oppdateres sannsynligvis, men komponenten som viser "Slettet" seksjonen re-rendres ikke, ELLER den slettede tasken mangler nødvendige felter.

Debug handleSoftDelete steg for steg:

1. Sjekk at setDeletedTasks faktisk kalles med riktig task-objekt
2. Sjekk at "Slettet" seksjonen bruker deletedTasks state (ikke en separat fetch)
3. Sjekk at betingelsen for å vise "Slettet" seksjonen er `deletedTasks.length > 0`

Sannsynlig problem: "Slettet" seksjonen henter data fra et eget API-kall (listDeletedTasks) i en useEffect, og den optimistiske oppdateringen til setDeletedTasks blir overskrevet av API-responsen som ennå ikke har den nye tasken (race condition).

Fiks: Kombiner optimistisk state med API-data:
```typescript
async function handleSoftDelete(taskId: string) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  // 1. Fjern fra hovedlisten
  setTasks(prev => prev.filter(t => t.id !== taskId));
  
  // 2. Legg til i deleted-listen UMIDDELBART
  setDeletedTasks(prev => [...prev, { ...task, status: "deleted" as const }]);
  
  // 3. Kall API (ikke await — fire and forget for UI-speed)
  softDeleteTask(taskId).catch(() => {
    // Rollback ved feil
    setTasks(prev => [...prev, task]);
    setDeletedTasks(prev => prev.filter(t => t.id !== taskId));
  });
  
  // 4. IKKE kall fetchTasks() eller fetchDeletedTasks() her
}
```

Sjekk også: Er det en useEffect som poller/refresher tasks som overskriver den optimistiske state? Feks:
```typescript
useEffect(() => {
  fetchTasks();
  fetchDeletedTasks(); // ← Denne kan overskrive optimistisk state
}, [someDepency]);
```

Hvis ja — legg til en `skipNextFetch` ref:
```typescript
const skipNextFetch = useRef(false);

async function handleSoftDelete(taskId: string) {
  skipNextFetch.current = true;
  // ... optimistisk oppdatering
  await softDeleteTask(taskId);
  // Vent litt så backend har prosessert
  setTimeout(() => { skipNextFetch.current = false; }, 1000);
}

useEffect(() => {
  if (skipNextFetch.current) return;
  fetchTasks();
  fetchDeletedTasks();
}, [dependency]);
```
FIX 4:
Drop-down meny på repoer inne Skills og scope er hvit, man ser ikke repo-navnene. Endre slik at den matcher andre drop-down knapper.

---

Gi rapport med den faktiske feilmeldingen fra start_task i Encore logs.
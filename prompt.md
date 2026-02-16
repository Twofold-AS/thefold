# Agent start fix, AgentStatus live, Skills i chat, duplikat tab/boks

## Instruksjoner

Les disse filene FØR du begynner — les HELE filen:
1. `ai/ai.ts` — HELE filen. Finn executeToolCall → start_task case. Finn NØYAKTIG hva som sendes som taskId. Les ALL logging.
2. `agent/agent.ts` — HELE filen. Finn startTask, executeTask, report().
3. `chat/chat.ts` — HELE filen. Finn processAIResponse, getTree kall, agent_status meldinger, Pub/Sub subscription for agentReports.
4. `tasks/tasks.ts` — Finn getTaskInternal. Hva er parameter-typen?
5. `frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx` — HELE filen. Finn AgentStatus rendering, skills-velger, tab/boks for generering.
6. `frontend/src/components/AgentStatus.tsx` — HELE filen.
7. `frontend/src/components/ModelSelector.tsx` — Sjekk skills-knappen.
8. `skills/skills.ts` — listSkills og resolve endpoints.
9. `frontend/src/lib/api.ts` — Finn skills-relaterte API-kall.

Kjør `encore run` og test: Send "Lag en index.html med h1 som sier Hei" i testing-thefold chat. Sjekk Encore logs for START_TASK og getTaskInternal.

---

## FIX 1: start_task sender ugyldig taskId (KRITISK)

### Problem
`getTaskInternal` feiler med "unable to parse uuid". Claude sender noe annet enn UUID som taskId.

### Debug
I ai/ai.ts executeToolCall → start_task, legg til FØRST:

```typescript
case "start_task": {
  console.log("=== START_TASK DEBUG ===");
  console.log("Full input object:", JSON.stringify(input, null, 2));
  console.log("input.taskId:", input.taskId);
  console.log("typeof input.taskId:", typeof input.taskId);
```

Sjekk OGSÅ hva create_task returnerer. Returnerer den taskId som string UUID? Eller et objekt?

### Fiks: UUID-validering

```typescript
case "start_task": {
  const taskId = String(input.taskId || "").trim();
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!taskId || !uuidRegex.test(taskId)) {
    console.error("start_task: Invalid taskId:", taskId, "full input:", JSON.stringify(input));
    return { success: false, error: `Ugyldig task ID format: "${taskId}". Trenger UUID.` };
  }
  
  // Verifiser at tasken finnes
  let task;
  try {
    task = await tasks.getTaskInternal({ id: taskId });
  } catch (e) {
    console.error("start_task: getTaskInternal failed:", e);
    return { success: false, error: `Fant ikke oppgave med ID ${taskId}` };
  }
  
  if (!task?.task) {
    return { success: false, error: `Oppgave ${taskId} finnes ikke` };
  }
  
  // Start agent med riktig repo
  try {
    await agent.startTask({
      conversationId: req.conversationId,
      taskId: taskId,
      thefoldTaskId: taskId,
      userMessage: req.message || "",
      repoName: task.task.repo || req.repoName,
      repoOwner: "Twofold-AS",
    });
    
    console.log("start_task: SUCCESS for", taskId, "repo:", task.task.repo);
    return { success: true, message: `Oppgave "${task.task.title}" startet. Agenten jobber nå.` };
  } catch (e) {
    console.error("start_task: agent.startTask failed:", e);
    return { success: false, error: `Kunne ikke starte agent: ${e instanceof Error ? e.message : String(e)}` };
  }
}
```

### Fiks create_task respons

Sørg for at create_task TYDELIG returnerer UUID:

```typescript
case "create_task": {
  // ... opprett task
  const result = await tasks.createTask({ ... });
  
  return { 
    success: true, 
    taskId: result.task.id,  // MÅ være UUID
    title: result.task.title,
    message: `Oppgave opprettet med ID ${result.task.id}. Bruk start_task med denne IDen for å starte den.`
  };
}
```

---

## FIX 2: getTree feiler for tomme repoer (IGJEN)

### Problem
chat.ts linje ~590 feiler med getTree for testing-thefold (tomt repo).

### Fiks
Finn ALLE steder i chat.ts der getTree kalles. Wrap ALLE i try/catch:

```typescript
let repoContext = "";
try {
  const tree = await github.getTree({ owner: "Twofold-AS", repo: repoName });
  repoContext = tree.treeString || "";
} catch (e) {
  console.warn(`getTree failed for ${repoName} (likely empty repo):`, e);
  repoContext = "(Tomt repo — ingen eksisterende filer)";
}
```

Gjør GREP gjennom hele chat.ts for "getTree" og sørg for at HVERT kall er wrappet.

---

## FIX 3: AgentStatus-boksen forsvinner / viser ikke live oppdateringer (KRITISK)

### Problem
Boksen dukker opp kort, men forsvinner. Den viser ikke live oppdateringer fra agenten. Brukeren ser bare at AI-en sier "Oppgave startet" og deretter skjer ingenting.

### Rotårsak
AgentStatus vises kun for meldinger med messageType "agent_status". Agenten publiserer via agentReports Pub/Sub → subscription lagrer som "agent_report" meldinger → disse filtreres BORT i frontend.

### Fiks: Pub/Sub handler skal OPPDATERE agent_status, ikke lage nye agent_report

I chat.ts, finn Pub/Sub subscription for agentReports. Endre den:

```typescript
const _ = new Subscription(agentReports, "store-agent-report", {
  handler: async (report) => {
    // IKKE opprett ny agent_report melding!
    // Finn og OPPDATER eksisterende agent_status melding for denne samtalen
    
    // Map status til fase
    const phase = report.status === "working" ? "Bygger" 
      : report.status === "completed" ? "Ferdig"
      : report.status === "failed" ? "Feilet"
      : report.status === "needs_input" ? "Venter"
      : "Bygger";
    
    // Bygg oppdatert agent_status innhold
    const statusContent = JSON.stringify({
      type: "agent_status",
      phase: phase,
      steps: parseReportToSteps(report),
      questions: report.status === "needs_input" ? report.content : undefined,
    });
    
    // Prøv å oppdatere eksisterende agent_status melding
    const updated = await db.exec`
      UPDATE messages 
      SET content = ${statusContent}, metadata = ${JSON.stringify({
        taskId: report.taskId,
        status: report.status,
        prUrl: report.prUrl,
        filesChanged: report.filesChanged,
      })}
      WHERE conversation_id = ${report.conversationId} 
        AND message_type = 'agent_status'
        AND created_at = (
          SELECT MAX(created_at) FROM messages 
          WHERE conversation_id = ${report.conversationId} 
            AND message_type = 'agent_status'
        )
    `;
    
    // Hvis ingen agent_status finnes, opprett en
    // (dette skjer hvis agenten rapporterer før chat har opprettet boksen)
    if (!updated || updated === 0) {
      await db.exec`
        INSERT INTO messages (conversation_id, role, content, message_type, metadata)
        VALUES (${report.conversationId}, 'assistant', ${statusContent}, 'agent_status', 
          ${JSON.stringify({ taskId: report.taskId, status: report.status })})
      `;
    }
  },
});

function parseReportToSteps(report: AgentReport): Array<{ label: string; status: string }> {
  // Parse agentens rapport til steg for AgentStatus-boksen
  const steps: Array<{ label: string; status: string }> = [];
  
  if (report.content.includes("Leser task")) {
    steps.push({ label: "Leser oppgave", status: "done" });
  }
  if (report.content.includes("prosjektstruktur")) {
    steps.push({ label: "Leser prosjektstruktur", status: "done" });
  }
  if (report.content.includes("kontekst")) {
    steps.push({ label: "Henter kontekst", status: "done" });
  }
  if (report.content.includes("Planlegger")) {
    steps.push({ label: "Planlegger arbeidet", status: "active" });
  }
  if (report.content.includes("sandbox") || report.content.includes("Skriver")) {
    steps.push({ label: "Skriver kode", status: "active" });
  }
  if (report.content.includes("Validerer")) {
    steps.push({ label: "Validerer kode", status: "active" });
  }
  if (report.content.includes("PR") || report.content.includes("pull request")) {
    steps.push({ label: "Oppretter PR", status: "active" });
  }
  
  // Siste steg basert på status
  if (report.status === "completed") {
    steps.push({ label: "Fullført!", status: "done" });
  } else if (report.status === "failed") {
    steps.push({ label: report.content.substring(0, 100), status: "error" });
  } else if (report.status === "working") {
    // Siste aktive steg
    const lastContent = report.content.split("...")[0] || report.content;
    if (!steps.some(s => s.status === "active")) {
      steps.push({ label: lastContent.substring(0, 80), status: "active" });
    }
  }
  
  return steps;
}
```

### Frontend: Poll for oppdateringer

I repo/[name]/chat/page.tsx, sørg for at chatten poller for nye meldinger mens agenten jobber:

```typescript
// Øk polling-frekvens når agent er aktiv
const [agentWorking, setAgentWorking] = useState(false);

useEffect(() => {
  const interval = setInterval(() => {
    fetchMessages();
  }, agentWorking ? 2000 : 5000); // 2s når agent jobber, 5s ellers
  
  return () => clearInterval(interval);
}, [agentWorking]);

// Sjekk om agent er aktiv basert på siste agent_status melding
useEffect(() => {
  const lastStatus = messages.filter(m => m.messageType === "agent_status").pop();
  if (lastStatus) {
    try {
      const parsed = JSON.parse(lastStatus.content);
      setAgentWorking(parsed.phase !== "Ferdig" && parsed.phase !== "Feilet");
    } catch {}
  }
}, [messages]);
```

---

## FIX 4: Skills-velger i chat viser ingenting

### Problem
"Skills" knappen i chat-headeren viser ingen skills å velge.

### Debug
Sjekk ModelSelector.tsx eller der skills-velgeren er. Sjekk:
1. Kaller den listSkills API?
2. Hva returnerer API-et?
3. Er det en filter som ekskluderer alle skills?

### Fiks
Skills-knappen i chat-headeren bør hente aktive skills og la brukeren toggle dem:

```typescript
// Hent skills
const [availableSkills, setAvailableSkills] = useState([]);
const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);

useEffect(() => {
  listSkills().then(res => {
    const active = res.skills.filter(s => s.enabled);
    setAvailableSkills(active);
    setActiveSkillIds(active.map(s => s.id));
  });
}, []);
```

I dropdown/popover for skills:
```tsx
{availableSkills.map(skill => (
  <label key={skill.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer">
    <input
      type="checkbox"
      checked={activeSkillIds.includes(skill.id)}
      onChange={() => toggleSkill(skill.id)}
    />
    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{skill.name}</span>
    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{skill.taskPhase}</span>
  </label>
))}
```

Send activeSkillIds med i chat-requesten slik at backend vet hvilke skills som er aktivert for denne samtalen.

---

## FIX 5: Tab og boks viser duplikat (IGJEN)

### Problem
Taben viser "Genererer..." med loading-sirkel, OG boksen viser "Forklarer..." med loading-sirkel. Duplikat tekst og duplikat animasjon.

### Regler
**Tab** = magisk, leken indikator. Roterer gjennom morsomme tekster med EGNE SVG-animasjoner (ikke samme som boksen).
**Boks** (AgentStatus) = seriøs, detaljert visning med steg-for-steg. Bruker eksisterende fase-ikoner (tannhjul, hammer, osv).

Tab og boks skal ALDRI bruke samme tekst eller samme animasjon.

### Tab-tekster — roter tilfeldig hvert 3. sekund:

```typescript
const magicPhrases = ["Tryller", "Glitrer", "Forhekser", "Hokus Pokus", "Alakazam"];

const [phraseIndex, setPhraseIndex] = useState(0);

useEffect(() => {
  if (!isGenerating) return;
  const interval = setInterval(() => {
    setPhraseIndex(prev => {
      let next;
      do { next = Math.floor(Math.random() * magicPhrases.length); } while (next === prev);
      return next;
    });
  }, 3000);
  return () => clearInterval(interval);
}, [isGenerating]);
```

### Tab SVG-animasjoner — unike per frase:

Hvert ord har sin egen SVG-animasjon. IKKE gjenbruk boksen sine ikoner:

```tsx
const magicIcons: Record<string, JSX.Element> = {
  "Tryller": (
    // Tryllestav med gnister
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="3" y1="17" x2="14" y2="6" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" values="0 8.5 11.5;-5 8.5 11.5;5 8.5 11.5;0 8.5 11.5" dur="2s" repeatCount="indefinite" />
      </line>
      <circle cx="14" cy="6" r="1" fill="currentColor">
        <animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="16" cy="4" r="0.5" fill="currentColor">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="0.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="15" cy="3" r="0.5" fill="currentColor">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  ),
  "Glitrer": (
    // Stjerner som blinker
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z">
        <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="scale" values="1;0.8;1.1;1" dur="1.2s" repeatCount="indefinite" additive="sum" />
      </path>
      <path d="M15 10l0.7 2 2 0.7-2 0.7-0.7 2-0.7-2-2-0.7 2-0.7z" opacity="0.6">
        <animate attributeName="opacity" values="0.6;1;0.3;0.6" dur="0.9s" repeatCount="indefinite" />
      </path>
      <path d="M5 12l0.5 1.5 1.5 0.5-1.5 0.5-0.5 1.5-0.5-1.5-1.5-0.5 1.5-0.5z" opacity="0.4">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
      </path>
    </svg>
  ),
  "Forhekser": (
    // Magisk sirkel som spinner
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="10" cy="10" r="7" strokeDasharray="4 3">
        <animateTransform attributeName="transform" type="rotate" values="0 10 10;360 10 10" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="10" cy="10" r="3" strokeDasharray="2 2">
        <animateTransform attributeName="transform" type="rotate" values="360 10 10;0 10 10" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="10" cy="10" r="1" fill="currentColor">
        <animate attributeName="r" values="1;1.5;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  ),
  "Hokus Pokus": (
    // Hatt med kanin-ører
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 16h8M7 16l1-8h4l1 8" strokeLinecap="round" />
      <ellipse cx="10" cy="8" rx="4" ry="1" />
      <path d="M9 7c0-2-1-4-1-5M11 7c0-2 1-4 1-5" strokeLinecap="round">
        <animate attributeName="d" values="M9 7c0-2-1-4-1-5M11 7c0-2 1-4 1-5;M9 7c0-2-2-3-2-5M11 7c0-2 2-3 2-5;M9 7c0-2-1-4-1-5M11 7c0-2 1-4 1-5" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>
  ),
  "Alakazam": (
    // Lyn/energi
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M11 2L6 10h4l-1 8 7-10h-4l2-6z">
        <animate attributeName="opacity" values="1;0.5;1;0.7;1" dur="0.8s" repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="scale" values="1;1.05;0.95;1" dur="0.8s" repeatCount="indefinite" additive="sum" />
      </path>
    </svg>
  ),
};
```

### Tab rendering:

```tsx
{isGenerating && (
  <div className="flex items-center gap-2 px-3 py-1">
    <span style={{ color: "var(--text-muted)" }}>
      {magicIcons[magicPhrases[phraseIndex]]}
    </span>
    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
      {magicPhrases[phraseIndex]}
    </span>
  </div>
)}
```

### Boks (AgentStatus) — beholdes som den er
Boksen bruker eksisterende ikoner (tannhjul, hammer, lupe, osv) og tekster ("Forbereder", "Analyserer", "Bygger", osv). INGEN endring.

### Kritisk: Tab og boks skal ALDRI bruke:
- Samme tekst
- Samme animasjon
- Samme loading-sirkel

---

## OPPSUMMERING

| # | Hva | Prioritet |
|---|-----|-----------|
| 1 | UUID-validering i start_task | KRITISK |
| 2 | Debug logging for start_task | KRITISK |
| 3 | create_task returnerer tydelig UUID | HØY |
| 4 | getTree try/catch i ALLE kall i chat.ts | KRITISK |
| 5 | Pub/Sub oppdaterer agent_status (ikke nye agent_report) | KRITISK |
| 6 | parseReportToSteps for live AgentStatus | HØY |
| 7 | Raskere polling (2s) når agent jobber | HØY |
| 8 | Skills-velger i chat henter og viser skills | HØY |
| 9 | Tab vs boks: fjern duplikat, tab = prikk + tekst | HØY |

## Oppdater dokumentasjon
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

## Rapport
✅ Fullført, ⚠️ Ikke fullført, 🐛 Bugs, 📋 Antall filer endret

Svar på:
1. Hva var input.taskId verdien som ble sendt til start_task?
2. Hva returnerte create_task som taskId?
3. Hvor mange getTree-kall fantes uten try/catch?
4. Fungerer agenten nå — fullførte den oppgaven?
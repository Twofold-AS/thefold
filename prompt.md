# Prompt AC — Tre Spesifikke Bugs

Du skal fikse NØYAKTIG 3 bugs. Ingen andre endringer. Les filene, forstå koden, fiks kun det som er beskrevet.

`git pull` først.

---

## BUG 1: "missing field errorMessage" CRASH

### Symptom
Hele appen krasjer med: `unable to decode response body: task: missing field errorMessage at line 1 column 711`

### Årsak
`errorMessage` ble lagt til i Task-typen som REQUIRED (ikke optional). Men eksisterende tasks i DB har NULL i error_message-kolonnen. Encore sin JSON-dekoder krever at alle required felter finnes.

### Fix — NØYAKTIG disse endringene:

**Fil: tasks/types.ts**
Finn `errorMessage` i Task interface. Endre fra:
```typescript
errorMessage: string;
```
til:
```typescript
errorMessage?: string;
```

**Fil: tasks/tasks.ts**
Finn ALLE steder der Task-objekter bygges (parseTask, eller inline mapping). Sørg for at errorMessage ALLTID har en verdi (tom string, ikke undefined):
```typescript
errorMessage: row.error_message || ""
```

Kjør `grep -n "errorMessage\|error_message" tasks/tasks.ts tasks/types.ts` og fiks ALLE forekomster.

Test: Appen skal ikke krasje når tasks hentes.

---

## BUG 2: AgentStatus-boksen vises for ALLE svar — skal KUN vises for agent-oppgaver

### Symptom
Selv enkle spørsmål som "Hva er repo-navnet?" viser boksen med "Forstår forespørselen", "Henter filer", osv.

### Årsak
Backend oppretter `agent_status` meldinger for ALLE AI-kall, ikke bare agent-oppgaver.

### Fix — Backend (chat.ts):

Finn i `chat/chat.ts` ALLE steder der meldinger med `message_type = 'agent_status'` opprettes. Det er sannsynligvis i processAIResponse eller i send-endpointet.

FJERN oppretting av agent_status for vanlige chat-svar. agent_status meldinger skal KUN opprettes:
1. Av agenten via Pub/Sub subscription (reportSteps → handler)
2. Ved start_task tool (initial "Forbereder" status)

For å finne det: `grep -n "agent_status" chat/chat.ts`

Du vil sannsynligvis finne en INSERT INTO messages med message_type = 'agent_status' som kjøres for ALLE svar. Fjern den eller legg til en betingelse:

```typescript
// KUN opprett agent_status hvis en agent-task faktisk ble startet
if (agentTriggered) {
  await db.exec`INSERT INTO messages ... message_type = 'agent_status' ...`;
}
```

Eller enda bedre: Fjern INSERT-en helt fra processAIResponse. La KUN agenten (via Pub/Sub) og start_task opprette agent_status.

### Fix — Frontend (begge chat-sider):

Som ekstra sikring, sjekk at agentActive KUN er true når det er en ekte task:

```typescript
const agentActive = useMemo(() => {
  if (!lastAgentStatus) return false;
  // Sjekk metadata for taskId — uten taskId er det ikke en agent-oppgave
  try {
    const meta = typeof lastAgentStatus.metadata === "string" 
      ? JSON.parse(lastAgentStatus.metadata) 
      : lastAgentStatus.metadata;
    if (!meta?.taskId) return false;
  } catch { return false; }
  return lastAgentStatus.phase !== "Ferdig" && lastAgentStatus.phase !== "Feilet";
}, [lastAgentStatus]);
```

Test: Still et enkelt spørsmål. INGEN boks skal vises. Bare tenker-indikatoren.

---

## BUG 3: AgentStatus-boksen sin TAB bruker spinner — skal bruke MagicIcon

### Symptom  
Bildet viser: Taben øverst i boksen sier "📋 Planlegger" med en loading-spinner (○). Skal vise MagicIcon + magisk frase.

### Årsak
AgentStatus.tsx bruker fase-tekst og spinner i taben, ikke MagicIcon.

### Fix:

**Fil: frontend/src/components/AgentStatus.tsx**

1. Importer MagicIcon:
```typescript
import { MagicIcon, magicPhrases } from "./MagicIcon";
```

2. Legg til state for magisk frase-rotasjon:
```typescript
const [phraseIndex, setPhraseIndex] = useState(0);

useEffect(() => {
  const interval = setInterval(() => {
    setPhraseIndex(prev => {
      let next;
      do { next = Math.floor(Math.random() * magicPhrases.length); } while (next === prev && magicPhrases.length > 1);
      return next;
    });
  }, 3000);
  return () => clearInterval(interval);
}, []);
```

3. Finn TAB-delen av komponenten. Det er den øverste raden som viser fase-navn. Den ser ut som noe à la:

```tsx
<div>
  <span>{icon}</span> {phase}
</div>
```

ERSTATT hele tab-raden med:
```tsx
<div className="flex items-center gap-2 px-3 py-2"
  style={{ borderBottom: "1px solid var(--border)" }}>
  <span style={{ color: "var(--text-muted)" }}>
    <MagicIcon phrase={magicPhrases[phraseIndex]} />
  </span>
  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
    {magicPhrases[phraseIndex]}
  </span>
</div>
```

4. BEHOLD innholdet i boksen (stegene med "Forstår forespørselen ✓", "Henter filer ○", osv). Bare TABEN endres.

5. FJERN header-indikatoren for enkel modus. I BEGGE chat-sider, finn headeren som viser magisk frase. Den skal KUN vises i agent modus OG den trenger den ikke lenger fordi AgentStatus-boksen har MagicIcon i taben. FJERN header-indikatoren helt:

Finn og SLETT:
```tsx
{isGenerating && ... && (
  <div className="flex items-center gap-2 px-3" style={{ ... borderRight ... }}>
    <MagicIcon .../>
    <span ...>{magicPhrases[...]}</span>
  </div>
)}
```

Test: Start en agent-oppgave. Boksen viser magisk ikon + "Glitrer"/"Tryller"/etc i taben, med stegene under. Headeren viser INGENTING.

---

## OPPSUMMERING

| Bug | Hva | Fil(er) |
|-----|-----|---------|
| 1 | errorMessage optional + default tom string | tasks/types.ts, tasks/tasks.ts |
| 2 | agent_status KUN for agent-tasks, ikke vanlige svar | chat/chat.ts, begge chat-sider |
| 3 | MagicIcon i AgentStatus tab, fjern header-indikator | AgentStatus.tsx, begge chat-sider |

INGEN andre endringer. Ikke endre noe annet.

## Rapport

Svar NØYAKTIG på:
1. Hva endret du i tasks/types.ts? (vis gammel → ny linje)
2. Hvilken INSERT/kode i chat.ts opprettet agent_status for alle svar? (vis linjenummer og koden du fjernet/endret)
3. Hva var i AgentStatus.tsx sin tab FØR endringen? (vis gammel kode)
4. Hvilke linjer i chat-sidene fjernet du header-indikatoren? (vis linjenummer)
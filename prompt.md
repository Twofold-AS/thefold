Se på følgende filer før du begynner:
- agent/agent.ts (HELE filen — spesielt executeTask, planSummary, retry-loopen,
  og curated vs standard path)
- agent/review.ts (respondToClarification, forceContinue)
- chat/chat.ts (send-endepunkt — der clarification-ruting skjer)
- tasks/tasks.ts (shouldStopTask / isCancelled)
- frontend/src/components/agent/AgentClarification.tsx
- frontend/src/components/agent/AgentStopped.tsx
- frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx (polling/status-logikk)
- GRUNNMUR-STATUS.md
- KOMPLETT-BYGGEPLAN.md

KONTEKST:
Prompt AW implementerte komponent-splitting, animerte ikoner, shouldStopTask,
og clarification-UX. Rapporten identifiserte 6 problemer som må fikses.

=== FIX 1: planSummary undefined i curated path ===

BUG: planSummary refereres i retry-loopen (previousAttempt: planSummary) men
er bare definert i standard path. Når curated path kjører retry, krasjer den.

Finn alle steder planSummary brukes i agent.ts. Det er definert som:
  const planSummary = plan.plan.map((s, i) => `${i+1}. ${s.description}`).join("\n");

I standard path er dette OK fordi plan defineres rett over.

I curated path — sjekk om plan defineres FØR planSummary. Hvis curated path
har en separat plan-variabel, lag planSummary der også. Hvis curated path
deler samme plan-variabel, flytt planSummary-definisjonen til ETTER plan er
satt, utenfor if/else-blokkene, slik at begge paths bruker den.

Mønsteret bør være:
  let plan = ...; // settes i curated ELLER standard path
  let planSummary = plan.plan.map((s, i) => `${i+1}. ${s.description}`).join("\n");
  // retry-loop bruker planSummary trygt

Oppdater OGSÅ planSummary etter re-plan i retry-loopen:
  plan = await ai.planTask({ ... previousAttempt: planSummary, errorMessage ... });
  planSummary = plan.plan.map((s, i) => `${i+1}. ${s.description}`).join("\n");

=== FIX 2: forceContinue bruker tom curated context ===

BUG: Når brukeren trykker "Fortsett likevel", kalles executeTask med
forceContinue=true og tom curated context. Agenten hopper over confidence-sjekk
men har ingen fil-kontekst å jobbe med.

Fiks: forceContinue skal IKKE bruke curated path. Den skal:
  1. Sette status tilbake til in_progress
  2. Kalle executeTask med useCurated=false (standard path)
  3. Legge til forceContinue=true i options som gjør at assessConfidence
     returnerer 100% confidence uansett (skip clarification-loopen)

I agent.ts executeTask:
  - Sjekk om options?.forceContinue === true
  - Hvis ja: hopp over assessConfidence-kallet helt, gå rett til planning
  - IKKE bruk curated path — la standard path samle kontekst normalt

I agent/review.ts forceContinue-endepunktet:
  Endre fra:
    executeTask(ctx, { useCurated: true, curatedContext: {} })
  Til:
    executeTask(ctx, { forceContinue: true })

=== FIX 3: respondToClarification conversationId-kobling ===

BUG: Hvis conversationId ikke sendes med, opprettes ny konversasjon og
agenten mister konteksten fra den opprinnelige samtalen.

Fiks i respondToClarification (agent/review.ts eller agent/agent.ts):
  1. Krev conversationId som parameter: { taskId, response, conversationId }
  2. Bruk conversationId til å sette riktig ctx.conversationId
  3. I frontend: send alltid activeConvId med kallet

I chat.ts send-endepunktet (der clarification-ruting skjer):
  Når en melding rutes til respondToClarification, send med conversationId
  fra den aktive samtalen.

Sjekk at frontend sender conversationId:
  - AgentClarification.tsx / chat page kaller respondToClarification
  - Sørg for at activeConvId sendes med

=== FIX 4: Frontend task-status polling ===

Mangler: Frontend har ingen måte å oppdage at en oppgave er stoppet fra
tasks-siden. Backend sjekker shouldStopTask, men frontend viser fortsatt
"Venter på input" til neste agent_status-melding kommer.

Implementer enkel polling i chat-siden:
  - Når AgentStatus viser en aktiv oppgave (working/waiting/clarification),
    poll task-status hvert 5 sekunder
  - Kall GET eller POST /tasks/get { id: activeTaskId }
  - Hvis status er backlog/blocked/cancelled → oppdater AgentStatus til "Stopped"
  - Stopp polling når oppgave er i terminal state (done/stopped/failed)

I frontend/src/app/(dashboard)/repo/[name]/chat/page.tsx:
  useEffect(() => {
    if (!activeTaskId || !agentActive) return;
    
    const interval = setInterval(async () => {
      try {
        const task = await getTask(activeTaskId);
        const stoppedStatuses = ['backlog', 'blocked', 'cancelled'];
        if (stoppedStatuses.includes(task.status)) {
          // Oppdater agent status til stopped
          setAgentPhase('Stopped');
          setAgentContent('Oppgaven ble stoppet eksternt');
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [activeTaskId, agentActive]);

Legg til getTask i api.ts hvis den ikke finnes:
  export async function getTask(taskId: string) {
    return apiFetch<{ id: string; status: string; ... }>("/tasks/get", {
      method: "POST",
      body: { id: taskId },
    });
  }

=== FIX 5: Oppdater planSummary i retry-loopen ===

Relatert til FIX 1 — etter at plan re-genereres i retry-loopen, oppdater
planSummary slik at neste retry bruker den oppdaterte planen:

  while (attempt < MAX_RETRIES) {
    // ... validation fails ...
    plan = await ai.planTask({ ..., previousAttempt: planSummary, ... });
    planSummary = plan.plan.map((s, i) => `${i+1}. ${s.description}`).join("\n");
    continue;
  }

Uten dette sender retry alltid den ORIGINALE planen som previousAttempt,
og AI-en får ikke informasjon om hva den allerede prøvde å fikse.

=== FIX 6: forceContinue type i ExecuteTaskOptions ===

Legg til forceContinue i ExecuteTaskOptions type (agent/types.ts eller
agent/agent.ts — der typen er definert):

  interface ExecuteTaskOptions {
    useCurated?: boolean;
    curatedContext?: CuratedContext;
    forceContinue?: boolean;     // <-- ny
    userClarification?: string;  // <-- sjekk at denne finnes
  }

=== IKKE GJØR ===
- Ikke endre komponent-strukturen fra Prompt AW
- Ikke endre motion-icons
- Ikke endre PubSub-definisjoner
- Ikke endre createPR, sandbox, eller builder

=== ETTER DU ER FERDIG ===
- Oppdater GRUNNMUR-STATUS.md
- Oppdater KOMPLETT-BYGGEPLAN.md under Prompt AX
- Gi meg rapport med:
  1. Hva som ble fullført (filer endret, funksjoner fikset)
  2. Hva som IKKE ble gjort og hvorfor
  3. Bugs, edge cases eller svakheter oppdaget
  4. Forslag til videre arbeid
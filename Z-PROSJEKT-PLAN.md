# Z-PROSJEKT-PLAN — TheFold Rebuild

_Dato: 23. februar 2026_
_Forrige prosjekter: X (stabilisering), Y (memory/context)_

---

## INNHOLD

1. [Visjon](#visjon)
2. [Agentoppsett for Claude Code](#agentoppsett-for-claude-code)
3. [Faseoversikt](#faseoversikt)
4. [Fase Z0: Meldingsformat + Chat-kontrakt](#fase-z0)
5. [Fase Z1: Review → Rapport + Confidence → Spørsmål](#fase-z1)
6. [Fase Z2: Tasks som master + Linear som import](#fase-z2)
7. [Fase Z3: AI-provider system + OpenAI embeddings](#fase-z3)
8. [Fase Z4: GitHub App + Repo-oppretting](#fase-z4)
9. [Fase Z5: Komponentbibliotek + Healing-pipeline](#fase-z5)
10. [Fase Z6: Sub-agent dynamisk orkestrering](#fase-z6)
11. [Fase Z7: MCP + Web-tilgang + Chat-integrasjoner](#fase-z7)
12. [Fase Z8: E-post + Opprydding + Kontooppsett](#fase-z8)
13. [Rapport-mal](#rapport-mal)
14. [Risiko-matrise](#risiko-matrise)

---

## VISJON

TheFold går fra "autonom kode-agent" til "autonom utviklingsplattform". Etter Z-prosjektet:

- Agenten svarer som én melding som vokser — ingen bokser, tabs, eller magic phrases
- Review erstattes av rapport inline i chat med godkjenn/avvis-knapper
- Agenten spør naturlig når den er usikker — ingen "clarification-tilstand"
- Sub-agenter styres dynamisk av planner, ikke hardkodede terskler
- Komponenter gjenbrukes på tvers av repoer med healing-pipeline
- TheFold eier sine egne repoer via GitHub App (thefold-dev org)
- AI-providers er plug-and-play (Anthropic, OpenRouter, Fireworks, OpenAI)
- TheFold kan besøke nettsider, sende e-post, og kommunisere via Slack/Discord
- Tasks eies av TheFold — Linear er bare en importkilde

---

## AGENTOPPSETT FOR CLAUDE CODE

Kjør denne prompten først i Claude Code for å sette opp sub-agenter:

```
Les Z-PROSJEKT-PLAN.md fra rot-mappen.

Dette prosjektet har 9 faser (Z0-Z8) med 21 deloppgaver.
Sett opp følgende sub-agenter som jobber parallelt der det er mulig:

AGENT 1 — "Kontrakt" (Z0 + Z1)
  Ansvar: Meldingsformat, chat-kontrakt, review→rapport, confidence→spørsmål
  Filer: agent/messages.ts, chat/chat.ts, chat/agent-message-parser.ts,
         agent/review.ts, agent/review-handler.ts, agent/confidence.ts,
         chat/migrations/, agent/migrations/
  Starter: Umiddelbart
  Ferdig-kriterie: Ny meldingskontrakt med tester, review endpoint
         returnerer rapport-format, confidence bruker vanlig melding

AGENT 2 — "Infrastruktur" (Z2 + Z3 + Z4)
  Ansvar: Tasks som master, AI-provider system, OpenAI embeddings, GitHub App
  Filer: tasks/tasks.ts, linear/linear.ts, ai/providers.ts, ai/router.ts,
         ai/ai.ts, memory/memory.ts, github/github.ts,
         tasks/migrations/, ai/migrations/, memory/migrations/
  Starter: Umiddelbart (uavhengig av Agent 1)
  Ferdig-kriterie: Tasks er eneste kilde, Linear er import,
         providers støtter OpenRouter/Fireworks/OpenAI,
         memory bruker OpenAI embeddings, GitHub App auth fungerer

AGENT 3 — "Komponenter" (Z5 + Z6)
  Ansvar: Komponentbibliotek, healing-pipeline, sub-agent dynamisk oppsett
  Filer: registry/registry.ts, templates/templates.ts, ai/sub-agents.ts,
         ai/orchestrate-sub-agents.ts, agent/execution.ts,
         registry/migrations/
  Starter: Etter at Agent 2 er ferdig med Z3 (trenger provider-system for sub-agenter)
  Ferdig-kriterie: Én komponent-service, healing kjører som planlagt jobb,
         planner bestemmer sub-agent-oppsett dynamisk

AGENT 4 — "Integrasjoner" (Z7 + Z8)
  Ansvar: MCP fungerende, web-tilgang, Slack/Discord toveis, e-post
  Filer: mcp/mcp.ts, mcp/router.ts, integrations/integrations.ts,
         gateway/gateway.ts (e-post), web/ (ny service)
  Starter: Etter at Agent 1 er ferdig med Z0 (trenger ny meldingskontrakt
           for å sende svar tilbake til Slack/Discord)
  Ferdig-kriterie: MCP-servere krever config, web scraping fungerer,
         Slack/Discord sender svar tilbake, e-post sendes ved jobb-fullføring

Regler for ALLE agenter:
1. Les CLAUDE.md, ARKITEKTUR.md, GRUNNMUR-STATUS.md FØR du skriver kode
2. Bruk Encore-skills for alle endpoints, DB, Pub/Sub, tester
3. Kjør encore-code-review etter hver deloppgave
4. Skriv tester for ALT (vitest + encore testing patterns)
5. Feature-flag alle nye features (Encore secrets, default false)
6. Skriv rapport til prosjekt-z-rapport.md etter fullføring
7. IKKE endre filer en annen agent eier — bruk interfaces
8. Ved konflikt: stopp og dokumenter i rapporten

Avhengighetsrekkefølge:
  Agent 1 ──→ Agent 4
  Agent 2 ──→ Agent 3
  Agent 1 + Agent 2 starter parallelt

Start nå. Hver agent rapporterer i prosjekt-z-rapport.md under sin
egen seksjon når den er ferdig med hver deloppgave.
```

---

## FASEOVERSIKT

```
Z-PROSJEKT TIDSLINJE
═══════════════════════════════════════════════════════════════

AGENT 1 ("Kontrakt")              AGENT 2 ("Infrastruktur")
─────────────────────             ───────────────────────────
Z0: Meldingsformat (3d)           Z2: Tasks master (2d)
  ZA → Ny meldingskontrakt          ZF → Tasks som eneste kilde
  ZB → Én oppdaterbar melding        ZG → Linear som importør
  ZC → DB-migrasjon + indekser
                                   Z3: AI-providers (3d)
Z1: Review + Confidence (3d)        ZH → Provider-abstraksjon
  ZD → Review → Rapport inline      ZI → OpenAI embeddings
  ZE → Confidence → Spørsmål        ZJ → Token-budsjett per fase
                                   
                                   Z4: GitHub App (2d)
        ↓                           ZK → App auth + repo-oppretting
  Agent 4 starter her
                                          ↓
                                    Agent 3 starter her

AGENT 3 ("Komponenter")           AGENT 4 ("Integrasjoner")
─────────────────────             ───────────────────────────
Z5: Komponentbibliotek (3d)       Z7: MCP + Web + Chat (4d)
  ZL → Merge registry+templates     ZP → MCP fungerende
  ZM → Healing-pipeline              ZQ → Web-tilgang (scraping)
                                     ZR → Slack/Discord toveis
Z6: Sub-agenter (3d)
  ZN → Dynamisk planner-styrt     Z8: E-post + Opprydding (2d)
  ZO → Visning i chat               ZS → E-post notifikasjoner
                                     ZT → Fjern død kode + legacy
                                     ZU → Kontosoppsett-guide

═══════════════════════════════════════════════════════════════
Total estimat: ~10 arbeidsdager (sub-agenter jobber parallelt)
```

---

## FASE Z0: MELDINGSFORMAT + CHAT-KONTRAKT {#fase-z0}

> **Mål:** Erstatt 6 meldingstyper + legacy fallback med én enkel kontrakt.
> **Agent:** 1 (Kontrakt)
> **Avhengigheter:** Ingen

---

### PROMPT ZA — Ny meldingskontrakt

**Mål:** Erstatt de 6 AgentMessage-typene (status, thought, report, clarification, review, completion) med én enhetlig meldingstype som representerer en progressiv melding.

**Les først:**
- CLAUDE.md
- agent/messages.ts (nåværende 6 typer + serialize/deserialize + legacy fallback)
- chat/agent-message-parser.ts (duplisert parser for cross-service boundary)
- agent/state-machine.ts (14 faser)

**Skills å bruke:**
- encore-api, encore-database, encore-infrastructure, encore-testing, encore-code-review

**Ny kontrakt (erstatter AgentMessage):**

```typescript
// agent/messages.ts — HELE filen erstattes

export interface ProgressStep {
  id: string;              // "context", "confidence", "plan", "build:1", "validate", etc.
  label: string;           // "Analyserte repository", "gateway/auth.ts"
  detail?: string;         // "14 filer, 3 minner"
  done: boolean | null;    // true=✓, false=●pågår, null=○venter
}

export interface ProgressReport {
  filesChanged: Array<{ path: string; action: "create" | "modify" | "delete"; diff?: string }>;
  costUsd: number;
  duration: string;
  qualityScore?: number;   // 1-10 fra AI review
  concerns?: string[];
  reviewId: string;        // referanse til code_reviews tabell
}

export interface AgentProgress {
  status: "thinking" | "working" | "waiting" | "done" | "failed";
  phase: string;           // "context" | "confidence" | "planning" | "building" | "validating" | "reviewing" | "completing" | "clarification"
  summary: string;         // "Bygger gateway/auth.ts (2/4)"
  progress?: {
    current: number;
    total: number;
    currentFile?: string;
  };
  steps: ProgressStep[];
  report?: ProgressReport;           // kun ved done
  question?: string;                 // kun ved waiting
  subAgents?: Array<{                // kun ved sub-agent arbeid
    id: string;
    role: string;
    model: string;
    status: "pending" | "working" | "done" | "failed";
    label: string;
  }>;
  error?: string;                    // kun ved failed
}

export function serializeProgress(progress: AgentProgress): string {
  return JSON.stringify({ type: "progress", ...progress });
}

export function deserializeProgress(raw: string): AgentProgress | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === "progress") return parsed as AgentProgress;
    // Legacy fallback — konverter gamle typer
    return convertLegacy(parsed);
  } catch {
    return null;
  }
}

function convertLegacy(parsed: any): AgentProgress | null {
  if (!parsed?.type) return null;
  
  switch (parsed.type) {
    case "status":
      return {
        status: "working",
        phase: parsed.phase || "building",
        summary: parsed.meta?.title || parsed.phase || "Jobber...",
        steps: (parsed.steps || []).map((s: any) => ({
          id: s.label, label: s.label, detail: s.detail,
          done: s.status === "done" ? true : s.status === "active" ? false : null,
        })),
      };
    case "thought":
      return null; // thoughts blir ikke vist i ny UI
    case "report":
      return {
        status: parsed.status === "completed" ? "done" : parsed.status === "failed" ? "failed" : "working",
        phase: parsed.status === "completed" ? "completing" : "building",
        summary: parsed.text?.substring(0, 100) || "",
        steps: [],
      };
    case "clarification":
      return {
        status: "waiting",
        phase: "clarification",
        summary: "Trenger avklaring",
        steps: (parsed.steps || []).map((s: any) => ({
          id: s.label, label: s.label, done: null,
        })),
        question: parsed.questions?.[0] || "",
      };
    case "review":
      return {
        status: "waiting",
        phase: "reviewing",
        summary: "Venter på godkjenning",
        steps: [],
        report: {
          filesChanged: [],
          costUsd: 0,
          duration: "",
          qualityScore: parsed.reviewData?.quality,
          concerns: parsed.reviewData?.concerns,
          reviewId: parsed.reviewData?.reviewId || "",
        },
      };
    case "completion":
      return {
        status: "done",
        phase: "completing",
        summary: parsed.text || "Ferdig",
        steps: [],
      };
    default:
      return null;
  }
}
```

**Filer som opprettes:**
- agent/messages.ts — ERSTATT hele innholdet med ny kontrakt over

**Filer som endres:**
- chat/agent-message-parser.ts — ERSTATT med enkel import av typer + `deserializeProgress` + `convertLegacy`

**Tester (agent/messages.test.ts — ERSTATT):**
1. serializeProgress/deserializeProgress roundtrip for alle statuser
2. Legacy "status"-type konverteres korrekt
3. Legacy "clarification" konverteres med question
4. Legacy "review" konverteres med report
5. Legacy "completion" konverteres til done
6. Legacy "thought" returnerer null (ikke vist i ny UI)
7. Ugyldig JSON returnerer null
8. Manglende felter håndteres gracefully (defaults)

**Feature flag:** `ZNewMessageContract` (Encore secret, default "false")
- false: `serializeMessage()` og `deserializeMessage()` fra gammel kode brukes
- true: `serializeProgress()` og `deserializeProgress()` brukes

**Etter fullføring:**
- Oppdater CLAUDE.md med ny meldingskontrakt
- Oppdater GRUNNMUR-STATUS.md
- Skriv rapport i prosjekt-z-rapport.md under "Agent 1 — ZA"

---

### PROMPT ZB — Én oppdaterbar melding

**Mål:** Agenten oppdaterer ÉN assistant-melding per oppgave i stedet for å spamme agent_status, agent_thought, agent_report, og completion som separate DB-rader.

**Les først:**
- CLAUDE.md
- chat/chat.ts — spesielt `store-agent-report` subscription, `processAIResponse`, `updateMessageContent`
- agent/helpers.ts — `report()` og `think()` funksjoner
- agent/execution.ts — `reportSteps()` kall

**Skills å bruke:**
- encore-api, encore-database, encore-infrastructure, encore-testing

**Nåværende flyt:**
1. agent.startTask() → chat oppretter initial `agent_status`-melding
2. Agent kaller report() 10-20 ganger → hver gang publiserer til agentReports topic
3. store-agent-report subscriber mottar → oppdaterer ELLER oppretter agent_status-meldinger
4. Ved completion → oppretter SEPARAT chat-melding + oppdaterer agent_status til "Ferdig"
5. Frontend poller history → filtrerer agent_status vs chat vs agent_thought → renderer forskjellig

**Ny flyt:**
1. agent.startTask() → chat oppretter én `assistant`-melding med messageType `agent_progress`
2. Agent kaller `reportProgress(ctx, progress)` → publiserer AgentProgress til agentReports
3. store-agent-report subscriber → ALLTID oppdaterer SAMME melding (UPDATE, aldri INSERT)
4. Ved completion → oppdaterer SAMME melding med report-feltet fylt ut
5. Frontend ser én melding med AgentProgress i content → renderer status/steg/rapport

**Filer som endres:**

`agent/helpers.ts`:
```typescript
// ERSTATT report() og think() med:

export async function reportProgress(
  ctx: AgentExecutionContext,
  progress: AgentProgress,
): Promise<void> {
  const { agentReports } = await import("../chat/chat");
  const { serializeProgress } = await import("./messages");
  
  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: serializeProgress(progress),
    status: progress.status === "done" ? "completed"
          : progress.status === "failed" ? "failed"
          : progress.status === "waiting" ? "needs_input"
          : "working",
  });
}

// Convenience helper for å bygge steg-listen progressivt
export function buildSteps(ctx: AgentExecutionContext): ProgressStep[] {
  // Leses fra ctx.progressSteps (ny felt på context)
  return ctx.progressSteps || [];
}

export function addStep(ctx: AgentExecutionContext, step: ProgressStep): void {
  if (!ctx.progressSteps) ctx.progressSteps = [];
  const existing = ctx.progressSteps.findIndex(s => s.id === step.id);
  if (existing >= 0) {
    ctx.progressSteps[existing] = step;
  } else {
    ctx.progressSteps.push(step);
  }
}
```

`chat/chat.ts` — store-agent-report subscriber:
```typescript
// ERSTATT hele handler med:

handler: async (report) => {
  const progress = deserializeProgress(report.content);
  
  if (!progress) {
    // Legacy melding — bruk gammel logikk (feature flag)
    return handleLegacyReport(report);
  }

  const metadata = JSON.stringify({
    taskId: report.taskId,
    status: report.status,
  });

  // Finn eksisterende agent_progress melding for denne task
  const existing = await db.queryRow<{ id: string }>`
    SELECT id FROM messages
    WHERE conversation_id = ${report.conversationId}
      AND message_type = 'agent_progress'
      AND metadata->>'taskId' = ${report.taskId}
    ORDER BY created_at DESC LIMIT 1
  `;

  if (existing) {
    // OPPDATER — alltid samme melding
    await db.exec`
      UPDATE messages
      SET content = ${report.content}, metadata = ${metadata}::jsonb, updated_at = NOW()
      WHERE id = ${existing.id}::uuid
    `;
  } else {
    // Første melding for denne task — opprett
    await db.exec`
      INSERT INTO messages (conversation_id, role, content, message_type, metadata)
      VALUES (${report.conversationId}, 'assistant', ${report.content}, 'agent_progress', ${metadata}::jsonb)
    `;
  }
}
```

`agent/types.ts` — legg til:
```typescript
// I AgentExecutionContext:
progressSteps?: ProgressStep[];
```

**Alle steder som kaller report() eller think() i disse filene MÅ oppdateres:**
- agent/execution.ts — reportSteps() → reportProgress()
- agent/review-handler.ts — report() ved review-submit
- agent/completion.ts — report() ved PR-opprettelse
- agent/confidence.ts — report() ved clarification
- agent/context-builder.ts — report() ved context-samling
- agent/agent.ts — report() ved start/feil/repo_locked

**Tester (chat/progress-message.test.ts — NY):**
1. Første rapport oppretter agent_progress melding
2. Påfølgende rapporter oppdaterer SAMME melding (ikke ny rad)
3. Terminal status (done/failed) oppdaterer samme melding
4. To tasks i samme conversation har SEPARATE meldinger
5. Legacy rapport (feature flag false) bruker gammel logikk
6. progressSteps builder legger til og oppdaterer steg korrekt

**Feature flag:** Samme `ZNewMessageContract` fra ZA

---

### PROMPT ZC — DB-migrasjon + Indekser

**Mål:** Fiks ytelse (samtalehistorikk 2s → <200ms) og legg til nye message_types.

**Les først:**
- chat/migrations/ (alle eksisterende migrasjoner)
- chat/chat.ts — history endpoint og conversations endpoint

**Skills å bruke:**
- encore-database, encore-testing

**Ny migrasjon (chat/migrations/N_z_performance_and_types.up.sql):**

```sql
-- Ytelsesindekser (fikser 2-sekunders historikk-lasting)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_role_created
  ON messages(conversation_id, role, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_type_task
  ON messages(conversation_id, message_type, (metadata->>'taskId'));

-- Legg til nye message_types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'chat',
    'agent_report',
    'task_start',
    'context_transfer',
    'agent_status',      -- legacy, fases ut
    'agent_thought',     -- fantes i praksis men manglet i constraint
    'agent_progress'     -- NY: én oppdaterbar melding per task
  ));

-- Indeks på conversations for raskere eierskapsoppslag
CREATE INDEX IF NOT EXISTS idx_conversations_owner_created
  ON conversations(owner_email, created_at DESC);
```

**Filer som endres:**
- chat/chat.ts — history endpoint: legg til `WHERE message_type != 'agent_status'` filter (skjul gamle statusmeldinger) ELLER la frontend filtrere

**Tester:**
1. History endpoint returnerer resultater under 500ms med 1000 meldinger
2. Conversations endpoint returnerer resultater under 500ms med 100 samtaler
3. agent_progress message_type aksepteres av constraint
4. agent_thought message_type aksepteres av constraint

---

## FASE Z1: REVIEW → RAPPORT + CONFIDENCE → SPØRSMÅL {#fase-z1}

> **Mål:** Review er en rapport i chat. Confidence er et naturlig spørsmål.
> **Agent:** 1 (Kontrakt)
> **Avhengigheter:** Z0 (ny meldingskontrakt)

---

### PROMPT ZD — Review → Rapport inline

**Mål:** Når agenten er ferdig, leveres rapporten som del av agent-svaret i chatten. Godkjenn/avvis/be om endringer skjer via chat — ikke via /review/[id]-navigering.

**Les først:**
- agent/review.ts — submitReviewInternal, approveReview, requestChanges, rejectReview
- agent/review-handler.ts — handleReview()
- frontend/src/app/(dashboard)/review/[id]/page.tsx

**Skills å bruke:**
- encore-api, encore-database, encore-testing

**Endring i review-handler.ts:**

Etter at AI review er ferdig og `submitReviewInternal()` er kalt, sender agenten en AgentProgress med status="done" og report-feltet fylt ut:

```typescript
// I handleReview(), etter submitReviewInternal():

const report: ProgressReport = {
  filesChanged: executionData.filesChanged.map(f => ({
    path: f.path,
    action: f.action,
    diff: f.content?.substring(0, 500), // Kort preview, ikke full kode
  })),
  costUsd: ctx.totalCostUsd,
  duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
  qualityScore: aiReview.qualityScore,
  concerns: aiReview.concerns,
  reviewId: reviewResult.reviewId,
};

addStep(ctx, { id: "review", label: "AI-review fullført", detail: `${aiReview.qualityScore}/10`, done: true });
addStep(ctx, { id: "waiting", label: "Venter på godkjenning", done: false });

await reportProgress(ctx, {
  status: "done",
  phase: "reviewing",
  summary: `Ferdig — ${executionData.filesChanged.length} filer, $${ctx.totalCostUsd.toFixed(2)}`,
  steps: buildSteps(ctx),
  report,
});
```

**Nye endepunkter for chat-basert review:**

```typescript
// chat/chat.ts — nye endpoints for review-handlinger fra chat

export const approveFromChat = api(
  { method: "POST", path: "/chat/review/approve", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string }): Promise<{ prUrl: string }> => {
    await verifyConversationAccess(req.conversationId);
    // Delegerer til eksisterende agent review
    const { agent } = await import("~encore/clients");
    return agent.approveReview({ reviewId: req.reviewId });
  }
);

export const requestChangesFromChat = api(
  { method: "POST", path: "/chat/review/changes", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string; feedback: string }): Promise<{ success: boolean }> => {
    await verifyConversationAccess(req.conversationId);
    const { agent } = await import("~encore/clients");
    await agent.requestReviewChanges({ reviewId: req.reviewId, feedback: req.feedback });
    return { success: true };
  }
);

export const rejectFromChat = api(
  { method: "POST", path: "/chat/review/reject", expose: true, auth: true },
  async (req: { conversationId: string; reviewId: string; feedback?: string }): Promise<{ success: boolean }> => {
    await verifyConversationAccess(req.conversationId);
    const { agent } = await import("~encore/clients");
    await agent.rejectReview({ reviewId: req.reviewId, feedback: req.feedback });
    return { success: true };
  }
);
```

**code_reviews tabell beholdes** som backend-lager. Frontenden henter rapport-data fra agent_progress-meldingen, ikke fra review-endepunktet. /review/[id]-siden beholdes som arkiv/historikk.

**Tester:**
1. handleReview sender AgentProgress med report-felt
2. approveFromChat delegerer korrekt til agent.approveReview
3. requestChangesFromChat krever feedback
4. rejectFromChat fungerer med og uten feedback
5. Rapport inneholder filesChanged, costUsd, qualityScore
6. Review-ID i rapport matcher code_reviews-tabellen

---

### PROMPT ZE — Confidence → Naturlig spørsmål

**Mål:** Når agenten er usikker, stiller den et naturlig spørsmål i meldingsstrømmen — ikke en "clarification"-tilstand med spesiell UI.

**Les først:**
- agent/confidence.ts — assessAndRoute()
- agent/agent.ts — respondToClarification(), forceContinue()

**Endring i confidence.ts:**

```typescript
// Når confidence < 90 og recommended_action === "clarify":

// I STEDET for:
//   buildClarificationMessage(phase, questions, steps)
//   → spesiell UI-tilstand

// NÅ:
addStep(ctx, { id: "confidence", label: `Confidence: ${result.overall}%`, detail: "Trenger avklaring", done: false });

await reportProgress(ctx, {
  status: "waiting",
  phase: "clarification",
  summary: "Trenger avklaring",
  steps: buildSteps(ctx),
  question: result.clarifying_questions[0], // ETT spørsmål, ikke flere
});
```

**Endring i chat/chat.ts:**

Svar på spørsmål håndteres allerede via `respondToClarification` i agent.ts. Endringen er at deteksjon av "dette er et svar på clarification" forenkles:

```typescript
// I sendMessage — erstatt den kompliserte isClarification-deteksjonen:

// Sjekk om siste agent_progress-melding for denne samtalen har status="waiting"
const lastProgress = await db.queryRow<{ content: string; metadata: string }>`
  SELECT content, metadata FROM messages
  WHERE conversation_id = ${req.conversationId}
    AND message_type = 'agent_progress'
  ORDER BY updated_at DESC LIMIT 1
`;

if (lastProgress) {
  const progress = deserializeProgress(lastProgress.content);
  const meta = JSON.parse(lastProgress.metadata);
  if (progress?.status === "waiting" && meta?.taskId) {
    const { agent } = await import("~encore/clients");
    await agent.respondToClarification({
      taskId: meta.taskId,
      response: req.message,
      conversationId: req.conversationId,
    });
    return { message: msg, agentTriggered: false };
  }
}
```

**Tester:**
1. Confidence < 90 sender AgentProgress med status="waiting" og question
2. Bruker-svar detekteres korrekt og routes til respondToClarification
3. Confidence ≥ 90 sender AgentProgress med status="working" (ingen spørsmål)
4. forceContinue oppdaterer AgentProgress til status="working"
5. Kun ETT spørsmål sendes (det viktigste)

---

## FASE Z2: TASKS SOM MASTER + LINEAR SOM IMPORT {#fase-z2}

> **Mål:** Tasks-servicen er eneste kilde til oppgaver. Linear importerer inn.
> **Agent:** 2 (Infrastruktur)
> **Avhengigheter:** Ingen

---

### PROMPT ZF — Tasks som eneste kilde

**Mål:** Agenten trigges KUN via tasks-servicen. Fjern alle steder der Linear-cronen starter agenten direkte.

**Les først:**
- tasks/tasks.ts — full CRUD, syncLinearTasks, createTask
- linear/linear.ts — check-thefold-tasks cron, getAssignedTasks
- agent/agent.ts — startTask(), checkPendingTasks()
- chat/chat.ts — shouldTriggerAgent logikk

**Endringer:**

`linear/linear.ts`:
- Fjern `check-thefold-tasks` cron ELLER endre den til å kalle `tasks.createTask()` i stedet for `agent.startTask()`
- Linear-cronen importerer oppgaver til tasks-tabellen med `source: "linear"`, starter IKKE agenten

`agent/agent.ts`:
- `checkPendingTasks()` henter fra `tasks.listTasks({ status: "ready" })` i stedet for `linear.getAssignedTasks()`
- `startTask()` krever alltid en `thefoldTaskId` (tasks-ID, ikke Linear-ID)

`chat/chat.ts`:
- `shouldTriggerAgent` oppretter alltid en task først via `tasks.createTask()`, deretter starter agenten med task-ID

**Ny Linear-import-flyt:**
1. Cron henter oppgaver fra Linear med "thefold"-label
2. For hver oppgave: sjekk om den allerede finnes i tasks-tabellen (via `externalId`)
3. Hvis ikke: `tasks.createTask({ title, description, source: "linear", externalId: linearTaskId })`
4. Task lever i tasks-tabellen, kan startes manuelt eller automatisk

**tasks/migrations/ — ny migrasjon:**
```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_source TEXT; -- "linear"
CREATE INDEX IF NOT EXISTS idx_tasks_external ON tasks(external_source, external_id);
```

**Tester:**
1. Linear-cron oppretter tasks, starter IKKE agent direkte
2. Agent.startTask krever thefoldTaskId
3. Chat-trigger oppretter task først, deretter starter agent
4. Duplikat-import fra Linear ignoreres (external_id match)
5. Tasks med source="linear" kan spores tilbake

---

### PROMPT ZG — Linear som importør + status-sync

**Mål:** Linear oppdateres når en TheFold-task endrer status — men TheFold eier sannheten.

**Endringer i tasks/tasks.ts:**
```typescript
// Ved statusendring: notifiser Linear hvis task har external_source="linear"
export async function syncStatusToLinear(taskId: string, newStatus: TaskStatus): Promise<void> {
  const task = await getTaskInternal({ id: taskId });
  if (task.task.externalSource !== "linear" || !task.task.externalId) return;
  
  try {
    const { linear } = await import("~encore/clients");
    const linearState = mapTheFoldStatusToLinear(newStatus);
    await linear.updateTask({ taskId: task.task.externalId, state: linearState });
  } catch {
    // Linear-sync er optional — ikke blokker
  }
}
```

**Tester:**
1. Status-endring i TheFold synces til Linear
2. Linear-sync feiler gracefully
3. Tasks uten external_source ignoreres
4. Status-mapping er korrekt (ready→todo, in_progress→in_progress, done→done)

---

## FASE Z3: AI-PROVIDER SYSTEM + OPENAI EMBEDDINGS {#fase-z3}

> **Mål:** AI-providers er plug-and-play. Memory bruker OpenAI.
> **Agent:** 2 (Infrastruktur)
> **Avhengigheter:** Ingen

---

### PROMPT ZH — Provider-abstraksjon

**Mål:** Bygg en provider-abstraksjon som lar TheFold kalle Anthropic, OpenRouter, Fireworks, og OpenAI gjennom ett felles interface.

**Les først:**
- ai/ai.ts — callAIWithFallback(), callAnthropicAPI()
- ai/router.ts — selectOptimalModel(), DB-backed model cache
- ai/providers.ts — dynamisk modellregister

**Ny arkitektur:**

```typescript
// ai/provider-interface.ts (NY)

export interface AIProvider {
  id: string;                    // "anthropic", "openrouter", "fireworks", "openai"
  name: string;
  baseUrl: string;
  apiKeySecret: string;          // Encore secret name
  supportedFeatures: string[];   // ["chat", "embeddings", "vision"]
  transformRequest(req: StandardRequest): ProviderRequest;
  transformResponse(res: ProviderResponse): StandardResponse;
}

export interface StandardRequest {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature?: number;
}

export interface StandardResponse {
  content: string;
  tokensUsed: number;
  modelUsed: string;
  costEstimate: { totalCost: number };
  stopReason: string;
}
```

```typescript
// ai/providers/anthropic.ts (NY)
// ai/providers/openrouter.ts (NY)
// ai/providers/fireworks.ts (NY)
// ai/providers/openai.ts (NY)

// Hver implementerer AIProvider-interfacet
```

```typescript
// ai/ai.ts — erstatt callAnthropicAPI() med:

export async function callAI(req: StandardRequest): Promise<StandardResponse> {
  const model = await getModelConfig(req.model); // fra DB
  const provider = getProvider(model.providerId);  // fra registry
  const providerReq = provider.transformRequest(req);
  
  const res = await fetch(provider.baseUrl + "/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey(provider.apiKeySecret)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(providerReq),
  });
  
  return provider.transformResponse(await res.json());
}
```

**Secrets som trengs:**
- `AnthropicApiKey` (eksisterer allerede som GitHubToken-mønster)
- `OpenRouterApiKey` (ny — bruker ber om den når den trengs)
- `FireworksApiKey` (ny)
- `OpenAIApiKey` (ny — settes opp for embeddings)

**ai/migrations/ — ny migrasjon:**
```sql
-- Legg til provider-referanse i models-tabellen
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS provider_id TEXT DEFAULT 'anthropic';
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS provider_model_id TEXT; -- modellens ID hos provideren

-- Seed OpenRouter og Fireworks modeller
INSERT INTO ai_providers (id, name, base_url, api_key_secret) VALUES
  ('openrouter', 'OpenRouter', 'https://openrouter.ai/api', 'OpenRouterApiKey'),
  ('fireworks', 'Fireworks', 'https://api.fireworks.ai/inference', 'FireworksApiKey'),
  ('openai', 'OpenAI', 'https://api.openai.com', 'OpenAIApiKey')
ON CONFLICT (id) DO NOTHING;
```

**Tester:**
1. Anthropic provider transformerer request/response korrekt
2. OpenRouter provider transformerer request/response korrekt
3. Fireworks provider transformerer request/response korrekt
4. callAI router til riktig provider basert på modell
5. Fallback til neste provider ved feil
6. Manglende API-nøkkel gir tydelig feilmelding

**Feature flag:** `ZMultiProvider` (default "false" — kun Anthropic)

---

### PROMPT ZI — OpenAI Embeddings for Memory

**Mål:** Bytt fra Voyage AI til OpenAI text-embedding-3-small for memory-embeddings.

**Les først:**
- memory/memory.ts — genererEmbedding(), search(), store()
- memory/migrations/ — pgvector dimensjoner

**Endringer:**

```typescript
// memory/memory.ts — erstatt Voyage-kallet:

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = OpenAIApiKey();
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`OpenAI embedding error ${res.status}: ${error}`);
  }
  
  const data = await res.json();
  return data.data[0].embedding; // 1536 dimensjoner
}
```

**VIKTIG — Dimensjonsendring:**
- Voyage-3-lite: 1024 dimensjoner
- OpenAI text-embedding-3-small: 1536 dimensjoner
- pgvector-kolonnen MÅ migreres

**memory/migrations/ — ny migrasjon:**
```sql
-- Endre embedding-dimensjon fra 1024 til 1536
-- MERK: Alle eksisterende embeddings blir ugyldige og må re-genereres

ALTER TABLE memories ALTER COLUMN embedding TYPE vector(1536);

-- Nullstill eksisterende embeddings (må re-genereres)
UPDATE memories SET embedding = NULL;
```

**Re-embedding jobb:**
```typescript
// memory/memory.ts — nytt endpoint for re-embedding

export const reEmbed = api(
  { method: "POST", path: "/memory/re-embed", expose: true, auth: true },
  async (): Promise<{ processed: number; failed: number }> => {
    const rows = await db.query<{ id: string; content: string }>`
      SELECT id, content FROM memories WHERE embedding IS NULL
    `;
    
    let processed = 0, failed = 0;
    for await (const row of rows) {
      try {
        const embedding = await generateEmbedding(row.content);
        await db.exec`
          UPDATE memories SET embedding = ${JSON.stringify(embedding)}::vector
          WHERE id = ${row.id}::uuid
        `;
        processed++;
      } catch {
        failed++;
      }
    }
    
    return { processed, failed };
  }
);
```

**Secret som trengs:** `OpenAIApiKey` — Claude Code sier:
```
Nå trenger jeg OpenAI API-nøkkelen.
Kjør: encore secret set OpenAIApiKey --type prod
Lim inn nøkkelen fra platform.openai.com → API Keys
```

**Tester:**
1. generateEmbedding returnerer 1536-dimensjons vektor
2. search() fungerer med ny dimensjon
3. store() genererer embedding og lagrer
4. re-embed prosesserer alle minner med NULL embedding
5. Feil fra OpenAI API håndteres gracefully
6. Rate limiting (retry etter 429)

---

### PROMPT ZJ — Hard token-budsjett per fase

**Mål:** Legg til hard cutoff per fase — stopp hvis fasen har brukt mer enn X tokens.

**Les først:**
- agent/metrics.ts — PhaseTracker
- agent/token-policy.ts — estimateTokenUsage, shouldUseSmallModel

**Ny konfig:**
```typescript
// agent/token-policy.ts — legg til:

export const PHASE_TOKEN_LIMITS: Record<string, number> = {
  context: 50_000,        // Kontekst-samling
  confidence: 10_000,     // Confidence + complexity vurdering
  planning: 30_000,       // Plan-generering
  building: 200_000,      // Kode-generering (høyest)
  validating: 50_000,     // Validering + fix-loops
  reviewing: 30_000,      // AI review
  completing: 10_000,     // PR + cleanup
};

export function isOverBudget(phase: string, tokensUsed: number): boolean {
  const limit = PHASE_TOKEN_LIMITS[phase];
  if (!limit) return false;
  return tokensUsed > limit;
}
```

**Tester:**
1. isOverBudget returnerer true når over grense
2. isOverBudget returnerer false for ukjent fase
3. Building-fasen har høyest grense
4. Integration med PhaseTracker — stopper ved overskridelse

---

## FASE Z4: GITHUB APP + REPO-OPPRETTING {#fase-z4}

> **Mål:** TheFold bruker GitHub App i stedet for PAT. Kan opprette repoer.
> **Agent:** 2 (Infrastruktur)
> **Avhengigheter:** Ingen

---

### PROMPT ZK — GitHub App auth + Repo-oppretting

**Mål:** Erstatt GitHubToken PAT med GitHub App authentication. Legg til repo-oppretting.

**Les først:**
- github/github.ts — ghApi(), alle endpoints
- agent/helpers.ts — REPO_OWNER, REPO_NAME (hardkodet)

**Ny auth-mekanisme:**

```typescript
// github/github-app.ts (NY)

import { secret } from "encore.dev/config";
import { SignJWT } from "jose"; // npm install jose

const GitHubAppId = secret("GitHubAppId");
const GitHubAppPrivateKey = secret("GitHubAppPrivateKey");

// Generer JWT for GitHub App
async function generateAppJWT(): Promise<string> {
  const privateKey = GitHubAppPrivateKey();
  const key = await importPKCS8(privateKey, "RS256");
  
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .setIssuer(GitHubAppId())
    .sign(key);
}

// Hent installation token for en org
export async function getInstallationToken(owner: string): Promise<string> {
  const jwt = await generateAppJWT();
  
  // Finn installation ID for denne orgen
  const installations = await fetch("https://api.github.com/app/installations", {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github.v3+json" },
  }).then(r => r.json());
  
  const installation = installations.find((i: any) =>
    i.account.login.toLowerCase() === owner.toLowerCase()
  );
  
  if (!installation) {
    throw new Error(`GitHub App ikke installert på ${owner}`);
  }
  
  // Generer installation token
  const tokenRes = await fetch(
    `https://api.github.com/app/installations/${installation.id}/access_tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github.v3+json" },
    }
  ).then(r => r.json());
  
  return tokenRes.token;
}
```

**Endring i github.ts:**
```typescript
// Erstatt:
//   const githubToken = secret("GitHubToken");
// Med:
import { getInstallationToken } from "./github-app";

async function ghApi(owner: string, path: string, options?: { ... }) {
  const token = await getInstallationToken(owner);
  // ... resten er likt, men token er nå per-org
}
```

**Ny: Repo-oppretting:**
```typescript
export const createRepo = api(
  { method: "POST", path: "/github/repo/create", expose: true, auth: true },
  async (req: { org: string; name: string; description?: string; isPrivate?: boolean }): Promise<{ url: string; cloneUrl: string }> => {
    const token = await getInstallationToken(req.org);
    
    const repo = await fetch(`https://api.github.com/orgs/${req.org}/repos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: req.name,
        description: req.description || `Created by TheFold`,
        private: req.isPrivate ?? true,
        auto_init: true,
      }),
    }).then(r => r.json());
    
    return { url: repo.html_url, cloneUrl: repo.clone_url };
  }
);
```

**Fjern hardkodet REPO_OWNER/REPO_NAME i agent/helpers.ts:**
```typescript
// Fjern:
//   export const REPO_OWNER = "Twofold-AS";
//   export const REPO_NAME = "thefold";

// Erstatt med: Hentes alltid fra ctx.repoOwner og ctx.repoName
// Default org hentes fra settings/preferences
```

**Secrets som trengs:**
```
Nå trenger jeg GitHub App credentials.
1. Gå til github.com → Settings → Developer settings → GitHub Apps → din app
2. Noter App ID (vises øverst)
3. Generer private key (knapp nederst → .pem-fil)

Kjør:
  encore secret set GitHubAppId --type prod
  encore secret set GitHubAppPrivateKey --type prod
  (lim inn hele innholdet av .pem-filen)
```

**Tester:**
1. generateAppJWT lager gyldig JWT
2. getInstallationToken henter token for org
3. createRepo oppretter repo i org
4. ghApi bruker installation token (ikke PAT)
5. Feil ved manglende installasjon gir tydelig melding
6. Token caches (ikke generer ny for hvert kall)

**Feature flag:** `ZGitHubApp` (default "false" — bruker gammel PAT)

---

## FASE Z5: KOMPONENTBIBLIOTEK + HEALING-PIPELINE {#fase-z5}

> **Mål:** Én komponent-service. Healing forbedrer kvalitet og propagerer oppdateringer.
> **Agent:** 3 (Komponenter)
> **Avhengigheter:** Z3 (trenger provider-system)

---

### PROMPT ZL — Merge Registry + Templates til Komponentbibliotek

**Mål:** Slå sammen registry/ og templates/ til én service. Komponenter er gjenbrukbar kode med filer, avhengigheter, metadata, og versjon.

**Les først:**
- registry/registry.ts — register, findForTask, triggerHealing
- templates/templates.ts — list, get, useTemplate
- registry/migrations/, templates/migrations/

**Ny datamodell (registry/migrations/ — ny migrasjon):**

```sql
-- Merge templates inn i components-tabellen
-- components-tabellen eksisterer allerede i registry

ALTER TABLE components ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE components ADD COLUMN IF NOT EXISTS quality_score DECIMAL DEFAULT 0;
ALTER TABLE components ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'component';
  -- type: 'component' | 'template' | 'pattern'
ALTER TABLE components ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]';
ALTER TABLE components ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]';
ALTER TABLE components ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]';
ALTER TABLE components ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
  -- source: 'manual' | 'extracted' | 'seeded'

-- Indeks for søk
CREATE INDEX IF NOT EXISTS idx_components_type ON components(type);
CREATE INDEX IF NOT EXISTS idx_components_quality ON components(quality_score);
```

**Seed med TheFolds EGNE mønstre (ikke random scaffolds):**
- Encore API endpoint pattern
- SQLDatabase + migration pattern
- Pub/Sub Topic + Subscription pattern
- CronJob pattern
- pgvector search pattern
- OTP auth flow
- Feature flag pattern (Encore secrets)
- Rate limiter pattern

**Nye endepunkter (erstatter templates/*):**
```typescript
// registry/registry.ts — legg til:

export const useComponent = api(
  { method: "POST", path: "/registry/use", expose: true, auth: true },
  async (req: { componentId: string; targetRepo: string; variables?: Record<string, string> }): Promise<{ files: Array<{ path: string; content: string }> }> => {
    // Hent komponent, substituér variabler, returner filer
  }
);

export const listComponents = api(
  { method: "POST", path: "/registry/list", expose: true, auth: true },
  async (req: { type?: string; category?: string }): Promise<{ components: Component[] }> => {
    // Filtrert liste av komponenter
  }
);
```

**Templates-servicen beholdes IKKE som egen service.** Alt flyttes til registry. Frontend oppdateres til å kalle registry-endepunkter.

**Tester:**
1. useComponent substituerer variabler og returnerer filer
2. listComponents filtrerer på type og category
3. findForTask returnerer relevante komponenter for en oppgave
4. Seeded patterns har korrekte filer og metadata
5. version-feltet inkrementeres ved oppdatering

---

### PROMPT ZM — Healing-pipeline

**Mål:** To moduser: kvalitetshealing (rebuild under 60%) og planlagt vedlikehold (weekly scan).

**Les først:**
- registry/registry.ts — triggerHealing (eksisterer men gjør ingenting nyttig)
- monitor/monitor.ts — runDailyChecks

**Kvalitetshealing:**
```typescript
// registry/healing.ts (NY)

export async function healComponent(componentId: string): Promise<HealingReport> {
  const component = await getComponent(componentId);
  if (component.qualityScore >= 60) {
    return { action: "skipped", reason: "Quality score above threshold" };
  }
  
  // Bruk AI til å forbedre komponentens kode
  const { ai } = await import("~encore/clients");
  const improved = await ai.improveComponent({
    files: component.files,
    concerns: component.concerns || [],
    currentScore: component.qualityScore,
  });
  
  // Lagre ny versjon
  await registerNewVersion(componentId, improved.files, improved.score);
  
  return {
    action: "healed",
    oldScore: component.qualityScore,
    newScore: improved.score,
    filesChanged: improved.filesChanged,
    version: component.version + 1,
  };
}
```

**Planlagt vedlikehold (cron):**
```typescript
// registry/maintenance.ts (NY)

import { CronJob } from "encore.dev/cron";

// Konfigurerbar via settings — default: fredag 03:00
const maintenanceCron = new CronJob("weekly-maintenance", {
  title: "Weekly code maintenance",
  schedule: "0 3 * * 5", // Fredag 03:00
  endpoint: runMaintenance,
});

export const runMaintenance = api(
  { method: "POST", path: "/registry/maintenance/run", expose: true, auth: true },
  async (): Promise<MaintenanceReport> => {
    const report: MaintenanceReport = {
      timestamp: new Date().toISOString(),
      componentsScanned: 0,
      componentsHealed: 0,
      reposScanned: 0,
      issues: [],
      recommendations: [],
    };
    
    // 1. Scan alle komponenter for kvalitet
    const components = await listAllComponents();
    for (const comp of components) {
      report.componentsScanned++;
      if (comp.qualityScore < 60) {
        const healResult = await healComponent(comp.id);
        if (healResult.action === "healed") report.componentsHealed++;
        report.issues.push({
          type: "low_quality",
          component: comp.name,
          score: comp.qualityScore,
          action: healResult.action,
        });
      }
    }
    
    // 2. Scan repoer for utdaterte komponenter
    // (sammenlign installert versjon mot nyeste versjon)
    
    // 3. Kjør dependency audit (npm audit-stil)
    
    // 4. Generer rapport
    // Rapport sendes via e-post (ZS) og lagres i DB
    
    return report;
  }
);
```

**Tester:**
1. healComponent forbedrer komponent under 60%
2. healComponent skipper komponent over 60%
3. Ny versjon lagres med inkrementert versjon
4. runMaintenance scanner alle komponenter
5. Rapport inneholder korrekt statistikk
6. Cron er registrert korrekt

**Feature flag:** `ZHealingEnabled` (default "false")

---

## FASE Z6: SUB-AGENT DYNAMISK ORKESTRERING {#fase-z6}

> **Mål:** Planner bestemmer sub-agent-oppsett. Bruker kan påvirke via prompt.
> **Agent:** 3 (Komponenter)
> **Avhengigheter:** Z3 (provider-system for modellvalg)

---

### PROMPT ZN — Dynamisk planner-styrt sub-agent

**Mål:** Erstatt hardkodede kompleksitets-terskler med planner-AI som bestemmer sub-agent-oppsett per oppgave.

**Les først:**
- ai/sub-agents.ts — roller, modell-mapping
- ai/orchestrate-sub-agents.ts — planSubAgents() med hardkodede terskler
- agent/execution.ts — STEP 5.5 sub-agent dispatch

**Erstatt `planSubAgents()` med AI-drevet planlegging:**

```typescript
// ai/orchestrate-sub-agents.ts — erstatt planSubAgents():

export async function planSubAgentsDynamic(
  taskDescription: string,
  planSummary: string,
  complexity: number,
  budgetMode: BudgetMode,
  userHint?: string, // "bruk 3 agenter" fra brukerens prompt
): Promise<SubAgentPlan> {
  
  // Spør planner-AI om sub-agent-oppsett
  const plannerResponse = await callAI({
    model: getModelForRole("planner", budgetMode),
    system: `Du er en planner som bestemmer om en oppgave trenger sub-agenter.
Analyser oppgaven og bestem:
1. Trenger denne oppgaven sub-agenter? (simple oppgaver: nei)
2. Hvis ja: hvilke roller, hvor mange, og hva skal hver gjøre?
3. Avhengigheter mellom agenter

Tilgjengelige roller: planner, implementer, tester, reviewer, documenter, researcher

Svar med JSON:
{
  "useSubAgents": true/false,
  "reason": "kort forklaring",
  "agents": [
    { "role": "implementer", "task": "hva den skal gjøre", "dependsOn": [] },
    { "role": "tester", "task": "hva den skal gjøre", "dependsOn": ["implementer"] }
  ]
}`,
    messages: [{ role: "user", content: `Oppgave: ${taskDescription}\n\nPlan: ${planSummary}\n\nKompleksitet: ${complexity}/10\n${userHint ? `Brukerens ønske: ${userHint}` : ""}` }],
    maxTokens: 2000,
  });
  
  const decision = JSON.parse(stripMarkdownJson(plannerResponse.content));
  
  if (!decision.useSubAgents || decision.agents.length === 0) {
    return { agents: [], mergeStrategy: "concatenate" };
  }
  
  // Bygg SubAgent-objekter fra planner-beslutning
  const agents: SubAgent[] = decision.agents.map((a: any, i: number) => ({
    id: `sub-${i + 1}`,
    role: a.role,
    model: getModelForRole(a.role, budgetMode),
    systemPrompt: getSystemPromptForRole(a.role),
    inputContext: `${a.task}\n\nOppgave: ${taskDescription}`,
    maxTokens: getMaxTokensForRole(a.role),
    dependsOn: (a.dependsOn || []).map((dep: string) => {
      const idx = decision.agents.findIndex((d: any) => d.role === dep);
      return idx >= 0 ? `sub-${idx + 1}` : "";
    }).filter(Boolean),
  }));
  
  return {
    agents,
    mergeStrategy: agents.length > 3 ? "ai_merge" : "concatenate",
  };
}
```

**Bruker-hint deteksjon i chat:**
```typescript
// chat/chat.ts — i sendMessage, parse brukerens melding for sub-agent hints:

function extractSubAgentHint(message: string): string | undefined {
  const patterns = [
    /bruk\s+(\d+)\s+agent/i,
    /(\d+)\s+sub-?agent/i,
    /parallell.*?(\d+)/i,
    /team.*?(\d+)/i,
  ];
  for (const p of patterns) {
    const match = message.match(p);
    if (match) return `Brukeren ønsker ${match[1]} agenter`;
  }
  if (/uten sub-?agent/i.test(message)) return "Brukeren ønsker INGEN sub-agenter";
  return undefined;
}
```

**Tester:**
1. Enkel oppgave → planner sier "useSubAgents: false"
2. Kompleks oppgave → planner foreslår team
3. Bruker-hint "bruk 3 agenter" respekteres
4. Bruker-hint "uten sub-agent" respekteres
5. Avhengigheter mellom agenter løses korrekt
6. Budget mode påvirker modellvalg per agent
7. Fallback til gammel logikk hvis planner feiler

**Feature flag:** `ZDynamicSubAgents` (default "false" — bruker gammel hardkodet logikk)

---

### PROMPT ZO — Sub-agent visning i chat

**Mål:** Når sub-agenter brukes, vises de i steg-listen med status per agent.

**Endring i agent/execution.ts:**

```typescript
// Etter at sub-agents er planlagt, oppdater progress:

if (subAgentPlan.agents.length > 0) {
  addStep(ctx, { id: "sub-agents", label: `${subAgentPlan.agents.length} sub-agenter`, detail: "Starter...", done: false });
  
  const subAgentDisplay = subAgentPlan.agents.map(a => ({
    id: a.id,
    role: a.role,
    model: a.model.split("-").slice(0, 2).join("-"), // "claude-sonnet" uten versjon
    status: "pending" as const,
    label: a.inputContext.substring(0, 60),
  }));
  
  await reportProgress(ctx, {
    status: "working",
    phase: "building",
    summary: `Bygger med ${subAgentPlan.agents.length} agenter`,
    steps: buildSteps(ctx),
    subAgents: subAgentDisplay,
  });
  
  // Under executeSubAgents — oppdater status per agent
  // (krever callback-mekanisme i executeSubAgents)
}
```

**Tester:**
1. Sub-agenter vises i AgentProgress.subAgents
2. Status oppdateres per agent (pending → working → done/failed)
3. Uten sub-agenter er subAgents-feltet undefined

---

## FASE Z7: MCP + WEB-TILGANG + CHAT-INTEGRASJONER {#fase-z7}

> **Mål:** MCP fungerer ekte. TheFold kan scrape. Slack/Discord sender svar tilbake.
> **Agent:** 4 (Integrasjoner)
> **Avhengigheter:** Z0 (ny meldingskontrakt for svar-routing)

---

### PROMPT ZP — MCP fungerende

**Mål:** Fjern ubrukbare pre-seeded servere. Krev config. Valider at servere starter.

**Les først:**
- mcp/mcp.ts — install, uninstall, listInstalled
- mcp/router.ts — callTool, JSON-RPC

**Endringer:**

1. Fjern pre-seeded servere som dupliserer eksisterende services:
   - github (dupliserer github/)
   - postgres (dupliserer memory/)
   
2. Behold og fiks:
   - context7 (allerede brukt via docs, men MCP gir mer fleksibilitet)
   - brave-search (nyttig for web-søk)
   - puppeteer (nødvendig for web scraping, ZQ)

3. Legg til:
   - sentry (bug-rapporter)
   - linear (les-tilgang for import, ZG)

4. Ny status-validering:
```typescript
export const validateServer = api(
  { method: "POST", path: "/mcp/validate", expose: true, auth: true },
  async (req: { serverId: string }): Promise<{ status: "active" | "misconfigured" | "error"; message: string }> => {
    // Prøv å starte serveren og kalle "tools/list"
    // Returner status basert på resultat
  }
);
```

5. Alle servere MÅ ha config satt før status er "active":
```typescript
// mcp/mcp.ts — endre install():
// Valider at alle påkrevde env vars er satt
// Status = "not_configured" inntil config er komplett
```

**Tester:**
1. Server uten config vises som "not_configured"
2. Server med config valideres og vises som "active"
3. Feil under validering vises som "error" med melding
4. github/postgres pre-seeded servere er fjernet
5. sentry og linear servere kan installeres

---

### PROMPT ZQ — Web-tilgang (scraping)

**Mål:** TheFold kan besøke nettsider og bruke innholdet som kontekst.

**Ny service: web/**

```typescript
// web/web.ts (NY SERVICE)

import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";

const FirecrawlApiKey = secret("FirecrawlApiKey");

interface ScrapeRequest {
  url: string;
  maxLength?: number;  // Maks tegn returnert (default 50000)
}

interface ScrapeResponse {
  title: string;
  content: string;     // Markdown-formatert innhold
  links: string[];
  metadata: { wordCount: number; language?: string };
}

export const scrape = api(
  { method: "POST", path: "/web/scrape", expose: false },
  async (req: ScrapeRequest): Promise<ScrapeResponse> => {
    const apiKey = FirecrawlApiKey();
    
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: req.url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });
    
    if (!res.ok) throw APIError.internal(`Firecrawl error: ${res.status}`);
    
    const data = await res.json();
    const content = data.data?.markdown || "";
    const maxLen = req.maxLength || 50000;
    
    return {
      title: data.data?.metadata?.title || "",
      content: content.substring(0, maxLen),
      links: data.data?.links || [],
      metadata: {
        wordCount: content.split(/\s+/).length,
        language: data.data?.metadata?.language,
      },
    };
  }
);
```

**Legg til web.scrape som tool i chat:**
```typescript
// ai/ai.ts — legg til i tool-definisjoner:
{
  name: "browse_url",
  description: "Besøk en nettside og les innholdet. Bruk dette når brukeren ber om å se på en URL.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL-en som skal besøkes" },
    },
    required: ["url"],
  },
}
```

**Secret:**
```
For web-tilgang trenger jeg Firecrawl API-nøkkel.
Gå til firecrawl.dev → Dashboard → API Keys
Kjør: encore secret set FirecrawlApiKey --type prod
(Gratis tier: 500 sider/måned)
```

**Tester:**
1. scrape henter innhold fra en URL
2. maxLength begrenser output
3. Feil fra Firecrawl håndteres gracefully
4. browse_url tool er tilgjengelig i chat
5. Innhold brukes som kontekst for agenten

---

### PROMPT ZR — Slack/Discord toveis

**Mål:** TheFold kan motta OG svare i Slack og Discord.

**Les først:**
- integrations/integrations.ts — slack-webhook, discord-webhook (kun mottak)
- chat/chat.ts — source-felt i SendRequest

**Ny flyt:**

1. Melding inn fra Slack → integrations/slack-webhook → chat.send(source: "slack", metadata: { channelId, responseUrl })
2. Agenten prosesserer → svar lagres i chat
3. Ny subscription: chat-response-router → sjekker source → sender svar tilbake til Slack/Discord

```typescript
// integrations/integrations.ts — legg til utgående:

export async function sendToSlack(webhookUrl: string, message: string): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

export async function sendToDiscord(webhookUrl: string, message: string): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
}
```

**Chat response router:**
```typescript
// chat/chat.ts — ny Pub/Sub subscriber:

export const chatResponses = new Topic<ChatResponse>("chat-responses", {
  deliveryGuarantee: "at-least-once",
});

interface ChatResponse {
  conversationId: string;
  content: string;
  source: "web" | "slack" | "discord" | "api";
  metadata: Record<string, string>;
}

const responseRouter = new Subscription(chatResponses, "route-response", {
  handler: async (response) => {
    if (response.source === "slack" && response.metadata.webhookUrl) {
      await sendToSlack(response.metadata.webhookUrl, response.content);
    } else if (response.source === "discord" && response.metadata.webhookUrl) {
      await sendToDiscord(response.metadata.webhookUrl, response.content);
    }
    // "web" og "api" — ingen routing nødvendig, frontend poller
  },
});
```

**Tester:**
1. Slack-webhook mottar melding og oppretter chat
2. Discord-webhook mottar melding og oppretter chat
3. Svar routes tilbake til Slack via webhook
4. Svar routes tilbake til Discord via webhook
5. Web-kilde får ikke sendt webhook (bare pollet)

---

## FASE Z8: E-POST + OPPRYDDING + KONTOSOPPSETT {#fase-z8}

> **Mål:** E-post-notifikasjoner, fjern død kode, og guide for kontosoppsett.
> **Agent:** 4 (Integrasjoner)
> **Avhengigheter:** Z0 + Z7

---

### PROMPT ZS — E-post notifikasjoner

**Mål:** TheFold sender e-post ved jobb-fullføring, healing-rapporter, og kritiske feil.

**Les først:**
- gateway/gateway.ts — Resend brukes allerede for OTP

**Ny: e-post-service (bruker samme Resend):**

```typescript
// gateway/email.ts (NY fil i gateway-servicen)

import { secret } from "encore.dev/config";

const ResendApiKey = secret("ResendApiKey"); // Eksisterer allerede
const TheFoldEmail = secret("TheFoldEmail"); // Ny: f.eks. "thefold@thefold.dev"

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(req: EmailRequest): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ResendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: TheFoldEmail(),
      to: req.to,
      subject: req.subject,
      html: req.html,
    }),
  });
}
```

**Trigger-punkter:**
1. `agent/completion.ts` — etter PR opprettet: send e-post med PR-link
2. `registry/maintenance.ts` — etter weekly scan: send healing-rapport
3. `agent/execution.ts` — ved kritisk feil (maks retries): send feilrapport

**Tester:**
1. E-post sendes ved jobb-fullføring
2. E-post sendes ved healing-rapport
3. E-post feiler gracefully (ikke blokker agent-flyt)
4. TheFoldEmail secret brukes som avsender

---

### PROMPT ZT — Fjern død kode + Legacy

**Mål:** Rydd opp alt som er erstattet av Z-prosjektet.

**Filer som SLETTES:**
```
# AgentStatus-komponenter (erstattet av AgentProgress i frontend-plan)
# MERK: Frontend-filer slettes i frontend-planen, ikke her.
# Denne prompten fjerner kun BACKEND død kode.

# Legacy meldingsformat
chat/agent-message-parser.ts — SLETT INNHOLD, erstatt med:
  export { deserializeProgress } from "../agent/messages";
  // Bare re-export for backward compat

# Templates-service (erstattet av komponentbibliotek)
templates/templates.ts — SLETT HELE FILEN
templates/types.ts — SLETT
templates/db.ts — SLETT
templates/migrations/ — BEHOLD (DB eksisterer, fjernes via migrasjon)

# Ubrukte monitor health_rules
monitor/migrations/X_health_rules — lag DROP TABLE migrasjon

# Legacy "magic phrases" og fase-ikoner referanser
# (Frontend-ansvar, men fjern eventuelle backend-referanser)
```

**Kode som FORENKLES:**
```
# chat/chat.ts — fjern buildLegacyStatusContent() etter at ZNewMessageContract er true i 2 uker
# agent/messages.ts — fjern convertLegacy() etter at ZNewMessageContract er true i 2 uker
# agent/helpers.ts — fjern report() og think() etter at alle kall er oppdatert til reportProgress()
```

**Tester:**
1. Etter sletting: `encore build` kompilerer uten feil
2. Etter sletting: alle eksisterende tester passerer
3. Ingen import-referanser til slettede filer

---

### PROMPT ZU — Kontosoppsett-guide

**Mål:** Dokument som guider gjennom oppsett av alle eksterne kontoer og secrets.

**Denne prompten genererer IKKE kode, men en markdown-fil:**

```markdown
# TheFold — Kontosoppsett

## Secrets som MÅ settes (i rekkefølge):

### 1. OpenAI (for memory embeddings)
- Gå til platform.openai.com → API Keys
- Bruk nøkkelen "thefold-memory" du opprettet
- Kjør: encore secret set OpenAIApiKey --type prod

### 2. GitHub App (for repo-tilgang)
- Gå til github.com → Settings → Developer settings → GitHub Apps
- Bruk appen du opprettet for thefold-dev
- Kjør: encore secret set GitHubAppId --type prod
- Kjør: encore secret set GitHubAppPrivateKey --type prod
  (lim inn HELE .pem-filen inkludert BEGIN/END linjer)

### 3. Firecrawl (for web-tilgang) — VALGFRITT
- Gå til firecrawl.dev → Dashboard → API Keys
- Kjør: encore secret set FirecrawlApiKey --type prod

### 4. OpenRouter (for flere AI-modeller) — VALGFRITT
- Gå til openrouter.ai → Keys
- Kjør: encore secret set OpenRouterApiKey --type prod

### 5. Fireworks (for billige modeller) — VALGFRITT
- Gå til fireworks.ai → API Keys
- Kjør: encore secret set FireworksApiKey --type prod

### 6. TheFold e-post
- Sett opp e-postdomene i Resend for thefold.dev
- Kjør: encore secret set TheFoldEmail --type prod
  (f.eks. "agent@thefold.dev")

## Feature flags (aktiver gradvis):
encore secret set ZNewMessageContract --type prod  (verdi: "true")
encore secret set ZMultiProvider --type prod       (verdi: "true")
encore secret set ZGitHubApp --type prod           (verdi: "true")
encore secret set ZDynamicSubAgents --type prod    (verdi: "true")
encore secret set ZHealingEnabled --type prod      (verdi: "true")

## Re-embedding av minner:
Etter at OpenAI er konfigurert:
  curl -X POST https://your-encore-app/memory/re-embed -H "Authorization: Bearer <token>"
```

---

## RAPPORT-MAL {#rapport-mal}

Alle agenter skriver til `prosjekt-z-rapport.md` i dette formatet:

```markdown
# Prosjekt Z — Rapport

## Agent 1 (Kontrakt)

### ZA — Ny meldingskontrakt
- Status: ✅/⚠️/❌
- Filer opprettet: [liste]
- Filer endret: [liste]
- Tester: X/Y passert
- Bugs funnet: [liste eller "Ingen"]
- Notater: [eventuelle avvik fra planen]

### ZB — Én oppdaterbar melding
...

### ZC — DB-migrasjon + indekser
...

### ZD — Review → Rapport
...

### ZE — Confidence → Spørsmål
...

---

## Agent 2 (Infrastruktur)

### ZF — Tasks som master
...
(osv. for ZG, ZH, ZI, ZJ, ZK)

---

## Agent 3 (Komponenter)

### ZL — Komponentbibliotek
...
(osv. for ZM, ZN, ZO)

---

## Agent 4 (Integrasjoner)

### ZP — MCP fungerende
...
(osv. for ZQ, ZR, ZS, ZT, ZU)

---

## Samlet status
- Totalt prompts: 21
- Fullført: X/21
- Delvis: X/21
- Feilet: X/21
- Totalt tester skrevet: X
- Totalt tester passert: X
- Kritiske bugs: [liste]
- Endringer som trengs: [liste]
```

---

## RISIKO-MATRISE {#risiko-matrise}

| Risiko | Sanns. | Konsekvens | Mitigering | Prompt |
|--------|--------|------------|------------|--------|
| Ny meldingskontrakt brekker frontend | HØY | Chat viser ikke agent-svar | Feature flag + legacy fallback | ZA |
| OpenAI embedding-dimensjon mismatch | MEDIUM | Memory-søk feiler | Migrasjon + re-embed | ZI |
| GitHub App token-generering feiler | LAV | Kan ikke lese/skrive kode | Fallback til gammel PAT | ZK |
| Templates-sletting mister data | LAV | Eksisterende templates borte | Migrer til registry først | ZL |
| Sub-agent planner gir dårlige oppsett | MEDIUM | Token-sløsing | Fallback til hardkodet logikk | ZN |
| Firecrawl rate limit | LAV | Web scraping stopper | Caching + backoff | ZQ |
| Slack/Discord webhook format-endring | LAV | Svar når ikke fram | Retry + feillogging | ZR |
| Mange samtidige migrasjoner krasjer DB | MEDIUM | Nedetid | Kjør migrasjoner sekvensielt | ZC |

---

## REGLER FOR ALLE PROMPTS

1. **Les CLAUDE.md FØR du skriver kode**
2. **Bruk Encore-skills** for alle endpoints, DB, Pub/Sub, secrets, tester
3. **Kjør encore-code-review** etter hver deloppgave
4. **Feature-flag ALT** — default false, aktiver gradvis
5. **Legacy fallback** — gammel kode fungerer når flag er false
6. **Skriv tester** for alt — minst 4 tester per prompt
7. **Oppdater docs** — CLAUDE.md, GRUNNMUR-STATUS.md etter hver prompt
8. **Rapport** — skriv til prosjekt-z-rapport.md etter fullføring
9. **Ikke endre andres filer** — definer interfaces, importer dem
10. **Ved tvil: stopp og dokumenter** — bedre å spørre enn å gjette

---

*Z-PROSJEKT transformerer TheFold fra autonom kode-agent til autonom utviklingsplattform. Backend-endringer i denne planen. Frontend-endringer i egen plan.*

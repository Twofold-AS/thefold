# 📋 PROMPT YE — Prosedyremessig minne (strategier)

---

## ⚠️ OBLIGATORISK: Skills — les, bruk og rapporter

### STEG 0 — Skills du SKAL lese og bruke:

| # | Skill | Sti | Hvorfor |
|---|-------|-----|---------|
| 1 | `encore-service` | `.claude/skills/encore-service/SKILL.md` | Cross-service kall, memory.store() |
| 2 | `encore-testing` | `.claude/skills/encore-testing/SKILL.md` | Vitest-mønster, mock-strategi |
| 3 | `encore-code-review` | `.claude/skills/encore-code-review/SKILL.md` | Sjekkliste for code review |
| 4 | `thefold-verify` | `.claude/skills/thefold-verify/SKILL.md` | Kjør STEG 3 (agent modul-integrasjon) etter implementasjon |

**LES ALLE 4 FØR DU SKRIVER EN ENESTE LINJE KODE.**

---

## ⚠️ OBLIGATORISK: Verifiser YA-YD først

```bash
# 1. YA: filterForPhase
grep -n "filterForPhase" agent/agent.ts

# 2. YB: RetryContext
grep -n "computeRetryContext" agent/execution.ts

# 3. YC: Hybrid search
grep -n "HYBRID_ALPHA" memory/memory.ts

# 4. YD: Import graph
grep -n "buildImportGraph" agent/code-graph.ts
grep -n "code-graph" agent/context-builder.ts

# 5. Kjør alle agent + memory tester
encore test ./agent/... 2>&1 | tail -5
encore test ./memory/... 2>&1 | tail -5
```

**Hvis noe mangler eller feiler:** Fiks det FØR du starter YE.

---

## Les følgende prosjektfiler:
- `CLAUDE.md`
- `Y-PROSJEKT-PLAN.md` (les "PROMPT YE"-seksjonen)
- `agent/completion.ts` — les HELE filen, spesielt:
  - `completeTask()` — STEP 9-12
  - STEP 11: Hvordan memories lagres (decisions + error_patterns)
  - Hva som er tilgjengelig: `ctx`, `allFiles`, `documentation`, `memoriesExtracted`
- `agent/execution.ts` — les STEP 5 (planning), spesielt:
  - Hvordan `ai.planTask()` kalles
  - Hva som sendes som input (task, projectStructure, relevantFiles, memoryContext, etc.)
  - Hvor strategier kan injiseres som hint
- `agent/types.ts` — les `AgentExecutionContext`, spesielt:
  - `totalAttempts`, `attemptHistory`, `taskDescription`
- `memory/memory.ts` — les `store()` og `search()`, spesielt:
  - Hvilke `memoryType`-verdier som finnes (`general`, `error_pattern`, `decision`, `code_pattern`, etc.)
  - Hvordan `search()` filtrerer på memoryType
  - trust_level (fra XL)
- `ai/ai.ts` — les `planTask()` input-typen — hva kan vi sende som ekstra kontekst?

---

## Bakgrunn

**Problemet:** Agenten "glemmer" vellykkede strategier. Hver gang den møter en lignende oppgave, resonnerer den fra scratch. Det koster tokens og gir inkonsistente resultater.

**Eksempel:** Agenten har bygget 5 Encore-migrasjoner. Hver gang oppdaget den: "sjekk eksisterende migrasjoner → finn neste nummer → lag up.sql → test". Men denne lærdommen er ikke lagret — den finnes implisitt i 5 separate `decision`-minner, ikke som én eksplisitt strategi.

**Løsningen:** Ny memory_type `strategy`. Etter vellykket task med førstegangssuksess og høy kvalitetsscore, analysér hva som fungerte og lagre det som en gjenbrukbar strategi. Ved neste lignende oppgave, hent strategien og gi den som hint til planning-fasen.

**Viktig design-beslutning:** Strategier er **hint, ikke instruksjoner**. AI-et kan velge å ignorere dem. De forfaller via eksisterende temporal decay — dårlige strategier forsvinner naturlig.

---

## Oppgave

### DEL 1: Task pattern detection

Ny funksjon i `agent/completion.ts`:

```typescript
/**
 * Detekterer oppgavetype basert på beskrivelse.
 * Returnerer en kort, søkbar streng som kan matche lignende oppgaver.
 *
 * Eksempler:
 *   "Legg til en ny API-endpoint for brukerregistrering" → "new api endpoint"
 *   "Fiks TypeScript-feilen i auth.ts" → "fix typescript error"
 *   "Lag en ny database-migrasjon for users" → "database migration"
 *   "Refaktorer agent.ts til mindre moduler" → "refactoring modules"
 *   "Legg til rate limiting på agent-kall" → "add rate limiting"
 */
export function detectTaskPattern(taskDescription: string): string {
  const desc = taskDescription.toLowerCase();

  // Prioriterte mønstre (sjekkes i rekkefølge)
  const patterns: Array<{ keywords: string[]; pattern: string }> = [
    { keywords: ["migration", "migrasjon", "sql", "alter table", "create table"], pattern: "database migration" },
    { keywords: ["api", "endpoint", "route", "handler"], pattern: "new api endpoint" },
    { keywords: ["fix", "fiks", "bug", "error", "feil"], pattern: "fix bug" },
    { keywords: ["refactor", "refaktorer", "decompose", "extract", "split"], pattern: "refactoring" },
    { keywords: ["test", "tester", "testing", "spec"], pattern: "add tests" },
    { keywords: ["security", "auth", "sikkerhet", "owasp"], pattern: "security improvement" },
    { keywords: ["frontend", "ui", "component", "page", "side"], pattern: "frontend change" },
    { keywords: ["config", "setup", "install", "configure"], pattern: "configuration" },
    { keywords: ["doc", "docs", "documentation", "readme"], pattern: "documentation" },
    { keywords: ["performance", "optimize", "cache", "speed"], pattern: "performance optimization" },
  ];

  for (const { keywords, pattern } of patterns) {
    if (keywords.some(kw => desc.includes(kw))) {
      return pattern;
    }
  }

  // Fallback: bruk de 3 første substansielle ordene
  const words = desc.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  return words.join(" ") || "general task";
}

/**
 * Ekstraher vellykkede steg fra plan + attemptHistory.
 * Returnerer en kort, lesbar liste av hva som fungerte.
 */
export function extractSuccessfulSteps(
  attemptHistory: Array<{ stepIndex: number; action: string; result: string; error?: string }>,
  planSummary: string,
): string[] {
  // Bruk plan-stegene som base
  const planSteps = planSummary.split("\n").filter(s => s.trim().length > 0);

  // Filtrer bort steg som feilet
  const failedSteps = new Set(
    attemptHistory
      .filter(a => a.result === "failure")
      .map(a => a.stepIndex)
  );

  return planSteps.filter((_, i) => !failedSteps.has(i));
}
```

### DEL 2: Lagre strategi etter vellykket completion

Modifiser `completeTask()` i `agent/completion.ts`. Legg til ETTER STEP 11 (existing memory storage):

```typescript
// === STEP 11.5: Store strategy memory (if first-attempt success with high quality) ===
const qualityScore = reviewData?.qualityScore ?? 0;
if (ctx.totalAttempts === 1 && qualityScore >= 7) {
  const taskPattern = detectTaskPattern(ctx.taskDescription);
  const successfulSteps = extractSuccessfulSteps(ctx.attemptHistory, planSummary);

  if (successfulSteps.length > 0) {
    const strategyContent = JSON.stringify({
      taskPattern,
      steps: successfulSteps,
      filesChanged: allFiles.map(f => f.path),
      model: ctx.selectedModel,
      qualityScore,
      tokensSaved: 0, // oppdateres ved gjenbruk
    });

    memory.store({
      content: `Strategy for "${taskPattern}": ${successfulSteps.join(" → ")}`,
      category: "strategy",
      linearTaskId: ctx.taskId,
      memoryType: "strategy",
      sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
      trustLevel: "agent",
      tags: [taskPattern, "strategy"],
    }).catch(e => log.warn("memory.store strategy failed", { error: String(e) }));

    log.info("strategy stored", {
      taskPattern,
      stepsCount: successfulSteps.length,
      qualityScore,
      repo: `${ctx.repoOwner}/${ctx.repoName}`,
    });
  }
}
```

**Betingelser for lagring:**
- `totalAttempts === 1` — førstegangssuksess (strategien fungerte uten retry)
- `qualityScore >= 7` — AI-reviewen ga god score (ikke bare "det kompilerer")
- `successfulSteps.length > 0` — det finnes faktisk steg å lagre

**Viktig:** Fire-and-forget `.catch()` — som eksisterende memory-lagring. Strategi-lagring er ikke kritisk.

### DEL 3: Hent strategier før planning

Modifiser `executePlan()` i `agent/execution.ts`. Legg til FØR STEP 5 (ai.planTask):

```typescript
// === STEP 4.9: Hent strategi-hint fra memory ===
let strategyHint = "";

try {
  const strategies = await memory.search({
    query: ctx.taskDescription.substring(0, 200),
    memoryType: "strategy",
    sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
    limit: 2,
  });

  if (strategies.results.length > 0) {
    const best = strategies.results[0];
    // Kun bruk strategi med god similarity (hybrid search gir bedre treff etter YC)
    if (best.similarity > 0.3) {
      strategyHint = `\n\n[STRATEGY HINT — Tidligere vellykket tilnærming for lignende oppgaver]\n${best.content}\n[END STRATEGY HINT — Bruk dette som inspirasjon, ikke som instruks]`;

      log.info("strategy hint found", {
        similarity: best.similarity,
        memoryType: best.memoryType,
        content: best.content.substring(0, 200),
      });
    }
  }
} catch (err) {
  log.warn("strategy search failed, continuing without", { error: String(err) });
  // Graceful degradation — planlegging fungerer fint uten strategi
}
```

**Injiser hint i planTask-kallet:**

```typescript
// Modifiser task-strengen som sendes til ai.planTask:
const taskWithStrategy = strategyHint
  ? `${ctx.taskDescription}\n\nUser context: ${ctx.userMessage}${strategyHint}`
  : `${ctx.taskDescription}\n\nUser context: ${ctx.userMessage}`;

plan = await auditedStep(ctx, "plan_created", {
  taskDescription: ctx.taskDescription.substring(0, 200),
  model: ctx.selectedModel,
  hasStrategyHint: strategyHint.length > 0,
}, () => aiBreaker.call(() => ai.planTask({
  task: taskWithStrategy,  // ← strategi-hint inkludert her
  projectStructure: treeString,
  relevantFiles,
  memoryContext: memoryStrings,
  docsContext: docsStrings,
  model: ctx.selectedModel,
})));
```

**Viktig design:**
- Strategien legges til i `task`-strengen — ikke som et separat felt. `ai.planTask()` trenger IKKE endres.
- Hint er tydelig merket med `[STRATEGY HINT]` og `[END STRATEGY HINT]` slik at AI-et vet det er et forslag, ikke en instruksjon.
- `similarity > 0.3` filtrerer bort irrelevante strategier (hybrid search fra YC gir bedre matching).
- `sourceRepo`-filter sikrer at strategier fra andre repoer ikke blandes inn (kan fjernes senere for cross-repo læring).
- Hele blokken er wrapped i try/catch — strategi-henting er aldri kritisk.

### DEL 4: Tester

**Legg til i `agent/completion.test.ts` (eller opprett ny fil `agent/strategy.test.ts` hvis completion.test.ts har import-problemer):**

```typescript
import { describe, it, expect } from "vitest";
import { detectTaskPattern, extractSuccessfulSteps } from "./completion";

describe("detectTaskPattern", () => {
  it("should detect database migration", () => {
    expect(detectTaskPattern("Lag en ny SQL-migrasjon for users-tabellen")).toBe("database migration");
  });

  it("should detect new api endpoint", () => {
    expect(detectTaskPattern("Legg til et nytt API-endpoint for brukerregistrering")).toBe("new api endpoint");
  });

  it("should detect fix bug", () => {
    expect(detectTaskPattern("Fiks TypeScript-feilen i auth.ts")).toBe("fix bug");
  });

  it("should detect refactoring", () => {
    expect(detectTaskPattern("Refaktorer agent.ts til mindre moduler")).toBe("refactoring");
  });

  it("should detect security improvement", () => {
    expect(detectTaskPattern("Implementer OWASP security headers")).toBe("security improvement");
  });

  it("should fallback to first 3 words for unknown patterns", () => {
    const pattern = detectTaskPattern("Implementer fancy widget system med konfetti");
    expect(pattern).toBeTruthy();
    expect(pattern.split(" ").length).toBeLessThanOrEqual(3);
  });

  it("should handle empty description", () => {
    expect(detectTaskPattern("")).toBe("general task");
  });

  it("should be case insensitive", () => {
    expect(detectTaskPattern("FIX the BUG in Auth")).toBe("fix bug");
  });
});

describe("extractSuccessfulSteps", () => {
  it("should return all steps when no failures", () => {
    const history = [
      { stepIndex: 0, action: "create", result: "success" },
      { stepIndex: 1, action: "create", result: "success" },
    ];
    const plan = "1. Create types.ts\n2. Create auth.ts";
    const steps = extractSuccessfulSteps(history, plan);
    expect(steps).toHaveLength(2);
  });

  it("should filter out failed steps", () => {
    const history = [
      { stepIndex: 0, action: "create", result: "success" },
      { stepIndex: 1, action: "create", result: "failure", error: "TS error" },
      { stepIndex: 2, action: "create", result: "success" },
    ];
    const plan = "1. Create types.ts\n2. Create broken.ts\n3. Create auth.ts";
    const steps = extractSuccessfulSteps(history, plan);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain("types.ts");
    expect(steps[1]).toContain("auth.ts");
  });

  it("should handle empty plan", () => {
    const steps = extractSuccessfulSteps([], "");
    expect(steps).toHaveLength(0);
  });
});
```

**Legg til i `agent/execution.test.ts`:**

```typescript
describe("strategy hint in planning", () => {
  it("should include strategy hint when memory returns results", async () => {
    // Mock memory.search to return a strategy
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{
        id: "strat-1",
        content: 'Strategy for "database migration": 1. Check existing → 2. Create up.sql',
        similarity: 0.8,
        memoryType: "strategy",
        category: "strategy",
        relevanceScore: 1.0,
        decayedScore: 1.0,
        accessCount: 3,
        tags: ["database migration"],
        createdAt: "2026-01-01",
        trustLevel: "agent",
      }],
    });

    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    // Verify planTask was called with strategy hint in task string
    const planTaskCall = (ai.planTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(planTaskCall.task).toContain("[STRATEGY HINT");
    expect(planTaskCall.task).toContain("database migration");
  });

  it("should skip strategy hint when similarity is too low", async () => {
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{
        id: "strat-2",
        content: "Irrelevant strategy",
        similarity: 0.1,  // too low
        memoryType: "strategy",
        category: "strategy",
        relevanceScore: 0.5,
        decayedScore: 0.5,
        accessCount: 1,
        tags: [],
        createdAt: "2026-01-01",
        trustLevel: "agent",
      }],
    });

    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    const planTaskCall = (ai.planTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(planTaskCall.task).not.toContain("[STRATEGY HINT");
  });

  it("should handle strategy search failure gracefully", async () => {
    (memory.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("memory service down"));

    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    // Should NOT throw — graceful degradation
    const result = await executePlan(ctx, CONTEXT_DATA, tracker, helpers);
    expect(result.success).toBe(true);
  });
});
```

---

## Filer som endres:
- `agent/completion.ts` — detectTaskPattern(), extractSuccessfulSteps(), STEP 11.5 strategi-lagring
- `agent/execution.ts` — STEP 4.9 strategi-henting + hint i planTask

## Filer som opprettes:
- `agent/strategy.test.ts` (NY) — 8+ tester for detectTaskPattern + extractSuccessfulSteps
  - MERK: Bruk separat testfil fordi completion.test.ts har kjent ~encore/auth import-problem

## Filer som IKKE endres:
- `memory/memory.ts` — "strategy" er allerede en gyldig memory_type (fritekst-felt)
- `ai/ai.ts` — planTask() endres IKKE (strategi injiseres via task-strengen)

## Krav:
- Alle eksisterende execution-tester MÅ fortsatt passere
- detectTaskPattern og extractSuccessfulSteps er RENE funksjoner — ingen sideeffekter, ingen async
- Strategi-lagring er fire-and-forget (.catch) — aldri kritisk
- Strategi-henting er wrapped i try/catch — aldri blokkerer planning
- Strategier er HINT, ikke instruksjoner — tydelig merket i prompt
- similarity > 0.3 som terskel for relevans
- sourceRepo-filter — strategier deles IKKE på tvers av repoer (foreløpig)
- ALDRI bruk `process.env`, `dotenv`, `express`, `require()`

## Tester: 11 minimum (8 pattern/steps + 3 execution strategy). Kjør `encore test`.

## Etter fullføring:

1. **Kjør `encore-code-review`** (bruk `.claude/skills/encore-code-review/SKILL.md`)
2. **Kjør `thefold-verify` STEG 3** — agent modul-integrasjon (bruk `.claude/skills/thefold-verify/SKILL.md`)
3. Y-PROSJEKT-PLAN.md — YE → ✅
4. GRUNNMUR-STATUS.md — legg til prosedyremessig minne seksjon
5. CLAUDE.md — oppdater completion.ts og execution.ts beskrivelser

6. **Rapport med følgende format:**

```
📋 PROMPT YE — Prosedyremessig minne (strategier)

Skills brukt:
- encore-service: [ja/nei] — [hvordan]
- encore-testing: [ja/nei] — [hvordan]
- encore-code-review: [ja/nei] — [hvordan]
- thefold-verify: [ja/nei] — [hvordan]

Implementasjon:
- completion.ts: [hva ble lagt til — detectTaskPattern, extractSuccessfulSteps, STEP 11.5]
- execution.ts: [hva ble lagt til — STEP 4.9 strategi-henting]

Tester: [X]/[Y] passert
Code review: [oppsummering]
thefold-verify STEG 3: [resultat]

Strategi-lagring:
- Betingelser: totalAttempts=1, qualityScore≥7
- Pattern detection: [antall mønstre] kategorier
- Storage: memory_type="strategy", trustLevel="agent"

Strategi-henting:
- Similarity-terskel: 0.3
- Repo-filter: ja
- Injeksjon: task-streng med [STRATEGY HINT] markup

Minnearkitektur fullstendig:
- Arbeidsminne: ✅ (AgentExecutionContext)
- Episodisk minne: ✅ (memory.search + temporal decay)
- Semantisk minne: ✅ (docs + skills)
- Prosedyremessig minne: ✅ (strategier — YE)
- Strukturelt minne: ✅ (import-graf — YD)

📋 Neste: YF (Agent Inspector — frontend)
```
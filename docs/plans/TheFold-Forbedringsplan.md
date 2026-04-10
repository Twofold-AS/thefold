# TheFold Forbedringsplan — Inspirert av Claude Code-arkitekturen

## Kontekst

TheFold er en autonom fullstack-agent bygget på Encore.ts (16 services). Etter analyse av Claude Code-kildekoden (~1900 filer, ~512K linjer) har vi identifisert konkrete mønstre som kan forbedre TheFold på 6 områder: gjenbruk av kode/patterns, sikkerhet, mappestruktur, Bun-vurdering, Dream-modus, og mikro-beslutninger ("hjerne-modus").

---

## FASE 1: Mikro-Beslutninger — "Hjerne-modus" (HØYEST PRIORITET)

**Problem:** Hver oppgave kjører FULL pipeline (context → confidence AI-kall → complexity AI-kall → plan AI-kall → build → review). For enkle oppgaver som "fix typo" eller "legg til import" koster dette $0.50+ og 30+ sekunder — helt unødvendig.

**Inspirasjon fra Claude Code:** Token budget med diminishing returns detection — stopp tidlig når output krymper. Coordinator heuristikk for continue vs. spawn fresh. Forked agents med separat kontekst.

### 1A. Decision Cache (`agent/decision-cache.ts` — NY FIL)

Forhåndsberegnet lookup-tabell over oppgave-mønstre til eksekveringsstrategier:

```typescript
interface CachedDecision {
  id: string;
  pattern: string;           // "fix_typo", "add_import", "update_dep"
  patternRegex: string;      // Regex for matching mot task descriptions
  confidence: number;        // 0-1, øker med suksessfulle bruk
  strategy: 'fast_path' | 'standard' | 'careful';
  skipConfidence: boolean;
  skipComplexity: boolean;
  preferredModel: string;
  planTemplate?: string;     // Forhåndsbygd plan (JSON) for vanlige patterns
  successCount: number;
  failureCount: number;
}
```

**Flyt:** Mellom `buildContext()` og `assessAndRoute()` i `agent/agent.ts`:
1. Match task description mot decision cache (regex + embedding similarity)
2. Hvis confidence > 0.85 → FAST PATH: hopp over AI confidence + complexity, bruk cached model/plan
3. Hvis mislykkes → fallback til standard pipeline, oppdater cache

### 1B. Pattern Matcher (`agent/pattern-matcher.ts` — NY FIL)

Hardkodede regex-mønstre for de vanligste oppgavetypene:

| Pattern | Strategi | Modell | Hopp over |
|---------|----------|--------|-----------|
| typo/spelling/rename | fast_path | haiku | confidence + complexity + plan |
| add/missing import | fast_path | haiku | confidence + complexity |
| update version/dep | fast_path | haiku | confidence |
| migration/schema | standard | sonnet | confidence |
| new feature/component | careful | sonnet/opus | ingenting |

### 1C. Erfaringsbasert Confidence Bypass (`agent/confidence.ts` — ENDRE)

Før AI-kall for confidence, sjekk:
1. Har repo'et 5+ vellykkede oppgaver? → Kjent repo, reduser vurdering
2. Finnes lignende strategi-minne med similarity > 0.8? → Hopp over confidence
3. Er oppgaven matchet av pattern-matcher? → Bruk cached strategi

### 1D. Adaptiv Læring (`agent/completion.ts` — ENDRE)

Etter hver oppgave:
- Fast-path suksess → øk pattern confidence
- Fast-path feil → reduser confidence, neste gang bruk standard
- Standard-path triviell (<30s, <1000 tokens) → opprett ny fast-path entry

**Filer:**
- NY: `agent/decision-cache.ts` (~150 linjer)
- NY: `agent/pattern-matcher.ts` (~100 linjer)
- NY: `agent/migrations/X_create_decision_cache.up.sql`
- ENDRE: `agent/agent.ts` — Legg til fast-path sjekk mellom context og confidence
- ENDRE: `agent/confidence.ts` — Legg til bypass-logikk
- ENDRE: `agent/completion.ts` — Oppdater decision cache etter oppgave

---

## FASE 2: Dream Mode — Automatisk Minnekonsolidering (HØY PRIORITET)

**Problem:** TheFold lagrer minner men forbedrer dem aldri. `consolidate()` er manuell og bare konkatenerer. Ingen auto-trigger, ingen kvalitetsforbedring.

**Inspirasjon fra Claude Code:** `autoDream.ts` — 4-gate system (tid + sesjoner + throttle + lock), forked agent med read-only tilgang, rollback ved feil.

### 2A. Dream Engine (`memory/dream.ts` — NY FIL)

CronJob som kjører hver 6. time med 4 gates:

1. **Tidsgate:** Sjekk `last_dream_at` i ny `memory_meta` tabell. < 24t siden sist → skip
2. **Aktivitetsgate:** Count fullførte oppgaver siden sist. < 3 oppgaver → skip
3. **Advisory lock:** `pg_try_advisory_lock(42424242)` — forhindrer samtidige drømmer
4. **Kvalitetssjekk:** Etter konsolidering, verifiser at nytt minne beholder semantisk kvalitet

### 2B. Dream-faser

```
SCAN    → Finn minneklynger (similarity > 0.7 mellom par, gruppert per repo+type)
ANALYZE → For hver klynge, identifiser kjerneinnsikt via AI
MERGE   → Opprett nytt raffinert minne, marker originaler som superseded
META    → Generer meta-observasjoner på tvers av oppgaver
PRUNE   → Fjern minner som er både lav-relevans OG superseded
```

### 2C. AI-drevet Konsolidering (`ai/ai.ts` — ENDRE)

Nytt endpoint `consolidateMemories`:
- Input: 3+ lignende minner
- Output: Én raffinert innsikt (ikke bare konkatenering)
- Modell: haiku (billigst, tilstrekkelig for oppsummering)

### 2D. Meta-minner

Dream-motoren genererer tre typer output:
- **Konsoliderte minner:** Sammenslåtte klynger
- **Strategi-minner:** Generaliserte mønstre fra suksessfulle oppgaver
- **Anti-patterns:** Fra mislykkede oppgaver — hva man IKKE skal gjøre

**Filer:**
- NY: `memory/dream.ts` (~250 linjer)
- NY: `memory/migrations/X_add_dream_meta.up.sql`
- ENDRE: `ai/ai.ts` — Nytt `consolidateMemories` endpoint
- ENDRE: `memory/memory.ts` — Eksporter interne søk-funksjoner for dream

---

## FASE 3: Smart Retry med Diminishing Returns (HØY PRIORITET)

**Problem:** Retry-loopen i `execution.ts` bruker fast `MAX_RETRIES = 5`. Ingen awareness om retries faktisk gjør fremskritt. Kan brenne $2+ på håpløse oppgaver.

**Inspirasjon fra Claude Code:** `tokenBudget.ts` — Track output per continuation, stopp tidlig ved 3+ continuations med < 500 tokens output.

### 3A. Retry Productivity Tracking (`agent/execution.ts` — ENDRE)

```typescript
interface RetryProductivity {
  attemptNumber: number;
  filesChanged: number;
  validationErrorsFixed: number;
  newErrorsIntroduced: number;
  outputTokens: number;
}
```

### 3B. Early Termination Logic

Etter 3+ forsøk, stopp hvis siste 2 forsøk:
- Fikset 0 feil, ELLER
- Introduserte flere feil enn de fikset, ELLER
- Endret < 2 filer OG produserte < 1000 output tokens

→ Eskaler til `impossible_task` diagnose i stedet for å bruke siste 2 forsøk

### 3C. Token Policy Enforcement (`agent/token-policy.ts` — ENDRE)

Oppgrader fra logging-only til soft enforcement:
- 80% av budsjett → logg warning
- 100% → hint til AI om kortere output
- 150% → hard-stop fasen, gå videre

**Filer:**
- ENDRE: `agent/execution.ts` — RetryProductivity tracking + early termination
- ENDRE: `agent/token-policy.ts` — `enforcePolicy()` funksjon
- ENDRE: `agent/types.ts` — Legg til RetryProductivity i AttemptRecord

---

## FASE 4: Sikkerhetsmodell-forbedringer (MEDIUM PRIORITET)

**Inspirasjon fra Claude Code:** Multi-stage permission gating, denial tracking, AST-basert bash-parsing, immutable audit log.

### 4A. Action Permission Layer (`agent/permissions.ts` — NY FIL)

Tre-lags permission-sjekk tilpasset server-kontekst:

| Lag | Hva | Kostnad | TheFold-ekvivalent |
|-----|-----|---------|---------------------|
| Tier 1 | Statisk risiko-kart per action | O(1) lookup | Erstatter spredt validateAgentScope() |
| Tier 2 | DB-baserte policy-regler | DB query | Konfigurerbar via settings UI |
| Tier 3 | Human-in-the-loop | Chat pause | For destruktive operasjoner |

Actions med risikonivå: `read` (alltid tillatt), `write` (regel-sjekket), `destructive` (krever godkjenning)

### 4B. Immutable Audit Log

DB-trigger som forhindrer UPDATE/DELETE på `agent_audit_log`:
```sql
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'audit log is immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON agent_audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

### 4C. Generert Kode-skanner (`sandbox/file-scanner.ts` — NY FIL)

Skann AI-genererte filer FØR skriving til sandbox:
- `process.env` bruk (bryter Encore.ts-regler)
- Hardkodede API-nøkler (regex-mønstre)
- `eval()`, `child_process`, `exec()` imports
- SQL `DROP TABLE` uten `IF EXISTS`

**Filer:**
- NY: `agent/permissions.ts` (~200 linjer)
- NY: `agent/migrations/X_create_permission_rules.up.sql`
- NY: `agent/migrations/X_immutable_audit.up.sql`
- NY: `sandbox/file-scanner.ts` (~100 linjer)
- ENDRE: `agent/helpers.ts` — Erstatt validateAgentScope med checkPermission
- ENDRE: `agent/completion.ts` — Wrap PR-operasjoner i permission check
- ENDRE: `sandbox/sandbox.ts` — Kall file-scanner i writeFile()

---

## FASE 5: Deklarativ Kontekstkompresjon (MEDIUM PRIORITET)

**Problem:** `trimContext()` bruker enkel "fjern fra baksiden" strategi. Orchestrator har egen duplikert trim-logikk.

**Inspirasjon fra Claude Code:** `apiMicrocompact.ts` — Deklarative strategiobjekter med trigger/retain/compress.

### 5A. Unified Context Strategy (`agent/context-builder.ts` — ENDRE)

```typescript
interface ContextStrategy {
  trigger: { type: 'tokens'; threshold: number };
  retain: { type: 'priority_weighted'; maxTokens: number };
  compress: {
    files: 'signatures_only' | 'full' | 'drop';
    memory: 'recent_5' | 'full' | 'drop';
    docs: 'relevant' | 'full' | 'drop';
    tree: 'summarize' | 'full' | 'drop';
  };
}
```

### 5B. `summarizeFile()` funksjon

Reduser filer til exports/interfaces/function-signaturer når kontekst er trang. For kode er type-definisjoner og signaturer viktigere enn implementasjonsdetaljer.

**Filer:**
- ENDRE: `agent/context-builder.ts` — ContextStrategy type, compressContext(), summarizeFile()
- ENDRE: `agent/orchestrator.ts` — Erstatt custom trimming med shared compressContext()

---

## FASE 6: Phase-End Hooks + Skills-forbedring (LAV PRIORITET)

### 6A. Phase-End Hooks (`agent/hooks.ts` — NY FIL)

Sentraliser fire-and-forget logikk som nå er spredt i completion.ts:
- Etter `building`: Ekstraher kode-patterns fra genererte filer
- Etter `completed`: Lagre minne, strategi, oppdater decision cache
- Etter `failed`: Lagre error pattern, sjekk lignende feil i minne

### 6B. Scoped Sub-Agent Contexts (`ai/sub-agents.ts` — ENDRE)

Per-rolle verktøybegrensning:
- planner: `[read_file, search_code, list_tasks]`
- implementer: `[read_file, search_code, generate_code]`
- tester: `[read_file, search_code, run_tests]`
- reviewer: `[read_file, search_code]` (read-only)

---

## Bun-vurdering: ANBEFALES IKKE

**Hvorfor ikke:**
1. Encore.ts har egen runtime — Bun ville erstatte kjerneverdien (auto-infrastruktur, service discovery, tracing)
2. `feature()` fra `bun:bundle` er Bun-spesifikt — fungerer ikke med Encore.ts sin build pipeline
3. TheFold bruker allerede `secret()` for feature flags — runtime-overhead er neglisjerbar
4. Encore.ts kompilerer og kjører TypeScript selv — Bun som runtime er inkompatibel

**Alternativ:** Behold Encore.ts runtime. Bruk `secret()` for feature flags. Eventuelt evaluer `bun test` kun for testsuiten hvis hastighet blir et problem.

---

## Mappestruktur-forbedring

**Nåværende problem:** Dokumenter, scripts og hemmeligheter blandet med kildekode på root-nivå.

**Foreslått endring (minimal, ikke-breaking):**

```
thefold/
  docs/                  ← NY: Samle all dokumentasjon
    ARKITEKTUR.md        ← Flytt fra root
    GRUNNMUR-STATUS.md   ← Flytt fra root
    OWASP-2025-2026-Report.md
    sprint-plans/        ← Flytt sprint-planer hit
    references/          ← Flytt kode-react-bits.md, prompt.md
  infrastructure/        ← NY: Samle deploy/scripts
    deploy/              ← Flytt fra root
    scripts/             ← Flytt fra root
  [services forblir på root]  ← Encore.ts krever dette
  frontend/
  CLAUDE.md              ← Beholdes på root
  encore.app
  package.json
```

**VIKTIG:** Encore.ts forventer services på root-nivå relativt til `encore.app`. IKKE flytt services inn i en `services/`-mappe. Kun flytt dokumentasjon og infrastruktur-filer.

**Handling:** Fjern `thefold-github-app.pem` fra repo (bruk `secret()` i stedet). Fjern `thefold-app.jsx` (78KB dump-fil).

---

## Implementeringsrekkefølge

| # | Fase | Estimat | Avhenger av |
|---|------|---------|-------------|
| 1 | FASE 3: Smart Retry | Liten | Ingen |
| 2 | FASE 1: Mikro-Beslutninger | Middels-stor | Ingen |
| 3 | FASE 2: Dream Mode | Middels | Ingen |
| 4 | FASE 4: Sikkerhet | Middels | Ingen |
| 5 | FASE 5: Kontekstkompresjon | Middels | Ingen |
| 6 | FASE 6: Hooks + Skills | Liten | Fase 1 |
| 7 | Mappestruktur | Liten | Ingen |

FASE 3 først fordi det er lavest effort med høyest umiddelbar gevinst (token-sparing). FASE 1 deretter fordi det er den mest transformative forbedringen.

---

## Verifisering

For hver fase:
1. `encore test` — Kjør eksisterende tester, bekreft ingen regresjoner
2. Nye unit-tester for alle nye filer (decision-cache, pattern-matcher, dream, permissions, file-scanner)
3. Manuell test: Opprett en enkel oppgave ("fix typo in README") og verifiser at fast-path trigges
4. Manuell test: Opprett en kompleks oppgave og verifiser at full pipeline kjøres
5. Sjekk at dream-cron trigger etter 3+ oppgaver (sett threshold lavt for test)
6. Verifiser at immutable audit trigger blokkerer DELETE/UPDATE
7. Verifiser at file-scanner blokkerer `process.env` i generert kode

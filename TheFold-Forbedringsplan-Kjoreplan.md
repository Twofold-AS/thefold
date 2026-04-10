# TheFold Forbedringsplan — Komplett kjøreplan for Claude Code

> **Dato:** 10. april 2026
> **Formål:** Alt Claude Code trenger for å jobbe gjennom TheFold-forbedringsplanene autonomt.
> **Styring:** Du styrer fra telefonen via Remote Control eller Dispatch.

---

## Del 1: Remote-oppsett — Styr Claude Code fra telefonen

Du har **tre gode alternativer** for å styre Claude Code fra telefonen. Du trenger IKKE tmux.

### Alternativ A: Desktop-appen + Dispatch (ANBEFALT for Windows)

Dette er det enkleste oppsettet. Claude Desktop-appen på Windows kjører Claude Code, og du sender oppgaver fra Claude-appen på telefonen via **Dispatch**.

**Oppsett:**

1. Last ned Claude Desktop-appen for Windows fra https://claude.ai
2. Logg inn med din Claude-konto (Pro eller Max)
3. Klikk **Code**-fanen i Desktop-appen
4. Par telefonen med Desktop-appen:
   - Åpne Claude-appen på telefonen (iOS/Android)
   - Følg instruksjonene på https://support.claude.com/en/articles/13947068 for å pare
5. Nå kan du sende oppgaver fra telefonen via Dispatch — Desktop-appen oppretter en sesjon og kjører oppgaven

**Fordeler:**
- Ingen terminal/tmux nødvendig
- Desktop-appen har visuell diff-visning
- Du kan kjøre flere sesjoner side om side
- Scheduled tasks kan kjøres direkte fra Desktop-appen

### Alternativ B: Remote Control fra terminal

Hvis du foretrekker terminal (f.eks. WSL, PowerShell, eller en VPS):

**Oppsett:**

```bash
# Installer Claude Code
curl -fsSL https://claude.ai/install.sh | bash   # Linux/WSL
# eller
irm https://claude.ai/install.ps1 | iex           # Windows PowerShell

# Naviger til TheFold-prosjektet
cd /path/to/thefold

# Start Remote Control server-modus
claude remote-control --name "TheFold Sprint"
```

**Koble til fra telefonen:**
- Trykk mellomrom i terminalen for å vise QR-kode
- Skann QR-koden med Claude-appen på telefonen
- Eller: gå til claude.ai/code og finn sesjonen i listen (grønn prikk = online)

**Alltid-på (for server/VPS):**

```bash
# Aktiver Remote Control permanent
# Kjør /config i Claude Code og sett "Enable Remote Control for all sessions" til true

# Server-modus med worktrees for parallelle sesjoner
claude remote-control --spawn worktree --name "TheFold"

# Alternativt: tmux for persistens ved SSH-disconnect
tmux new-session -s thefold -d 'claude remote-control --name "TheFold Sprint"'
```

### Alternativ C: Claude Code on the Web (cloud)

Kjør alt i skyen — ingen lokal maskin nødvendig:

```bash
# Fra terminal, push endringer først
git push

# Start cloud-sesjon
claude --remote "Implementer Sprint 7 Knowledge-system. Les CLAUDE.md og docs/plans/ for kontekst."
```

Eller gå direkte til claude.ai/code, velg repo, og start en sesjon der.

**Fordeler:** Kjører selv om PC-en er av. Perfekt for lange oppgaver over natten.
**Ulempe:** Trenger GitHub-tilgang konfigurert. Encore.ts runtime er ikke i cloud-VM.

### Anbefalt arbeidsflyt

| Situasjon | Bruk |
|-----------|------|
| Sitter ved PC-en, vil overvåke fra telefonen etterpå | **Remote Control** — start sesjon, koble til fra telefonen |
| Borte fra PC-en, vil starte ny oppgave | **Dispatch** via Claude-appen → Desktop-appen kjører |
| Lang oppgave over natten | **Cloud** via `--remote` eller claude.ai/code |
| Kjøre tester/verifisere | **Desktop-appen** direkte |

---

## Del 2: Kildedokumenter og kontekst

### Planstruktur

Det finnes fire plandokumenter som til sammen dekker hele utviklingsløpet. De ligger i `docs/plans/`:

| Dokument | Fil | Dekker |
|----------|-----|--------|
| **Forbedringsplan** | `TheFold-Forbedringsplan.md` | 6 faser: mikro-beslutninger, dream mode, smart retry, sikkerhet, kontekstkompresjon, hooks |
| **Implementeringsplan** | `thefold-implementeringsplan.md` | Sprint 7-14: knowledge, søvn, manifest, kontrakter, scheduled tasks, benchmarks, dep-graph, selv-evaluering |
| **Masterplan** | `thefold-masterplan.md` | Sprint 6-25 samlet med kode-referanser, korreksjoner, eksisterende grunnmur |
| **Oppgraderingsplan** | `thefold-oppgraderingsplan.md` | Sprint 15-25: basalganglier, proaktivitet, dyp hukommelse, synscortex, amygdala, prefrontal |

**Masterplanen er autoritativ** — den inneholder referanser til eksisterende kode og korreksjoner som de andre mangler.

### Embedding-dimensjoner — VIKTIG

Systemet bruker **OpenAI text-embedding-3-small med 1536 dimensjoner**. Koden i `memory/memory.ts` bruker allerede OpenAI API for embeddings. Alle nye tabeller med embedding-kolonner skal bruke `vector(1536)`.

Masterplanens korreksjon til `vector(512)` er UTDATERT og skal ignoreres — den refererer til Voyage AI som ikke lenger brukes.

---

## Del 3: Komplett sprint-instruksjonssett

Hver sprint nedenfor inneholder den eksakte prompten du kan gi Claude Code. Kopier og lim inn.

---

### PRE-SPRINT: Fase 3 — Smart Retry (kjøres først, lavest effort)

**Hvorfor først:** Direkte token-besparelse uten avhengigheter. 1 sesjon.

**Filer som endres:**
- `agent/execution.ts` — RetryProductivity tracking + early termination
- `agent/token-policy.ts` — enforcePolicy() funksjon (oppgrader fra logging-only)
- `agent/types.ts` — Legg til RetryProductivity i AttemptRecord

**Prompt:**

```
Les CLAUDE.md for prosjektstruktur og regler.

Implementer Smart Retry med Diminishing Returns — Fase 3 fra docs/plans/TheFold-Forbedringsplan.md:

1. I agent/types.ts — legg til RetryProductivity interface i AttemptRecord:
   - attemptNumber, filesChanged, validationErrorsFixed, newErrorsIntroduced, outputTokens

2. I agent/execution.ts — implementer early termination i retry-loopen:
   - Track RetryProductivity per forsøk
   - Etter 3+ forsøk, stopp hvis siste 2 forsøk:
     * Fikset 0 feil, ELLER
     * Introduserte flere feil enn de fikset, ELLER
     * Endret < 2 filer OG produserte < 1000 output tokens
   - Ved early termination: eskaler til impossible_task diagnose

3. I agent/token-policy.ts — oppgrader fra logging-only til soft enforcement:
   - 80% av budsjett → logg warning
   - 100% → hint til AI om kortere output
   - 150% → hard-stop fasen, gå videre
   - Ny funksjon: enforcePolicy()

Kjør encore test etter implementering. Bekreft ingen regresjoner.
```

---

### SPRINT 7: Knowledge-systemet

**Mål:** TheFold lærer fra fullførte oppgaver. Estimat: 1-2 sesjoner.

**Avhengigheter:** Ingen.

**Nye filer:**
- `memory/migrations/X_create_knowledge.up.sql` (sjekk siste nummer, nå 7+)

**Endrede filer:**
- `memory/memory.ts` — 5 nye endpoints
- `agent/completion.ts` — maybeDistill() etter STEP 11.5
- `skills/engine.ts` — knowledge-injection i resolve() + feedback i executePostRun()

**Prompt (del 1 — backend):**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 7-seksjonen) for full kontekst.

Implementer Sprint 7 — Knowledge-systemet:

1. Sjekk siste migrasjonsnummer i memory/migrations/ og opprett NESTE nummer.
   Opprett knowledge-tabellen:
   - id UUID PK, rule TEXT, category TEXT, context TEXT, source_task_id UUID
   - source_model TEXT, source_quality_score INT
   - embedding vector(1536)  ← VIKTIG: 1536 dim for OpenAI text-embedding-3-small
   - confidence FLOAT DEFAULT 0.5
   - times_applied, times_helped, times_hurt (alle INT DEFAULT 0)
   - last_applied_at, last_reviewed_at TIMESTAMPTZ
   - status TEXT DEFAULT 'active', promoted_at TIMESTAMPTZ
   - created_at, updated_at TIMESTAMPTZ
   - Indekser: ivfflat på embedding, category, status+confidence

2. Nye endpoints i memory/memory.ts:
   - POST /memory/knowledge/store (expose: false) — lagre destillert knowledge
   - POST /memory/knowledge/search (expose: false) — pgvector-søk
   - POST /memory/knowledge/feedback (expose: false) — oppdater times_helped/hurt
   - GET /memory/knowledge/list (expose: true, auth: true) — frontend-visning
   - GET /memory/knowledge/stats (expose: true, auth: true) — aggregert statistikk

3. maybeDistill() i agent/completion.ts:
   - Kalles etter STEP 11.5 (etter procedural memory), før STEP 12 (sandbox destroy)
   - Trigger: qualityScore >= 7 OG (minst 1 retry ELLER ny fil-pattern) OG > 100 tokens output
   - Input: oppgavebeskrivelse (200 tokens), feil+fixes (300 tokens), filtyper (200 tokens)
   - Bruk billigste modell (Haiku)
   - Output: 0-3 regler med category og context
   - Deduplication: embed regel, cosine > 0.85 mot eksisterende → styrk (confidence += 0.1). Ny → confidence 0.5

4. Knowledge-injection i skills/engine.ts resolve():
   - Etter eksisterende skills-matching
   - Embed oppgavebeskrivelsen (bruk eksisterende embedding-logikk)
   - pgvector-søk: WHERE status = 'active' AND confidence > 0.4, topp 5
   - Bygg "## Learned Knowledge" seksjon, injiser etter "## Active Skills"
   - Returner knowledge-IDer i ResolveResponse
   - OPPDATER hashResolveInput() med knowledge-versjonsnøkkel for cache-invalidering

5. Feedback-loop i skills/engine.ts executePostRun():
   - Output OK → UPDATE knowledge SET times_helped + 1
   - Output problemer → UPDATE knowledge SET times_hurt + 1
   - Oppdater confidence = times_helped / GREATEST(times_helped + times_hurt, 1)
   - Knowledge-IDer må flytes gjennom fra resolve() → pre-run → post-run

Kjør encore test etter implementering. Bekreft ingen regresjoner.
```

**Prompt (del 2 — frontend):**

```
Opprett frontend-side for knowledge-systemet.

Følg mønsteret fra frontend/src/app/(dashboard)/tools/skills/page.tsx og
frontend/src/app/(dashboard)/tools/costs/page.tsx.

Opprett: frontend/src/app/(dashboard)/tools/knowledge/page.tsx

Innhold:
- Liste over all knowledge med confidence-bar, kategori-badge, status-indikator
- Filter-tabs: All / Active / Promoted / Archived
- Søkefelt som filtrerer i regler-tekst
- Manuell arkiver/aktiver-knapp per knowledge-entry
- Statistikk-kort øverst: totalt antall, gjennomsnittlig confidence, sist oppdatert
- Bruk eksisterende API-klient-mønster fra prosjektet

Husk: dette er et Encore.ts + Next.js 15 prosjekt. API-kall går via den genererte klienten.
```

---

### SPRINT 8: Søvn-systemet

**Mål:** TheFold evaluerer og forbedrer seg selv ukentlig. Estimat: 1 sesjon.

**Avhengigheter:** Sprint 7 (knowledge-tabellen).

**Prompt:**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 8-seksjonen).

Implementer Sprint 8 — Søvn-systemet:

1. Sjekk siste migrasjonsnummer i agent/migrations/ og opprett NESTE.
   Opprett sleep_logs-tabell: id UUID PK, started_at, completed_at,
   knowledge_reviewed/archived/promoted/merged (INT), scheduled_tasks_run INT,
   cost_usd FLOAT, tokens_used INT, report JSONB, status TEXT, created_at.

2. Ny fil: agent/sleep.ts
   CronJob: "0 3 * * 0" (søndag kl 03:00 UTC)
   KOLLISJONSSJEKK: monitor=daglig 03:00, registry=fredag 03:00 — søndag er ledig.

   5 steg:
   a) Arkivering (ren DB): WHERE confidence < 0.3 AND last_applied_at < NOW() - 30 days → archived
   b) Review tvilsomme (maks 20): WHERE confidence BETWEEN 0.3 AND 0.5 AND times_applied > 5 → AI Haiku vurderer
   c) Promotering (ren DB): WHERE confidence > 0.8 AND times_applied > 10 → promoted
   d) Merging: embedding cosine > 0.9 par → AI Haiku slår sammen
   e) Rapport: lagre i sleep_logs, send chat-notifikasjon via Pub/Sub

   Bruk service-to-service kall til memory-service for knowledge-operasjoner.

3. Utvid frontend /tools/knowledge med søvn-rapport-visning:
   - Ny seksjon: "Siste søvn-rapport" med dato, antall reviewed/archived/promoted/merged
   - Historikk-liste over tidligere søvn-rapporter

Kjør encore test etter implementering.
```

---

### SPRINT 9: Prosjektmanifest

**Mål:** TheFold forstår hele prosjektarkitekturen. Estimat: 1 sesjon.

**Avhengigheter:** Ingen.

**Prompt:**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 9-seksjonen).

Implementer Sprint 9 — Prosjektmanifest:

1. Ny migrasjon i memory/migrations/:
   project_manifests-tabell: id UUID PK, repo_owner TEXT, repo_name TEXT,
   summary TEXT, tech_stack TEXT[], services JSONB, data_models JSONB,
   contracts JSONB, conventions TEXT, known_pitfalls TEXT, file_count INT,
   last_analyzed_at TIMESTAMPTZ, version INT DEFAULT 1, created_at, updated_at.
   UNIQUE(repo_owner, repo_name).

2. Ny fil agent/manifest.ts ELLER utvidelse av agent/context-builder.ts:
   getOrCreateManifest(owner, repo):
   - Sjekk DB (bruk cache-service for hot-path, key: manifest:{owner}/{repo})
   - Hvis < 24 timer gammelt: returner
   - Ellers: generer via AI (Haiku) — identifiser nøkkelfiler via github.getTree()
   
   Inkrementell oppdatering: kall etter fullført oppgave i agent/completion.ts

3. Injection i agent/context-builder.ts buildContext():
   - Hent manifest, injiser som "## Project Architecture"
   - PRIORITET: Høyere enn memory og docs (500-800 tokens)
   - Også i agent/orchestrator.ts curateContext()

4. 4 nye endpoints i memory/:
   - POST /memory/manifest/get (intern)
   - POST /memory/manifest/update (intern)
   - GET /memory/manifest/view (auth)
   - POST /memory/manifest/edit (auth)

Kjør encore test etter implementering.
```

---

### SPRINT 10: Kontraktbasert dekomponering

**Mål:** Store prosjekter med eksplisitte kontrakter mellom faser. Estimat: 1 sesjon.

**Avhengigheter:** Sprint 9.

**Prompt:**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 10-seksjonen).

Implementer Sprint 10 — Kontraktbasert dekomponering:

1. Ny migrasjon i agent/migrations/:
   ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS input_contracts JSONB DEFAULT '[]',
   ADD COLUMN IF NOT EXISTS output_contracts JSONB DEFAULT '[]',
   ADD COLUMN IF NOT EXISTS contracts_verified BOOLEAN DEFAULT false,
   ADD COLUMN IF NOT EXISTS verification_notes TEXT,
   ADD COLUMN IF NOT EXISTS actual_output JSONB;

2. Oppdater ai.decomposeProject() i ai/ai.ts:
   - Utvid system-prompten: "For hver oppgave: definer input-kontrakt og output-kontrakt"
   - Kontrakt-format: JSON array av strenger

3. Kontraktverifisering i agent/orchestrator.ts executeProject():
   - Etter hver fullført oppgave: verifiser output-kontraktene
   - Sammenlign output_contracts med actual_output (filer produsert)
   - AI (Haiku, ~500 tokens): "Ble kontraktene oppfylt?"
   - Flagg avvik i verification_notes
   - Før neste fase: injiser forrige fases kontraktresultat i kontekst

4. Frontend: utvid prosjekt-status-visning med kontraktdata per fase.
   Grønn/rød indikator. Manuell godkjenning av avvik.

Kjør encore test etter implementering.
```

---

### SPRINT 11: Scheduled tasks

**Mål:** TheFold utfører oppgaver på planlagte tidspunkter. Estimat: 1-2 sesjoner.

**Avhengigheter:** Ingen.

**Prompt:**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 11-seksjonen).

Implementer Sprint 11 — Scheduled Tasks:

1. Ny migrasjon i agent/migrations/:
   scheduled_tasks-tabell: id UUID PK, title TEXT, description TEXT,
   task_type TEXT (notify/review/analyze/build/benchmark),
   schedule_type TEXT (once/cron), run_at TIMESTAMPTZ, cron_expression TEXT,
   run_in_sleep BOOLEAN DEFAULT false, config JSONB DEFAULT '{}',
   last_run_at TIMESTAMPTZ, next_run_at TIMESTAMPTZ, run_count INT DEFAULT 0,
   status TEXT DEFAULT 'active', last_result JSONB, created_at, user_id TEXT.
   Indeks: idx_scheduled_next_run ON (next_run_at) WHERE status = 'active'.

2. Ny fil agent/scheduled.ts:
   CronJob: "*/15 * * * *" (hvert 15. minutt)
   - Kjør alle WHERE next_run_at <= NOW() AND status = 'active'
   - For run_in_sleep = true: hopp over (kjøres av søvn-systemet)
   - Etter kjøring: oppdater last_run_at, run_count, beregn next_run_at

3. Task-type implementering:
   - notify: send chat-melding direkte (ingen AI)
   - review: hent filer fra repo, AI code review, send resultat som chat
   - analyze: bruk monitor.runCheck() for health, generer rapport
   - build: opprett task i tasks-service, start agent
   - benchmark: stub for Sprint 12

4. Endpoints:
   - POST /agent/scheduled/create (auth)
   - POST /agent/scheduled/update (auth)
   - POST /agent/scheduled/delete (auth)
   - GET /agent/scheduled/list (auth)
   - POST /agent/scheduled/run-due (intern, cron)

5. Frontend: ny side /tools/scheduled
   - Liste med neste kjøring, type-ikon, status
   - Opprett ny (velg type, tid/cron, konfigurasjon)
   - Historikk med resultater
   - Pause/resume/slett

Kjør encore test etter implementering.
```

---

### SPRINT 12: Modell-benchmarks

**Mål:** Sammenligne modeller på spesifikke oppgaver. Estimat: 1 sesjon.

**Avhengigheter:** Ingen.

**Prompt:**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 12-seksjonen).

Implementer Sprint 12 — Modell-benchmarks:

1. Ny migrasjon i ai/migrations/:
   model_benchmarks-tabell: id UUID PK, name TEXT, models TEXT[],
   task_description TEXT, task_category TEXT, run_mode TEXT DEFAULT 'manual',
   scheduled_at TIMESTAMPTZ, results JSONB, winner TEXT, summary TEXT,
   status TEXT DEFAULT 'pending', created_at, completed_at.

2. Ny fil ai/benchmarks.ts:
   - Kjør oppgaven gjennom alle valgte modeller med identisk prompt
   - Bruk skills.resolve() for å bygge prompt (reelle prompts med skills + knowledge)
   - Mål: tokens brukt, kostnad, varighet, output-lengde
   - AI-dommer (billigste modell) evaluerer outputs: kvalitet 0-100
   - Lagre resultater, beregn vinner

3. Endpoints:
   - POST /ai/benchmarks/create (auth)
   - POST /ai/benchmarks/run (auth)
   - GET /ai/benchmarks/list (auth)
   - GET /ai/benchmarks/get (auth)

4. Frontend: ny side /tools/benchmarks
   - Opprett: velg modeller, skriv oppgave
   - Liste med vinner-indikasjon
   - Detalj: side-by-side outputs med score

Kjør encore test etter implementering.
```

---

### SPRINT 13: Persistent dependency graph

**Mål:** Diff-basert kontekst, 40-60% token-besparelse. Estimat: 1 sesjon.

**Avhengigheter:** Sprint 9 (manifest).

**Prompt:**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 13-seksjonen).

Implementer Sprint 13 — Persistent dependency graph + diff-basert kontekst:

1. Ny migrasjon i memory/migrations/:
   project_dependency_graph: repo_owner TEXT, repo_name TEXT,
   graph JSONB (gjenbruk format fra builder/graph.ts),
   file_count INT, edge_count INT, analyzed_at TIMESTAMPTZ.
   PRIMARY KEY (repo_owner, repo_name).

   ALTER TABLE project_manifests ADD COLUMN IF NOT EXISTS file_hashes JSONB DEFAULT '{}';

2. Inkrementell oppdatering:
   - Etter fullført oppgave i agent/completion.ts: oppdater kun endrede filer
   - Gjenbruk analyzeDependencies() logikk fra builder/graph.ts
   - Service-to-service kall (Encore-stil), ikke direkte import

3. Diff-basert kontekst i agent/context-builder.ts:
   - Hent file_hashes fra manifest
   - Sammenlign med nåværende (fra GitHub tree)
   - Send kun endrede filer til AI
   - Estimer tokens spart, logg

Kjør encore test etter implementering.
```

---

### SPRINT 14: Selv-evaluering under arbeid

**Mål:** TheFold fanger feil under arbeid, ikke bare etter. Estimat: 1 sesjon.

**Avhengigheter:** Sprint 9 (manifest).

**Prompt:**

```
Les CLAUDE.md og docs/plans/thefold-masterplan.md (Sprint 14-seksjonen).

Implementer Sprint 14 — Selv-evaluering under arbeid:

1. Manifest-validering i builder/phases.ts implement-fasen:
   - Etter hver generert fil: sjekk konsistens med prosjektmanifestet
   - Ny import som ikke matcher manifestets services → logg advarsel
   - Bryter conventions → pause og re-generér

2. Plan-validering mot manifest i agent/execution.ts:
   - Etter planTask(): sammenlign planens filer med manifestets dependency graph
   - Fang: "planen endrer ServiceA men nevner ikke ServiceB som avhenger av den"
   - Kostnad: ~200 tokens (Haiku)

3. Intra-task confidence mellom STEP 6 (build) og STEP 7 (validate):
   - Rask selvevaluering av generert kode
   - "Matcher dette planen? Har jeg glemt noe?"
   - ~500 tokens

Kjør encore test etter implementering.
```

---

### FORBEDRINGSPLAN-FASENE (mikses inn mellom/etter sprinter)

Disse er fra Forbedringsplan-dokumentet og kan kjøres uavhengig:

**Fase 1: Mikro-Beslutninger** (etter Sprint 7)

```
Les docs/plans/TheFold-Forbedringsplan.md Fase 1.

Implementer Mikro-Beslutninger:

1. Ny fil agent/decision-cache.ts (~150 linjer):
   CachedDecision med pattern, strategi, confidence, cached model/plan
   
2. Ny fil agent/pattern-matcher.ts (~100 linjer):
   Hardkodede regex for vanlige oppgavetyper:
   - typo/spelling → fast_path, haiku, hopp over confidence+complexity+plan
   - add import → fast_path, haiku
   - update dep → fast_path, haiku
   - migration → standard, sonnet
   - new feature → careful, sonnet/opus

3. Ny migrasjon i agent/migrations/ for decision_cache-tabell

4. Endre agent/agent.ts: fast-path sjekk mellom buildContext og assessAndRoute

5. Endre agent/confidence.ts: bypass-logikk for kjente patterns

6. Endre agent/completion.ts: oppdater decision cache etter oppgave (adaptiv læring)

Kjør encore test.
```

**Fase 4: Sikkerhet** (kan kjøres når som helst)

```
Les docs/plans/TheFold-Forbedringsplan.md Fase 4.

Implementer sikkerhetsmodell-forbedringer:

1. Ny fil agent/permissions.ts (~200 linjer):
   Tre-lags permission: read (alltid OK), write (regel-sjekket), destructive (godkjenning)
   
2. Ny migrasjon: permission_rules-tabell + immutable audit trigger

3. Ny fil sandbox/file-scanner.ts (~100 linjer):
   Skann AI-genererte filer FØR skriving: process.env, hardkodede nøkler, eval(), DROP TABLE

4. Endre agent/helpers.ts: erstatt validateAgentScope med checkPermission
5. Endre sandbox/sandbox.ts: kall file-scanner i writeFile()

Kjør encore test.
```

**Fase 5: Kontekstkompresjon** (etter Sprint 9)

```
Les docs/plans/TheFold-Forbedringsplan.md Fase 5.

Implementer deklarativ kontekstkompresjon:

1. Endre agent/context-builder.ts:
   - ContextStrategy type med trigger/retain/compress
   - compressContext() med strategiobjekter
   - summarizeFile(): reduser filer til exports/interfaces/signaturer

2. Endre agent/orchestrator.ts: erstatt custom trimming med shared compressContext()

Kjør encore test.
```

---

## Del 4: Kjørerekkefølge og avhengigheter

```
PRE:  Fase 3 Smart Retry ←── ingen avhengigheter
  ↓
Sprint 7: Knowledge ←── ingen avhengigheter
  ↓
Sprint 8: Søvn ←── Sprint 7
  ↓
Sprint 9: Manifest ←── ingen avhengigheter (kan parallelliseres med 7/8)
  ↓
Sprint 10: Kontrakter ←── Sprint 9
Sprint 11: Scheduled tasks ←── ingen (kan parallelliseres)
Sprint 12: Benchmarks ←── ingen (kan parallelliseres)
Sprint 13: Dep-graph ←── Sprint 9
Sprint 14: Selv-evaluering ←── Sprint 9
  ↓
Fase 1: Mikro-Beslutninger ←── Sprint 7
Fase 4: Sikkerhet ←── ingen
Fase 5: Kontekstkompresjon ←── Sprint 9
```

**Optimal parallell kjøring:**
- Sesjon 1: Pre → Sprint 7 → Sprint 8
- Sesjon 2: Sprint 9 → Sprint 10
- Sesjon 3: Sprint 11
- Sesjon 4: Sprint 12
- Sesjon 5: Sprint 13 → Sprint 14
- Sesjon 6: Fase 1 + Fase 4 + Fase 5

---

## Del 5: Sjekkliste per sprint

Før hver sprint:
- [ ] `git checkout main && git pull`
- [ ] `git checkout -b feat/sprint-X-beskrivelse`
- [ ] Sjekk siste migrasjonsnummer i relevante services
- [ ] `encore run` fungerer

Etter hver sprint:
- [ ] `encore test` passerer
- [ ] `encore run` starter uten feil
- [ ] Git commit med beskrivende melding
- [ ] Push branch og opprett PR
- [ ] Merge til main etter review

---

## Del 6: Kritiske regler

1. **vector(1536)** — OpenAI text-embedding-3-small. IKKE vector(512).
2. **Migrasjonsnumre** — Sjekk ALLTID siste nummer før du lager nye. De må være sekvensielle.
3. **Eksisterende grunnmur** — Aktiver det som finnes i stedet for å bygge nytt. Se masterplanen.
4. **Encore.ts-regler** — ALDRI Express/Fastify/dotenv/process.env. ALLTID `api()`, `secret()`, `SQLDatabase`.
5. **Test etter HVER sprint** — `encore test` MÅ passere.
6. **Én branch per sprint** — Hold endringer isolerte og reviewbare.
7. **Fire-and-forget pattern** — Nye funksjoner som maybeDistill() skal ikke blokkere hoved-flyten.
8. **Service-to-service kall** — Bruk `import { service } from "~encore/clients"`, aldri direkte import mellom services.

---

## Del 7: Tidsestimat

| Sprint | Innhold | Sesjoner | Avhengigheter |
|--------|---------|----------|---------------|
| Pre | Fase 3: Smart Retry | 1 | Ingen |
| 7 | Knowledge-system | 1-2 | Ingen |
| 8 | Søvn-system | 1 | Sprint 7 |
| 9 | Prosjektmanifest | 1 | Ingen |
| 10 | Kontraktbasert dekomp. | 1 | Sprint 9 |
| 11 | Scheduled tasks | 1-2 | Ingen |
| 12 | Modell-benchmarks | 1 | Ingen |
| 13 | Dependency graph | 1 | Sprint 9 |
| 14 | Selv-evaluering | 1 | Sprint 9 |
| + | Fase 1 Mikro-Beslutninger | 1 | Sprint 7 |
| + | Fase 4 Sikkerhet | 1 | Ingen |
| + | Fase 5 Kontekstkompresjon | 1 | Sprint 9 |

**Total: ~12-15 Claude Code-sesjoner for hele planen (Sprint 7-14 + forbedringsfaser).**

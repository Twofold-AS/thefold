# TheFold — Plan: Løs Context-Tap (3 Kritiske Gap)

> Basert på analyse i `context-ai-loses.md`
> Dato: 14. februar 2026

---

## Oppsummering av problemene

Analysen identifiserer 5 gap, der 3 er kritiske og 2 er konfigurasjon:

| # | Gap | Kritisk? | Hva mangler |
|---|-----|----------|-------------|
| 1 | Oppgavedekomponering | **JA** | Én chatmelding → mange atomære tasks med avhengigheter |
| 2 | Context Curator | **JA** | Intelligent kontekstvalg per sub-task basert på avhengighetsgraf |
| 3 | Prosjekt-tilstandsfil | **JA** | Persistent prosjektplan som overlever krasj og styrer rekkefølge |
| 4 | Konvensjonsdokument | Nei | Én kompakt always-on skill (konfigurasjon, ikke kode) |
| 5 | Re-planlegging mellom faser | Nei | Bruk eksisterende revisePlan proaktivt, ikke bare ved feil |

---

## Arkitekturbeslutninger

### Hva vi IKKE gjør:
- Lager IKKE en ny service. Alt bygges inn i eksisterende `agent`, `ai` og `memory` services.
- Erstatter IKKE agent-loopen. Den nye prosjekt-orchestratoren sitter **over** den.
- Lager IKKE en ny database. Vi bruker eksisterende `agent`-databasen med nye tabeller.

### Hva vi gjør:
1. **Ny tabell `project_plans`** i agent-databasen — den strukturerte tilstandsfilen
2. **Ny tabell `project_tasks`** i agent-databasen — atomære sub-tasks med avhengigheter og status
3. **Nytt AI-endepunkt `ai.decomposeProject()`** — bryter ned stor forespørsel til oppgaver
4. **Ny funksjon `curateContext()`** i agent — intelligent kontekstvalg per sub-task
5. **Ny orchestrator-loop `executeProject()`** i agent — styrer mange sub-tasks sekvensielt
6. **Ny skill "Project Conventions"** — alltid-inkludert, kompakt konvensjonsdokument
7. **Proaktiv re-planlegging** — kall revisePlan etter hver fase, ikke bare ved feil

---

## Database-skjema

### project_plans
```sql
CREATE TABLE project_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(255) NOT NULL,
  user_request TEXT NOT NULL,           -- Opprinnelig brukermelding
  status TEXT NOT NULL DEFAULT 'planning',  -- planning, executing, paused, completed, failed
  current_phase INT DEFAULT 0,          -- Hvilken fase som kjøres nå
  plan_data JSONB NOT NULL DEFAULT '{}', -- Strukturert plan med faser og metadata
  conventions TEXT,                      -- Kompakt konvensjonsdokument generert for dette prosjektet
  total_tasks INT DEFAULT 0,
  completed_tasks INT DEFAULT 0,
  failed_tasks INT DEFAULT 0,
  total_cost_usd DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### project_tasks
```sql
CREATE TABLE project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project_plans(id) ON DELETE CASCADE,
  phase INT NOT NULL DEFAULT 0,         -- Fase-nummer (0-basert)
  task_order INT NOT NULL DEFAULT 0,    -- Rekkefølge innen fase
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, skipped
  depends_on UUID[],                    -- Andre task-IDer som må fullføres først
  output_files TEXT[],                  -- Filer denne tasken produserte
  output_types TEXT[],                  -- Type-definisjoner/interfaces som ble opprettet
  context_hints TEXT[],                 -- Hints om hva context curator bør hente
  linear_task_id VARCHAR(255),          -- Evt. koblet Linear-task
  pr_url TEXT,                          -- PR som ble opprettet
  cost_usd DECIMAL DEFAULT 0,
  error_message TEXT,
  attempt_count INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_status ON project_tasks(status);
CREATE INDEX idx_project_tasks_phase ON project_tasks(project_id, phase, task_order);
```

---

## Ny flyt: Prosjektdekomponering

```
Brukermelding: "Bygg en oppgave-app med auth og teams"
                │
                ▼
        ai.decomposeProject()
        ├── Analyserer scope og kompleksitet
        ├── Genererer faser (auth → models → API → frontend)
        ├── Bryter ned til 10-30 atomære tasks
        ├── Setter avhengigheter mellom tasks
        ├── Genererer context_hints per task
        └── Genererer conventions-dokument
                │
                ▼
        Lagres i project_plans + project_tasks
                │
                ▼
        executeProject() — Orchestrator-loop
        ├── For hver fase:
        │   ├── Hent alle tasks i fasen (sortert etter task_order)
        │   ├── For hver task:
        │   │   ├── Sjekk at depends_on er fullført
        │   │   ├── curateContext() — hent relevant kontekst
        │   │   │   ├── Output-filer fra avhengige tasks
        │   │   │   ├── Type-definisjoner fra output_types
        │   │   │   ├── context_hints → memory search + GitHub files
        │   │   │   └── Conventions-dokumentet (alltid inkludert)
        │   │   ├── Kall eksisterende executeTask() med kuratert kontekst
        │   │   ├── Lagre output_files og output_types
        │   │   └── Oppdater status og cost
        │   ├── Etter fase: ai.revisePlan() — juster neste fase
        │   └── Rapporter fremgang til chat
        └── Ferdig: Samlerapport med alle PRs og total kostnad
```

---

## Endringer per fil

### Nye filer:
| Fil | Innhold |
|-----|---------|
| `agent/migrations/NNN_project_plans.up.sql` | DDL for project_plans + project_tasks |
| `agent/orchestrator.ts` | executeProject(), curateContext(), prosjektstyring |
| `agent/orchestrator.test.ts` | Tester for dekomponering og context curation |

### Endrede filer:
| Fil | Endring |
|-----|---------|
| `ai/ai.ts` | Nytt endpoint: decomposeProject() + generateConventions() |
| `agent/agent.ts` | executeTask() tar valgfri kuratert kontekst som parameter |
| `agent/types.ts` | Nye typer: ProjectPlan, ProjectTask, CuratedContext |
| `chat/chat.ts` | Detektere store forespørsler → trigger decomposeProject istedenfor direkte agent |
| `CLAUDE.md` | Dokumenter prosjekt-orchestrator flyt |
| `ARKITEKTUR.md` | Nye tabeller, endpoints, flyt |
| `KOMPLETT-BYGGEPLAN.md` | Nytt steg for denne featuren |
| `GRUNNMUR-STATUS.md` | Oppdater med nye features |

### Skill-endring:
| Handling | Detalj |
|----------|--------|
| Ny seed-skill: "Project Conventions" | priority: 1, execution_phase: inject, alltid aktiv |
| Innhold | Encore.ts-regler + TS strict + filnavnkonvensjoner + testmønster (< 2000 tokens) |

---

## Filer som MÅ oppdateres (dokumentasjon):

1. **CLAUDE.md** — Legg til "Project Orchestrator" seksjon i Agent Flow
2. **ARKITEKTUR.md** — Nye tabeller (project_plans, project_tasks), nye endpoints, oppdatert flytdiagram
3. **KOMPLETT-BYGGEPLAN.md** — Nytt steg (f.eks. Steg 3.4: Project Orchestrator) 
4. **GRUNNMUR-STATUS.md** — Nye features i agent-service seksjonen

---

## Estimat

| Del | Kompleksitet | Estimert tid |
|-----|-------------|--------------|
| Database-migrasjoner | Lav | 15 min |
| ai.decomposeProject() | Høy | 1-2 timer |
| curateContext() | Medium | 45 min |
| executeProject() orchestrator | Høy | 1-2 timer |
| Chat-integrasjon (deteksjon) | Lav | 30 min |
| Konvensjons-skill | Lav | 15 min |
| Proaktiv re-planlegging | Lav | 30 min |
| Tester | Medium | 1 time |
| Dokumentasjonsoppdatering | Lav | 30 min |
| **Totalt** | | **5-7 timer** |

---

## Prompt-struktur

Gitt kompleksiteten bør dette deles i **2 prompts**:

**Prompt 1:** Database + Typer + AI-endepunkt (decomposeProject + conventions)
**Prompt 2:** Orchestrator + Context Curator + Chat-integrasjon + Dokumentasjon

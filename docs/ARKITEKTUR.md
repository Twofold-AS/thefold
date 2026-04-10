# TheFold — Arkitektur

## Oversikt

TheFold er en autonom fullstack utviklingsagent bygget med **Encore.ts** (12 mikrotjenester) og **Next.js** frontend. Den leser oppgaver fra Linear, leser/skriver kode via GitHub, validerer i sandbox, og leverer PRs med dokumentasjon.

## Tjenester

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   gateway    │  │   frontend   │  │    chat      │
│ Auth (HMAC)  │  │  Next.js 14  │  │ PostgreSQL   │
│ Bearer token │  │  Dashboard   │  │ Pub/Sub      │
└──────┬───────┘  └──────────────┘  └──────┬───────┘
       │                                    │
┌──────┴───────┐  ┌─────────────┐  ┌───────┴──────┐
│    users     │  │     ai      │  │    agent     │
│ OTP auth     │  │ Claude API  │  │ Autonomous   │
│ Preferences  │  │ Multi-model │  │ Meta-reason  │
└──────────────┘  │ Prompt cache│  │ Diagnosis    │
                  └──────┬──────┘  └──────┬───────┘
                         │                │
┌──────────────┐  ┌──────┴──────┐  ┌──────┴───────┐
│   github     │  │   sandbox   │  │   linear     │
│ Repo ops     │  │ Validation  │  │ Task sync    │
│ PR creation  │  │ Pipeline    │  │ Cron         │
└──────────────┘  └─────────────┘  └──────────────┘

┌──────────────┐  ┌─────────────┐  ┌──────────────┐
│   memory     │  │   skills    │  │   monitor    │
│ pgvector     │  │ Pipeline    │  │ Health checks│
│ Decay + code │  │ Resolve +   │  │ Cron (flag)  │
│ patterns     │  │ Exec + Log  │  │              │
└──────────────┘  └─────────────┘  └──────────────┘

┌──────────────┐  ┌─────────────┐  ┌──────────────┐
│    cache     │  │    docs     │  │    tasks     │
│ PostgreSQL   │  │ Context7    │  │ Task engine  │
│ Key-value    │  │ MCP lookup  │  │ Linear sync  │
└──────────────┘  └─────────────┘  │ AI planning  │
                                   └──────────────┘

┌──────────────┐  ┌─────────────┐
│   builder    │  │  registry   │
│ File-by-file │  │ Marketplace │
│ Dep graph    │  │ Healing     │
│ 6 phases     │  │ Components  │
└──────────────┘  └─────────────┘
```

## Database-skjemaer

### users (PostgreSQL)
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | Auto-generert |
| email | TEXT UNIQUE | Brukerens e-post |
| name | TEXT | Visningsnavn |
| role | TEXT | 'admin' / 'viewer' |
| avatar_url | TEXT | Profilbilde URL |
| preferences | JSONB | Brukerinnstillinger (modelMode, avatarColor, etc.) |
| created_at | TIMESTAMPTZ | |
| last_login_at | TIMESTAMPTZ | |

### revoked_tokens (PostgreSQL) — gateway service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| token_hash | TEXT PK | SHA-256 hash av Bearer token |
| revoked_at | TIMESTAMPTZ | Tidspunkt for revokering |
| expires_at | TIMESTAMPTZ | Original token-utløpstid (for cleanup) |

### otp_codes (PostgreSQL)
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | |
| user_id | UUID FK | Kobling til users |
| code_hash | TEXT | SHA-256 hash av OTP-kode |
| expires_at | TIMESTAMPTZ | 5 min utløp |
| used | BOOLEAN | Markert etter verifisering |
| attempts | INT | Maks 3 forsøk |

### memories (PostgreSQL + pgvector)
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | |
| content | TEXT | Minneinnhold |
| category | VARCHAR(50) | Kategori |
| memory_type | TEXT | 'skill', 'task', 'session', 'error_pattern', 'decision', 'general' |
| embedding | vector(512) | Voyage-3-lite embedding |
| parent_memory_id | UUID FK | Hierarkisk kobling |
| last_accessed_at | TIMESTAMPTZ | Temporal decay tracking |
| access_count | INT | Bruksfrekvens |
| relevance_score | DECIMAL | 0.0-1.0 |
| ttl_days | INT | Levetid (0 = evig) |
| pinned | BOOLEAN | Beskyttet mot sletting |
| superseded_by | UUID FK | Konsolidert til |
| source_repo | TEXT | Kilde-repo |
| tags | TEXT[] | Merkelapper |

### code_patterns (PostgreSQL + pgvector)
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | |
| pattern_type | TEXT | 'bug_fix', 'optimization', 'refactoring', 'new_feature' |
| source_repo | TEXT | |
| problem_description | TEXT | |
| solution_description | TEXT | |
| problem_embedding | vector(512) | For similarity search |
| solution_embedding | vector(512) | |
| confidence_score | DECIMAL | Effektivitet |
| times_reused | INT | Gjenbruksteller |

### skills (PostgreSQL)
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | |
| name | TEXT | Skill-navn |
| description | TEXT | |
| prompt_fragment | TEXT | System prompt-tillegg |
| applies_to | TEXT[] | ['planning', 'coding', 'review', 'chat'] |
| scope | TEXT | 'global', 'repo:{name}', 'user:{id}' |
| category | TEXT | 'security', 'quality', 'style', 'framework', 'language' |
| version | TEXT | Semantic versioning |
| marketplace_id | TEXT | NULL = privat |
| tags | TEXT[] | |
| depends_on | UUID[] | Avhengigheter |
| conflicts_with | UUID[] | Konflikter |
| execution_phase | TEXT | 'pre_run', 'inject', 'post_run' (default: inject) |
| priority | INT | Lavere = kjøres først (default: 100) |
| token_estimate | INT | Estimert tokens i prompt |
| token_budget_max | INT | Maks tokens (0 = ubegrenset) |
| routing_rules | JSONB | Auto-aktivering: { keywords, file_patterns, labels } |
| parent_skill_id | UUID FK | Hierarkisk sub-skill |
| composable | BOOLEAN | Kan kombineres med andre |
| output_schema | JSONB | Forventet output-format |
| success_count | INT | Antall vellykkede bruk |
| failure_count | INT | Antall feilede bruk |
| avg_token_cost | DECIMAL | Gjennomsnittlig token-kostnad |
| confidence_score | DECIMAL | success / (success + failure) |
| last_used_at | TIMESTAMPTZ | Sist brukt |
| total_uses | INT | Totalt antall bruk |

### project_plans (PostgreSQL) — agent service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | gen_random_uuid() |
| conversation_id | VARCHAR(255) | Tilhørende samtale |
| user_request | TEXT | Opprinnelig brukermelding |
| status | TEXT | 'planning', 'executing', 'paused', 'completed', 'failed' |
| current_phase | INT | Nåværende fase (0-basert) |
| plan_data | JSONB | Strukturert plan med faser og metadata |
| conventions | TEXT | Kompakt konvensjonsdokument (<2000 tokens) |
| total_tasks | INT | Totalt antall oppgaver |
| completed_tasks | INT | Fullførte oppgaver |
| failed_tasks | INT | Feilede oppgaver |
| total_cost_usd | DECIMAL | Total kostnad |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### project_tasks (PostgreSQL) — agent service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | gen_random_uuid() |
| project_id | UUID FK | Referanse til project_plans |
| phase | INT | Fase-nummer (0-basert) |
| task_order | INT | Rekkefølge innen fase |
| title | TEXT | Oppgavetittel |
| description | TEXT | Detaljert beskrivelse for AI |
| status | TEXT | 'pending', 'running', 'completed', 'failed', 'skipped', 'pending_review' |
| depends_on | UUID[] | Andre task-IDer som må fullføres først |
| output_files | TEXT[] | Filer produsert (fylles ut etter utførelse) |
| output_types | TEXT[] | Type-definisjoner opprettet |
| context_hints | TEXT[] | Hints til context curator |
| linear_task_id | VARCHAR(255) | Linear task kobling |
| pr_url | TEXT | PR-lenke |
| cost_usd | DECIMAL | Kostnad for denne oppgaven |
| error_message | TEXT | Feilmelding ved failure |
| attempt_count | INT | Antall forsøk |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

### code_reviews (PostgreSQL) — agent service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | gen_random_uuid() |
| conversation_id | VARCHAR(255) | Chat-samtale |
| task_id | TEXT | Linear/orchestrator task |
| project_task_id | UUID | Valgfri FK til project_tasks |
| sandbox_id | TEXT | Sandbox som holdes i live |
| files_changed | JSONB | [{path, content, action}] |
| ai_review | JSONB | {documentation, qualityScore, concerns, memoriesExtracted} |
| status | TEXT | 'pending', 'approved', 'changes_requested', 'rejected' |
| reviewer_id | UUID | Bruker som tok aksjon |
| feedback | TEXT | Tilbakemelding fra bruker |
| created_at | TIMESTAMPTZ | |
| reviewed_at | TIMESTAMPTZ | |
| pr_url | TEXT | PR-lenke (settes ved godkjenning) |

### health_checks (PostgreSQL)
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | |
| repo | TEXT | Repository |
| check_type | TEXT | 'dependency_audit', 'test_coverage', etc. |
| status | TEXT | 'pass', 'warn', 'fail' |
| details | JSONB | Sjekk-detaljer |

### messages (PostgreSQL) — chat service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | |
| conversation_id | VARCHAR | |
| role | TEXT | 'user', 'assistant' |
| content | TEXT | Meldingsinnhold |
| message_type | TEXT | 'chat', 'agent_report', 'task_start', 'context_transfer' |
| metadata | JSONB | |

### conversations (PostgreSQL) — chat service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | VARCHAR PK | |
| owner_email | VARCHAR | OWASP A01 ownership |

### tasks (PostgreSQL) — tasks service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | |
| title | TEXT NOT NULL | Oppgavetittel |
| description | TEXT | Detaljert beskrivelse |
| repo | VARCHAR(255) | owner/name format |
| status | TEXT | 'backlog', 'planned', 'in_progress', 'in_review', 'done', 'blocked' |
| priority | INT | 0-4 (0=ingen, 4=urgent) |
| labels | TEXT[] | Tags |
| phase | TEXT | Fasegruppering |
| depends_on | UUID[] | Andre task-IDer som må fullføres først |
| source | TEXT | 'manual', 'linear', 'healing', 'marketplace' |
| linear_task_id | VARCHAR(255) | Linear sync kobling |
| linear_synced_at | TIMESTAMPTZ | Siste synktidspunkt |
| healing_source_id | UUID | Kilde-task for auto-fix |
| estimated_complexity | INT | 1-10 fra AI |
| estimated_tokens | INT | Estimerte tokens |
| planned_order | INT | AI-bestemt rekkefølge |
| assigned_to | TEXT | Agent eller bruker |
| build_job_id | TEXT | Builder-referanse |
| pr_url | TEXT | PR-lenke |
| review_id | UUID | Review-referanse |
| created_by | TEXT | Bruker-e-post |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | Satt ved status=done |

### builder_jobs (PostgreSQL) — builder service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | gen_random_uuid() |
| task_id | TEXT NOT NULL | Oppgave-ID fra agent |
| sandbox_id | TEXT | Sandbox-ID for bygging |
| status | TEXT | 'pending', 'planning', 'building', 'validating', 'complete', 'failed', 'cancelled' |
| plan | JSONB | BuildPlan med steps, description, model |
| build_strategy | TEXT | 'sequential', 'scaffold_first', 'dependency_order' |
| current_phase | TEXT | Nåværende fase |
| current_step | INT | Nåværende steg-nummer |
| total_steps | INT | Totalt antall fil-steg |
| files_written | JSONB | [{path, status, attempts, errors}] |
| files_validated | JSONB | [{path, valid, errors}] |
| build_iterations | INT | Antall integrate-iterasjoner |
| max_iterations | INT | Maks iterasjoner (default 10) |
| context_window | JSONB | Akkumulert fil-innhold for kontekst |
| dependency_graph | JSONB | {file → [dependencies]} |
| total_tokens_used | INT | Totalt tokens forbrukt |
| total_cost_usd | DECIMAL | Total kostnad |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### build_steps (PostgreSQL) — builder service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | gen_random_uuid() |
| job_id | UUID FK | Referanse til builder_jobs (CASCADE) |
| step_number | INT | Steg-nummer |
| phase | TEXT | 'init', 'scaffold', 'dependencies', 'implement', 'integrate', 'finalize' |
| action | TEXT | 'create_file', 'modify_file', 'delete_file', 'run_command' |
| file_path | TEXT | Filbane |
| prompt_context | JSONB | AI-kontekst brukt |
| ai_model | TEXT | Modell brukt |
| tokens_used | INT | Tokens forbrukt |
| status | TEXT | 'pending', 'running', 'success', 'failed', 'skipped' |
| content | TEXT | Generert filinnhold |
| output | TEXT | Kommando-output |
| error | TEXT | Feilmelding |
| validation_result | JSONB | Valideringsresultat |
| fix_attempts | INT | Antall fiksforsøk |
| created_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

### components (PostgreSQL) — registry service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | gen_random_uuid() |
| name | TEXT NOT NULL | Komponentnavn |
| description | TEXT | Beskrivelse |
| category | TEXT | 'auth', 'api', 'ui', 'util', 'config' |
| version | TEXT | Semantic versjon (default '1.0.0') |
| previous_version_id | UUID | Lenke til forrige versjon |
| files | JSONB NOT NULL | [{path, content, language}] |
| entry_point | TEXT | Hovedfil |
| dependencies | TEXT[] | npm-pakker |
| source_repo | TEXT NOT NULL | Repo den ble ekstrahert fra |
| source_task_id | UUID | Task som opprettet den |
| extracted_by | TEXT | 'thefold' eller 'manual' |
| used_by_repos | TEXT[] | Repos som bruker denne |
| times_used | INT | Bruksteller |
| test_coverage | DECIMAL | Testdekning |
| validation_status | TEXT | 'pending', 'validated', 'failed' |
| tags | TEXT[] | Merkelapper |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### healing_events (PostgreSQL) — registry service
| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | UUID PK | gen_random_uuid() |
| component_id | UUID FK | Referanse til components |
| old_version | TEXT | Versjon før endring |
| new_version | TEXT | Versjon etter endring |
| trigger | TEXT | 'update', 'bugfix', 'security' |
| severity | TEXT | 'low', 'normal', 'high', 'critical' |
| affected_repos | TEXT[] | Berørte repos |
| tasks_created | UUID[] | Opprettede task-IDer |
| status | TEXT | 'pending', 'in_progress', 'completed', 'failed' |
| created_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

## API-endepunkt-katalog

### Gateway
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /auth/request-otp | Nei | Send OTP-kode |
| POST | /auth/verify-otp | Nei | Verifiser OTP |
| POST | /auth/logout | Ja | Logg ut |
| GET | /users/me | Ja | Hent profil |
| POST | /users/preferences | Ja | Oppdater innstillinger |
| POST | /users/update-profile | Ja | Oppdater profil |

### Chat
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /chat/send | Ja | Send melding |
| POST | /chat/history | Ja | Hent historikk |
| GET | /chat/conversations | Ja | Liste samtaler |
| POST | /chat/transfer-context | Ja | Overfør kontekst |

### AI
| Metode | Path | Intern | Beskrivelse |
|--------|------|--------|-------------|
| POST | /ai/chat | Ja | Direkte chat |
| POST | /ai/plan | Ja | Planlegg oppgave |
| POST | /ai/review | Ja | Code review |
| POST | /ai/assess-confidence | Ja | Vurder confidence |
| POST | /ai/assess-complexity | Ja | Vurder kompleksitet |
| POST | /ai/diagnose | Ja | Diagnostiser feil |
| POST | /ai/revise-plan | Ja | Revider plan |
| POST | /ai/decompose-project | Ja | Dekomponér prosjekt til atomære tasks |
| POST | /ai/revise-project-phase | Ja | AI-drevet re-planlegging mellom faser |
| POST | /ai/plan-task-order | Ja | AI-basert task-prioritering og rekkefølge |
| POST | /ai/generate-file | Ja | Generer enkeltfil med kontekst (builder) |
| POST | /ai/fix-file | Ja | Fiks TypeScript-feil i fil (builder) |

### Agent
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /agent/start | Intern | Start oppgave |
| POST | /agent/check | Ja | Sjekk pending |
| POST | /agent/audit/list | Ja | Audit-logg |
| POST | /agent/audit/trace | Ja | Oppgave-trace |
| POST | /agent/audit/stats | Ja | Statistikk |
| POST | /agent/project/start | Ja | Start prosjektkjøring |
| POST | /agent/project/status | Ja | Prosjektstatus med tasks |
| POST | /agent/project/pause | Ja | Pause prosjekt |
| POST | /agent/project/resume | Ja | Gjenoppta prosjekt |
| POST | /agent/project/store | Intern | Lagre dekomponert plan |
| POST | /agent/review/submit | Intern | Lagre review fra agent loop |
| POST | /agent/review/get | Ja | Hent full review med filer |
| POST | /agent/review/list | Ja | Liste reviews med statusfilter |
| POST | /agent/review/approve | Ja | Godkjenn → opprett PR |
| POST | /agent/review/request-changes | Ja | Be om endringer → re-kjør agent |
| POST | /agent/review/reject | Ja | Avvis → destroy sandbox |

### Memory
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /memory/search | Ja | Søk minner (decayed) |
| POST | /memory/store | Ja | Lagre minne |
| POST | /memory/extract | Intern | Auto-ekstraher |
| POST | /memory/consolidate | Intern | Slå sammen |
| POST | /memory/cleanup | Intern (cron) | Slett utløpte |
| GET | /memory/stats | Ja | Statistikk |
| POST | /memory/store-pattern | Intern | Lagre code pattern |
| POST | /memory/search-patterns | Intern | Søk patterns |

### Skills
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| GET | /skills/list | Ja | Liste skills |
| GET | /skills/get | Ja | Hent skill |
| POST | /skills/create | Ja | Opprett |
| POST | /skills/update | Ja | Oppdater |
| POST | /skills/toggle | Ja | Aktiver/deaktiver |
| POST | /skills/delete | Ja | Slett |
| GET | /skills/preview | Ja | Forhåndsvis prompt |
| POST | /skills/resolve | Intern | Pipeline: automatisk routing og skill-seleksjon |
| POST | /skills/execute-pre-run | Intern | Kjør pre-run skills |
| POST | /skills/execute-post-run | Intern | Kjør post-run skills |
| POST | /skills/log-result | Intern | Logg skill-bruk og scoring |

### Tasks
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /tasks/create | Ja | Opprett ny task |
| POST | /tasks/update | Ja | Oppdater task-felter |
| POST | /tasks/delete | Ja | Slett task |
| GET | /tasks/get | Ja | Hent task |
| POST | /tasks/get-internal | Intern | Hent task (service-to-service) |
| POST | /tasks/list | Ja | Liste med filtre (repo, status, source, labels) |
| POST | /tasks/sync-linear | Ja | Synk fra Linear |
| POST | /tasks/push-to-linear | Ja | Push status til Linear |
| POST | /tasks/plan-order | Ja | AI-basert task-prioritering |
| GET | /tasks/stats | Ja | Statistikk (total, byStatus, bySource, byRepo) |
| POST | /tasks/update-status | Intern | Agent oppdaterer task-status |

### Builder
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /builder/start | Intern | Start build-jobb med plan |
| POST | /builder/status | Intern | Hent jobb-status med steg |
| POST | /builder/cancel | Intern | Avbryt pågående jobb |
| GET | /builder/job | Ja | Hent jobb (frontend) |
| POST | /builder/jobs | Ja | Liste jobber med filter |

### Registry
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /registry/register | Intern | Registrer ny komponent |
| GET | /registry/get | Ja | Hent komponent |
| POST | /registry/list | Ja | Liste med filter (category, repo) |
| POST | /registry/search | Ja | Søk (navn, beskrivelse, tags) |
| POST | /registry/use | Intern | Marker bruk (oppdater used_by_repos) |
| POST | /registry/find-for-task | Intern | Finn komponenter for en oppgave |
| POST | /registry/trigger-healing | Intern | Trigger healing-pipeline |
| GET | /registry/healing-status | Ja | Status for healing-events |

### Monitor
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /monitor/run-check | Ja | Kjør health check |
| GET | /monitor/health | Ja | Siste status |
| POST | /monitor/history | Ja | Sjekk-historikk |

## Skill Pipeline

Skills er aktive komponenter i en three-phase pipeline:

```
Pre-run          Inject              Post-run
(validering)     (system prompt)     (quality check)
    │                 │                   │
    ▼                 ▼                   ▼
┌─────────┐     ┌──────────┐       ┌──────────┐
│ Security │     │ Encore   │       │ Norwegian│
│ Check    │     │ Rules    │       │ Docs     │
│ (p:5)    │     │ (p:10)   │       │ (p:100)  │
└─────────┘     │ TS Strict│       └──────────┘
                │ (p:20)   │
                │ Test Cov │
                │ (p:30)   │
                └──────────┘
```

**Automatisk routing:** Skills aktiveres basert på `routing_rules` (keywords, file_patterns, labels) som matches mot oppgavekontekst.

**Token-budsjett:** Skills sorteres etter priority og inkluderes til token-budsjettet er brukt opp.

**Scoring:** Hver skill tracker success/failure count og beregner confidence_score automatisk.

## Service-avhengigheter

```
chat → ai, memory, agent (via pub/sub), github (for project detection), registry (healing sub)
agent → ai, github, linear, memory, sandbox, users, docs, chat (pub/sub), tasks, builder
builder → ai, sandbox (for file generation and validation)
tasks → linear (for sync), ai (for planTaskOrder)
ai → skills (for prompt enrichment)
memory → cache (for embedding caching) — planlagt: bytt Voyage → OpenAI text-embedding-3-small
github → cache (for repo structure caching) — planlagt: webhook endpoint for auto-sync (PR merge → task done)
monitor → sandbox (for running checks)
registry → tasks (healing tasks), memory (code patterns)
```

## Fremtidige features og grunnmur

| Feature | Bygger på |
|---------|-----------|
| Marketplace Frontend | registry/ service, skills.marketplace_id, skills.version |
| Component Auto-extraction | registry/extractor.ts stub, ai-basert komponentdeteksjon |
| Multi-repo bug fixing | memory.source_repo, code_patterns.source_repo |
| Proactive monitoring | monitor.health_rules, monitor.daily-health-check cron |
| Memory consolidation | memory.consolidated_from, memory.superseded_by |
| Snapshot testing | sandbox VALIDATION_PIPELINE (snapshot step, enabled: false) |
| Performance benchmarks | sandbox VALIDATION_PIPELINE (performance step, enabled: false) |
| Token cost optimization | ai.cache_control, ai.logTokenUsage |
| Git-integrasjon i UI | github/ service — commit-feed, branch-status, one-click merge, webhook for auto-sync |
| OpenAI embeddings | memory/ service — bytt Voyage → text-embedding-3-small (512 dim, $0.02/M tokens) |

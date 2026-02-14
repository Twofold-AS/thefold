# TheFold — Arkitektur

## Oversikt

TheFold er en autonom fullstack utviklingsagent bygget med **Encore.ts** (9 mikrotjenester) og **Next.js** frontend. Den leser oppgaver fra Linear, leser/skriver kode via GitHub, validerer i sandbox, og leverer PRs med dokumentasjon.

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

┌──────────────┐  ┌─────────────┐
│    cache     │  │    docs     │
│ PostgreSQL   │  │ Context7    │
│ Key-value    │  │ MCP lookup  │
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

### Agent
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /agent/start | Intern | Start oppgave |
| POST | /agent/check | Ja | Sjekk pending |
| POST | /agent/audit/list | Ja | Audit-logg |
| POST | /agent/audit/trace | Ja | Oppgave-trace |
| POST | /agent/audit/stats | Ja | Statistikk |

### Memory
| Metode | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /memory/search | Intern | Søk minner (decayed) |
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
chat → ai, memory, agent (via pub/sub)
agent → ai, github, linear, memory, sandbox, users
ai → skills (for prompt enrichment)
memory → cache (for embedding caching)
github → cache (for repo structure caching)
monitor → sandbox (for running checks)
```

## Fremtidige features og grunnmur

| Feature | Bygger på |
|---------|-----------|
| Marketplace | skills.marketplace_id, skills.version, skills.author_id |
| Component Registry | code_patterns.component_id |
| Multi-repo bug fixing | memory.source_repo, code_patterns.source_repo |
| Proactive monitoring | monitor.health_rules, monitor.daily-health-check cron |
| Memory consolidation | memory.consolidated_from, memory.superseded_by |
| Snapshot testing | sandbox VALIDATION_PIPELINE (snapshot step, enabled: false) |
| Performance benchmarks | sandbox VALIDATION_PIPELINE (performance step, enabled: false) |
| Token cost optimization | ai.cache_control, ai.logTokenUsage |

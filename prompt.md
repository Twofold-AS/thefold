Les CLAUDE.md, ARKITEKTUR.md, KOMPLETT-BYGGEPLAN.md, ENDRINGER-AUTH-SKILLS-REKKEFØLGE.md og THEFOLD-COMPETITIVE-ANALYSIS.md.
Gå deretter gjennom HELE kodebasen og oppdater dokumentasjonen. Målet: enhver utvikler (eller AI) som leser dokumentasjonen skal forstå nøyaktig hva som er bygget, hva som er aktivt, hva som er stubbet ut, og hva som kreves for å aktivere hver feature.

OPPGAVE 1: Opprett GRUNNMUR-STATUS.md
Opprett en ny fil GRUNNMUR-STATUS.md i roten med følgende struktur. Gå gjennom faktisk kode — ikke gjett. Åpne hver fil og verifiser hva som faktisk eksisterer.
markdown# TheFold — Grunnmur-status og aktiveringsplan

> Sist oppdatert: [dato]
> Formål: Oversikt over alt som er bygget inn i arkitekturen, hva som er aktivt,
> hva som er stubbet, og hva som trengs for å aktivere hver feature.

---

## Statusforklaring
- 🟢 AKTIV — Fungerer i produksjon/dev, fullt implementert
- 🟡 STUBBET — Kode eksisterer, grunnmur på plass, men returnerer dummy/passthrough
- 🔴 GRUNNMUR — Kun database-felter og/eller interfaces, ingen implementering ennå
- ⚪ PLANLAGT — Nevnt i planer men ingen kode skrevet

---

## 1. Memory-service

### Database-felter
[List opp ALLE kolonner i memories-tabellen med status for hver]

| Kolonne | Type | Status | Brukes av | Aktivering |
|---------|------|--------|-----------|------------|
| id | UUID | 🟢 | Alle queries | — |
| content | TEXT | 🟢 | store, search | — |
| embedding | vector | 🟢 | search | — |
| memory_type | TEXT | 🟢/🟡/🔴? | ? | ? |
| parent_memory_id | UUID | ? | ? | ? |
| last_accessed_at | TIMESTAMPTZ | ? | ? | ? |
| access_count | INT | ? | ? | ? |
| relevance_score | DECIMAL | ? | ? | ? |
| ttl_days | INT | ? | ? | ? |
| pinned | BOOLEAN | ? | ? | ? |
| consolidated_from | UUID[] | ? | ? | ? |
| superseded_by | UUID | ? | ? | ? |
| source_repo | TEXT | ? | ? | ? |
| source_task_id | TEXT | ? | ? | ? |
| tags | TEXT[] | ? | ? | ? |
[osv — list opp ALLE]

### Endepunkter
| Endepunkt | Status | Beskrivelse | Hva mangler for full aktivering |
|-----------|--------|-------------|--------------------------------|
| POST /memory/store | 🟢/🟡? | Lagre minne | Bruker den alle nye felter? |
| POST /memory/search | ? | Søk med decay | Fungerer decayed scoring? |
| POST /memory/consolidate | ? | Slå sammen minner | |
| POST /memory/cleanup | ? | Slett utløpte | |
| GET /memory/stats | ? | Statistikk | |
| POST /memory/store-pattern | ? | Code patterns | |
| POST /memory/search-patterns | ? | Søk patterns | |

### Code patterns-tabell
[List opp alle kolonner i code_patterns med status]

### Cron-jobs
| Cron | Status | Schedule | Hva den gjør | Aktivering |
|------|--------|----------|--------------|------------|
| memory-cleanup | ? | 0 4 * * * | ? | ? |

### Hva trengs for full aktivering
[Konkret liste over hva som må gjøres]

---

## 2. Agent-service

### Meta-reasoning typer (agent/types.ts)
[List opp alle typer og om de faktisk brukes i agent-loopen]

| Type | Status | Brukes i | Aktivering |
|------|--------|----------|------------|
| DiagnosisResult | ? | ? | ? |
| AgentExecutionContext | ? | ? | ? |
| AttemptRecord | ? | ? | ? |
| ErrorPattern | ? | ? | ? |

### Agent-loop flyten
| Steg | Status | Beskrivelse | Hva mangler |
|------|--------|-------------|-------------|
| 1. Hent task fra Linear | ? | | |
| 2. Hent error patterns fra memory | ? | | |
| 3. Opprett ExecutionContext | ? | | |
| 4. Plan med AI | ? | | |
| 5. Execute i sandbox | ? | | |
| 6. Diagnose ved feil | ? | | |
| 7. Revise plan hvis bad_plan | ? | | |
| 8. Lagre error patterns | ? | | |
| 9. Opprett PR | ? | | |
| 10. Rapporter i chat | ? | | |

### Hva trengs for full aktivering

---

## 3. AI-service

### Endepunkter
| Endepunkt | Status | Expose | Auth | Brukes av | Hva mangler |
|-----------|--------|--------|------|-----------|-------------|
| POST /ai/chat | ? | ? | ? | ? | ? |
| POST /ai/plan | ? | ? | ? | ? | ? |
| POST /ai/generate | ? | ? | ? | ? | ? |
| POST /ai/review | ? | ? | ? | ? | ? |
| POST /ai/diagnose | ? | ? | ? | ? | ? |
| POST /ai/revise-plan | ? | ? | ? | ? | ? |
| POST /ai/assess-complexity | ? | ? | ? | ? | ? |

### Prompt caching
| Feature | Status | Beskrivelse | Aktivering |
|---------|--------|-------------|------------|
| cache_control på system prompt | ? | | |
| cache_control på repo context | ? | | |
| Token tracking / logging | ? | | |

### Hva trengs for full aktivering

---

## 4. Sandbox-service

### Validation pipeline
| Steg | Status | Enabled | Beskrivelse | Aktivering |
|------|--------|---------|-------------|------------|
| typecheck | ? | ? | tsc --noEmit | |
| lint | ? | ? | eslint | |
| test | ? | ? | npm test | |
| snapshot | ? | ? | Snapshot-sammenligning | |
| performance | ? | ? | Performance benchmark | |

### Hva trengs for full aktivering

---

## 5. Skills-service

### Database-felter
[List opp ALLE kolonner med status — inkludert alle pipeline-felter]

### Endepunkter
[Alle endepunkter med status]

### Pipeline engine (skills/engine.ts)
| Funksjon | Status | Beskrivelse | Aktivering |
|----------|--------|-------------|------------|
| resolve | ? | Automatisk skill-routing | |
| executePreRun | ? | Pre-run skills | |
| executePostRun | ? | Post-run skills | |
| logResult | ? | Eval/scoring | |

### Automatisk routing
| Feature | Status | Beskrivelse | Aktivering |
|---------|--------|-------------|------------|
| Keyword matching | ? | | |
| File pattern matching | ? | | |
| Label matching | ? | | |
| Dependency resolution | ? | | |
| Conflict handling | ? | | |
| Token budget | ? | | |

### Fremtidige features (fra skills-os-system)
| Feature | Grunnmur | Status | Aktivering |
|---------|----------|--------|------------|
| Skill-hierarki (parent/child) | parent_skill_id | ? | |
| Skill-komposisjon | composable | ? | |
| Pre-run validering | execution_phase='pre_run' | ? | |
| Post-run review | execution_phase='post_run' | ? | |
| Skill versjonering | version | ? | |
| Marketplace | marketplace_id, downloads, rating | ? | |
| Token-budsjett per skill | token_budget_max | ? | |
| Confidence scoring | confidence_score | ? | |
| Usage logging | total_uses, last_used_at | ? | |
| Output schema validering | output_schema | ? | |
| Skill bundles/packages | — | ⚪ | Trenger ny tabell |
| RBAC | — | ⚪ | Trenger ny tabell |
| Skill A/B testing | — | ⚪ | Trenger ny tabell |
| Canary rollout | — | ⚪ | Trenger versjonerings-logikk |
| Skill-signering | — | ⚪ | Trenger krypto-lag |
| Prompt injection detection | — | ⚪ | Trenger eget endepunkt |

### Hva trengs for full aktivering

---

## 6. Monitor-service

### Database-tabeller
[List opp alle kolonner i health_checks og health_rules]

### Endepunkter
[Alle endepunkter med status]

### Health checks implementert
| Check | Status | Beskrivelse | Aktivering |
|-------|--------|-------------|------------|
| dependency_audit | ? | npm audit | |
| test_coverage | ? | npm test --coverage | |
| code_quality | ? | | |
| doc_freshness | ? | | |
| performance | ? | | |

### Cron-jobs
| Cron | Status | Feature-flag | Aktivering |
|------|--------|-------------|------------|
| daily-health-check | ? | MonitorEnabled | |

### Hva trengs for full aktivering

---

## 7. Gateway/Auth

[Oppsummer nåværende auth-status]

## 8. Chat-service

[Oppsummer nåværende status, inkludert conversation ownership, transfer]

## 9. Frontend

### Sider og status
| Side | Status | Koblet til backend | Hva mangler |
|------|--------|-------------------|-------------|
| /login | ? | ? | |
| /home | ? | ? | |
| /chat | ? | ? | |
| /skills | ? | ? | |
| /settings | ? | ? | |
| /environments | ? | ? | |
| /secrets | ? | ? | |
| /repo/[name]/overview | ? | ? | |
| /repo/[name]/chat | ? | ? | |
| /repo/[name]/tasks | ? | ? | |
[osv for alle sider]

---

## Aktiveringsplan: Prioritert rekkefølge

### Fase 1: Kjernefunksjonalitet (nødvendig for MVP)
1. [Hva må aktiveres først]
2. [osv]

### Fase 2: Kvalitetsforbedring
1. [Hva gir mest verdi etter MVP]

### Fase 3: Avanserte features
1. [Hva kan vente]

### Fase 4: Enterprise/Marketplace
1. [Langsiktige features]
VIKTIG: Fyll inn ALLE ? med faktisk status ved å lese koden. Ikke gjett. Åpne filene og verifiser.

OPPGAVE 2: Oppdater KOMPLETT-BYGGEPLAN.md
Oppdater byggeplanen slik at den refererer til GRUNNMUR-STATUS.md for detaljert status, og legg til:

En seksjon "Grunnmur som er bygget inn men ikke aktivert" med kort oppsummering og lenke til GRUNNMUR-STATUS.md
Oppdaterte steg fremover som tar hensyn til hva som allerede er stubbet og klart for aktivering
Tydelig skille mellom "bygge nytt" og "aktivere eksisterende grunnmur"


OPPGAVE 3: Oppdater CLAUDE.md
Legg til en seksjon i CLAUDE.md:
## Grunnmur-awareness
Når du jobber med TheFold, vær klar over at mange features har grunnmur på plass
men er ikke aktivert ennå. Se GRUNNMUR-STATUS.md for full oversikt. Når du
implementerer en feature som berører noe som allerede er stubbet, AKTIVER den
eksisterende grunnmuren i stedet for å bygge noe nytt.

OPPGAVE 4: Push til GitHub

RAPPORTERING
## Oppgavestatus
| # | Oppgave | Status | Detaljer |
|---|---------|--------|----------|
| 1 | GRUNNMUR-STATUS.md | ✅/❌ | Antall features dokumentert, alle ? fylt inn? |
| 2 | KOMPLETT-BYGGEPLAN.md | ✅/❌ | Oppdatert med grunnmur-referanser? |
| 3 | CLAUDE.md | ✅/❌ | Grunnmur-awareness lagt til? |
| 4 | Push | ✅/❌ | Commit hash |

## Oppsummering
- Antall 🟢 AKTIVE features: ?
- Antall 🟡 STUBBEDE features: ?
- Antall 🔴 GRUNNMUR features: ?
- Antall ⚪ PLANLAGTE features: ?

## Uløste problemer
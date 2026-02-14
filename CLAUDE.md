# TheFold — Development Instructions

## What is TheFold?
An autonomous fullstack development agent. It reads tasks from Linear, reads/writes code via GitHub, validates in a sandbox, and delivers PRs with documentation.

## Architecture (9 Encore.ts services)
```
gateway  → Auth (Bearer token with HMAC, OTP via Resend)
chat     → Communication channel (user ↔ TheFold), PostgreSQL, OWASP ownership
ai       → Claude API orchestration, multi-model routing, prompt caching, diagnosis
agent    → The brain: autonomous task execution loop with meta-reasoning
github   → Read/write repos via GitHub API, context windowing
sandbox  → Isolated code execution, validation pipeline (tsc + lint + tests)
linear   → Task management, cron sync, status updates
memory   → pgvector semantic search, temporal decay, code patterns, consolidation
skills   → Modular prompt system with categories, marketplace future-proofing
monitor  → Repository health checks, dependency audits (feature-flagged cron)
docs     → Context7 MCP for up-to-date library documentation
cache    → PostgreSQL-based key-value cache (until Encore CacheCluster supports TS)
```

## Critical Rules
- ALL APIs: `api()` from "encore.dev/api"
- ALL secrets: `secret()` from "encore.dev/config"
- ALL databases: `SQLDatabase` from "encore.dev/storage/sqldb"
- ALL pub/sub: `Topic`/`Subscription` from "encore.dev/pubsub"
- ALL cron: `CronJob` from "encore.dev/cron"
- NEVER Express, Fastify, dotenv, process.env
- NEVER hardcode keys, tokens, passwords

## Agent Flow (with meta-reasoning)
1. Linear task picked up (cron or user request via chat)
2. GitHub: read project tree + relevant files (with context windowing)
3. Memory: search for relevant context (with temporal decay scoring)
4. Memory: search for similar error patterns from previous tasks
5. Context7: look up library docs
6. AI: assess confidence → proceed / clarify / break down
7. AI: assess complexity → select optimal model (auto/manual)
8. AI: plan the work (structured JSON output)
9. Sandbox: clone repo, write files, validate via pipeline (tsc + lint + tests)
10. If validation fails → **diagnose failure**:
    - `bad_plan` → AI revises plan entirely (max 2 revisions)
    - `implementation_error` → AI fixes code
    - `missing_context` → fetch more from memory/GitHub
    - `impossible_task` → escalate to human, block Linear task
    - `environment_error` → wait 30s and retry
11. Max 5 total attempts (up from 3)
12. GitHub: create branch + PR with documentation
13. Linear: update task to "In Review"
14. Memory: store decisions + error patterns for future learning
15. Chat: report to user with cost tracking

## Memory Types
| Type | When to use |
|------|-------------|
| `general` | Default for unclassified memories |
| `skill` | Learned skills and capabilities |
| `task` | Task-specific context |
| `session` | Conversation extracts |
| `error_pattern` | Errors and their resolutions (for cross-task learning) |
| `decision` | Architectural decisions and key choices |

## Validation Pipeline
The sandbox runs a 5-step pipeline (3 enabled, 2 stubbed for future):
1. **typecheck** ✅ — `npx tsc --noEmit`
2. **lint** ✅ — `npx eslint . --no-error-on-unmatched-pattern`
3. **test** ✅ — `npm test --if-present`
4. **snapshot** ⬜ — Snapshot comparison (future)
5. **performance** ⬜ — Performance benchmarks (future)

## Skills Pipeline
Skills are active components in a three-phase pipeline:
- **pre_run** — Run before AI call (validation, context enrichment)
- **inject** — Injected into system prompt (current default behavior)
- **post_run** — Run after AI call (quality review, security scan)

Automatic routing via `routing_rules` JSONB: keywords, file_patterns, labels.
Token budgeting: skills sorted by priority, included until budget exhausted.
Scoring: success/failure tracking with confidence_score = success/(success+failure).

Key engine endpoints (internal): `/skills/resolve`, `/skills/execute-pre-run`, `/skills/execute-post-run`, `/skills/log-result`.
Categories: `framework`, `language`, `security`, `style`, `quality`, `general`.

## Monitor Service
Health checks for repos: dependency_audit, test_coverage, code_quality (stub), doc_freshness (stub).
Daily cron at 03:00, but **feature-flagged off by default**.

## Grunnmur-awareness
Når du jobber med TheFold, vær klar over at mange features har grunnmur på plass
men er ikke aktivert ennå. Se **GRUNNMUR-STATUS.md** for full oversikt (134 features,
87 aktive, 18 stubbede, 22 grunnmur, 7 planlagte). Når du implementerer en feature
som berører noe som allerede er stubbet, **AKTIVER den eksisterende grunnmuren**
i stedet for å bygge noe nytt.

Eksempler på stubbede features klare for aktivering:
- `skills/engine.ts` executePreRun/executePostRun (returnerer passthrough)
- `monitor/monitor.ts` code_quality/doc_freshness (returnerer "not implemented")
- `sandbox/sandbox.ts` snapshot/performance pipeline-steg (enabled: false)

## Running
```bash
encore run              # all services + local infra
# Dashboard: http://localhost:9400
```

## Key Files
- `agent/agent.ts` — The autonomous loop with meta-reasoning (most critical file)
- `agent/types.ts` — DiagnosisResult, AgentExecutionContext, AttemptRecord, ErrorPattern
- `ai/ai.ts` — System prompts, multi-model routing, diagnosis, prompt caching
- `sandbox/sandbox.ts` — Validation pipeline (typecheck, lint, tests)
- `memory/memory.ts` — Semantic search with decay, code patterns, consolidation
- `skills/skills.ts` — CRUD + prompt enrichment
- `skills/engine.ts` — Pipeline engine: resolve, pre-run, post-run, scoring
- `monitor/monitor.ts` — Health checks and cron
- `github/github.ts` — Repository operations with context windowing
- `ARKITEKTUR.md` — Full architecture documentation with all schemas and endpoints

# TheFold — Development Instructions

## What is TheFold?
An autonomous fullstack development agent. It reads tasks from Linear, reads/writes code via GitHub, validates in a sandbox, and delivers PRs with documentation.

## Architecture (16 Encore.ts services)
```
gateway      → Auth (Bearer token with HMAC, OTP via Resend, token revocation)
chat         → Communication channel (user ↔ TheFold), PostgreSQL, OWASP ownership, file uploads
ai           → Multi-AI orchestration, dynamic provider/model system (DB-backed), prompt caching, diagnosis, tool-use
agent        → The brain: autonomous task execution loop with meta-reasoning
tasks        → TheFold's task engine: CRUD, Linear sync, AI planning, Pub/Sub events
builder      → TheFold's hands: file-by-file code building with dependency analysis
github       → Read/write repos via GitHub API, context windowing
sandbox      → Isolated code execution, validation pipeline (tsc + lint + tests), Docker isolation
linear       → Task management, cron sync, status updates
memory       → pgvector semantic search, temporal decay, code patterns, consolidation
skills       → Modular prompt system with categories, marketplace future-proofing
registry     → Component marketplace + healing pipeline, exposed use-component endpoint
templates    → Template library: pre-seeded scaffolds, variable substitution, category browsing
mcp          → MCP server registry: install/uninstall/configure, agent tool awareness
integrations → External service webhooks (Slack, Discord), CRUD config, frontend /tools/integrations
monitor      → Repository health checks, dependency audits (feature-flagged cron)
docs         → Context7 MCP for up-to-date library documentation
cache        → PostgreSQL-based key-value cache (until Encore CacheCluster supports TS)
```

## Templates Service
Template library with pre-seeded scaffolds for common patterns.

Key concepts:
- **Templates:** Pre-built code scaffolds with real, usable TypeScript code
- **Categories:** auth, api, ui, database, payment, form
- **Variables:** `{{VAR_NAME}}` placeholders in file contents and paths, substituted on use
- **Pre-seeded:** 5 templates: Contact Form, User Auth (OTP), Stripe Payment, REST API CRUD, File Upload

Endpoints: `/templates/list` (auth), `/templates/get` (auth), `/templates/use` (auth), `/templates/categories` (auth)
Database: `templates` table with JSONB files, dependencies, variables

Key files:
- `templates/templates.ts` — 4 endpoints: list, get, useTemplate, categories
- `templates/types.ts` — Template, TemplateFile, TemplateVariable types
- `templates/db.ts` — SQLDatabase reference

## MCP Service
MCP (Model Context Protocol) server management. Registry of external tool servers the agent can use.

Key concepts:
- **Servers:** Pre-seeded MCP servers (filesystem, github, postgres, context7, brave-search, puppeteer)
- **Status:** `available` (not active), `installed` (active, included in agent context), `error`
- **Categories:** general, code, data, docs, ai
- **Agent integration:** At task start, agent fetches installed servers via `mcp.installed()` and includes them in AI context
- **Actual MCP call routing:** Not yet implemented — comes in Fase 5

Endpoints: `/mcp/list` (auth), `/mcp/get` (auth), `/mcp/install` (auth), `/mcp/uninstall` (auth), `/mcp/configure` (auth), `/mcp/installed` (internal)
Database: `mcp_servers` table with JSONB env_vars and config

```
```

## Critical Rules
- ALL APIs: `api()` from "encore.dev/api"
- ALL secrets: `secret()` from "encore.dev/config"
- ALL databases: `SQLDatabase` from "encore.dev/storage/sqldb"
- ALL pub/sub: `Topic`/`Subscription` from "encore.dev/pubsub"
- ALL cron: `CronJob` from "encore.dev/cron"
- NEVER Express, Fastify, dotenv, process.env
- NEVER hardcode keys, tokens, passwords

## Task Engine
TheFold has its own task service (`tasks/`) as the central nervous system for all work:
- **Sources:** manual (user-created), chat (created via chat tool-use), linear (synced from Linear), healing (auto-fix), marketplace (future)
- **Statuses:** backlog → planned → in_progress → in_review → done (+ blocked)
- **Linear sync:** Two-way — pull from Linear, push status back
- **AI planning:** `ai.planTaskOrder` orders tasks by dependencies, complexity, priority
- **Pub/Sub:** `task-events` topic broadcasts created/updated/deleted/completed/failed events
- **Agent integration:** Agent STEP 1 checks for `thefoldTaskId` before Linear path

Key endpoints: `/tasks/create`, `/tasks/list`, `/tasks/sync-linear`, `/tasks/plan-order`, `/tasks/stats`

## Builder Service
The builder is TheFold's hands — it takes a plan from `ai.planTask()` and builds code file-by-file:
- **6 phases:** init → scaffold → dependencies → implement → integrate → finalize
- **Dependency graph:** Analyzes imports/requires to build a topological sort (Kahn's algorithm)
- **3 strategies:** sequential (simple), scaffold_first (new projects with npm init), dependency_order (complex deps)
- **File-by-file generation:** Each file generated via `ai.generateFile()` with context from completed dependencies
- **Fix loop:** Per-file incremental validation + up to 3 AI fix attempts via `ai.fixFile()`
- **Integration phase:** Full `sandbox.validate()` + identify failing files + AI fix + re-validate (max 3 iterations)
- **Cost tracking:** Tokens and USD accumulated per job, persisted to DB
- **Pub/Sub:** `build-progress` topic emits phase/step events for live progress

Agent STEP 6 calls `builder.start()` which runs all phases and returns `BuildResult` with filesChanged.

Key files:
- `builder/builder.ts` — Core orchestration, 5 endpoints (start, status, cancel, job, jobs)
- `builder/phases.ts` — 6 phase implementations
- `builder/graph.ts` — Dependency analysis, topological sort, import extraction
- `builder/types.ts` — BuilderJob, BuildPlan, BuildResult, BuildProgressEvent
- `builder/db.ts` — Shared SQLDatabase, Topic, helper functions

Endpoints: `/builder/start` (internal), `/builder/status` (internal), `/builder/cancel` (internal), `/builder/job` (auth), `/builder/jobs` (auth)
Database: `builder_jobs` + `build_steps` tables

## Chat Tool-Use (Function Calling)
Chat is connected to the agent system via Claude tool-use. When users ask for actions in chat, the AI can invoke tools directly:
- **5 tools:** `create_task`, `start_task`, `list_tasks`, `read_file`, `search_code`
- **Tool-loop flow:** `callAnthropicWithTools()` sends messages with tool definitions, loops on `stop_reason: tool_use` (MAX_TOOL_LOOPS=10): execute tools → send tool_result back → repeat until `end_turn`. Enables multi-tool sequences (e.g. create_task → start_task)
- **create_task enhancements:** Uses `source: "chat"` (not "manual"), fire-and-forget `enrichTaskWithAI()` estimates complexity + tokens after creation
- **start_task enhancements:** Verifies task exists via `tasks.getTaskInternal()` before starting agent, updates status to `in_progress`, sets `blocked` on failure. Propagates `conversationId` to agent
- **Dynamic AgentStatus:** `processAIResponse` builds steps dynamically based on intent detection with phase names (Forbereder/Analyserer/Planlegger/Bygger/Reviewer/Utforer)
- **Animated PhaseIcons:** Per-phase SVG icons with CSS animations (grid-blink, magnifying glass pulse, clipboard, lightning swing, eye, gear spin)

Key files: `ai/ai.ts` (tool definitions, callAnthropicWithTools, executeToolCall), `frontend/src/components/AgentStatus.tsx` (animated phase icons)

## Integrations Service
External service webhook integrations (Slack, Discord) with configuration management.

Key concepts:
- **Configs:** `integration_configs` table stores per-service credentials (webhook URLs, tokens)
- **Webhooks:** Slack and Discord webhook endpoints for receiving external messages
- **CRUD:** list, save, delete integration configs

Endpoints: `/integrations/list` (auth), `/integrations/save` (auth), `/integrations/delete` (auth), `/integrations/slack-webhook`, `/integrations/discord-webhook`
Database: `integration_configs` table

Key files:
- `integrations/integrations.ts` — CRUD + webhook endpoints
- `integrations/db.ts` — SQLDatabase reference

## Dynamic AI Provider & Model System
DB-driven model registry with full CRUD. Replaces hardcoded MODEL_REGISTRY.

Key concepts:
- **Providers:** AI providers (Anthropic, OpenAI, Moonshot, Google) stored in `ai_providers` table
- **Models:** Individual models with tier, costs, context window, tags stored in `ai_models` table (FK to provider)
- **Cache:** 60-second TTL DB cache in router.ts for fast model lookups, fallback models for cold start
- **Tag-based selection:** Models tagged (chat, coding, analysis, planning) for context-specific routing
- **Tier-based upgrade:** Fallback logic prefers same provider when upgrading tier (haiku→sonnet→opus within Anthropic)
- **Full CRUD:** Frontend `/settings/models` allows adding/editing/deleting providers and models

Endpoints: `/ai/providers` (GET, lists providers with nested models array), `/ai/providers/save` (POST, upsert provider), `/ai/models/save` (POST, upsert model), `/ai/models/toggle` (POST, enable/disable), `/ai/models/delete` (POST, delete model)
Database: `ai_providers` + `ai_models` tables

Pre-seeded data:
- **4 providers:** Anthropic, OpenAI, Moonshot, Google
- **9 models:** moonshot-v1-32k, moonshot-v1-128k, gpt-4o-mini, gemini-2.0-flash (tier 1), claude-haiku-4-5 (tier 2), claude-sonnet-4-5, gpt-4o (tier 3), claude-opus-4-5, gemini-2.0-pro (tier 5)

Key files:
- `ai/db.ts` — SQLDatabase("ai") with providers + models tables
- `ai/migrations/1_add_providers_and_models.up.sql` — DB schema + seed data
- `ai/providers.ts` — 5 CRUD endpoints for providers and models
- `ai/router.ts` — DB-backed cache, selectOptimalModel, getUpgradeModel, tag-based selection
- `frontend/src/app/(dashboard)/settings/models/page.tsx` — Full CRUD UI (expand/collapse, modal forms)

## Agent Flow (with meta-reasoning)
1. Task picked up via **dual-source lookup**: tries tasks service first (`tasks.getTaskInternal()`), falls back to Linear (`linear.getTask()`). When found locally, sets `ctx.thefoldTaskId = ctx.taskId` and updates status to `in_progress`. Also triggered by user request via chat tool-use dispatch
2. GitHub: read project tree + relevant files (with context windowing)
3. Memory: search for relevant context (with temporal decay scoring)
4. Memory: search for similar error patterns from previous tasks
5. Context7: look up library docs
6. AI: assess confidence → proceed / clarify / break down
7. AI: assess complexity → select optimal model (auto/manual)
8. AI: plan the work (structured JSON output)
9. **Sub-agents** (if enabled + complexity >= 5): dispatch parallel AI agents (planner, implementer, tester, reviewer, documenter) → merge outputs as enriched context for builder
10. Builder: file-by-file code generation with dependency analysis, incremental validation, fix loops
11. If validation fails → **diagnose failure**:
    - `bad_plan` → AI revises plan entirely (max 2 revisions)
    - `implementation_error` → AI fixes code
    - `missing_context` → fetch more from memory/GitHub
    - `impossible_task` → escalate to human, block Linear task
    - `environment_error` → wait 30s and retry
12. Max 5 total attempts (up from 3)
13. **Review gate** (unless `skipReview=true`): submit for user review via `submitReviewInternal()`
    - Agent pauses, sandbox stays alive, status = `pending_review`
    - User reviews at `/review/[id]`: approve, request changes, or reject
    - Approve → creates PR, updates Linear, stores memories, destroys sandbox
    - Request changes → re-executes task with feedback, creates new review
    - Reject → destroys sandbox
14. If `skipReview=true`: GitHub: create branch + PR with documentation (direct)
15. Linear: update task to "In Review"
16. Memory: store decisions + error patterns for future learning
17. Chat: report to user with cost tracking

## Project Orchestrator
When a user sends a large request ("Build a task app with auth and teams"), the orchestrator:
1. Chat detects project request via heuristics (>100 words, build intent, multiple systems)
2. `ai.decomposeProject()` breaks it into atomic tasks organized in phases
3. Plan stored via `agent.storeProjectPlan()` with dependency-index-to-UUID resolution
4. User confirms → `executeProject()` starts async via `agent.startProject()`
5. For each phase, for each task:
   - `curateContext()` gathers dependency outputs, memory, GitHub files, docs
   - Token-trimming with priority: conventions → deps → files → memory → docs (max 30K tokens)
   - `executeTask()` runs with curated context (skips steps 1-3)
   - Results update task status, cost, output_files in DB
6. Failed tasks → downstream dependents marked as 'skipped'
7. Between phases: `ai.reviseProjectPhase()` reviews completed results and adjusts next phase tasks (skip, revise descriptions, add new tasks)
8. After each phase: progress report via agentReports pub/sub
9. Crash-resumable: reads current state from DB, skips completed tasks

Key files:
- `agent/orchestrator.ts` — curateContext, executeProject, 5 API endpoints
- `agent/agent.ts` — executeTask with optional `ExecuteTaskOptions` (dual-path)
- `agent/types.ts` — ProjectPlan, ProjectTask, CuratedContext
- `chat/detection.ts` — detectProjectRequest heuristics
- `chat/chat.ts` — send endpoint with project detection integration

Endpoints: `/agent/project/start`, `/status`, `/pause`, `/resume`, `/store`
Database: `project_plans` + `project_tasks` tables (in agent service)

## Code Review System
Review gate sits between AI review (step 8) and PR creation. Agent pauses after self-review, stores review in DB, notifies user via chat. User reviews changes at `/review/[id]`.

Key flows:
- **Approve**: `approveReview()` → creates PR → updates Linear → stores memories → destroys sandbox
- **Request changes**: stores feedback → re-executes `executeTask()` with feedback in taskDescription → new review created
- **Reject**: destroys sandbox, notifies chat
- **Orchestrator integration**: `pending_review` pauses project, resumes after approval

Endpoints: `/agent/review/submit` (internal), `/get`, `/list`, `/approve`, `/request-changes`, `/reject`
Database: `code_reviews` table (in agent service) — JSONB for files_changed and ai_review

## Circuit Breaker (OWASP ASI08)
Agent wraps critical service calls with circuit breakers to prevent cascading failures:
- `aiBreaker` (threshold: 5, reset: 60s) — AI/builder calls
- `githubBreaker` (threshold: 5, reset: 60s) — GitHub API calls
- `sandboxBreaker` (threshold: 3, reset: 30s) — Sandbox operations

States: closed → open (after N failures) → half_open (after timeout) → closed (on success)
File: `agent/circuit-breaker.ts`

## Sub-agents (Multi-Agent Orchestration)
When enabled via user preferences (`subAgentsEnabled: true`), the agent dispatches **parallel specialized AI agents** for complex tasks (complexity >= 5). Sub-agents enrich the builder's context rather than replacing it.

**Roles and default models (balanced mode):**
| Role | Model | Purpose |
|------|-------|---------|
| planner | sonnet | Detailed implementation planning |
| implementer | sonnet | Code generation guidance |
| tester | haiku | Test writing |
| reviewer | sonnet | Code quality review |
| documenter | haiku | Documentation (complexity 10 only) |
| researcher | haiku | Context research and summarization |

**Budget modes:** `balanced` (default), `quality_first` (sonnet/opus for all), `aggressive_save` (haiku for all)

**Complexity thresholds:**
- < 5: No sub-agents
- 5-7: implementer + tester (parallel)
- 8-9: planner → implementer + tester + reviewer (parallel after planner)
- 10: Full team including documenter

**Execution:** Dependency graph → ready agents run via `Promise.allSettled` → outputs fed to dependents → merged as enriched context for builder.

**Merge strategies:** `concatenate` (join with headers) or `ai_merge` (Haiku combines outputs).

Key files: `ai/sub-agents.ts` (types, role mapping), `ai/orchestrate-sub-agents.ts` (planning, execution, merging)
Endpoint: `POST /ai/estimate-sub-agent-cost` (auth: true) — cost preview for frontend

## Token Revocation (OWASP A07)
Gateway maintains `revoked_tokens` table (SHA256 hash of token → expires_at).
- Auth handler checks revocation before returning AuthData
- `POST /gateway/revoke` (exposed, auth: true) — revoke current Bearer token
- `POST /gateway/revoke-token` (internal) — revoke specific token
- Daily cron cleans up expired entries

## Memory Types
| Type | When to use |
|------|-------------|
| `general` | Default for unclassified memories |
| `skill` | Learned skills and capabilities |
| `task` | Task-specific context |
| `session` | Conversation extracts |
| `error_pattern` | Errors and their resolutions (for cross-task learning) |
| `decision` | Architectural decisions and key choices |

## Sandbox Modes
Controlled by `SandboxMode` secret (`"docker"` or `"filesystem"`). Default: `"filesystem"`.

- **Filesystem mode:** Uses `/tmp/thefold-sandboxes/` with local exec. For development.
- **Docker mode:** Uses `node:20-alpine` containers with security limits:
  - `--network=none` — no network access
  - `--read-only` with tmpfs for `/tmp` and `/workspace`
  - `--memory=512m --cpus=0.5` — resource limits
  - Cleanup cron every 30 min removes containers older than 30 min
  - Repo cloned on host, `docker cp` into container (avoids network in container)

All sandbox endpoints (`create`, `writeFile`, `deleteFile`, `runCommand`, `validate`, `validateIncremental`, `destroy`) support both modes transparently.

Key files: `sandbox/sandbox.ts` (mode switching, pipeline), `sandbox/docker.ts` (Docker operations)

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
Health checks for repos: dependency_audit, test_coverage, code_quality, doc_freshness.
Daily cron at 03:00, **feature-flagged via MonitorEnabled secret**.

## Registry Service (Component Marketplace Grunnmur)
Component registry with healing pipeline. Foundation for Fase 5 marketplace.

Key concepts:
- **Components:** Registered code components with versioning, files (JSONB), tags, used_by_repos tracking
- **Healing:** When a component is updated, trigger-healing creates tasks for all affected repos via tasks service
- **Pub/Sub:** `healing-events` topic notifies chat service, which stores healing notifications as system messages
- **Extractor:** Stub for future AI-based component auto-extraction from completed builds

Endpoints: `/registry/register` (internal), `/get`, `/list`, `/search`, `/use` (internal), `/find-for-task` (internal), `/trigger-healing` (internal), `/healing-status`
Database: `components` + `healing_events` tables
Connected to: `code_patterns.component_id` in memory service, `tasks.createTask()` for healing

## Grunnmur-awareness
Når du jobber med TheFold, vær klar over at mange features har grunnmur på plass
men er ikke aktivert ennå. Se **GRUNNMUR-STATUS.md** for full oversikt (250+ features,
240+ aktive, 2 stubbede, 21 grunnmur, 9 planlagte). Når du implementerer en feature
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
- `agent/orchestrator.ts` — Project orchestrator: curateContext, executeProject, project endpoints
- `agent/review.ts` — Code review system: submit, get, list, approve, request-changes, reject
- `agent/types.ts` — DiagnosisResult, AgentExecutionContext, AttemptRecord, ErrorPattern, ProjectPlan, ProjectTask, CuratedContext, CodeReview, ReviewFile, AIReviewData
- `agent/db.ts` — Shared SQLDatabase reference for agent service
- `tasks/tasks.ts` — Task engine: CRUD, Linear sync, AI planning, Pub/Sub events, statistics
- `tasks/types.ts` — Task, TaskStatus, TaskSource types
- `builder/builder.ts` — Builder service core: 5 endpoints, build orchestration
- `builder/phases.ts` — 6 build phases: init, scaffold, dependencies, implement, integrate, finalize
- `builder/graph.ts` — Dependency analysis, topological sort, import extraction
- `ai/ai.ts` — System prompts, multi-model routing, diagnosis, prompt caching, reviseProjectPhase, planTaskOrder, generateFile, fixFile
- `ai/db.ts` — SQLDatabase("ai") for providers + models tables
- `ai/providers.ts` — 5 CRUD endpoints for dynamic provider/model system
- `ai/router.ts` — DB-backed model cache, selectOptimalModel, getUpgradeModel, tag-based selection, tier-based upgrade
- `ai/sub-agents.ts` — Sub-agent types, role-to-model mapping (6 roles, 3 budget modes)
- `ai/orchestrate-sub-agents.ts` — Sub-agent planning, parallel execution, result merging, cost estimation
- `ai/sanitize.ts` — OWASP A03 input sanitization for AI calls (null bytes, control chars, max length)
- `chat/chat.ts` — Chat service with project detection integration, file uploads, source tracking
- `chat/detection.ts` — detectProjectRequest heuristics
- `sandbox/sandbox.ts` — Validation pipeline, dual-mode (filesystem/Docker) switching
- `sandbox/docker.ts` — Docker container sandbox: create, exec, write, delete, destroy, cleanup
- `memory/memory.ts` — Semantic search with decay, code patterns, consolidation
- `skills/skills.ts` — CRUD + prompt enrichment
- `skills/engine.ts` — Pipeline engine: resolve, pre-run, post-run, scoring
- `monitor/monitor.ts` — Health checks and cron
- `github/github.ts` — Repository operations with context windowing
- `registry/registry.ts` — Component marketplace: CRUD, use-tracking, useComponent (exposed), healing pipeline, Pub/Sub
- `registry/types.ts` — Component, HealingEvent, request/response types
- `registry/extractor.ts` — Stub for AI-based component auto-extraction
- `templates/templates.ts` — Template library: list, get, useTemplate, categories
- `templates/types.ts` — Template, TemplateFile, TemplateVariable types
- `mcp/mcp.ts` — MCP server registry: list, get, install, uninstall, configure, installed
- `integrations/integrations.ts` — External service webhooks (Slack, Discord), CRUD config
- `agent/e2e.test.ts` — End-to-end integration tests (25 tests across 10 groups)
- `ARKITEKTUR.md` — Full architecture documentation with all schemas and endpoints

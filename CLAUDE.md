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
MCP (Model Context Protocol) server management with actual call routing.

Key concepts:
- **Servers:** Pre-seeded MCP servers (filesystem, github, postgres, context7, brave-search, puppeteer)
- **Status:** `available` (not active), `installed` (active, included in agent context), `error`
- **Categories:** general, code, data, docs, ai
- **Agent integration:** STEP 3.5 starts installed servers via `startInstalledServers()`, includes tools in AI context with `mcp_` prefix
- **Call routing:** AI tool-use loop detects `mcp_` prefix, parses server/tool name, routes to `mcp.callTool()`
- **Cleanup:** STEP 12.5 calls `stopAllServers()` after task completion
- **Feature flag:** MCPRoutingEnabled secret controls routing (true) vs info-mode (false)
- **Protocol:** JSON-RPC 2.0 over stdio with subprocess spawning (15s start timeout, 30s tool call timeout)

Endpoints: `/mcp/list` (auth), `/mcp/get` (auth), `/mcp/install` (auth), `/mcp/uninstall` (auth), `/mcp/configure` (auth), `/mcp/installed` (internal), `/mcp/routing-status` (auth), `/mcp/call-tool` (internal)
Database: `mcp_servers` table with JSONB env_vars, config, discovered_tools

Key files:
- `mcp/client.ts` — MCPClient class with JSON-RPC 2.0 subprocess communication (285 lines)
- `mcp/router.ts` — Server lifecycle (startInstalledServers, routeToolCall, stopAllServers), routing endpoints (244 lines)
- `mcp/migrations/2_add_tools_cache.up.sql` — discovered_tools, last_health_check, health_status columns

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

### Single-task flow (from chat or direct trigger)
1. Task picked up via **dual-source lookup**: tries tasks service first (`tasks.getTaskInternal()`), falls back to Linear (`linear.getTask()`). When found locally, sets `ctx.thefoldTaskId = ctx.taskId` and updates status to `in_progress`
2. GitHub: read project tree + relevant files (with context windowing). If repo is empty (`tree.empty`), runs `autoInitRepo()` to scaffold and push initial files
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
13. **Review gate** (always): submit for user review via `submitReviewInternal()`
    - Agent pauses, sandbox stays alive, status = `pending_review`
    - User reviews at `/review/[id]`: approve, request changes, or reject
    - Approve → creates PR, updates Linear, stores memories, destroys sandbox
    - Request changes → re-executes task with feedback, creates new review
    - Reject → destroys sandbox

### collectOnly mode (used by orchestrator)
When `ExecuteTaskOptions.collectOnly = true`, executeTask runs steps 1-7 (plan, build, validate) but stops after validation. It returns `ExecuteTaskResult` with `filesContent` (all files written) and `sandboxId` (for reuse). No review gate, no PR, no cleanup. The orchestrator accumulates these results across all tasks and submits one aggregated review at the end.

## Project Orchestrator
When a user sends a large request ("Build a task app with auth and teams"), the orchestrator runs ALL tasks autonomously and submits ONE aggregated review:

1. Chat detects project request via heuristics (>100 words, build intent, multiple systems)
2. `ai.decomposeProject()` breaks it into atomic tasks organized in phases
3. Plan stored via `agent.storeProjectPlan()` with dependency-index-to-UUID resolution
4. User confirms → `executeProject()` starts async via `agent.startProject()`
5. **Auto-init**: If repo is empty, `autoInitRepo()` scaffolds initial files before sandbox creation
6. **One shared sandbox** created for the entire project — all tasks execute in the same sandbox
7. For each phase, for each task:
   - `curateContext()` gathers dependency outputs, memory, GitHub files, docs
   - Token-trimming with priority: conventions → deps → files → memory → docs (max 30K tokens)
   - `executeTask()` runs with `collectOnly: true` + shared `sandboxId` — returns files without creating PR or triggering review
   - Files accumulated in `accumulatedFiles` array with path-based deduplication
   - Results update task status, cost, output_files in DB
8. Failed tasks → downstream dependents marked as 'skipped', other tasks continue
9. Between phases: `ai.reviseProjectPhase()` reviews completed results and adjusts next phase tasks
10. After each phase: progress report via agentReports pub/sub
11. After ALL phases complete: `ai.reviewProject()` reviews the entire project (all files, all tasks, all phases)
12. **One aggregated review** submitted via `submitReviewInternal()` — user reviews everything at once
13. Project status set to `pending_review` — sandbox stays alive until user decides
14. Approve → ONE PR with all files, sandbox destroyed. Request changes → re-execute specific tasks. Reject → sandbox destroyed
15. Crash-resumable: reads current state from DB, skips completed tasks, outer try/catch destroys sandbox on unexpected errors

Key files:
- `agent/orchestrator.ts` — curateContext, executeProject, 5 API endpoints
- `agent/agent.ts` — executeTask with `collectOnly` mode, `autoInitRepo`
- `agent/types.ts` — ProjectPlan, ProjectTask, CuratedContext, ExecuteTaskResult (with filesContent, sandboxId)
- `ai/ai.ts` — `reviewProject()` endpoint for whole-project AI review with token-trimming
- `chat/detection.ts` — detectProjectRequest heuristics
- `chat/chat.ts` — send endpoint with project detection integration

Endpoints: `/agent/project/start`, `/status`, `/pause`, `/resume`, `/store`
Database: `project_plans` + `project_tasks` + `agent_jobs` tables (in agent service)

## Code Review System
Two review modes depending on context:

### Single-task review (from chat)
Review gate sits after validation in executeTask. Agent pauses, stores review in DB, notifies user via chat. User reviews at `/review/[id]`.

### Project review (from orchestrator)
After ALL tasks complete, orchestrator calls `ai.reviewProject()` for a whole-project AI review, then submits ONE aggregated review covering all files from all tasks. User approves once → one PR.

Key flows:
- **Approve**: `approveReview()` → creates PR → updates Linear → stores memories → destroys sandbox
- **Request changes**: stores feedback → re-executes `executeTask()` with feedback in taskDescription → new review created
- **Reject**: destroys sandbox, notifies chat

Endpoints: `/agent/review/submit` (internal), `/get`, `/list`, `/approve`, `/request-changes`, `/reject`
Database: `code_reviews` table (in agent service) — JSONB for files_changed and ai_review

### ai.reviewProject()
Dedicated endpoint for reviewing entire projects. Receives all files, tasks, and phases. Token-trimming sorts files by size — smaller files included in full, larger ones as summaries (MAX_FILE_TOKENS = 60000). Returns: documentation, qualityScore (1-10), concerns, architecturalDecisions, memoriesExtracted.
Endpoint: `POST /ai/review-project` (internal)

## GitHub Scope + Rate Limiting (OWASP ASI02)
- `validateAgentScope(ctx, owner, repo)` in `agent/helpers.ts` — hard block if write targets wrong repo
- Rate limiting in `agent/rate-limiter.ts`: 20 tasks/hour, 100 tasks/day per userId
- `checkRateLimit(userId)` / `recordTaskStart(userId)` — called in `startTask()` before lock acquired
- `github_write` audit via `auditedStep()` in `completion.ts` — all PR operations logged
- Migration: `agent/migrations/9_create_rate_limits.up.sql`
- Cleanup cron: deletes records older than 48h, runs at 03:00

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

## Security Headers (OWASP A02)
Next.js security headers configured in `frontend/next.config.ts`:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Content-Security-Policy` — restricts resource loading, includes `frame-ancestors 'none'`
- `Referrer-Policy: strict-origin-when-cross-origin` — controls referrer information
- `X-XSS-Protection: 1; mode=block` — legacy XSS protection
- `Permissions-Policy` — restricts browser features (camera, microphone, geolocation)

## Silent Error Logging (OWASP A10)
All backend silent `catch {}` blocks now use structured logging:
- `agent/execution.ts` — 2 fixes: error pattern fallback comment, impossible_task log
- `agent/completion.ts` — 3 fixes: updateTaskStatus, savePhaseMetrics, completeJob
- `agent/review-handler.ts` — 3 fixes: updateTaskStatus, savePhaseMetrics, completeJob
- `agent/helpers.ts` — 2 fixes: isCancelled log, sandbox.destroy comment
- `github/github.ts` — 2 comments: package.json optional
- Pattern: `catch (err) { log.warn("operation failed", { error: err instanceof Error ? err.message : String(err) }); }`

## Login Failure Monitoring (OWASP A09)
Suspicious login activity monitoring in `users/users.ts`:
- `checkSuspiciousActivity(email)` — fires `log.error` at 10+ failed attempts/hour
- `GET /users/security/login-report` (auth: true) — returns suspicious accounts (5+ failures/24h) and total failures
- Integrated with existing `login_audit` table and `checkLockout()` exponential backoff
- Future: Slack/Discord notifications via integrations service

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

**Advanced Pipeline Feature Flag:** `SandboxAdvancedPipeline` secret controls snapshot and performance pipeline steps:
- `"true"` → Snapshot comparison and performance benchmarks enabled
- `"false"` or unset → Steps return "disabled by feature flag" warning (non-blocking)

Key files: `sandbox/sandbox.ts` (mode switching, pipeline), `sandbox/snapshot.ts` (snapshot logic), `sandbox/docker.ts` (Docker operations)

## Validation Pipeline
The sandbox runs a 5-step pipeline (5 enabled, feature-flagged):
1. **typecheck** ✅ — `npx tsc --noEmit`
2. **lint** ✅ — `npx eslint . --no-error-on-unmatched-pattern`
3. **test** ✅ — `npm test --if-present`
4. **snapshot** ✅ — Snapshot comparison: før/etter file diff via SHA-256 hash + size (SandboxAdvancedPipeline flag)
5. **performance** ✅ — Performance benchmarks: build time, bundle size, source file count (SandboxAdvancedPipeline flag)

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

## Running
```bash
encore run              # all services + local infra
# Dashboard: http://localhost:9400
```

## Key Files
- `agent/agent.ts` — Thin orchestrator (174 lines): executeTask() calls buildContext → assessAndRoute → executePlan → handleReview → completeTask. API endpoints: startTask, respondToClarification, forceContinue, job management, metrics, audit log queries
- `agent/helpers.ts` — All shared helper functions: report(), think(), reportSteps(), auditedStep(), audit(), shouldStopTask(), checkCancelled(), updateLinearIfExists(), autoInitRepo(), validateAgentScope(). Re-exports circuit breakers. Constants: REPO_OWNER, REPO_NAME, MAX_RETRIES, MAX_PLAN_REVISIONS
- `agent/rate-limiter.ts` — Rate limiting: checkRateLimit(), recordTaskStart(), cleanupRateLimits cron. 20/h + 100/day per userId
- `agent/token-policy.ts` — Per-phase token budget limits (confidence 2K, planning 8K, building 50K, diagnosis 4K, review 8K). isOverTokenBudget(), warnIfOverBudget(). Logging only, no hard enforcement
- `agent/state-machine.ts` — Explicit state machine for agent lifecycle: 14 phases, VALID_TRANSITIONS, createStateMachine(), validateSequence(), feature-flagged strict mode (AgentStateMachineStrict secret)
- `agent/messages.ts` — Typed Pub/Sub message contract: AgentMessage union (6 types: status/thought/report/clarification/review/completion), serializeMessage/deserializeMessage with legacy fallback, builder functions
- `agent/orchestrator.ts` — Project orchestrator: curateContext, executeProject, project endpoints
- `agent/review.ts` — Code review system: submit, get, list, approve, request-changes, reject
- `agent/types.ts` — DiagnosisResult, AgentExecutionContext (with phase?: AgentPhase), AttemptRecord, ErrorPattern, ProjectPlan, ProjectTask, CuratedContext, CodeReview, ReviewFile, AIReviewData
- `agent/db.ts` — Shared SQLDatabase reference + acquireRepoLock/releaseRepoLock (advisory lock) + createJob/startJob/updateJobCheckpoint/completeJob/failJob/findResumableJobs/expireOldJobs/getActiveJobForRepo (persistent job queue)
- `agent/metrics.ts` — PhaseTracker (in-memory per-task): createPhaseTracker(), recordAICall(), getAll(). DB: savePhaseMetrics(), getPhaseMetricsSummary(), getTaskCostBreakdown(). Uses SQLDatabase.named("agent")
- `agent/context-builder.ts` — STEP 2+3+3.5: buildContext(ctx, tracker, helpers) → AgentContext. GitHub tree, relevant files, memory search, docs lookup, MCP tools
- `agent/confidence.ts` — STEP 4+4.5: assessAndRoute(ctx, contextData, tracker, helpers, options) → ConfidenceResult. Confidence assessment, complexity assessment, model selection
- `agent/execution.ts` — STEP 5-7+retry: executePlan(ctx, contextData, tracker, helpers, options) → ExecutionResult. Plan, error patterns, sub-agents, build, validate, retry loop with 6 diagnosis branches
- `agent/review-handler.ts` — STEP 8-8.5: handleReview(ctx, executionData, tracker, helpers, options) → ReviewResult. AI review, submit for user review, two stop-checkpoints, skipReview path
- `agent/completion.ts` — STEP 9-12: completeTask(ctx, completionData, tracker, helpers) → CompletionResult. PR creation, Linear update, memory storage (fire-and-forget), sandbox destroy, final report
- `tasks/tasks.ts` — Task engine: CRUD, Linear sync, AI planning, Pub/Sub events, statistics
- `tasks/types.ts` — Task, TaskStatus, TaskSource types
- `builder/builder.ts` — Builder service core: 5 endpoints, build orchestration
- `builder/phases.ts` — 6 build phases: init, scaffold, dependencies, implement, integrate, finalize
- `builder/graph.ts` — Dependency analysis, topological sort, import extraction
- `ai/ai.ts` — System prompts, multi-model routing, diagnosis, prompt caching, reviseProjectPhase, planTaskOrder, generateFile, fixFile, callForExtraction (for registry auto-extraction)
- `ai/db.ts` — SQLDatabase("ai") for providers + models tables
- `ai/providers.ts` — 5 CRUD endpoints for dynamic provider/model system
- `ai/router.ts` — DB-backed model cache, selectOptimalModel, getUpgradeModel, tag-based selection, tier-based upgrade
- `ai/sub-agents.ts` — Sub-agent types, role-to-model mapping (6 roles, 3 budget modes)
- `ai/orchestrate-sub-agents.ts` — Sub-agent planning, parallel execution, result merging, cost estimation
- `ai/sanitize.ts` — OWASP A03 input sanitization for AI calls (null bytes, control chars, max length)
- `chat/chat.ts` — Chat service with project detection integration, file uploads, source tracking
- `chat/agent-message-parser.ts` — Duplicated agent message types for cross-service boundary (Encore prohibition), deserializeMessage + buildStatusContent
- `chat/detection.ts` — detectProjectRequest heuristics
- `sandbox/sandbox.ts` — Validation pipeline, dual-mode (filesystem/Docker) switching, snapshot cache, SandboxAdvancedPipeline flag
- `sandbox/snapshot.ts` — File snapshots: takeSnapshot, takeDockerSnapshot, compareSnapshots
- `sandbox/docker.ts` — Docker container sandbox: create, exec, write, delete, destroy, cleanup
- `memory/memory.ts` — Semantic search with decay, code patterns, consolidation. ASI06: sanitizeForMemory() on all writes, SHA-256 content_hash integrity check in search(), trust_level segmentation (user/agent/system)
- `skills/skills.ts` — CRUD + prompt enrichment
- `skills/engine.ts` — Pipeline engine: resolve, pre-run, post-run, scoring
- `monitor/monitor.ts` — Health checks and cron
- `github/github.ts` — Repository operations with context windowing
- `registry/registry.ts` — Component marketplace: CRUD, use-tracking, useComponent (exposed), healing pipeline, Pub/Sub
- `registry/types.ts` — Component, HealingEvent, request/response types
- `registry/extractor.ts` — AI-based component auto-extraction with extractComponents(), extractAndRegister(), callForExtraction endpoint, feature-flagged via RegistryExtractionEnabled
- `templates/templates.ts` — Template library: list, get, useTemplate, categories
- `templates/types.ts` — Template, TemplateFile, TemplateVariable types
- `mcp/mcp.ts` — MCP server registry: list, get, install, uninstall, configure, installed
- `integrations/integrations.ts` — External service webhooks (Slack, Discord), CRUD config
- `agent/e2e.test.ts` — End-to-end integration tests (25 tests across 10 groups)
- `agent/e2e-mock.test.ts` — E2E mock tests (12 tests, 10 passing): full agent flow with mock AI provider, no external API keys required
- `agent/test-helpers/mock-ai.ts` — Mock AI provider: deterministisk AI responses, call logging for assertions
- `agent/test-helpers/mock-services.ts` — Mock services: GitHub, Memory, Docs, MCP, Sandbox, Builder mocks
- `registry/extractor.test.ts` — Component extraction tests (8 tests: feature flag, filtering, limits, errors, quality score, enrichment, language detection)
- `ARKITEKTUR.md` — Full architecture documentation with all schemas and endpoints
